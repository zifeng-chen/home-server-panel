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
