# 设备 Agent

HSP Agent 是一个零依赖的单文件程序，安装在被管理设备上，自动完成注册、心跳、指标采集和远程命令执行。

---

## 是什么 & 怎么用

装好 Agent 之后，设备会自动出现在 HSP 面板的「设备中心」里。你能看到：

- 设备在线/离线状态
- 实时 CPU、内存、磁盘、网络流量
- 设备基本信息（操作系统、架构、运行时间）

还可以通过面板向设备发送命令：获取系统信息、Ping 测试、查看进程等。

---

## 在哪下载

预编译的二进制文件在 `agent/release/` 目录下：

| 文件名 | 设备类型 |
|--------|----------|
| `hsp-agent-linux-amd64` | x86_64 Linux（iStoreOS、群晖 x86、VPS） |
| `hsp-agent-linux-arm64` | ARM64 Linux（树莓派 4B+、ARM NAS） |
| `hsp-agent-darwin-arm64` | Apple Silicon Mac（M1/M2/M3） |

拿到文件后放到设备的 `/usr/local/bin/` 下就行。

---

## 参数说明

只有三个参数，且都有默认值：

```
hsp-agent -server HSP面板地址 -name "显示名称" -secret 密钥
```

| 参数 | 作用 | 不填会怎样 |
|------|------|------------|
| `-server` | HSP 面板的地址 | 默认 `http://192.168.100.1:3456`，内网用这个就行 |
| `-name` | 在面板上显示的名字 | 自动取设备的系统名称 |
| `-secret` | 设备的认证密钥 | 自动生成，不需要费心 |

**最常见的用法**：只需要指定 HSP 地址：

```bash
hsp-agent -server http://192.168.100.1:3456
```

👉 如果你想把家里的路由器装 Agent，复制这行命令，把地址换成你 HSP 面板的地址，在路由器终端执行，就完成了。

---

## 自启动（开机自动运行）

Agent 关机会掉，需要配一下自启动，才能在设备重启后自动恢复。

### Linux 设备（路由器 / NAS / VPS）

```bash
# ① 创建自启动配置（把 HSP 面板地址改一下）
sudo tee /etc/systemd/system/hsp-agent.service << 'EOF'
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

# ② 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable hsp-agent
sudo systemctl start hsp-agent

# ③ 检查是否在运行
systemctl status hsp-agent
```

### macOS 设备（Mac）

```bash
# ① 创建自启动配置（把 HSP 地址换成你的）
cat > ~/Library/LaunchAgents/com.hsp.agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.hsp.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/hsp-agent</string>
        <string>-server</string><string>http://192.168.100.1:3456</string>
    </array>
    <key>KeepAlive</key><true/>
    <key>RunAtLoad</key><true/>
</dict></plist>
EOF

# ② 加载
launchctl load ~/Library/LaunchAgents/com.hsp.agent.plist
```

---

## 工作原理

```
你的设备                   HSP 面板
   │                         │
   ├─ 启动时 ──────────────→ 自动注册
   ├─ 每 30 秒 ────────────→ 心跳包（保持在线）
   ├─ 每 60 秒 ────────────→ 指标上报（CPU/内存/磁盘）
   └─ 常驻连接 ←── WebSocket ──→ 接收远程命令
```

全程加密认证，Agent 自动生成密钥，无需手动配置。

---

## 故障排查

**"设备中心没有我的设备"**

在设备上执行：
```bash
curl http://192.168.100.1:3456/api/system/uptime
```
如果不通，说明设备和 HSP 面板网络不通，检查 IP 和防火墙。

**"Agent 启动报错"**

Agent 是 Go 编译的单文件，不需要任何运行环境依赖。如果提示 `Permission denied`，执行：
```bash
chmod +x /usr/local/bin/hsp-agent
```

---

> 部署步骤回到 [安装部署文档](INSTALL.md)
