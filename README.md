# Home Server Panel - 家庭服务器运维管理面板

**版本**: v1.13.1 | **技术栈**: Node.js + Express + SQLite + 原生 HTML/CSS/JS | **许可**: MIT

轻量级家庭服务器运维管理面板，支持 SQLite/MySQL 双模式存储。支持群晖 (Synology)、绿联 (UGREEN)、iStoreOS、Linux/UNIX 系统。

> 🎯 **亮点**: Web SSH 终端 · Docker 管理 · DDNS v4/v6 · SSL 证书导出 · 操作日志 · MySQL/SQLite · 反向代理 · Nginx 管理

---

## 📦 功能模块

| 模块 | 功能 | 状态 |
|------|------|------|
| 📊 **仪表盘** | 系统概览 (卡片点击跳转) | ✅ v1.12 |
| 📡 **DDNS 解析** | 阿里云 DNS (IPv4/IPv6/批量/推送) | ✅ v1.12 |
| 🔒 **SSL 证书** | Let's Encrypt (申请/续期/导出/到期通知) | ✅ v1.12 |
| 🌐 **Nginx 管理** | 安装/启停/重载/SSE 进度/日志 | ✅ v1.8 |
| 🔄 **反向代理** | 群晖风格 Nginx Reverse Proxy | ✅ v1.5 |
| 🔌 **端口管理** | TCP+UDP 全状态扫描 | ✅ v1.8 |
| 📢 **通知推送** | PushPlus 微信通知 | ✅ v1.5 |
| 📋 **操作日志** | 按模块查询/审计追踪 | ✅ v1.11 |
| ⏰ **定时任务** | DDNS 自动更新/SSL 自动续期 | ✅ v1.6 |
| 🔄 **进程管理** | PM2 进程列表/启停/安装引导 | ✅ v1.7 |
| 🐳 **Docker 管理** | 容器/镜像/Stats/日志 | ✅ v1.8 |
| 💻 **Web SSH** | xterm.js 浏览器终端 | ✅ v1.8 |
| 🗄️ **数据存储** | SQLite 本地 / MySQL 远程双模式 | ✅ v1.12 |
| 🔐 **认证系统** | Cookie + Token 双通道 / bcryptjs | ✅ v1.1 |
| ⚙️ **系统设置** | 配置/数据库/导入导出/诊断 | ✅ v1.12 |

---

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际配置 (阿里云密钥等)

# 启动服务
node src/server.js

# 或使用 PM2 守护
pm2 start src/server.js --name home-panel
```

访问: **http://localhost:3456**  
默认账号: `admin` / `admin123`

---

## 🐳 Docker Compose 部署

```yaml
version: '3'
services:
  home-panel:
    image: node:20-alpine
    container_name: home-panel
    ports:
      - "3456:3456"
    volumes:
      - ./:/app
      - /var/run/docker.sock:/var/run/docker.sock  # Docker 管理 (规划)
      - /etc/nginx:/etc/nginx:ro  # Nginx 配置读取
    working_dir: /app
    command: node src/server.js
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - .env
```

---

## 🔧 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `ALIYUN_ACCESS_KEY_ID` | 阿里云 AccessKey ID | DDNS + SSL |
| `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | DDNS + SSL |
| `DDNS_DOMAINS` | 需要 DDNS 的域名 (逗号分隔) | DDNS |
| `DDNS_NETWORK_INTERFACE` | 公网出口网卡 (默认 eth0) | DDNS |
| `ACME_EMAIL` | Let's Encrypt 联系邮箱 | SSL |
| `ACME_DNS_PROVIDER` | ACME DNS 提供商 (默认 alidns) | SSL |
| `SSL_CERT_DIR` | SSL 证书存储目录 | SSL |
| `NGINX_CONF_DIR` | Nginx 配置目录 | Nginx |
| `PUSHPLUS_TOKEN` | PushPlus 推送 Token | 通知 |
| `SERVER_PORT` | 面板监听端口 (默认 3456) | 否 |
| `SERVER_HOST` | 面板监听地址 (默认 0.0.0.0) | 否 |
| `LOG_LEVEL` | 日志级别 (debug/info/warn/error) | 否 |

---

## 📁 目录结构

```
home-server-panel/
├── src/
│   ├── server.js           # 入口文件 + 中间件
│   ├── routes/             # API 路由 (15个)
│   │   ├── auth.js, ddns.js, cert.js, nginx.js, proxy.js
│   │   ├── port.js, notify.js, log.js, cron.js, pm2.js
│   │   ├── docker.js, ssh.js, system.js, setup.js, db.js
│   ├── services/           # 业务逻辑层 (15个)
│   │   ├── sqlite-service.js#  SQLite 数据库引擎
│   │   ├── ddns-service.js #  阿里云 DNS (A+AAAA)
│   │   ├── ssl-service.js  #  ACME 证书管理
│   │   ├── nginx-service.js#  Nginx 启停/配置
│   │   ├── proxy-service.js#  反向代理规则
│   │   ├── docker-service.js#  Docker API 封装
│   │   ├── ssh-service.js  #  SSH2 + WebSocket
│   │   ├── db-service.js   #  MySQL 连接池
│   │   └── ...
├── public/                 # 前端 SPA
│   ├── index.html, install.html, login.html
│   ├── css/style.css
│   └── js/api.js, utils.js, app.js, pages/*.js
├── data/                   # SQLite 数据库文件
├── .env.example
├── CHANGELOG.md, README.md
```

---

## 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/change-password` | 修改密码 |
| GET  | `/api/system/info` | 系统信息 |
| GET  | `/api/system/uptime` | 运行时长 |
| GET  | `/api/ddns` | DDNS 记录列表 |
| POST | `/api/ddns/record` | 添加记录 |
| PUT  | `/api/ddns/record/:id` | 编辑记录 |
| POST | `/api/ddns/record/:id/toggle` | 启停记录 |
| DELETE | `/api/ddns/record/:id` | 删除记录(本地) |
| POST | `/api/ddns/batch-update` | 批量更新 |
| GET  | `/api/cert` | SSL 证书列表 |
| POST | `/api/cert/issue` | 申请证书 |
| GET  | `/api/cert/issue/stream` | 申请进度 (SSE) |
| POST | `/api/cert/renew` | 续期证书 |
| DELETE | `/api/cert/:domain` | 删除证书(含文件) |
| GET  | `/api/cert/export/:domain` | 导出证书 |
| GET  | `/api/nginx` | Nginx 状态 |
| POST | `/api/nginx/start` | 启动 Nginx |
| POST | `/api/nginx/stop` | 停止 Nginx |
| POST | `/api/nginx/reload` | 重载 |
| POST | `/api/nginx/config-test` | 配置测试 |
| GET  | `/api/nginx/sites` | 站点列表 |
| GET  | `/api/nginx/logs` | 日志 |
| GET  | `/api/nginx/sse-install` | 安装进度 (SSE) |
| GET  | `/api/proxy` | 代理规则 |
| POST | `/api/proxy` | 添加规则 |
| PUT  | `/api/proxy/:id` | 编辑规则 |
| DELETE | `/api/proxy/:id` | 删除规则 |
| GET  | `/api/port` | 端口扫描 |
| GET  | `/api/log` | 操作日志 |
| GET  | `/api/pm2` | PM2 进程 |
| GET  | `/api/docker/containers` | Docker 容器 |
| POST | `/api/setup/install` | 引导安装 |
| GET  | `/api/db/status` | 数据库状态 |
| POST | `/api/db/migrate` | 数据迁移 |
| POST | `/api/db/import` | 导入数据 |
| GET  | `/api/db/export` | 导出数据 |
| GET  | `/api/db/settings` | 获取存储设置 |
| PUT  | `/api/db/settings` | 更新存储设置 |

---

## 📅 开发路线图

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| 🚀 **Phase 11** | Nginx 一键安装 + SSE 进度追踪 | ✅ v1.8 |
| 🚀 **Phase 12** | Docker 容器管理面板 | ✅ v1.8 |
| 🚀 **Phase 13** | Web SSH 终端 (xterm.js) | ✅ v1.8 |
| 🚀 **Phase 14** | DDNS IPv6 + Nginx/Proxy 合并 | ✅ v1.9 |
| 🚀 **Phase 15** | 引导安装页 + 系统优化 | ✅ v1.10 |
| 🚀 **Phase 16** | 操作日志升级 + SSL证书导出 + MySQL存储 | ✅ v1.11 |
| 🚀 **Phase 17** | 系统监控图表 (CPU/内存/磁盘/网络) | 🟡 中 |
| 🚀 **Phase 18** | 文件管理器 | 🟡 中 |
| 🚀 **Phase 19** | 反向代理 HTTPS + 自动续期 | 🟡 中 |
| 🚀 **Phase 20** | 备份与恢复 (配置/数据/数据库) | 🟢 低 |
| 🚀 **Phase 21** | 移动端适配 + PWA | 🟢 低 |

---

## 🛠️ 部署 (iStoreOS / Linux)

```bash
# 克隆项目
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel && npm install

# 配置环境
cp .env.example .env && vim .env

# 启动 (PM2 推荐)
pm2 start src/server.js --name home-panel
pm2 save && pm2 startup
```

访问: http://服务器IP:3456 | 默认: admin / admin123

---

## 📝 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v1.13.1 | 2026-06-09 | MySQL安装引导修复+反向代理自动部署+iStoreOS BusyBox兼容 |
| v1.12.0 | 2026-06-07 | SQLite全量迁移+安全加固(限速/路径遍历/安全头)+设置页增强 |
| v1.11.0 | 2026-06-05 | 操作日志审计+SSL证书多格式导出+MySQL双模式存储 |
| v1.10.0 | 2026-06-04 | 引导安装页+全局错误弹窗+Nginx左右分栏+五项UI优化 |
| v1.9.0 | 2026-06-04 | DDNS IPv6支持+Nginx与反向代理合并为一个页面 |
| v1.8.7 | 2026-06-03 | BUILD_ID缓存爆破+端口TCP/UDP全扫描+诊断栏可折叠 |
| v1.8.4 | 2026-06-02 | Web SSH终端(xterm.js+SSH2)+Docker Stats批量优化 |
| v1.8.2 | 2026-06-01 | Docker容器管理+PM2安装引导 |
| v1.8.0 | 2026-06-01 | Nginx SSE一键安装+acme.sh管理 |
| v1.7.0 | 2026-05-31 | PM2进程管理模块 |
| v1.6.1 | 2026-05-31 | Dashboard诊断修复+GitHub推送部署 |
| v1.5.0 | 2026-05-30 | 端口管理+PushPlus通知 |
| v1.3.0 | 2026-05-31 | 反向代理引擎+Nginx管理 |
| v1.2.0 | 2026-05-30 | SSL证书管理 |
| v1.1.0 | 2026-05-30 | DDNS域名解析 |
| v1.0.1 | 2026-05-30 | SPA fallback修复 |
| v1.0.0 | 2026-05-28 | 项目骨架 |

---

## 🤝 贡献

Issues 和 PR 欢迎提交。

## 📄 许可

MIT License