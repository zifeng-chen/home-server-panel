package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"time"
	"flag"
	"strings"

	"github.com/gorilla/websocket"
)

// ============================================================
// HSP Agent V2.0 - 轻量设备代理
// 用法: ./hsp-agent -server http://192.168.100.1:3456 -secret mykey
// 编译: GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o hsp-agent
// ============================================================

var (
	serverURL string
	deviceSecret string
	deviceID   string
	deviceName string
	hostIP     string

	httpClient = &http.Client{Timeout: 15 * time.Second}
	agentVersion = "2.0.0"
)

func main() {
	// 参数
	flag.StringVar(&serverURL, "server", "http://192.168.100.1:3456", "HSP 服务端地址")
	flag.StringVar(&deviceSecret, "secret", "", "设备密钥(为空则自动生成)")
	flag.StringVar(&deviceName, "name", "", "设备名称(为空则用 hostname)")
	flag.Parse()

	// 设备标识
	deviceID = getDeviceID()
	if deviceName == "" {
		hostname, _ := os.Hostname()
		deviceName = hostname
	}
	if deviceSecret == "" {
		deviceSecret = generateSecret(deviceID)
	}
	hostIP = getLocalIP()

	log.SetFlags(log.Ltime)
	log.Printf("🚀 HSP Agent %s (go%s/%s)", agentVersion, runtime.Version()[2:], runtime.GOARCH)
	log.Printf("   设备ID: %s  名称: %s  IP: %s", deviceID, deviceName, hostIP)
	log.Printf("   服务端: %s", serverURL)

	// 注册
	if !register() {
		log.Fatal("❌ 注册失败,退出")
	}
	log.Println("✅ 注册成功")

	// 启动 heartbeat
	go heartbeatLoop(30 * time.Second)

	// 启动指标采集
	go metricsLoop(60 * time.Second)

	// WebSocket 长连接(命令通道)
	go wsLoop()

	// 优雅退出
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	ticker := time.NewTicker(30 * time.Minute)
	for {
		select {
		case <-sig:
			log.Println("🛑 收到中断信号,退出...")
			offlineReport()
			return
		case <-ticker.C:
			log.Printf("💚 运行中 - 指标(%d) heartbeat(每30s) ws(%s)",
				metricCount, wsStatus())
		}
	}
}

func getDeviceID() string {
	hostname, _ := os.Hostname()
	// 跨平台唯一设备标识:hostname + runtime 架构
	return fmt.Sprintf("agent_%s_%s", hostname, runtime.GOARCH)
}

func generateSecret(base string) string {
	h := sha256.Sum256([]byte(base + "_hsp_v2_" + runtime.GOOS))
	return fmt.Sprintf("%x", h)[:16]
}

func getLocalIP() string {
	// 遍历网络接口，优先取非回环 IPv4
	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				if ipnet, ok := addr.(*net.IPNet); ok && ipnet.IP.To4() != nil && !ipnet.IP.IsLoopback() {
					return ipnet.IP.String()
				}
			}
		}
	}
	// Fallback: hostname lookup
	hostname, _ := os.Hostname()
	addrs, err := net.LookupHost(hostname)
	if err != nil || len(addrs) == 0 {
		return "0.0.0.0"
	}
	for _, addr := range addrs {
		if !strings.Contains(addr, ":") && addr != "127.0.0.1" && !strings.HasPrefix(addr, "127.") {
			return addr
		}
	}
	return addrs[0]
}

// ============ REST API ============

func apiPost(path string, body any) (map[string]any, error) {
	data, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", serverURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-device-id", deviceID)
	req.Header.Set("x-device-secret", deviceSecret)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respData, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(respData, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w (body: %.100s)", err, string(respData))
	}
	return result, nil
}

func register() bool {
	body := map[string]any{
		"deviceId": deviceID,
		"secret":    deviceSecret,
		"name":      deviceName,
		"ip":        hostIP,
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
		"version":   agentVersion,
		"hostname":  deviceName,
	}
	
	for i := 0; i < 3; i++ {
		result, err := apiPost("/api/v2/device/register", body)
		if err != nil {
			log.Printf("⚠️ 注册尝试 %d/3: %v", i+1, err)
			time.Sleep(3 * time.Second)
			continue
		}
		success, _ := result["success"].(bool)
		if success {
			return true
		}
		log.Printf("⚠️ 注册尝试 %d/3: 返回非 success → %v", i+1, result)
		time.Sleep(3 * time.Second)
	}
	return false
}

var heartbeatFailures int

func heartbeatLoop(interval time.Duration) {
	body := map[string]any{
		"device_id": deviceID,
		"secret":    deviceSecret,
		"status":    "online",
	}
	for {
		time.Sleep(interval)
		result, err := apiPost("/api/v2/device/heartbeat", body)
		if err != nil {
			heartbeatFailures++
			if heartbeatFailures <= 3 {
				log.Printf("⚠️ 心跳失败 (%d): %v", heartbeatFailures, err)
			}
			if heartbeatFailures > 10 {
				log.Println("❌ 心跳连续失败超过10次,重新注册...")
				if !register() {
					log.Fatal("❌ 重注册失败")
				}
				heartbeatFailures = 0
			}
			continue
		}
		if heartbeatFailures > 0 {
			log.Printf("✅ 心跳恢复")
		}
		heartbeatFailures = 0
		_ = result
	}
}

func offlineReport() {
	body := map[string]any{
		"device_id": deviceID,
		"secret":    deviceSecret,
		"status":    "offline",
	}
	apiPost("/api/v2/device/heartbeat", body)
	log.Println("📡 已报告离线")
}

var metricCount int

func metricsLoop(interval time.Duration) {
	time.Sleep(5 * time.Second) // 首次延迟
	for {
		metrics := collectMetrics()
		result, err := apiPost("/api/v2/device/report", map[string]any{
			"deviceId": deviceID,
			"secret":    deviceSecret,
			"metrics":   metrics,
		})
		if err != nil {
			log.Printf("⚠️ 指标上报失败: %v", err)
		} else {
			metricCount++
			if metricCount <= 3 || metricCount%30 == 0 {
				success, _ := result["success"].(bool)
				if success {
					log.Printf("📊 指标#%d 已上报", metricCount)
				}
			}
		}
		time.Sleep(interval)
	}
}

func collectMetrics() map[string]any {
	m := MetricsSnapshot()
	return map[string]any{
		"cpu": m.CPU,
		"memory": map[string]any{
			"total": m.MemoryTotal / 1024 / 1024, // MB
			"used":  m.MemoryUsed / 1024 / 1024,
			"pct":  m.MemoryPct,
		},
		"disk": map[string]any{
			"total": m.DiskTotal / 1024 / 1024, // MB
			"used":  m.DiskUsed / 1024 / 1024,
			"pct":   m.DiskPct,
		},
		"net": map[string]any{
			"rx": m.NetRx,
			"tx": m.NetTx,
		},
		"uptime": m.Uptime,
		"load":   []float64{m.Load1m},
	}
}

// ============ WebSocket ============

var (
	wsConn   *websocket.Conn
	wsStatus = func() string {
		if wsConn != nil { return "connected" }
		return "disconnected"
	}
)

func wsLoop() {
	url := strings.Replace(strings.Replace(serverURL, "http://", "ws://", 1), "https://", "wss://", 1)
	url += "/api/v2/device/ws"

	headers := http.Header{}
	headers.Set("x-device-id", deviceID)
	headers.Set("x-device-secret", deviceSecret)

	retryDelay := 1 * time.Minute
	for {
		var err error
		d := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
		wsConn, _, err = d.Dial(url, headers)
		if err != nil {
			log.Printf("⚠️ WS 连接失败: %v - %v 后重试", err, retryDelay)
			time.Sleep(retryDelay)
			retryDelay *= 2
			if retryDelay > 10*time.Minute {
				retryDelay = 10 * time.Minute
			}
			continue
		}
		retryDelay = 1 * time.Minute
		log.Println("🔌 WS 已连接")

		// 读取命令
		for {
			_, message, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("⚠️ WS 断开: %v", err)
				wsConn = nil
				break
			}
			handleCommand(message)
		}

		time.Sleep(retryDelay)
	}
}

func handleCommand(msg []byte) {
	var cmd Msg
	if err := json.Unmarshal(msg, &cmd); err != nil {
		log.Printf("⚠️ 命令解析失败: %v - %.100s", err, string(msg))
		return
	}

	log.Printf("📨 收到命令: %s → %s", cmd.Type, cmd.Action)

	// 执行命令
	result := executeCommand(cmd)

	// 回复结果
	reply := map[string]any{
		"type":      "cmd_result",
		"command_id":cmd.CommandID,
		"device_id": deviceID,
		"result":    result,
		"timestamp": time.Now().Unix(),
	}
	if wsConn != nil {
		data, _ := json.Marshal(reply)
		wsConn.WriteMessage(websocket.TextMessage, data)
	}
}

// ============ 命令路由 ============

type Msg struct {
	Type      string `json:"type"`
	Action    string `json:"action"`
	CommandID string `json:"command_id"`
	Plugin    string `json:"plugin"`
	Data      map[string]any `json:"data"`
}

func executeCommand(cmd Msg) map[string]any {
	switch cmd.Action {
	case "get_system":
		return getSystemInfo()
	case "get_metrics":
		return forceMetrics()
	case "run_plugin":
		return runPlugin(cmd.Plugin, cmd.Data)
	default:
		return map[string]any{"error": "unknown action", "action": cmd.Action}
	}
}

func getSystemInfo() map[string]any {
	m := MetricsSnapshot()
	return map[string]any{
		"hostname": deviceName,
		"device_id":deviceID,
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"version":  agentVersion,
		"ip":       hostIP,
		"cpu":      fmt.Sprintf("%.2f", m.CPU),
		"memory_pct":fmt.Sprintf("%.2f", m.MemoryPct),
		"disk_pct": fmt.Sprintf("%.2f", m.DiskPct),
		"uptime":   m.Uptime,
	}
}

func forceMetrics() map[string]any {
	return collectMetrics()
}
