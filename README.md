# Home Server Panel

家庭服务器运维管理面板，一站式 Web 界面管理你的路由器、NAS 和服务器。

**版本**: v0.9.4-beta | **许可**: MIT

---

## 能做什么

- 📊 **仪表盘** — 系统概览、资源监控、操作日志
- 🌐 **DDNS** — 阿里云 + 腾讯云双云动态域名解析
- 🔒 **SSL 证书** — 自动申请、续期、部署 Let's Encrypt 证书
- 🔄 **反向代理** — Nginx 可视化配置，自动部署生效
- 🐳 **Docker** — 容器/镜像/日志/Stats 一站式管理
- 🖥️ **Web SSH** — 浏览器里的终端 (xterm.js)
- 📡 **设备中心** — 多设备注册，远程指标采集 (v2.0)
- 👥 **多用户** — 管理员/普通用户权限隔离
- 📢 **通知推送** — PushPlus 微信通知，SSL 到期/DDNS 变更提醒

### 💡 首次使用？

启动服务后浏览器打开面板地址，会**自动跳转到安装向导**（`/install.html`），三步完成：选数据库 → 设管理员 → 开始使用。不用手动写配置。

## 文档导航

| 文档 | 适合谁 | 内容 |
|------|--------|------|
| [⬇️ 安装部署](docs/INSTALL.md) | 所有人 | 服务端安装 + Agent 安装 |
| [🔌 API 接口](docs/API.md) | 开发者 | 90+ 个端点完整参考 |
| [🤖 设备 Agent](docs/AGENT.md) | 被管理设备 | Agent 下载、启动、自启动 |
| [🏗️ 技术架构](docs/ARCHITECTURE.md) | 开发者 | 技术栈、目录结构、设计决策 |
| [🔐 安全架构](docs/SECURITY.md) | 所有人 | 认证、加密、防护措施 |

## 快速上手

```bash
git clone https://github.com/zifeng-chen/home-server-panel.git
cd home-server-panel
npm install && cd client && npm install && cd ..
npm run build
node src/server.js
```

浏览器打开 `http://localhost:3456`，默认账号 `admin` / `admin123`。

> 详细部署说明见 [安装部署文档](docs/INSTALL.md)

---

**变更记录**: [CHANGELOG.md](CHANGELOG.md) | **最近版本**: v0.9.4-beta（合并 + 代码审查收尾）
