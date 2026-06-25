# 安装部署

## 服务端部署

### 前置条件

- Node.js ≥ 18
- curl（用于安装 acme.sh）
- （可选）Nginx、Docker、PM2 — 按需安装

### 快速开始

```bash
# 1. 克隆
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel

# 2. 安装依赖
npm install
cd client && npm install && cd ..

# 3. 构建前端
npm run build
# 输出: client/dist/ (Vue SPA) + public/js/bundle.js (兼容旧页面)

# 4. 启动
node src/server.js

# 5. 访问
# 浏览器打开 http://localhost:3456
# 默认账号: admin / admin123
```

### 配置 MySQL（可选）

默认使用 SQLite，无需额外配置。如需 MySQL 远程存储，在 `.env` 中设置：

```bash
DB_MODE=mysql
DB_HOST=192.168.100.110
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=home_server_panel
```

不配置则自动使用 SQLite，MySQL 不可达时自动回退，不影响使用。

### iStoreOS / OpenWRT 部署

```bash
# 1. 安装 Node.js
opkg update && opkg install node

# 2. 创建目录
mkdir -p /opt/home-server-panel

# 3. 上传构建产物并解压
# （将 Mac 上的构建产物 scp 到路由器）
tar xzf hsp.tar.gz -C /opt/home-server-panel
cd /opt/home-server-panel && npm install --production

# 4. 启动
nohup node src/server.js > /tmp/hsp.log 2>&1 &
```

### 群晖 DSM 部署

```bash
# 群晖需先安装 Node.js 套件（套件中心 → Node.js v18/v20）
# 后续步骤同上，建议使用 PM2：
npm install -g pm2
pm2 start src/server.js --name hsp
pm2 save && pm2 startup
```

---

## 设备 Agent 安装

Agent 是一个独立的小程序，安装在需要被 HSP 管理的设备上，自动注册、上报指标、接收命令。

> 完整说明见 [设备 Agent 文档](AGENT.md)

### 三步启动

以下以 Linux 设备为例。macOS 同理，把文件名换成 `hsp-agent-darwin-arm64`。

```bash
# ① 下载（选择你设备的架构）
# Linux x86_64 → hsp-agent-linux-amd64
# Linux ARM64  → hsp-agent-linux-arm64
# Mac M系列    → hsp-agent-darwin-arm64
wget http://你的HSP地址:3456/agent/hsp-agent-linux-amd64 -O /usr/local/bin/hsp-agent

# ② 加执行权限
chmod +x /usr/local/bin/hsp-agent

# ③ 启动（把地址换成 HSP 面板的实际地址）
hsp-agent -server http://192.168.100.1:3456
```

启动后，Agent 会自动注册到 HSP 面板的「设备中心」。无需手动配置密钥或名称 —— Agent 会自动生成。

### 让 Agent 开机自启

**Linux (systemd)**：
```bash
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

sudo systemctl daemon-reload
sudo systemctl enable hsp-agent
sudo systemctl start hsp-agent
```

**macOS (launchd)**：
```bash
# 把 HSP_SERVER 换成实际地址
HSP_SERVER="http://192.168.100.1:3456"
cat > ~/Library/LaunchAgents/com.hsp.agent.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.hsp.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/hsp-agent</string>
        <string>-server</string><string>${HSP_SERVER}</string>
    </array>
    <key>KeepAlive</key><true/>
    <key>RunAtLoad</key><true/>
</dict></plist>
EOF

launchctl load ~/Library/LaunchAgents/com.hsp.agent.plist
```

### 常见问题

**Q:** Agent 启动后设备中心看不到？  
**A:** 确认 `-server` 地址可通（在设备上 `curl http://192.168.100.1:3456/api/system/uptime` 测试）

**Q:** 下载地址从哪来？  
**A:** HSP 面板没有内置文件下载服务，当前阶段将二进制文件手动传到设备。`agent/release/` 目录下有预编译版本。

**Q:** 我需要在 Agent 端装什么依赖？  
**A:** 零依赖。Agent 是 Go 编译的单文件，直接运行。
