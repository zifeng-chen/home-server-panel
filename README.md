# Home Server Panel — 家庭服务器运维管理面板

**版本**: v0.7.1-beta | **技术栈**: Node.js + Express + SQLite(SQL.js WASM) + MySQL + 原生 HTML/CSS/JS | **许可**: MIT

一款轻量级、零编译依赖的家庭服务器运维管理面板。支持 SQLite/MySQL 双模式持久化存储，兼容群晖 (Synology)、绿联 (UGREEN)、iStoreOS (OpenWRT)、Debian/Ubuntu 等 Linux 发行版，以及 macOS 开发环境。

> 🎯 **亮点**: Web SSH 终端 · Docker 容器管理 · DDNS IPv4/IPv6 · SSL 证书自动续期 · 反向代理一键部署 · 操作日志审计 · 系统监控图表 · 引导式安装

---

## 📦 功能模块

### 🏠 仪表盘
系统概览看板，显示 CPU、内存、磁盘、网络实时监控图表，快捷操作入口直达各模块。

### 📡 DDNS 动态解析
基于阿里云 DNS API 的 IPv4/IPv6 动态域名解析，支持 A/AAAA 双栈记录、批量操作（全选/启停/删除）、PushPlus 推送通知。

> **依赖**: 阿里云 AccessKey (AliyunDNSFullAccess 权限)

### 🔒 SSL 证书管理 (Let's Encrypt)
acme.sh 一键安装/卸载，ZeroSSL 注册，SSE 实时进度追踪。支持证书申请、续期、多格式导出 (cert/key/fullchain/ca/all)、90 天到期自动推送提醒、**自动续期**（每 24 小时检查，到期前 30 天自动续期）。

> **依赖**: curl + cron (acme.sh 自动安装)

### 🌐 Nginx 管理
Nginx 状态监控、启停、配置重载、配置测试（sudo NOPASSWD），安装/卸载 SSE 进度条，错误/访问日志实时查看（双标签页 + 一键复制）。

> **依赖**: Nginx 已安装，`/etc/sudoers.d/nginx` NOPASSWD 配置（一次性）

### 🔄 反向代理
CRUD 管理反向代理规则，支持 SSL + WebSocket 配置，500ms 防抖自动部署 Nginx 配置。群晖风格操作界面，规则预览。

### 🔌 端口管理
TCP+UDP 全协议端口扫描，含监听状态、进程名、PID 信息。iStoreOS 因 BusyBox 限制仅显示端口号。

### 📢 通知推送
PushPlus 微信推送集成，支持测试推送、DDNS 更新通知、SSL 到期提醒。

### 📋 操作日志
中间件自动记录所有 API 调用（高频 GET 静默），按模块/级别筛选，JSON/CSV 导出，MySQL/SQLite 双写持久化。

### ⏰ 定时任务
Cron 风格定时任务管理，DDNS 自动更新、SSL 证书定时续期。

### 🔄 PM2 进程管理
PM2 守护进程安装/卸载（SSE 进度），进程列表、启停、日志查看。iStoreOS 自动探测 PM2 安装路径，无 PM2 时提供 killall + nohup 备用方案。

### 🐳 Docker 管理
容器概览/详情/日志/Stats、镜像列表，批量 docker stats 异步采集避免阻塞事件循环，Docker API (unix socket) 直接调用。

### 💻 Web SSH 终端
xterm.js 浏览器终端，后端 SSH2 + WebSocket (Cookie 认证)，SSH 配置持久化存储（主机名/IP/端口/用户名/密码），3 分钟无操作自动断连 + 蒙层重连。

### 🗄️ 数据存储
SQLite (SQL.js WASM) 本地存储 + MySQL 远程双模式。运行时实时同步，启动时自动增量合并。所有模块 6 张 SQLite 表 + 9 张 MySQL 表完整持久化。

### 🔐 认证安全
bcryptjs 密码哈希 + Cookie/Token 双通道认证 + IP 速率限制（10 次/分钟 → 5 分钟冷却）+ 全局 API 限速（120/min）+ CSP/HSTS 安全头。

### ⚙️ 系统设置
阿里云密钥配置、PushPlus Token、Let's Encrypt 邮箱/DNS 提供商、数据库迁移（SQLite↔MySQL）、数据导入/导出、日志导出（JSON/CSV）、系统重启、重装向导。

---

## 🚀 安装部署

### 方法一：引导安装（推荐）

```bash
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel
npm install
node src/server.js
```

打开浏览器访问 `http://localhost:3456`，首次运行自动跳转引导安装页，三步完成数据库配置和管理员账号设置。

### 方法二：直接配置 .env

```bash
cp .env.example .env
# 编辑 .env 填入配置
node src/server.js
```

### 方法三：PM2 守护进程

```bash
npm install -g pm2
pm2 start src/server.js --name home-panel
pm2 save && pm2 startup
```

### 方法四：Docker Compose

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
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc/nginx:/etc/nginx:ro
    working_dir: /app
    command: node src/server.js
    restart: unless-stopped
    env_file:
      - .env
```

### 部署到 iStoreOS / OpenWRT

```bash
# 路由器上
opkg update && opkg install node
mkdir -p /opt && cd /opt
# 上传项目文件（scp 或 tar.gz）
tar xzf home-server-panel.tar.gz -C /opt/home-server-panel
cd /opt/home-server-panel && npm install --production
# 配置 .env，然后启动
nohup node src/server.js > /tmp/hsp.log 2>&1 &
```

---

## 🔧 依赖

### 运行时依赖 (npm)

| 包名 | 用途 |
|------|------|
| `express` ^5.1 | Web 框架 |
| `mysql2` ^3.14 | MySQL 连接池 |
| `sql.js` ^1.12 | SQLite WASM 引擎 |
| `bcryptjs` ^2.4 | 密码哈希 |
| `ws` ^8.18 | WebSocket (SSH 终端) |
| `ssh2` ^1.17 | SSH 客户端 |
| `dockerode` ^4.0 | Docker API |
| `node-schedule` ^2.1 | 定时任务 |
| `multer` ^2.0 | 文件上传 |

### 系统依赖

| 工具 | 用途 | 必装 |
|------|------|------|
| Node.js ≥ 18 | 运行时 | ✅ |
| curl | acme.sh 安装/API 调用 | ✅ |
| Nginx | Nginx 管理模块 | 可选 |
| Docker | Docker 管理模块 | 可选 |
| PM2 | 进程守护 | 可选 |

---

## 📋 环境变量

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `DB_MODE` | 存储模式 (`local` 或 `mysql`) | `local` | 否 |
| `ADMIN_USER` | 管理员用户名 | `admin` | 否 |
| `ADMIN_PASS` | 管理员密码 (bcrypt 哈希) | `admin123` | 否 |
| `SESSION_SECRET` | 会话加密密钥 | 随机生成 | 否 |
| `SERVER_PORT` | 面板监听端口 | `3456` | 否 |
| `LOG_LEVEL` | 日志级别 | `info` | 否 |
| **阿里云** | | | |
| `ALIYUN_ACCESS_KEY_ID` | 阿里云 AccessKey ID | 空 | DDNS/SSL |
| `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | 空 | DDNS/SSL |
| **SSL/ACME** | | | |
| `ACME_EMAIL` | Let's Encrypt 邮箱 | 空 | SSL |
| `ACME_DNS_PROVIDER` | DNS 验证方式 | `alidns` | SSL |
| **通知** | | | |
| `PUSHPLUS_TOKEN` | PushPlus Token | 空 | 推送 |
| **Nginx** | | | |
| `NGINX_CONF_DIR` | Nginx 配置目录 | 系统默认 | Nginx |
| **MySQL**（当 DB_MODE=mysql 时） | | | |
| `DB_HOST` | MySQL 主机 | `127.0.0.1` | ✅ |
| `DB_PORT` | MySQL 端口 | `3306` | 否 |
| `DB_USER` | MySQL 用户名 | `root` | ✅ |
| `DB_PASSWORD` | MySQL 密码 | 空 | 否 |
| `DB_NAME` | MySQL 数据库名 | `server_panel` | 否 |

---

## 📁 目录结构

```
home-server-panel/
├── src/
│   ├── server.js              # 应用入口：中间件、路由、优雅关闭
│   ├── routes/                # API 路由层（15 个文件）
│   │   ├── auth.js            #   登录/登出/改密
│   │   ├── ddns.js            #   DDNS 记录 CRUD
│   │   ├── cert.js            #   SSL 证书管理
│   │   ├── nginx.js           #   Nginx 启停/日志
│   │   ├── proxy.js           #   反向代理规则
│   │   ├── port.js            #   端口扫描
│   │   ├── notify.js          #   PushPlus 推送
│   │   ├── log.js             #   操作日志
│   │   ├── cron.js            #   定时任务
│   │   ├── pm2.js             #   PM2 进程管理
│   │   ├── docker.js          #   Docker 容器
│   │   ├── ssh.js             #   SSH 终端/配置
│   │   ├── system.js          #   系统信息/重启
│   │   ├── setup.js           #   引导安装
│   │   ├── db.js              #   数据库管理
│   │   └── monitor.js         #   系统监控
│   └── services/              # 业务逻辑层（16 个文件）
│       ├── auth.js            #   认证引擎
│       ├── sqlite-service.js  #   SQLite 引擎 (SQL.js WASM)
│       ├── db-service.js      #   MySQL 引擎 + 双写同步
│       ├── log-service.js     #   日志服务 (双写)
│       ├── monitor-service.js #   系统监控采集
│       ├── ddns-service.js    #   阿里云 DNS API
│       ├── ssl-service.js     #   acme.sh 封装
│       ├── ssl-renew-service.js # SSL 自动续期
│       ├── nginx-service.js   #   Nginx 操作
│       ├── proxy-service.js   #   反向代理引擎
│       ├── docker-service.js  #   Docker API
│       ├── ssh-service.js     #   SSH2 + WebSocket
│       ├── ws-service.js      #   WebSocket 服务
│       ├── cron-service.js    #   定时任务引擎
│       ├── pm2-service.js     #   PM2 探测/操作
│       ├── notify-service.js  #   PushPlus 推送
│       └── setup-service.js   #   引导安装逻辑
├── public/                    # 前端 SPA
│   ├── index.html             #   主页面
│   ├── login.html             #   登录页 (Canvas 粒子动画)
│   ├── install.html           #   引导安装页
│   ├── css/
│   │   └── style.css          #   全局样式 (白色主题)
│   └── js/
│       ├── api.js             #   API 通信层
│       ├── utils.js           #   工具函数
│       ├── app.js             #   路由/导航控制器
│       └── pages/             #   各模块页面脚本
│           ├── dashboard.js   #   仪表盘
│           ├── settings.js    #   系统设置
│           ├── ddns.js        #   DDNS
│           ├── cert.js        #   SSL 证书
│           ├── nginx.js       #   Nginx 管理
│           ├── port.js        #   端口管理
│           ├── cron.js        #   定时任务
│           ├── pm2.js         #   PM2 管理
│           ├── docker.js      #   Docker 管理
│           └── ssh.js         #   SSH 终端
├── data/                      # SQLite 数据库文件 (panel.db)
├── build.mjs                  # esbuild 构建脚本
├── .env.example               # 环境变量模板
├── CHANGELOG.md               # 完整更新日志
└── README.md                  # 本文件
```

---

## 📡 API 接口

> 所有 API 需携带 `x-auth-token` header（登录接口除外）。安装引导接口 (`/api/setup`) 无认证要求。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/login` | 用户登录 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `POST` | `/api/auth/change-password` | 修改密码 |
| `GET` | `/api/auth/status` | 认证状态 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/system/info` | 系统信息（版本/CPU/内存） |
| `GET` | `/api/system/uptime` | 面板运行时长 |
| `GET` | `/api/system/config` | 获取配置（脱敏） |
| `POST` | `/api/system/config` | 保存配置 |
| `POST` | `/api/system/restart` | **重启面板服务** |

### DDNS

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/ddns` | 域名记录列表 |
| `POST` | `/api/ddns/record` | 添加域名记录 |
| `PUT` | `/api/ddns/record/:id` | 编辑记录 |
| `POST` | `/api/ddns/record/:id/toggle` | 启停记录 |
| `DELETE` | `/api/ddns/record/:id` | 删除记录 |
| `POST` | `/api/ddns/batch-update` | 批量更新 DNS |

### SSL 证书

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/cert` | 证书列表 |
| `POST` | `/api/cert/issue` | 申请证书（SSE 进度） |
| `GET` | `/api/cert/issue/stream` | 申请进度 SSE |
| `POST` | `/api/cert/renew` | 续期单个证书 |
| `POST` | `/api/cert/renew-all` | 续期全部证书 |
| `DELETE` | `/api/cert/:domain` | 删除证书（含文件） |
| `GET` | `/api/cert/export/:domain` | 导出证书文件 |

### Nginx

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/nginx` | Nginx 状态 |
| `POST` | `/api/nginx/start` | 启动 |
| `POST` | `/api/nginx/stop` | 停止 |
| `POST` | `/api/nginx/reload` | 重载配置 |
| `POST` | `/api/nginx/config-test` | 配置测试 |
| `GET` | `/api/nginx/sites` | 站点列表 |
| `GET` | `/api/nginx/logs` | 访问/错误日志 |
| `GET` | `/api/nginx/sse-install` | 安装进度 SSE |
| `POST` | `/api/nginx/uninstall` | 卸载 |

### 反向代理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/proxy` | 代理规则列表 |
| `POST` | `/api/proxy` | 添加规则 |
| `PUT` | `/api/proxy/:id` | 更新规则 |
| `DELETE` | `/api/proxy/:id` | 删除规则 |

### 端口管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/port` | TCP+UDP 端口扫描 |

### 通知推送

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/notify/test` | 测试 PushPlus 推送 |

### 操作日志

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/log` | 日志列表（支持分页/筛选） |
| `GET` | `/api/log/export` | 导出日志（JSON/CSV） |

### 定时任务

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/cron` | 任务列表 |
| `POST` | `/api/cron` | 创建任务 |
| `PUT` | `/api/cron/:id` | 更新任务 |
| `DELETE` | `/api/cron/:id` | 删除任务 |

### PM2 进程

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/pm2` | 进程列表 |
| `POST` | `/api/pm2/install` | 安装 PM2 (SSE) |
| `POST` | `/api/pm2/uninstall` | 卸载 |
| `POST` | `/api/pm2/start/:name` | 启动进程 |
| `POST` | `/api/pm2/stop/:name` | 停止进程 |

### Docker

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/docker/containers` | 容器列表 |
| `GET` | `/api/docker/container/:id` | 容器详情 |
| `GET` | `/api/docker/container/:id/logs` | 容器日志 |
| `GET` | `/api/docker/stats` | 批量 Stats |
| `GET` | `/api/docker/images` | 镜像列表 |
| `POST` | `/api/docker/container/:id/start` | 启动容器 |
| `POST` | `/api/docker/container/:id/stop` | 停止容器 |
| `POST` | `/api/docker/container/:id/restart` | 重启容器 |
| `POST` | `/api/docker/image/:id/pull` | 拉取镜像 |

### SSH 终端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/ssh/config` | SSH 配置列表（脱敏） |
| `GET` | `/api/ssh/config/:id` | 单个配置（含密码） |
| `POST` | `/api/ssh/config` | 新增配置 |
| `PUT` | `/api/ssh/config/:id` | 更新配置 |
| `DELETE` | `/api/ssh/config/:id` | 删除配置 |
| `POST` | `/api/ssh/connect` | 连接 SSH 终端 |

### 数据库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/db/status` | 数据库连接状态 |
| `GET` | `/api/db/check` | 表完整性检查 |
| `POST` | `/api/db/sync` | 手动同步 SQLite→MySQL |
| `POST` | `/api/db/migrate` | 迁移至 MySQL |
| `POST` | `/api/db/export` | 导出全部数据 |
| `POST` | `/api/db/import` | 导入数据 |
| `POST` | `/api/db/test` | 测试连接 |
| `POST` | `/api/db/connect` | 连接 MySQL |

### 系统监控

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/monitor` | 实时监控数据 |
| `GET` | `/api/monitor/live` | 实时快照 |
| `GET` | `/api/monitor/history` | 历史数据 |

### 引导安装

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/setup/status` | 安装状态检查 |
| `POST` | `/api/setup/test-db` | 测试数据库连接 |
| `POST` | `/api/setup/install` | 完成安装 |
| `POST` | `/api/setup/reset` | 重置系统 |

---

## 📅 开发路线

### ✅ 已完成

| 阶段 | 内容 | 版本 |
|------|------|------|
| Phase 1 | 项目骨架 + 认证系统 + SPA 路由 | v0.1.0 |
| Phase 2 | DDNS 域名解析 (阿里云) | v0.2.0 |
| Phase 3 | SSL 证书管理 (acme.sh) | v0.3.0 |
| Phase 4 | Nginx 管理 + 反向代理 | v0.4.0 |
| Phase 5 | PM2 进程管理 + Docker 容器 | v0.5.0 |
| Phase 6 | Web SSH 终端 (xterm.js) | v0.6.0 |
| Phase 7 | 系统监控 + 操作日志 + 引导安装 | v0.7.0 |

### 🟡 规划中

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| Phase 8 | 文件管理器 (SMB/NFS 挂载管理) | 🟡 中 |
| Phase 9 | 系统备份与恢复 (配置/数据库一键打包) | 🟡 中 |
| Phase 10 | 移动端适配 + PWA (离线可用) | 🟢 低 |
| Phase 11 | 多用户/角色权限管理 | 🟢 低 |
| Phase 12 | 第三方通知集成 (企业微信/钉钉/飞书) | 🟢 低 |
| Phase 13 | i18n 国际化 (中/英) | 🟢 低 |

---

## 📝 更新日志

完整更新日志见 [CHANGELOG.md](./CHANGELOG.md)

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v0.7.1-beta | 2026-06-14 | SSL 到期日/CA 修复 + 崩溃修复 + 全量时区审计 + 操作日志北京时间 |
| v0.7.0-beta | 2026-06-13 | SSH 配置持久化 + SSL 自动续期 + 系统重启 + 引导安装表补全 |
| v0.7.0 | 2026-06-12 | 代码审计 19 项修复 + bcrypt 密码哈希 + esbuild 构建 + Dashboard 骨架屏 |
| v0.6.0 | 2026-06-10 | 白色主题重写 + 2K/4K 自适应 + DDNS 批量操作 + 页面懒加载 |
| v0.5.0 | 2026-06-07 | SQLite 全量迁移 + 安全加固 + CSP/HSTS + 设置页增强 |
| v0.4.0 | 2026-06-05 | 操作日志审计 + SSL 导出 + MySQL 双模式 + 引导安装 |
| v0.3.0 | 2026-06-04 | DDNS IPv6 + Nginx/Proxy 合并 + Web SSH 终端 |
| v0.2.0 | 2026-06-01 | Docker 容器 + PM2 管理 + Nginx SSE 安装 |
| v0.1.0 | 2026-05-30 | 项目骨架 + DDNS + SSL + Nginx + 反向代理 + 端口扫描 |

---

## 🤝 贡献

Issues 和 Pull Requests 欢迎提交。

## 📄 许可

MIT License — 详见 [LICENSE](./LICENSE)
