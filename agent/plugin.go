package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// PluginResult is the output of a plugin execution
type PluginResult struct {
	Success  bool   `json:"success"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	Duration int64  `json:"duration_ms"`
}

// PluginManifest describes a plugin capability
type PluginManifest struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Command     string `json:"command"`
	Timeout     int    `json:"timeout_s"`
}

var defaultPlugins = map[string]PluginManifest{
	"ping": {
		Name:    "ping",
		Version: "1.0",
		Description: "Ping 延迟检测",
		Command: "ping -c 3 {target}",
		Timeout: 10,
	},
	"uptime": {
		Name:    "uptime",
		Version: "1.0",
		Description: "设备运行时间",
		Command: "uptime",
		Timeout: 5,
	},
	"df": {
		Name:    "df",
		Version: "1.0",
		Description: "磁盘使用情况",
		Command: "df -h",
		Timeout: 5,
	},
	"free": {
		Name:    "free",
		Version: "1.0",
		Description: "内存使用情况",
		Command: "free -m 2>/dev/null || vm_stat",
		Timeout: 5,
	},
	"top": {
		Name:    "top",
		Version: "1.0",
		Description: "进程负载 top 5",
		Command: "ps -eo pid,pcpu,pmem,args --sort=-pcpu 2>/dev/null | head -6 || ps aux | sort -rnk 3 | head -6",
		Timeout: 5,
	},
	"who": {
		Name:    "who",
		Version: "1.0",
		Description: "当前登录用户",
		Command: "who 2>/dev/null || w",
		Timeout: 5,
	},
}

// ListPlugins returns all available plugins
func ListPlugins() []PluginManifest {
	var list []PluginManifest
	for _, p := range defaultPlugins {
		list = append(list, p)
	}
	return list
}

func runPlugin(name string, data map[string]any) map[string]any {
	manifest, ok := defaultPlugins[name]
	if !ok {
		return map[string]any{"error": "plugin not found", "plugin": name}
	}

	cmdStr := manifest.Command
	
	// 替换模板变量
	if data != nil {
		for k, v := range data {
			repl := fmt.Sprintf("%v", v)
			cmdStr = strings.ReplaceAll(cmdStr, "{"+k+"}", repl)
		}
	}

	start := time.Now()
	
	// 构建命令（使用 sh -c 执行管道）
	var cmd *exec.Cmd
	if strings.Contains(cmdStr, "|") || strings.Contains(cmdStr, ";") || strings.Contains(cmdStr, "||") {
		cmd = exec.Command("sh", "-c", cmdStr)
	} else {
		parts := strings.Fields(cmdStr)
		cmd = exec.Command(parts[0], parts[1:]...)
	}

	stdout, err := cmd.Output()
	duration := time.Since(start).Milliseconds()

	result := PluginResult{
		Success:  true,
		ExitCode: 0,
		Stdout:   string(stdout),
		Duration: duration,
	}

	if err != nil {
		result.Success = false
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			result.Stderr = string(exitErr.Stderr)
		} else {
			result.ExitCode = -1
			result.Stderr = err.Error()
		}
	}

	// Return as generic map
	resultMap, _ := json.Marshal(result)
	var out map[string]any
	json.Unmarshal(resultMap, &out)
	return out
}
