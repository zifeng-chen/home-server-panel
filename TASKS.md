# 任务看板 (TASK BOARD)

## 阶段一：核心功能骨架 ✅
- [x] 项目骨架搭建 + 7 模块 UI + API 路由

## 阶段二：DDNS 域名解析 ✅
- [x] 阿里云 DNS SDK 接入 (@alicloud/pop-core)
- [x] 公网 IP 自动检测（5源 fallback）
- [x] DNS 记录查询与 IP 变化检测
- [x] DDNS 配置管理（添加/删除域名）
- [x] 手动刷新全部记录
- [x] 前端完整交互（添加弹窗/IP对比/状态标签）

## 阶段三：SSL 证书管理 ✅
- [x] acme.sh 安装检测与引导
- [x] Let's Encrypt 证书申请（DNS-01 验证，via 阿里云 DNS）
- [x] 通配符证书支持
- [x] 证书状态监控（到期天数 + 三态标签）
- [x] 证书续期（单个/批量）
- [x] 证书部署到 Nginx（--install-cert）

## 阶段四：Nginx 管理 ✅
- [ ] Nginx 安装检测 + 引导安装
- [ ] 启停/重载/配置测试
- [ ] conf.d 目录解析（server 块识别）
- [ ] 站点配置可视化编辑
- [ ] 日志查看

## 阶段五：反向代理引擎 ✅
- [ ] 照搬群晖 Reverse Proxy 设计
- [ ] 来源协议/域名/端口 → 目标协议/IP/端口
- [ ] 自动生成 Nginx 配置（proxy_pass）
- [ ] SSL 证书关联（HTTPS 来源自动选证书）
- [ ] 自定义 Header（WebSocket 升级等）

## 阶段六：PushPlus 通知 ✅
- [ ] PushPlus API 接入
- [ ] 通知模板：DDNS 变更 / SSL 到期 / 服务异常
- [ ] 通知开关 + 测试推送

阶段★：登录认证 ✅

## 阶段七：端口管理 ✅
- [ ] 系统端口扫描（netstat/ss/lsof）
- [ ] 端口对应服务识别
- [ ] 防火墙规则管理（iptables/nftables）
- [ ] 端口启停

## 阶段八：系统增强 ✅
- [ ] 配置持久化（MySQL/SQLite）
- [ ] 用户认证 + 登录页面
- [ ] DDNS 定时任务（Cron / setInterval）
- [ ] SSL 自动续期定时任务
- [ ] 服务健康检查（HTTP 探测）
- [ ] 仪表盘增强（DDNS状态/证书到期/端口在线数）
### ✅ Phase 11 — Nginx 一键安装 + SSE 进度 (v1.8.0)
- [x] SSE 安装流端点 (`GET /api/nginx/install/stream`)
- [x] 安装引导API (`POST /api/nginx/install`)
- [x] 前端实时终端日志 UI (EventSource + 滚动)
- [x] 多平台支持 (brew/apt/yum/apk)

## V3.0 Phase 3 — 设备远程运维 🚧
- [x] FR-3.2 文件浏览器（list/read/write/delete/upload/download + 路径白名单 + 敏感文件黑名单）
- [x] FR-3.3 Docker 管理（容器/镜像/资源占用/Compose；Agent + 本机双通道；镜像拉取与清理）
- [x] FR-3.1 Web 终端（xterm.js + WS 中继；多会话；行模式交互 shell；断线重连）
- [x] FR-3.4 批量命令（并行执行 + 10 个巡检模板 + 差异对比 + 历史回放）
- [ ] T8 部署验收：需在 `192.168.100.x` 网段对 iStoreOS 实机实测

## V3.0 Phase 4 — AI 智能引擎 ⬜
- [ ] AI 对话面板 / 设备诊断 / 方案生成 / 自然语言命令

## V3.0 Phase 5 — 技能插件体系 ⬜

## V3.0 Phase 6 — 自愈与自动运维 ⬜
- [ ] 注：2026-07-01 曾实现 health-check/healing/report-service，2026-07-02 清理时被当作残留删除，只剩 alert-service
