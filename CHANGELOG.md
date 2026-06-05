# 更新日志 (CHANGELOG)

本项目所有更新迭代均记录于此，时间戳精确到秒。

---

## v1.3.0 - 2026-05-31 00:23:39

### 🔄 反向代理引擎 + 🌐 Nginx 管理完成

**反向代理（群晖风格）：**
- ✅ 规则 CRUD（来源协议/域名/端口 → 目标协议/主机/端口）
- ✅ 启用/停用切换
- ✅ 自动生成 Nginx 配置（server 块 + location + proxy_pass）
- ✅ Nginx 配置预览 + 一键导出到文件
- ✅ SSL 证书关联（HTTPS 来源 + ssl_certificate/ssl_certificate_key）
- ✅ WebSocket 支持（Upgrade/Connection 头）
- ✅ 自定义 Headers
- ✅ 统计面板（总计/启用/停用/HTTPS/WS）
- ✅ 前端完整表单（双栏布局，高级选项可展开）

**Nginx 管理：**
- ✅ Nginx 安装检测（Mac brew/Linux apt/yum 自适应）
- ✅ 一键安装引导（brew install nginx）
- ✅ 服务状态 / 版本 / PID / 运行时长
- ✅ 启停 / 重载 / 重启
- ✅ 配置语法测试（nginx -t）
- ✅ conf.d / sites-available / sites-enabled 站点解析
- ✅ server 块解析（server_name/listen/SSL/proxy_pass/root/locations）
- ✅ 访问日志 / 错误日志查看
- ✅ 前端完整交互（状态栏/按钮/安装引导）

**新增/修改的文件：**
| 文件 | 操作 |
|------|------|
| src/services/proxy-service.js | 新增 - 群晖风格反向代理引擎 |
| src/routes/proxy.js | 重写 - 8 个 API 端点 |
| public/js/pages/proxy.js | 重写 - 完整表单+预览+导出 |
| src/services/nginx-service.js | 新增 - Nginx 全生命周期管理 |
| src/routes/nginx.js | 重写 - 8 个 API 端点 |
| public/js/pages/nginx.js | 重写 - 启停/站点/日志 |
| public/index.html | 更新 - Nginx + Proxy 页面 HTML |
| data/proxy-config.json | 新增 - 代理规则持久化 |

**测试验证:**
- 代理规则 CRUD ✅
- Nginx 配置自动生成 ✅
- 配置预览正常 ✅
- 页面加载 HTTP 200 ✅

---

## v1.2.0 - 2026-05-30 23:49:03

### 🔒 SSL 证书管理模块完成

**新增功能:**
- acme.sh 集成（一键安装 + 状态检测）
- Let's Encrypt 证书申请（DNS-01 验证，via 阿里云 DNS）
- 通配符证书 / 证书续期 / 状态监控
- 证书部署到 Nginx（--install-cert）

---

## v1.1.0 - 2026-05-30 23:32:34

### 🚀 DDNS 域名解析模块完成

**新增功能:**
- 阿里云 DNS SDK (@alicloud/pop-core) + 5 源公网 IP 检测
- DDNS 配置管理 + IP 变化自动检测

---

## v1.0.1 - 2026-05-30 23:09:49

### 🐛 SPA fallback 路由修复

---

## v1.0.0 - 2026-05-30 22:43:00

### 🎉 项目初始化 - 七大模块骨架
## v1.4.0 - 2026-05-31 00:44:00

### 🔐 登录认证 + 📢 PushPlus 通知

**登录认证：**
- ✅ 账号密码验证（admin/admin123，可配置）
- ✅ Token 认证（x-auth-token Header + hsp_token Cookie 双通道）
- ✅ 24 小时 Session 过期自动清理
- ✅ 未登录 302 重定向到 /login.html
- ✅ 登录页 Canvas 背景动画（网格+粒子+连线）
- ✅ 与主面板同色系深色主题

**PushPlus 通知：**
- ✅ 通用 send() 接口（支持 HTML 模板）
- ✅ 测试推送（/api/notify/test）
- ✅ DDNS IP 变更通知
- ✅ SSL 证书到期通知（7天/30天分级提醒）
- ✅ 服务异常告警通知
- ✅ Token 配置更新接口

**新增文件：**
| 文件 | 操作 |
|------|------|
| src/services/auth.js | 新增 - 认证中间件 |
| src/routes/auth.js | 新增 - 登录/登出/状态 API |
| public/login.html | 新增 - 登录页 |
| src/services/notify-service.js | 新增 - PushPlus 集成 |
| src/routes/notify.js | 重写 - 通知 API |

**测试验证：**
- 未登录访问 API → 401 ✅
- 未登录访问首页 → 302 到 login.html ✅
- 正确密码登录 → 200 + token ✅
- 错误密码登录 → 401 ✅
- 带 token 访问 API → 200 ✅
- 带 Cookie 访问首页 → 200 ✅

## v1.5.0 - 2026-05-31 01:05:00

### 🔌 端口管理模块完成

- ✅ lsof + netstat 双引擎端口扫描（Mac/Linux 自适应）
- ✅ 30+ 常见端口服务名映射（HTTP/MySQL/Jellyfin/群晖等）
- ✅ 端口状态/进程名/PID/监听地址 完整展示
- ✅ 单端口占用检测（/api/port/check/:port）
- ✅ 统计面板（端口总数/Web端口/TOP进程）
- ✅ 前端图标区分（🌐Web ⚙️系统 📌普通 🏠自身）

**新增/更新文件：**
| 文件 | 操作 |
|------|------|
| src/services/port-service.js | 新增 |
| src/routes/port.js | 重写 |
| public/js/pages/port.js | 重写 |
| public/index.html | 更新 - 端口页HTML |

## v1.6.0 - 2026-05-31 01:15:00

### 🐛 Dashboard 修复
- 修复重复 DOMContentLoaded 导致仪表盘数据被覆盖
- 新增 dashboardLoaded 防重入标记
- 仪表盘从 6 卡片升级为 11 卡片（含各模块状态概览）

### 📋 操作日志模块
- log-service.js: Express 中间件自动拦截 API 调用
- 日志查询/搜索/筛选/清空（data/logs/current.json 持久化）
- 前端日志页面: 级别着色 + 搜索 + 模块筛选
- 自动归档机制（超过500条归档到 archive-日期.json）

### ⏰ 定时任务模块
- cron-service.js: 可编程调度引擎
- CRUD API (/api/cron) + 启用/停用/立即执行
- 持久化到 data/cron-jobs.json
- 前端管理页面

### 📁 新增文件
| 文件 | 操作 |
|------|------|
| src/services/log-service.js | 新增 |
| src/services/cron-service.js | 新增 |
| src/routes/log.js | 新增 |
| src/routes/cron.js | 新增 |
| public/js/pages/log.js | 新增 |
| public/js/pages/cron.js | 新增 |

### 📝 更新文件
| 文件 | 变更 |
|------|------|
| src/server.js | 集成 log 中间件 + log/cron 路由 |
| public/js/pages/dashboard.js | 重写 - 去重 + 11卡片 |
| public/js/app.js | 注册 log/cron 页面加载器 |
| public/index.html | 新增日志/定时任务页面 + 导航 |

## v1.7.0 - 2026-05-31

### 🔄 进程管理 (PM2)
- pm2-service.js: pm2 jlist 查询 + 启停/重启/删除操作
- routes/pm2.js: GET/POST/DELETE API 端点
- PM2 页面: 进程列表 + 概览卡片 + 操作按钮
- Dashboard 集成: 显示 PM2 进程数状态

### 🐛 修复
- app.js pageLoaders 去重 (log/cron 重复键)
- dashboard.js 添加防并发/防重入标记
- safeFetch 单接口容错
- 缓存破坏 v=1.7.0 全部 JS/CSS

### 📁 新增文件
- src/services/pm2-service.js
- src/routes/pm2.js
- public/js/pages/pm2.js

## v1.7.1 - 2026-05-31

### 🐛 修复
- Nginx 路由：添加 GET /api/nginx 根路由（之前返回 404）
- Notify 路由：添加 GET /api/notify 根路由 + getStatus() 方法
- System Info：添加 modules 列表和 panelVersion 字段
- Port 进程名：修复 lsof `\x20` 转义（如 Plex\x20M → Plex M）

### 📁 修改文件
- src/routes/nginx.js, notify.js, system.js
- src/services/notify-service.js, port-service.js
- public/index.html, public/js/app.js (version update)

## v1.8.0 - 2026-06-01

### ✨ 新增
- Nginx 一键安装 + SSE 实时进度追踪
  - GET /api/nginx/install/stream SSE端点，支持 brew/apt/yum/apk
  - 前端实时终端式日志输出，安装错误可视化
  - 支持 SSH 部署后的远程安装（sudo + stream）
- POST /api/nginx/install 安装引导API（返回平台推荐的安装方式）

### 🔧 优化
- installNginx 弹窗UI重做：方法选择按钮 + 实时进度面板

### 📁 修改文件
- src/routes/nginx.js
- public/js/pages/nginx.js
- public/css/style.css (spinner 动画)

## v1.11.0 - 2026-06-05 17:01

### 🗄️ MySQL 双模式存储 + 📋 操作日志审计 + 🔒 SSL 证书导出

**MySQL 数据库支撑：**
- ✅ db-service.js: MySQL 连接池 (mysql2)、双模式 (local/mysql)
- ✅ Schema 自动初始化 (config/logs/cert_domains/ddns_records 表)
- ✅ JSON → MySQL 数据迁移引擎
- ✅ 系统设置页: 数据库管理卡片 (配置/测试连接/迁移)

**操作日志系统升级：**
- ✅ 模块名映射 (cert→ssl 等)、按 module/level/search 分页查询
- ✅ 操作日志查看器 (系统设置页 + 各模块日志按钮)
- ✅ 日志记录上限 500 条 (data/logs/current.json)

**SSL 证书多格式导出：**
- ✅ GET /api/cert/export/:domain?format=cert|key|fullchain|ca|all
- ✅ 单文件下载 (PEM) + 打包下载 (tar.gz)
- ✅ 前端导出弹窗 (完整证书链/域名证书/私钥/CA)

### 📁 文件变更
- new: src/services/db-service.js, src/routes/db.js
- mod: src/services/log-service.js, cert.js, server.js
- mod: public/js/utils.js, pages/cert.js, ddns.js, docker.js, settings.js

---

## v1.10.0 - 2026-06-04

### 🏗️ 引导安装页 + 🎨 五项 UI 优化

**引导安装页面：**
- ✅ install.html: 深色主题三步安装向导 (数据库/管理员/完成)
- ✅ 支持本地 JSON / MySQL 双模式
- ✅ POST /api/setup/install (skipSchema 参数跳过已有数据库)
- ✅ 安装中间件: 检测 .env 是否存在决定重定向

**五项全局 UI 优化：**
- ✅ 登录页密码显示/隐藏切换按钮
- ✅ 全局错误弹窗 (showError + 一键复制)
- ✅ API 层自动错误弹窗 (支持 modal/notify 模式)
- ✅ Nginx 页左右分栏 (左 Nginx 管理 / 右反向代理规则)
- ✅ 移除操作日志页面 (合并至系统设置)

### 🐛 修复
- SSL 通配符域名: 阻止 `*.*.xxx`、自动剥离 `*.` 前缀
- SSL DNS 清理: 新增 `_cleanDnsTxtRecords()` 清除残留 TXT 记录
- 退出登录: POST /api/auth/logout → 清除 localStorage → 跳转登录页

---

## v1.9.0 - 2026-06-04

### 📡 DDNS IPv6 + 🌐 Nginx/Proxy 合并

**DDNS IPv6 升级：**
- ✅ IPv6 公网检测 (5 服务 + 网卡 fallback)
- ✅ AAAA 记录支持: 添加/编辑/启用/停用
- ✅ getAllRecords() 同时返回 A + AAAA 记录

**Nginx + 反向代理合并：**
- ✅ 移除独立 #page-proxy、合并至 nginx.js 双标签页
- ✅ Nginx 管理 / 反向代理规则同页切换

---

## v1.8.7 - 2026-06-03

### 🎨 Port + Diag + UI 增强

**端口管理增强：**
- ✅ UDP 协议支持 (netstat -u)
- ✅ 去重改为 port+protocol 维度

**诊断栏优化：**
- ✅ 可折叠 (默认隐藏, 右上角 24×24 小图标)
- ✅ 系统设置页新增诊断日志面板 (按页面筛选)

**UI 优化：**
- ✅ 弹窗 z-index 提升至 10001
- ✅ 通知栏居中 (fade-in 动画)
- ✅ 按钮/下拉框美化 (.btn-sm 紧凑样式)

### 🐛 修复
- api.js baseUrl '' → '/api' (Dashboard 所有 API 返回 HTML 根因)

---

## v1.8.5 - 2026-06-02

### 💻 Web SSH 终端 + 🔒 acme.sh SSE 安装

**Web SSH 终端：**
- ✅ ws + ssh2 + xterm.js 架构
- ✅ WebSocket 认证 (URL query token 参数)
- ✅ SSH 凭据仅内存存储不落盘
- ✅ CDN 动态加载 xterm.js

**acme.sh 管理：**
- ✅ SSE 多步进度流安装/卸载
- ✅ Gitee 镜像下载 (GitHub 超时 fallback)
- ✅ ZeroSSL CA 注册

**Dashboard 修复链：**
- ✅ MIME 类型显式设置 (NAS Express 5 返回 text/plain)
- ✅ BUILD_ID 永久缓存爆破方案
- ✅ HTML 内联诊断脚本 (cookie/localStorage/buildId 检测)

---

## v1.8.2 - 2026-06-01

### 🐳 Docker 容器管理模块

**Docker 管理：**
- ✅ 容器列表/启停/重启/日志/Stats/Images
- ✅ 批量 docker stats 避免事件循环阻塞

**PM2 安装引导：**
- ✅ 4 步安装指引 (命令可点击复制)

---

## v1.8.0 - 2026-06-01

### 🌐 Nginx SSE 安装 + 修复

**SSE 安装进度：**
- ✅ Nginx 一键安装 + 实时进度流

**修复：**
- ✅ Nginx 配置测试 sudo 权限 fallback
- ✅ 反向代理字段兼容双格式
- ✅ 系统设置 .env 写入

---

## v1.8.1 - 2026-06-01

### 🐛 修复
- Nginx 版本检测：分离 `nginx -v`/`-t` 检测，stderr 不再导致版本丢失
- 反向代理：兼容 `sourceHost/targetHost` + `domain/target` 双字段格式
- 系统设置：实现 POST /api/system/config 写入 .env（原返回「功能开发中」）
- 设置页：补全 pageLoaders 中 `settings: loadSettings`（侧栏可点但无 JS 绑定）
- proxy catch 块：version 字段兜底

### 📁 修改文件
- src/routes/system.js, proxy.js
- src/services/nginx-service.js
- public/js/app.js
