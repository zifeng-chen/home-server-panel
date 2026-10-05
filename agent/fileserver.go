package main

// fileserver.go — Phase 3 结构化文件操作
// 提供 file_list / file_read / file_write / file_delete / file_upload 动作，
// 带路径白名单 + 敏感文件黑名单 + 大小限制，供 HSP 服务端经 WS 命令通道调用。

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	maxReadBytes   = 2 * 1024 * 1024   // 单次读取上限 2MB
	maxWriteBytes  = 5 * 1024 * 1024   // 写入上限 5MB
	maxUploadBytes = 32 * 1024 * 1024  // 上传上限 32MB
)

// 允许访问的根目录（绝对路径前缀）。为空表示不限制（不推荐）。
var allowedRoots = []string{
	"/home", "/root", "/opt", "/srv", "/usr/local",
	"/var/log", "/var/lib", "/var/www", "/tmp", "/mnt", "/media",
	"/etc", "/user", "/share", "/volume1", "/volume2", "/volume3", "/volume4",
}

// 明确禁止访问的路径前缀（即使落在白名单内）
var deniedPathPrefixes = []string{
	"/etc/shadow", "/etc/gshadow", "/etc/sudoers",
	"/root/.ssh", "/.ssh", "/etc/ssh/ssh_host_",
}

// 禁止访问的文件名（大小写敏感）
var deniedNames = map[string]bool{
	"id_rsa": true, "id_ed25519": true, "id_ecdsa": true, "id_dsa": true,
	"authorized_keys": true, "shadow": true, "gshadow": true, ".netrc": true, ".pgpass": true,
}

// safePath 归一化并校验路径安全性，返回绝对路径或错误信息
func safePath(p string) (string, string) {
	if p == "" {
		return "", "路径不能为空"
	}
	p = strings.TrimSpace(p)
	if strings.Contains(p, "\x00") {
		return "", "非法路径"
	}
	clean := filepath.Clean(p)
	if !filepath.IsAbs(clean) {
		return "", "仅支持绝对路径"
	}
	// 拒绝包含 .. 的路径（Clean 后仍含说明越界）
	if strings.Contains(clean, "..") {
		return "", "非法路径"
	}
	// 黑名单前缀
	low := strings.ToLower(clean)
	for _, deny := range deniedPathPrefixes {
		if low == deny || strings.HasPrefix(low, deny+"/") || strings.HasPrefix(low, deny) {
			return "", "禁止访问该路径"
		}
	}
	// 黑名单文件名
	base := strings.ToLower(filepath.Base(clean))
	if deniedNames[base] {
		return "", "禁止访问该文件"
	}
	// 白名单根目录
	if len(allowedRoots) > 0 {
		ok := false
		for _, root := range allowedRoots {
			if clean == root || strings.HasPrefix(clean, root+"/") {
				ok = true
				break
			}
		}
		if !ok {
			return "", "路径不在允许范围内"
		}
	}
	return clean, ""
}

type fileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

// fileList 列出目录内容
func fileList(data map[string]any) map[string]any {
	path, _ := data["path"].(string)
	abs, errMsg := safePath(path)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	files := make([]fileEntry, 0, len(entries))
	for _, e := range entries {
		info, ierr := e.Info()
		if ierr != nil {
			continue
		}
		files = append(files, fileEntry{
			Name:    e.Name(),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			IsDir:   e.IsDir(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
		})
	}
	// 目录在前，然后按名称排序
	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})
	// 计算父目录
	parent := filepath.Dir(abs)
	if parent == abs {
		parent = ""
	}
	return map[string]any{"path": abs, "parent": parent, "files": files}
}

// fileRead 读取文本文件
func fileRead(data map[string]any) map[string]any {
	path, _ := data["path"].(string)
	abs, errMsg := safePath(path)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	info, err := os.Stat(abs)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	if info.IsDir() {
		return map[string]any{"error": "目标是目录，无法读取"}
	}
	if info.Size() > maxReadBytes {
		return map[string]any{"error": "文件过大 (>2MB)，请下载查看"}
	}
	content, err := os.ReadFile(abs)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	// 简单二进制检测：含 NUL 字节视为二进制
	encoding := "utf8"
	for _, b := range content {
		if b == 0 {
			encoding = "binary"
			break
		}
	}
	return map[string]any{
		"path":     abs,
		"content":  string(content),
		"size":     len(content),
		"encoding": encoding,
	}
}

// fileWrite 写入文本文件
func fileWrite(data map[string]any) map[string]any {
	path, _ := data["path"].(string)
	content, _ := data["content"].(string)
	abs, errMsg := safePath(path)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	if len(content) > maxWriteBytes {
		return map[string]any{"error": "内容过大 (>5MB)"}
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return map[string]any{"error": err.Error()}
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"path": abs, "written": len(content)}
}

// fileDelete 删除文件或空目录
func fileDelete(data map[string]any) map[string]any {
	path, _ := data["path"].(string)
	abs, errMsg := safePath(path)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	if abs == "/" {
		return map[string]any{"error": "禁止删除根目录"}
	}
	info, err := os.Stat(abs)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	if info.IsDir() {
		// 仅允许删除空目录，避免误删整棵树
		if err := os.Remove(abs); err != nil {
			return map[string]any{"error": "目录非空或删除失败: " + err.Error()}
		}
	} else {
		if err := os.Remove(abs); err != nil {
			return map[string]any{"error": err.Error()}
		}
	}
	return map[string]any{"path": abs, "deleted": true}
}

// fileUpload 接收 base64 内容写入指定目录
func fileUpload(data map[string]any) map[string]any {
	dir, _ := data["path"].(string)   // 目标目录
	name, _ := data["name"].(string)  // 文件名
	b64, _ := data["content"].(string)
	if name == "" || strings.ContainsAny(name, "/\\") {
		return map[string]any{"error": "非法文件名"}
	}
	absDir, errMsg := safePath(dir)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return map[string]any{"error": "base64 解码失败: " + err.Error()}
	}
	if len(raw) > maxUploadBytes {
		return map[string]any{"error": "文件过大 (>32MB)"}
	}
	target := filepath.Join(absDir, name)
	if _, errMsg := safePath(target); errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	if err := os.WriteFile(target, raw, 0o644); err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"path": target, "size": len(raw)}
}

// handleFileAction 分发文件相关动作
func handleFileAction(action string, data map[string]any) map[string]any {
	if data == nil {
		data = map[string]any{}
	}
	switch action {
	case "file_list":
		return fileList(data)
	case "file_read":
		return fileRead(data)
	case "file_write":
		return fileWrite(data)
	case "file_delete":
		return fileDelete(data)
	case "file_upload":
		return fileUpload(data)
	default:
		return map[string]any{"error": "unknown file action", "action": action}
	}
}
