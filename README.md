# Home Server Panel — 家庭服务器运维管理面板

**版本**: v0.9.2-beta | **许可**: MIT

轻量级家庭服务器运维管理面板，支持 iStoreOS/OpenWRT、群晖 DSM、Debian/Ubuntu、macOS 等 Linux 发行版。

> 🎯 **亮点**: Vue 3 SPA · Element Plus · Web SSH 终端 (xterm.js) · Docker 容器管理 · DDNS 双云 (阿里云+腾讯云) · SSL 自动续期 · 反向代理一键部署 · 多用户权限 · 操作日志审计 · i18n 中/英

---

## 🧱 技术栈

### 前端 (SPA)

| 技术 | 版本 | 用途 |
|------|------|------|
| **Vue 3** | ^3.5 | Composition API + `<script setup>` |
| **Vite** | ^8.0 | 构建工具 (Rolldown)，906ms 生产构建 |
| **Element Plus** | ^2.14 | UI 组件库（表格/表单/弹窗/下拉） |
| **Pinia** | ^3.0 | 状态管理 (auth + system stores) |
| **Vue Router** | ^4.6 | SPA 路由，懒加载 + beforeEach 认证守卫 |
| **vue-i18n** | ^9.14 | 中/英国际化，~200 keys |
| **xterm.js** | ^5.3 | Web SSH 终端 (Tokyo Night 主题) |
| **@xterm/addon-fit** | ^0.11 | xterm ResizeObserver 自适应 |
| **Axios** | ^1.18 | HTTP 请求 (x-auth-token 拦截器) |
| **TypeScript** | ~6.0 | 类型定义 + vue-tsc 检查 |
| **Sass** | ^1.101 | CSS 预处理 |

### 后端 (Node.js)

| 技术 | 版本 | 用途 |
|------|------|------|
| **Express 5** | ^5.2 | HTTP 框架 + 中间件栈 |
| **WebSocket (ws)** | ^8.21 | SSH 终端实时通信 |
| **ssh2** | ^1.17 | SSH 客户端 (密码/AES-256-GCM 加密存储) |
| **mysql2** | ^3.22 | MySQL 连接池 (promise API) |
| **sql.js** | ^1.14 | SQLite WASM 引擎 (零编译依赖) |
| **bcryptjs** | ^3.0 | 密码哈希与验证 |
| **dotenv** | ^17.4 | 环境变量管理 |
| **cookie-parser** | ^1.4 | Cookie 认证 |
| **multer** | ^2.1 | 文件上传 (证书/备份) |
| **esbuild** | ^0.28 | 旧版前端 JS 打包 (public/js/) |

### 云服务 SDK

| 包 | 用途 |
|------|------|
| `@alicloud/alidns20150109` | 阿里云 DNS API (DDNS) |
| `@alicloud/openapi-client` | 阿里云 OpenAPI 客户端 |
| `@alicloud/pop-core` | 阿里云 POP API 核心 |
| 腾讯云 DDNS | 自实现 HTTP API 签名调用 |

### 数据库架构

```
┌─────────────────────────────────────┐
│   SQLite (SQL.js WASM)              │  ← 事实源 (single source of truth)
│   文件: data/panel.db               │     零原生依赖，所有平台可用
│   9 张表，所有模块读写              │
└──────────┬──────────────────────────┘
           │ syncFromSQLite() 实时同步
           ▼
┌─────────────────────────────────────┐
│   MySQL (可选 DB_MODE=mysql)        │  ← 同步目标
│   192.168.100.110:3306             │     MySQL 不可达时 → SQLite 回退
│   数据库: home_server_panel         │     启动时增量合并
└─────────────────────────────────────┘
```

**9 张数据表**: `ddns_config` | `ddns_records` | `ssl_certs` | `proxy_rules` | `ssh_config` | `cron_jobs` | `operation_logs` | `system_config` | `users`

### 系统依赖

| 工具 | 用途 | 必装 |
|------|------|:--:|
| Node.js ≥ 18 | 运行时 | ✅ |
| curl | acme.sh 安装 | ✅ |
| Nginx | Nginx 管理模块 | 可选 |
| Docker | Docker 管理模块 | 可选 |
| PM2 | 进程守护 | 可选 |
| acme.sh | SSL 证书 | SSL 需 |

---

## 📁 完整目录结构

```
home-server-panel/
│
├── src/                              # 后端代码
│   ├── server.js                     # 入口: Express + WS + 中间件 + 优雅关闭
│   │
│   ├── routes/                       # API 路由层 (17 文件)
│   │   ├── auth.js                   #   认证: 登录/登出/改密/状态
│   │   ├── users.js                  #   用户管理 CRUD (adminOnly)
│   │   ├── ddns.js                   #   DDNS 双云: 阿里云 + 腾讯云
│   │   ├── cert.js                   #   SSL: 申请/续期/导出/SSE 进度
│   │   ├── nginx.js                  #   Nginx: 启停/重载/日志/安装
│   │   ├── proxy.js                  #   反向代理 CRUD + 自动部署
│   │   ├── port.js                   #   端口扫描 TCP/UDP
│   │   ├── notify.js                 #   PushPlus 推送测试
│   │   ├── log.js                    #   操作日志: 分页/筛选/导出
│   │   ├── cron.js                   #   定时任务 CRUD
│   │   ├── pm2.js                    #   PM2: 安装/卸载/进程管理
│   │   ├── docker.js                 #   Docker: 容器/镜像/日志/Stats
│   │   ├── ssh.js                    #   SSH 配置 CRUD + WebSocket 连接
│   │   ├── system.js                 #   系统信息/配置/重启/运行时长
│   │   ├── monitor.js                #   监控数据: 实时/历史
│   │   ├── db.js                     #   数据库: 状态/同步/迁移/导入导出
│   │   ├── setup.js                  #   引导安装 (无认证)
│   │   └── process.js               #   系统进程查询
│   │
│   └── services/                     # 业务逻辑层 (17 文件)
│       ├── auth.js                   #   认证: bcrypt 验证 + 动态迁移
│       ├── sqlite-service.js         #   SQLite 引擎: 建表/CRUD/Schema 校验
│       ├── db-service.js             #   MySQL 引擎 + 双写同步
│       ├── log-service.js            #   日志: 中间件自动记录 + 双写
│       ├── monitor-service.js        #   监控采集: 5s 间隔 CPU/内存/磁盘/网络
│       ├── ddns-service.js           #   阿里云 DNS API 封装
│       ├── ddns-tencent.js           #   腾讯云 DNS API 封装 (TC3 签名)
│       ├── ssl-service.js            #   acme.sh 封装: 安装/签发/续期
│       ├── ssl-renew-service.js      #   SSL 自动续期 (24h 定时)
│       ├── nginx-service.js          #   Nginx 操作: sudo + nginx CLI
│       ├── proxy-service.js          #   反向代理引擎: 配置生成 + 部署
│       ├── docker-service.js         #   Docker API: unix socket + 批量采集
│       ├── ssh-service.js            #   SSH2 客户端: 连接/日志/密码加密
│       ├── ws-service.js             #   WebSocket: token 认证 + 消息路由
│       ├── cron-service.js           #   定时任务引擎
│       ├── pm2-service.js            #   PM2: 多路径探测 + 安装/卸载 SSE
│       ├── notify-service.js         #   PushPlus: 微信/钉钉/飞书/邮件
│       └── setup-service.js          #   引导安装: 建表/管理员/测试连接
│
├── client/                           # Vue 3 SPA 前端
│   ├── index.html                    # Vite 入口 HTML
│   ├── vite.config.ts                # Vite 配置 (代理/版本/Element Plus)
│   ├── tsconfig.json                 # TypeScript 配置
│   ├── package.json                  # 前端依赖 (Vue/Vite/Element Plus)
│   │
│   └── src/
│       ├── main.ts                   # Vue 应用入口: Pinia + Router + i18n
│       ├── App.vue                   # 根组件
│       ├── i18n.ts                   # vue-i18n 配置: zh-CN/en-US
│       │
│       ├── api/
│       │   └── index.ts              # Axios 封装: 拦截器/错误处理
│       │
│       ├── router/
│       │   └── index.ts              # 路由: 懒加载 15 页 + 认证守卫
│       │
│       ├── stores/
│       │   ├── auth.ts               # 认证状态: token/user/role/isAdmin
│       │   └── system.ts             # 系统状态: config/info/uptime 实时刷新
│       │
│       ├── composables/              # Vue Composables (预留)
│       │
│       ├── layouts/
│       │   └── MainLayout.vue        # 主布局: SideBar + TopBar + RouterView
│       │
│       ├── components/
│       │   ├── SideBar.vue           # 侧边栏: Logo + 导航 (adminOnly 过滤)
│       │   ├── TopBar.vue            # 顶栏: 实时指标 + 管理员下拉菜单
│       │   └── Logo.vue              # Logo: 亮/暗模式 + sm/md/lg/xl 尺寸
│       │
│       ├── pages/                    # 15 个业务页面 (懒加载)
│       │   ├── Login.vue             # 登录: Canvas 粒子动画背景
│       │   ├── Install.vue           # 引导安装
│       │   ├── Dashboard.vue         # 仪表盘: 系统概览 + 操作日志 + 服务状态
│       │   ├── Ddns.vue              # DDNS 管理: 双云 + 批量操作 + 编辑弹窗
│       │   ├── Ssl.vue               # SSL 证书: 申请/导出/续期/强制重申请
│       │   ├── Nginx.vue             # Nginx: 启停 + 反向代理集成 + 日志
│       │   ├── Port.vue              # 端口扫描
│       │   ├── Pm2.vue               # PM2: 进程列表 + 添加进程 + 安装/卸载
│       │   ├── Cron.vue              # 定时任务
│       │   ├── Docker.vue            # Docker: 容器/镜像/Stats/日志
│       │   ├── Ssh.vue               # SSH 终端: xterm.js + WebSocket + 历史记录
│       │   ├── Settings.vue          # 系统设置: 云凭据/SSL/通知/数据库
│       │   └── Users.vue             # 用户管理: CRUD + 角色 (adminOnly)
│       │
│       ├── locales/
│       │   ├── zh-CN.json            # 中文 locale (~200 keys)
│       │   └── en-US.json            # 英文 locale
│       │
│       ├── styles/
│       │   └── variables.css         # CSS 变量: 亮/暗主题 + 响应式断点
│       │
│       └── assets/
│           ├── logo1.png             # 亮色模式 Logo
│           ├── logo2.png             # 暗色模式 Logo
│           └── logo1_副本/logo2_副本 # Logo 备份
│
├── public/                           # 旧版前端 (保留兼容 / install / login)
│   ├── index.html                    # 旧 SPA 入口 (已被 Vue dist/ 替代)
│   ├── login.html                    # 旧登录页 (Canvas 粒子动画)
│   ├── install.html                  # 旧安装引导页
│   ├── css/
│   │   └── style.css                 # 旧全局样式
│   └── js/
│       ├── api.js                    # 旧 API 层
│       ├── utils.js                  # 旧工具函数
│       ├── app.js                    # 旧路由/导航
│       └── pages/                    # 旧页面脚本 (10 文件)
│
├── scripts/
│   └── validate-schema.js            # Schema 一致性校验 (构建前自动运行)
│
├── data/                             # SQLite 数据库 + 数据文件
│   └── panel.db                      # SQLite WASM 数据库文件
│
├── logs/                             # 日志输出目录
│
├── build.mjs                         # esbuild 构建: 旧 public/js/ 打包
├── ecosystem.config.js               # PM2 配置
├── install.sh                        # 一键安装脚本
├── package.json                      # 后端依赖
├── .env                              # 环境变量 (gitignore)
├── .env.example                      # 环境变量模板
├── CHANGELOG.md                      # 完整更新日志
└── README.md                         # 本文件
```

---

## 🔐 安全架构

| 层级 | 措施 |
|------|------|
| 密码存储 | bcryptjs (saltRounds=10) |
| SSH 密码 | AES-256-GCM 加密 (随机 IV + auth tag) |
| 认证通道 | x-auth-token Header + Cookie 双重验证 |
| 登录保护 | IP 速率限制 (10次/分钟 → 5分钟冷却) |
| 全局限流 | 120 req/min (普通 API), 20 req/min (昂贵操作) |
| CSP | `script-src 'self' 'unsafe-eval'` (Vue 运行时需要) |
| HSTS | max-age=31536000; includeSubDomains |
| 路径安全 | 所有文件路径 resolve + 正规化, 防遍历 |
| 命令注入 | 端口号 1-65535 校验, Nginx method 白名单 |
| 错误脱敏 | 生产环境 `err.message` 替换为通用提示 |
| XSS | 所有用户输入 escapeHtml 转义 |
| 权限 | 管理员 (admin) 全权限, 普通用户 (user) 只读 |

---

## 📋 环境变量

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|:--:|
| `ADMIN_USER` | 管理员用户名 | `admin` | 否 |
| `ADMIN_PASS` | 管理员密码 | `admin123` | 否 |
| `SESSION_SECRET` | 会话加密密钥 | 随机生成 | 否 |
| `SERVER_PORT` | 面板端口 | `3456` | 否 |
| `LOG_LEVEL` | 日志级别 (debug/info/warn/error) | `info` | 否 |
| **存储** | | | |
| `DB_MODE` | `local` (SQLite) / `mysql` | `local` | 否 |
| `DB_HOST` | MySQL 主机 | `127.0.0.1` | mysql |
| `DB_PORT` | MySQL 端口 | `3306` | 否 |
| `DB_USER` | MySQL 用户名 | `root` | mysql |
| `DB_PASSWORD` | MySQL 密码 | — | 否 |
| `DB_NAME` | MySQL 数据库名 | `home_server_panel` | 否 |
| **阿里云** | | | |
| `ALIYUN_ACCESS_KEY_ID` | AccessKey ID | — | DDNS/SSL |
| `ALIYUN_ACCESS_KEY_SECRET` | AccessKey Secret | — | DDNS/SSL |
| **腾讯云** | | | |
| `TENCENT_SECRET_ID` | SecretId | — | DDNS |
| `TENCENT_SECRET_KEY` | SecretKey | — | DDNS |
| **SSL** | | | |
| `ACME_EMAIL` | Let's Encrypt 邮箱 | — | SSL |
| `ACME_DNS_PROVIDER` | DNS 提供商 (alidns/dns_dp) | `alidns` | SSL |
| **通知** | | | |
| `PUSHPLUS_TOKEN` | PushPlus Token | — | 推送 |
| `PUSHPLUS_TITLE` | 推送标题 | `Server Panel 通知` | 否 |
| `PUSHPLUS_CHANNEL` | 推送渠道 | `wechat` | 否 |

---

## 📡 API 接口 (74 个端点)

> 所有 API 需 `x-auth-token` header（`/api/setup/*` 除外）

### 认证 & 用户

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:--:|
| POST | `/api/auth/login` | 登录 | - |
| POST | `/api/auth/logout` | 登出 | all |
| POST | `/api/auth/change-password` | 改密 | all |
| GET | `/api/auth/status` | 认证状态 | all |
| GET | `/api/users` | 用户列表 | admin |
| GET | `/api/users/me` | 当前用户信息 | all |
| POST | `/api/users` | 创建用户 | admin |
| PUT | `/api/users/:id` | 更新用户 | admin |
| DELETE | `/api/users/:id` | 删除用户 | admin |

### 系统 & 监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/system/info` | 系统信息 (版本/CPU/内存/OS/内核) |
| GET | `/api/system/uptime` | 运行时长 (秒级实时) |
| GET | `/api/system/config` | 获取配置 (脱敏) |
| POST | `/api/system/config` | 保存配置 |
| POST | `/api/system/restart` | 重启面板 |
| GET | `/api/monitor` | 实时监控数据 |
| GET | `/api/monitor/live` | 实时快照 |
| GET | `/api/monitor/history` | 历史数据 |
| GET | `/api/process` | 系统进程列表 |

### DDNS (双云)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ddns` | 记录列表 (按云商分组) |
| POST | `/api/ddns/domains` | 添加域名记录 |
| GET/PUT/DELETE | `/api/ddns/record/:id` | 记录 CRUD |
| POST | `/api/ddns/record/:id/toggle` | 启停记录 |
| POST | `/api/ddns/batch-update` | 批量更新 DNS |

### SSL 证书

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cert` | 证书列表 |
| POST | `/api/cert/issue` | 申请证书 (SSE) |
| POST | `/api/cert/renew` | 续期 |
| POST | `/api/cert/renew-all` | 全量续期 |
| DELETE | `/api/cert/:domain` | 删除证书 |
| GET | `/api/cert/export/:domain` | 导出 (cert/key/fullchain/ca/all) |

### Nginx & 反向代理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/nginx` | Nginx 状态 |
| POST | `/api/nginx/start\|stop\|reload\|config-test` | 启停/配置 |
| GET | `/api/nginx/sites` | 站点列表 |
| GET | `/api/nginx/logs` | 日志 (access/error) |
| POST | `/api/nginx/install\|uninstall` | 安装/卸载 (SSE) |
| GET/POST/PUT/DELETE | `/api/proxy` | 反向代理 CRUD |

### 其他模块

| 模块 | 端点 | 说明 |
|------|------|------|
| 端口 | `GET /api/port` | TCP+UDP 全量扫描 |
| 通知 | `POST /api/notify/test` | 测试推送 |
| 日志 | `GET /api/log` + `/export` | 分页/筛选/JSON/CSV 导出 |
| 定时任务 | CRUD `/api/cron` | cron + ssl_renew + custom |
| PM2 | CRUD `/api/pm2` + install/uninstall | 进程管理 + SSE |
| Docker | 容器/镜像/日志/Stats | 8 个端点 |
| SSH | CRUD `/api/ssh/config` + connect | 终端 + 配置 |
| 数据库 | status/sync/migrate/export/import | 7 个端点 |
| 安装 | `/api/setup/*` | 6 个端点 (无认证) |

---

## 🚀 快速开始

```bash
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel
npm install
cd client && npm install && cd ..
npm run build    # Vue + esbuild 双流水线
node src/server.js
# 浏览器打开 http://localhost:3456
```

**默认账号**: `admin` / `admin123`

### iStoreOS 部署

```bash
opkg update && opkg install node
mkdir -p /opt/home-server-panel
# 上传构建产物
tar xzf hsp.tar.gz -C /opt/home-server-panel
cd /opt/home-server-panel && npm install --production
# 仅需运行时依赖，客户端已预构建在 client/dist/
nohup node src/server.js > /tmp/hsp.log 2>&1 &
echo $! > /tmp/hsp.pid
```

### 构建命令

```bash
npm run build    # client/dist (Vite) + public/js/bundle.js (esbuild)
npm run dev      # 后端热重载
cd client && npm run dev  # Vite 开发服务器 (5173)
```

---

## 🏗️ 技术决策

| 决策 | 理由 |
|------|------|
| **SQL.js WASM 替代 better-sqlite3** | iStoreOS 无编译链，WASM 零原生依赖，通用性最强 |
| **SQLite 事实源 + MySQL 同步** | 单机可靠，远程可观测；MySQL 不可达时自动回退 |
| **Vue 3 SPA + Vite** | 组件化 + 懒加载 + HMR，替代旧 jQuery 风格 |
| **Element Plus** | 成熟的中后台 UI 库，暗色模式原生支持 |
| **vue-i18n 中英双语** | 可扩展多语言，~200 个翻译键覆盖全模块 |
| **bcryptjs 纯 JS** | 免编译，跨平台一致，替代原生 bcrypt |
| **Express 5** | 成熟生态 + async error handling |
| **xterm.js + ssh2 + ws** | 浏览器端终端体验，3 分钟自动断连 |
| **esbuild 保留旧构建** | public/js/ 兼容非 Vue 环境 (install/login) |
| **BUILD_ID 缓存破坏** | 每次构建注入唯一 ID，强制浏览器加载新资源 |
| **优雅关闭 (SIGTERM)** | 关闭监控采集 → MySQL 连接池 → SQLite → HTTP |

---

## 🔄 版本迭代规则

- **每 3 个版本迭代后，更新本 README.md**
- 版本号：`v0.X.Y-beta`，X=大版本(重大功能)，Y=小版本(修复/优化)
- 变更记录同步维护 [CHANGELOG.md](./CHANGELOG.md)

---

## 📝 最近更新

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v0.8.5-beta | 2026-06-21 | 多用户管理 + PushPlus 增强 (标题/渠道) + 设置页重组 + 根除版本号硬编码 |
| v0.8.4-beta | 2026-06-20 | 暗色模式表格修复 + Nginx 布局重构 + 移动端响应式 + Logo 组件 |
| v0.8.3-beta | 2026-06-20 | 仪表盘修复 + Apple 风格 CSS 动画 + 登录页 Canvas 粒子动画 +
PM2 空状态处理 |
| v0.8.2-beta | 2026-06-20 | Nginx+Proxy 合并 + Settings 云凭据脱敏 + DNS 下拉分组 + 推送测试按钮 |
| v0.8.1-beta | 2026-06-19 | i18n 国际化 (中/英) + 暗色切换 + SPA 路由修复 |
| v0.8.0-beta | 2026-06-19 | **Vue 3 全栈重构** + 安全审计 16 项 + SSH 密码 AES-GCM 加密 |
| 更早版本 | 2026-05~06 | 见 [CHANGELOG.md](./CHANGELOG.md) |

---

## 📄 许可

MIT License
