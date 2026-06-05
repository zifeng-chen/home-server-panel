# Home Server Panel - 家庭服务器运维管理面板

**版本**: v1.7.1 | **技术栈**: Node.js + Express + 原生 HTML/CSS/JS | **许可**: MIT

一个轻量级的家庭服务器运维管理面板，无需数据库，开箱即用。支持群晖 (Synology)、绿联 (UGREEN)、Linux/UNIX 系统。

---

## 📦 功能模块

| 模块 | 功能 | 状态 |
|------|------|------|
| 📊 **仪表盘** | 系统概览 (CPU/内存/负载/运行时长) | ✅ v1.0 |
| 📡 **DDNS 解析** | 阿里云 DNS 动态域名解析 | ✅ v1.2 |
| 🔒 **SSL 证书** | Let's Encrypt 自动申请/续期/管理 | ✅ v1.3 |
| 🌐 **Nginx 管理** | 安装检测/启停/重载/站点解析 | ✅ v1.4 |
| 🔄 **反向代理** | 类群晖 DSM Reverse Proxy | ✅ v1.5 |
| 🔌 **端口管理** | 端口扫描/状态检测/进程识别 | ✅ v1.5 |
| 📢 **通知推送** | PushPlus 微信通知 (DDNS变化/SSL到期/服务异常) | ✅ v1.5 |
| 📋 **操作日志** | API 请求日志/审计追踪 | ✅ v1.5 |
| ⏰ **定时任务** | DDNS 自动更新/SSL 自动续期 | ✅ v1.6 |
| 🔄 **进程管理** | PM2 进程列表/启停/重启/CPU/内存 | ✅ v1.7 |
| 🔐 **认证系统** | 双通道认证 (Cookie + x-auth-token) / bcryptjs | ✅ v1.1 |
| ⚙️ **系统设置** | 密钥配置/推送设置/模块开关 | ✅ v1.5 |

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
│   ├── server.js           # 入口文件 + 中间件配置
│   ├── routes/             # API 路由 (10个模块)
│   │   ├── auth.js         #   认证
│   │   ├── ddns.js         #   DDNS
│   │   ├── cert.js         #   SSL证书
│   │   ├── nginx.js        #   Nginx管理
│   │   ├── proxy.js        #   反向代理
│   │   ├── port.js         #   端口管理
│   │   ├── notify.js       #   通知推送
│   │   ├── log.js          #   操作日志
│   │   ├── cron.js         #   定时任务
│   │   ├── pm2.js          #   进程管理
│   │   └── system.js       #   系统信息
│   ├── services/           # 业务逻辑层 (10个服务)
│   │   ├── auth.js         #   JWT + Cookie 认证
│   │   ├── ddns-service.js #   阿里云 DNS API
│   │   ├── ssl-service.js  #   ACME 证书管理
│   │   ├── nginx-service.js#   Nginx 启停/配置解析
│   │   ├── proxy-service.js#   反向代理规则
│   │   ├── port-service.js #   lsof/netstat 端口扫描
│   │   ├── notify-service.js#  PushPlus API
│   │   ├── log-service.js  #   请求日志中间件
│   │   ├── cron-service.js #   定时任务调度
│   │   └── pm2-service.js  #   PM2 CLI 封装
│   └── utils/
├── public/                 # 前端 (原生 HTML/CSS/JS)
│   ├── index.html          #   SPA 入口
│   ├── css/style.css       #   暗色主题样式
│   └── js/
│       ├── api.js          #   API 通信 + 认证拦截
│       ├── utils.js        #   工具函数
│       ├── app.js          #   应用入口 + 路由
│       └── pages/          #   11个页面模块
│           ├── dashboard.js
│           ├── ddns.js
│           ├── cert.js
│           ├── nginx.js
│           ├── proxy.js
│           ├── port.js
│           ├── log.js
│           ├── cron.js
│           ├── pm2.js
│           └── settings.js
├── data/                   # 持久化数据 (JSON)
├── logs/                   # 服务日志
├── .env.example            # 环境变量模板
├── CHANGELOG.md            # 更新日志
├── TASKS.md                # 开发任务
└── deploy.exp              # 自动部署脚本
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
| GET  | `/api/system/config` | 配置(脱敏) |
| GET  | `/api/ddns` | DDNS 记录列表 |
| POST | `/api/ddns/update` | 手动更新 DDNS |
| GET  | `/api/cert` | SSL 证书列表 |
| POST | `/api/cert/issue` | 申请证书 |
| POST | `/api/cert/renew` | 续期证书 |
| GET  | `/api/nginx` | Nginx 状态 |
| POST | `/api/nginx/start` | 启动 Nginx |
| POST | `/api/nginx/stop` | 停止 Nginx |
| POST | `/api/nginx/reload` | 重载配置 |
| GET  | `/api/nginx/sites` | 站点列表 |
| GET  | `/api/nginx/logs` | Nginx 日志 |
| GET  | `/api/proxy` | 代理规则列表 |
| POST | `/api/proxy` | 添加规则 |
| DELETE | `/api/proxy/:id` | 删除规则 |
| GET  | `/api/port` | 端口扫描 |
| GET  | `/api/notify` | 通知状态 |
| POST | `/api/notify/test` | 测试推送 |
| GET  | `/api/log` | 操作日志 |
| GET  | `/api/cron` | 定时任务 |
| GET  | `/api/pm2` | PM2 进程列表 |
| POST | `/api/pm2/:name/restart` | 重启进程 |
| POST | `/api/pm2/:name/stop` | 停止进程 |
| POST | `/api/pm2/:name/start` | 启动进程 |
| DELETE | `/api/pm2/:name` | 删除进程 |

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

## 🛠️ 部署到 NAS

```bash
# 一键部署 (需要 SSH 访问)
expect deploy.exp

# 或手动部署
cd /volume4/Individual\ Sport
curl -sLO http://<MAC_IP>:8899/hsp-latest.tar.gz
tar -xzf hsp-latest.tar.gz
cd home-server-panel && npm install
node src/server.js &
```

---

## 📝 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v1.11.0 | 2026-06-05 | 操作日志审计+SSL证书多格式导出+MySQL双模式存储 |
| v1.10.0 | 2026-06-04 | 引导安装页+全局错误弹窗+Nginx左右分栏+五项UI优化 |
| v1.9.0 | 2026-06-04 | DDNS IPv6支持+Nginx与反向代理合并为一个页面 |
| v1.8.7 | 2026-06-03 | BUILD_ID缓存爆破+端口TCP/UDP全扫描+诊断栏可折叠 |
| v1.8.5 | 2026-06-02 | Dashboard MIME修复+Web SSH终端+acme.sh SSE安装 |
| v1.8.2 | 2026-06-01 | Docker容器管理+PM2安装引导+Docker Stats批量获取 |
| v1.8.0 | 2026-06-01 | Nginx SSE一键安装+Nginx配置测试修复 |
| v1.7.1 | 2026-05-31 | API根路由修复+进程名转义+系统信息完善 |
| v1.7.0 | 2026-05-31 | PM2进程管理模块 |
| v1.6.1 | 2026-05-30 | Dashboard诊断+API加载提示 |
| v1.6.0 | 2026-05-30 | 反向代理完整功能 |
| v1.5.0 | 2026-05-30 | 多模块完善 (Nginx/Proxy/Port/Notify/Log/Cron) |
| v1.4.0 | 2026-05-29 | Nginx管理+DDNS/SSL页面 |
| v1.3.0 | 2026-05-29 | SSL证书服务 |
| v1.2.0 | 2026-05-29 | DDNS功能实现 |
| v1.1.0 | 2026-05-29 | 认证系统+SPA框架 |
| v1.0.0 | 2026-05-28 | 项目骨架 |

---

## 🤝 贡献

Issues 和 PR 欢迎提交。

## 📄 许可

MIT License