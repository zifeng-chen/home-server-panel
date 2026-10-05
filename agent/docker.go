package main

// docker.go — Phase 3 远程 Docker 管理
// 通过 docker CLI 封装容器 / 镜像 / Compose 操作，供 HSP 服务端经 WS 命令通道调用。
//
// 安全约束：
//   - 不拼接 shell 字符串，全部走 exec.Command 参数数组，杜绝命令注入
//   - 容器名/ID、镜像引用、Compose 服务名均经正则白名单校验
//   - 容器操作、Compose 操作、prune 目标均为固定 allowlist
//   - Compose 文件路径复用 fileserver.go 的 safePath 白名单

import (
	"context"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	dockerQueryTimeout  = 20 * time.Second
	dockerActionTimeout = 90 * time.Second
	dockerPullTimeout   = 5 * time.Minute
	dockerMaxTail       = 2000
)

// 允许的容器生命周期操作
var containerActions = map[string]bool{
	"start": true, "stop": true, "restart": true,
	"kill": true, "pause": true, "unpause": true,
}

// 允许的 compose 子命令
var composeActions = map[string]bool{
	"up": true, "down": true, "ps": true, "logs": true,
	"restart": true, "stop": true, "start": true, "pull": true, "config": true,
}

var (
	containerRefRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)
	imageRefRe     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,190}$`)
	sinceRe        = regexp.MustCompile(`^([0-9]{1,10}(ms|us|µs|ns|s|m|h|d)?|[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2})?)?)$`)
)

// psFormat 容器列表格式（旧版 docker 不支持 .CreatedAt 时会降级）
const psFormatFull = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}"

// psFormatLite 降级格式
const psFormatLite = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}"

// imgFormat 镜像列表格式
const imgFormat = "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"

// statsFormat 资源占用格式
const statsFormat = "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}"

var cachedDockerBin string

// dockerBin 定位 docker 可执行文件（兼容桌面发行版与 OpenWrt/iStoreOS 的非常规路径）
func dockerBin() string {
	if cachedDockerBin != "" {
		return cachedDockerBin
	}
	for _, c := range []string{
		"docker",
		"/usr/bin/docker", "/usr/local/bin/docker", "/opt/bin/docker",
		"/opt/usr/bin/docker", "/sbin/docker", "/usr/sbin/docker",
	} {
		if p, err := exec.LookPath(c); err == nil {
			cachedDockerBin = p
			return p
		}
	}
	// 兜底：返回裸名，执行时会返回 "executable file not found"
	cachedDockerBin = "docker"
	return cachedDockerBin
}

// runDocker 执行 docker 子命令，返回结构化结果（不 panic，错误转成 error 字段）
func runDocker(args []string, timeout time.Duration) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	bin := dockerBin()
	cmd := exec.CommandContext(ctx, bin, args...)
	var out, errBuf strings.Builder
	cmd.Stdout = &out
	cmd.Stderr = &errBuf

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start).Milliseconds()

	res := map[string]any{
		"stdout":      out.String(),
		"stderr":      errBuf.String(),
		"duration_ms": duration,
		"exit_code":   0,
	}

	if ctx.Err() == context.DeadlineExceeded {
		res["exit_code"] = 124
		res["error"] = "docker 命令超时（" + timeout.String() + "）"
		return res
	}
	if err != nil {
		code := 1
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		}
		res["exit_code"] = code
		msg := strings.TrimSpace(errBuf.String())
		if strings.Contains(err.Error(), "executable file not found") ||
			strings.Contains(err.Error(), "no such file or directory") {
			res["error"] = "Docker 未安装或 docker 命令不可用"
		} else if msg != "" {
			res["error"] = msg
		} else {
			res["error"] = err.Error()
		}
	}
	return res
}

// dockerOK 执行并要求成功，失败时返回错误文案
func dockerOK(args []string, timeout time.Duration) (map[string]any, string) {
	r := runDocker(args, timeout)
	if e, ok := r["error"].(string); ok && e != "" {
		return r, e
	}
	if code, ok := r["exit_code"].(int); ok && code != 0 {
		msg := strings.TrimSpace(toStr(r["stderr"]))
		if msg == "" {
			msg = "docker 执行失败 (exit " + strconv.Itoa(code) + ")"
		}
		return r, msg
	}
	return r, ""
}

func toStr(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func countLines(s string) int {
	n := 0
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) != "" {
			n++
		}
	}
	return n
}

func validContainerRef(v any) (string, string) {
	name, _ := v.(string)
	name = strings.TrimSpace(name)
	if name == "" {
		return "", "缺少容器名或 ID"
	}
	if !containerRefRe.MatchString(name) {
		return "", "非法容器名/ID"
	}
	return name, ""
}

func validImageRef(v any) (string, string) {
	image, _ := v.(string)
	image = strings.TrimSpace(image)
	if image == "" {
		return "", "缺少镜像名"
	}
	if !imageRefRe.MatchString(image) {
		return "", "非法镜像引用"
	}
	return image, ""
}

// ============ 动作实现 ============

type containerInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
	Created string `json:"created"`
}

type imageInfo struct {
	ID         string `json:"id"`
	Repository string `json:"repository"`
	Tag        string `json:"tag"`
	Size       string `json:"size"`
	Created    string `json:"created"`
	Dangling   bool   `json:"dangling"`
}

type composeLine struct {
	Name    string `json:"name"`
	Service string `json:"service"`
	State   string `json:"state"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
}

// dockerStatus Docker 可用性 + 概览计数
func dockerStatus(_ map[string]any) map[string]any {
	if _, err := exec.LookPath(dockerBin()); err != nil {
		return map[string]any{"available": false, "installed": false, "error": "Docker 未安装"}
	}
	ver := runDocker([]string{"version", "--format", "{{.Server.Version}}"}, dockerQueryTimeout)
	if code, _ := ver["exit_code"].(int); code != 0 {
		return map[string]any{
			"available": false, "installed": true,
			"error": firstNonEmpty(toStr(ver["stderr"]), toStr(ver["error"]), "Docker daemon 未运行"),
		}
	}

	out := map[string]any{
		"available": true,
		"installed": true,
		"version":   strings.TrimSpace(toStr(ver["stdout"])),
		"binary":    dockerBin(),
	}

	if r, errMsg := dockerOK([]string{"ps", "-a", "--format", "{{.ID}}"}, dockerQueryTimeout); errMsg == "" {
		out["containers"] = countLines(toStr(r["stdout"]))
	}
	if r, errMsg := dockerOK([]string{"ps", "--format", "{{.ID}}"}, dockerQueryTimeout); errMsg == "" {
		out["running"] = countLines(toStr(r["stdout"]))
	}
	if r, errMsg := dockerOK([]string{"images", "--format", "{{.ID}}"}, dockerQueryTimeout); errMsg == "" {
		out["images"] = countLines(toStr(r["stdout"]))
	}

	// compose 可用性（v2 插件）
	if _, errMsg := dockerOK([]string{"compose", "version"}, dockerQueryTimeout); errMsg == "" {
		out["compose"] = true
	} else {
		out["compose"] = false
	}
	return out
}

// dockerPs 容器列表
func dockerPs(data map[string]any) map[string]any {
	all := true
	if v, ok := data["all"].(bool); ok {
		all = v
	}
	base := []string{"ps"}
	if all {
		base = append(base, "-a")
	}

	args := append(append([]string{}, base...), "--no-trunc", "--format", psFormatFull)
	r := runDocker(args, dockerQueryTimeout)
	if code, _ := r["exit_code"].(int); code != 0 {
		// 兼容旧版 docker：降级到不含 CreatedAt 的格式
		args2 := append(append([]string{}, base...), "--format", psFormatLite)
		r2 := runDocker(args2, dockerQueryTimeout)
		if code2, _ := r2["exit_code"].(int); code2 != 0 {
			return map[string]any{
				"available": false,
				"error":     firstNonEmpty(toStr(r["error"]), toStr(r["stderr"]), "docker ps 执行失败"),
			}
		}
		r = r2
	}

	containers := make([]containerInfo, 0)
	for _, line := range strings.Split(toStr(r["stdout"]), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		f := strings.Split(line, "\t")
		for len(f) < 7 {
			f = append(f, "")
		}
		containers = append(containers, containerInfo{
			ID: f[0], Name: f[1], Image: f[2], State: f[3],
			Status: f[4], Ports: f[5], Created: f[6],
		})
	}
	return map[string]any{"available": true, "containers": containers, "count": len(containers)}
}

// dockerLogs 容器日志
func dockerLogs(data map[string]any) map[string]any {
	name, errMsg := validContainerRef(data["name"])
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}

	tail := 200
	if v, ok := data["tail"].(float64); ok && v > 0 {
		tail = int(v)
	}
	if tail > dockerMaxTail {
		tail = dockerMaxTail
	}

	args := []string{"logs", "--tail", strconv.Itoa(tail)}
	if since, _ := data["since"].(string); strings.TrimSpace(since) != "" {
		since = strings.TrimSpace(since)
		if !sinceRe.MatchString(since) {
			return map[string]any{"error": "非法的 since 参数（如 10m / 2h / 2026-10-05T10:00 ）"}
		}
		args = append(args, "--since", since)
	}
	if ts, ok := data["timestamps"].(bool); ok && ts {
		args = append(args, "--timestamps")
	}
	args = append(args, name)

	r := runDocker(args, dockerQueryTimeout)
	stdout := toStr(r["stdout"])
	stderr := toStr(r["stderr"])

	// docker logs 把容器 stderr 也写到进程 stderr，正常情况需合并展示
	text := stdout
	if stderr != "" {
		if text != "" {
			text += "\n"
		}
		text += stderr
	}

	if code, _ := r["exit_code"].(int); code != 0 && strings.TrimSpace(stdout) == "" {
		return map[string]any{
			"error": firstNonEmpty(toStr(r["error"]), stderr, "读取日志失败"),
		}
	}
	return map[string]any{"name": name, "tail": tail, "logs": text}
}

// dockerStats 各容器资源占用（快照）
func dockerStats(_ map[string]any) map[string]any {
	r, errMsg := dockerOK([]string{"stats", "--no-stream", "--format", statsFormat}, dockerActionTimeout)
	if errMsg != "" {
		return map[string]any{"available": false, "error": errMsg}
	}
	type statRow struct {
		Name    string `json:"name"`
		CPU     string `json:"cpu"`
		Mem     string `json:"mem"`
		MemPct  string `json:"memPct"`
		NetIO   string `json:"netIO"`
		BlockIO string `json:"blockIO"`
		PIDs    string `json:"pids"`
	}
	rows := make([]statRow, 0)
	for _, line := range strings.Split(toStr(r["stdout"]), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		f := strings.Split(line, "\t")
		for len(f) < 7 {
			f = append(f, "")
		}
		rows = append(rows, statRow{f[0], f[1], f[2], f[3], f[4], f[5], f[6]})
	}
	return map[string]any{"available": true, "stats": rows}
}

// dockerAction 容器启停等操作
func dockerAction(data map[string]any) map[string]any {
	name, errMsg := validContainerRef(data["name"])
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	action, _ := data["action"].(string)
	action = strings.TrimSpace(action)
	if !containerActions[action] {
		return map[string]any{"error": "不支持的容器操作: " + action}
	}

	r, errMsg := dockerOK([]string{action, name}, dockerActionTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	return map[string]any{
		"name": name, "action": action,
		"result":      strings.TrimSpace(toStr(r["stdout"])),
		"duration_ms": r["duration_ms"],
	}
}

// dockerRemove 删除容器
func dockerRemove(data map[string]any) map[string]any {
	name, errMsg := validContainerRef(data["name"])
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	force := false
	if v, ok := data["force"].(bool); ok {
		force = v
	}
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, name)

	r, errMsg := dockerOK(args, dockerActionTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	return map[string]any{"name": name, "deleted": true, "result": strings.TrimSpace(toStr(r["stdout"]))}
}

// dockerImages 镜像列表
func dockerImages(_ map[string]any) map[string]any {
	r, errMsg := dockerOK([]string{"images", "--no-trunc", "--format", imgFormat}, dockerQueryTimeout)
	if errMsg != "" {
		return map[string]any{"available": false, "error": errMsg}
	}
	images := make([]imageInfo, 0)
	for _, line := range strings.Split(toStr(r["stdout"]), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		f := strings.Split(line, "\t")
		for len(f) < 5 {
			f = append(f, "")
		}
		repo := f[1]
		images = append(images, imageInfo{
			ID: f[0], Repository: repo, Tag: f[2], Size: f[3], Created: f[4],
			Dangling: repo == "" || repo == "<none>",
		})
	}
	return map[string]any{"available": true, "images": images, "count": len(images)}
}

// dockerPull 拉取镜像
func dockerPull(data map[string]any) map[string]any {
	image, errMsg := validImageRef(data["image"])
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	r, errMsg := dockerOK([]string{"pull", image}, dockerPullTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	out := toStr(r["stdout"])
	if s := strings.TrimSpace(toStr(r["stderr"])); s != "" {
		if out != "" {
			out += "\n"
		}
		out += s
	}
	return map[string]any{"image": image, "output": out, "duration_ms": r["duration_ms"]}
}

// dockerImageRemove 删除镜像
func dockerImageRemove(data map[string]any) map[string]any {
	image, errMsg := validImageRef(data["image"])
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	force := false
	if v, ok := data["force"].(bool); ok {
		force = v
	}
	args := []string{"rmi"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, image)

	r, errMsg := dockerOK(args, dockerActionTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	return map[string]any{"image": image, "deleted": true, "result": strings.TrimSpace(toStr(r["stdout"]))}
}

// dockerPrune 清理无主资源（volume 需显式 confirm）
func dockerPrune(data map[string]any) map[string]any {
	target, _ := data["target"].(string)
	target = strings.ToLower(strings.TrimSpace(target))
	if target == "" {
		target = "image"
	}

	var args []string
	switch target {
	case "image", "images":
		args = []string{"image", "prune", "-f"}
	case "container", "containers":
		args = []string{"container", "prune", "-f"}
	case "network", "networks":
		args = []string{"network", "prune", "-f"}
	case "builder":
		args = []string{"builder", "prune", "-f"}
	case "volume", "volumes":
		confirm, _ := data["confirm"].(bool)
		if !confirm {
			return map[string]any{"error": "清理数据卷会删除数据，需显式确认 (confirm=true)"}
		}
		args = []string{"volume", "prune", "-f"}
	default:
		return map[string]any{"error": "不支持的清理目标: " + target}
	}

	r, errMsg := dockerOK(args, dockerPullTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}
	return map[string]any{"target": target, "result": strings.TrimSpace(toStr(r["stdout"]))}
}

// dockerCompose Compose 编排
func dockerCompose(data map[string]any) map[string]any {
	file, _ := data["file"].(string)
	if strings.TrimSpace(file) == "" {
		return map[string]any{"error": "缺少 compose 文件路径"}
	}
	abs, pathErr := safePath(file)
	if pathErr != "" {
		return map[string]any{"error": "compose 文件路径不合法: " + pathErr}
	}
	switch strings.ToLower(filepath.Ext(abs)) {
	case ".yml", ".yaml":
	default:
		return map[string]any{"error": "compose 文件必须是 .yml / .yaml"}
	}

	action, _ := data["action"].(string)
	action = strings.TrimSpace(action)
	if !composeActions[action] {
		return map[string]any{"error": "不支持的 compose 操作: " + action}
	}

	service, _ := data["service"].(string)
	service = strings.TrimSpace(service)
	if service != "" && !containerRefRe.MatchString(service) {
		return map[string]any{"error": "非法服务名"}
	}

	args := []string{"compose", "-f", abs}
	switch action {
	case "up":
		args = append(args, "up", "-d")
	case "logs":
		args = append(args, "logs", "--tail", "200")
	default:
		args = append(args, action)
	}
	if service != "" {
		args = append(args, service)
	}

	r, errMsg := dockerOK(args, dockerPullTimeout)
	if errMsg != "" {
		return map[string]any{"error": errMsg}
	}

	out := toStr(r["stdout"])
	if s := strings.TrimSpace(toStr(r["stderr"])); s != "" {
		if out != "" {
			out += "\n"
		}
		out += s
	}

	res := map[string]any{
		"file": abs, "action": action, "service": service,
		"output": out, "duration_ms": r["duration_ms"],
	}
	if action == "ps" {
		res["containers"] = parseComposePs(out)
	}
	return res
}

// parseComposePs 解析 docker compose ps 的表格输出。
// 由于 CREATED / STATUS 列本身含空格，不能按空白切分，
// 这里用表头定位每列的字符区间，再按区间切数据行。
func parseComposePs(out string) []composeLine {
	lines := make([]string, 0, 8)
	for _, l := range strings.Split(out, "\n") {
		l = strings.TrimRight(l, "\r")
		if strings.TrimSpace(l) != "" {
			lines = append(lines, l)
		}
	}
	if len(lines) < 2 {
		return []composeLine{}
	}

	header := lines[0]
	idx := composeColRe.FindAllStringIndex(header, -1)
	if len(idx) == 0 {
		return []composeLine{}
	}

	type colSpan struct {
		name       string
		start, end int
	}
	cols := make([]colSpan, 0, len(idx))
	for i, m := range idx {
		end := int(^uint(0) >> 1) // 最后一列取行尾
		if i+1 < len(idx) {
			end = idx[i+1][0]
		}
		cols = append(cols, colSpan{
			name:  strings.ToUpper(strings.TrimSpace(header[m[0]:m[1]])),
			start: m[0],
			end:   end,
		})
	}

	rows := make([]composeLine, 0, len(lines)-1)
	for _, line := range lines[1:] {
		var c composeLine
		for _, col := range cols {
			if col.start >= len(line) {
				continue
			}
			end := col.end
			if end > len(line) {
				end = len(line)
			}
			val := strings.TrimSpace(line[col.start:end])
			switch col.name {
			case "NAME":
				c.Name = val
			case "SERVICE":
				c.Service = val
			case "STATUS":
				c.Status = val
			case "PORTS":
				c.Ports = val
			case "STATE":
				c.State = val
			}
		}
		if c.Name == "" {
			continue
		}
		if c.State == "" {
			c.State = parseComposeState(c.Status)
		}
		rows = append(rows, c)
	}
	return rows
}

var composeColRe = regexp.MustCompile(`\S+`)

// pickField 取第 idx 列（越界返回空串）
func pickField(f []string, idx int) string {
	if idx < len(f) {
		return f[idx]
	}
	return ""
}

func parseComposeState(status string) string {
	s := strings.ToLower(status)
	switch {
	case strings.HasPrefix(s, "up"):
		return "running"
	case strings.HasPrefix(s, "exited"):
		return "exited"
	case strings.HasPrefix(s, "restarting"):
		return "restarting"
	case strings.HasPrefix(s, "created"):
		return "created"
	case strings.HasPrefix(s, "paused"):
		return "paused"
	case strings.HasPrefix(s, "dead"):
		return "dead"
	default:
		return "unknown"
	}
}

// handleDockerAction 分发 Docker 相关动作
func handleDockerAction(action string, data map[string]any) map[string]any {
	if data == nil {
		data = map[string]any{}
	}
	switch action {
	case "docker_status":
		return dockerStatus(data)
	case "docker_ps":
		return dockerPs(data)
	case "docker_logs":
		return dockerLogs(data)
	case "docker_stats":
		return dockerStats(data)
	case "docker_action":
		return dockerAction(data)
	case "docker_remove":
		return dockerRemove(data)
	case "docker_images":
		return dockerImages(data)
	case "docker_pull":
		return dockerPull(data)
	case "docker_image_rm":
		return dockerImageRemove(data)
	case "docker_prune":
		return dockerPrune(data)
	case "docker_compose":
		return dockerCompose(data)
	default:
		return map[string]any{"error": "unknown docker action", "action": action}
	}
}
