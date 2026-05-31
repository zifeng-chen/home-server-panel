# Home Server Panel - 家庭服务器运维管理面板

**版本**: v1.0.0 | **技术栈**: Node.js + Express + 原生 HTML/CSS/JS

## 功能模块

| 模块 | 功能 | 实现状态 |
|------|------|----------|
| 📊 仪表盘 | 系统概览 (CPU/内存/负载/运行时长) | ✅ 已实现 |
| 📡 DDNS 解析 | 阿里云 DNS 动态域名解析 | 🚧 骨架完成 |
| 🔒 SSL 证书 | Let's Encrypt 自动申请/续期/管理 | 🚧 骨架完成 |
| 🌐 Nginx 管理 | 安装/启停/重载/站点管理 | 🚧 骨架完成 |
| 🔄 反向代理 | 类似群晖 DSM Reverse Proxy | 🚧 骨架完成 |
| 🔌 端口管理 | 端口扫描/启停 | 🚧 骨架完成 |
| ⚙️ 系统设置 | 密钥配置/推送设置 | 🚧 骨架完成 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际配置

# 开发模式
npm run dev

# 生产模式 (PM2)
npm run pm2:start
```

访问: http://localhost:3456

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| ALIYUN_ACCESS_KEY_ID | 阿里云 AccessKey ID | DDNS + SSL |
| ALIYUN_ACCESS_KEY_SECRET | 阿里云 AccessKey Secret | DDNS + SSL |
| DDNS_DOMAINS | 需要 DDNS 的域名，逗号分隔 | DDNS |
| ACME_EMAIL | Let's Encrypt 联系邮箱 | SSL |
| PUSHPLUS_TOKEN | PushPlus 推送 Token | 通知 |
| SERVER_PORT | 面板监听端口 (默认3456) | 否 |

## 目录结构

```
home-server-panel/
├── src/                # 后端源码
│   ├── server.js       # 入口文件
│   ├── routes/         # API 路由
│   ├── services/       # 业务逻辑层
│   └── config/         # 配置管理
├── public/             # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js      # API 通信
│       ├── utils.js    # 工具函数
│       ├── app.js      # 主入口
│       └── pages/      # 各页面模块
├── data/               # 数据文件
├── logs/               # 日志文件
├── .env.example        # 环境变量模板
└── CHANGELOG.md        # 更新日志
```