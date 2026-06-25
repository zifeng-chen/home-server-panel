# HSP Agent — 设备代理程序

**版本**: v2.0.0 | **Go 1.24+**

轻量级跨平台设备代理，运行在需要被 HSP 管理的设备上。负责注册、心跳、指标采集和命令执行。

## 支持架构

| 架构 | 文件名 | 适用设备 |
|------|--------|----------|
| Linux amd64 | `hsp-agent-linux-amd64` | iStoreOS/x86_64 NAS/PC/服务器 |
| Linux arm64 | `hsp-agent-linux-arm64` | ARM64 NAS/树莓派 4B+ |
| macOS arm64 | `hsp-agent-darwin-arm64` | Apple Silicon Mac |

## 安装使用

### 1. 下载二进制文件

```bash
# 选择与设备架构匹配的版本
# Linux x86_64 (iStoreOS / 群晖 x86 / 大部分 VPS)
wget http://192.168.100.1:3456/agent/hsp-agent-linux-amd64 -O /usr/local/bin/hsp-agent

# Linux arm64 (树莓派 / ARM NAS)
wget http://192.168.100.1:3456/agent/hsp-agent-linux-arm64 -O /usr/local/bin/hsp-agent

# macOS Apple Silicon
curl -o /usr/local/bin/hsp-agent http://192.168.100.1:3456/agent/hsp-agent-darwin-arm64
```

### 2. 赋予执行权限

```bash
chmod +x /usr/local/bin/hsp-agent
```

### 3. 启动 Agent

```bash
# 基本用法（所有参数都有默认值）
hsp-agent -server http://192.168.100.1:3456

# 指定设备名称和密钥
hsp-agent -server http://192.168.100.1:3456 -name "我的NAS" -secret my-secret-key
```

### 4. 使用 systemd 守护（推荐 Linux）

```bash
cat > /etc/systemd/system/hsp-agent.service << 'EOF'
[Unit]
Description=HSP Device Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hsp-agent -server http://192.168.100.1:3456
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable hsp-agent
systemctl start hsp-agent
```

### 5. 使用 launchd 守护（macOS）

```bash
cat > ~/Library/LaunchAgents/com.hsp.agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hsp.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/hsp-agent</string>
        <string>-server</string>
        <string>http://192.168.100.1:3456</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.hsp.agent.plist
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-server` | HSP 服务端地址 | `http://192.168.100.1:3456` |
| `-secret` | 设备密钥（随机生成） | 自动生成 |
| `-name` | 设备名称 | 系统 hostname |

## 工作原理

```
┌────────────────────────────────────────────────┐
│  HSP Agent (Go)                                │
│                                                │
│  ① 启动 → HTTP POST /api/v2/device/register  │
│  ② 30s/次 → HTTP POST heartbeat              │
│  ③ 60s/次 → HTTP POST 指标上报 (CPU/内存/磁盘)│
│  ④ 常驻 → WebSocket /api/v2/device/ws        │
│     (接收命令: get_system/get_metrics/plugin)  │
└──────────────────┬─────────────────────────────┘
                   │ LAN / 互联网
                   ▼
┌────────────────────────────────────────────────┐
│  HSP Server (Node.js)                          │
│  设备中心: 在线状态 / 实时指标 / 远程命令      │
└────────────────────────────────────────────────┘
```

## 内置插件命令

| 命令 | 说明 |
|------|------|
| `ping` | Ping 延迟检测 |
| `uptime` | 设备运行时间 |
| `df` | 磁盘使用情况 |
| `free` | 内存使用情况 |
| `top` | TOP 5 进程 |
| `who` | 当前登录用户 |

## 从源码编译

```bash
cd agent
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o release/hsp-agent-linux-amd64
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o release/hsp-agent-linux-arm64
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o release/hsp-agent-darwin-arm64
```

## 安全模型

- 设备身份: `hostname + arch` 生成唯一 Device ID
- 认证方式: HTTP `x-device-id` + `x-device-secret` header
- 密钥生成: SHA256(deviceID + salt) 自动生成 16 位 hex
- WebSocket: 同 header 认证，心跳 + 命令通道
- 插件沙箱: 命令模板变量替换（`{target}` → 用户输入），超时硬限制
