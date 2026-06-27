# 技术架构

## 概览

```
┌──────────────────────────────────────────┐
│  Client (Vue 3 SPA)                     │
│  Element Plus + Pinia + Vue Router       │
│  Vite 构建 → client/dist/               │
└──────────────┬───────────────────────────┘
               │ HTTP + WebSocket
┌──────────────▼───────────────────────────┐
│  Server (Express 5 + ws)                │
│                                          │
│  routes/  17 文件   API 路由层          │
│  services/ 17 文件  业务逻辑层           │
│  auth/           认证中间件栈            │
│                                          │
│  ┌─────────────┐  ┌──────────────┐      │
│  │ SQLite WASM  │  │  MySQL       │      │
│  │ (事实源)     │◄─│  (同步目标)  │      │
│  └─────────────┘  └──────────────┘      │
└──────────────┬───────────────────────────┘
               │ HTTP + WebSocket
┌──────────────▼───────────────────────────┐
│  Go Agent (零依赖单文件)                │
│  运行在被管理设备上                      │
│  自动注册 → 心跳 → 指标 → WS 命令通道   │
└──────────────────────────────────────────┘
```

## 前端技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (Composition API) | 组件框架 |
| Vite (Rolldown) | 构建工具，生产构建 < 1s |
| Element Plus | UI 组件库 |
| Pinia | 状态管理 |
| Vue Router | SPA 路由（懒加载 + 认证守卫） |
| vue-i18n | 中/英国际化 (~200 keys) |
| xterm.js | Web SSH 终端 |
| Axios | HTTP 请求 |

## 后端技术栈

| 技术 | 用途 |
|------|------|
| Express 5 | HTTP 框架 |
| ws | WebSocket |
| ssh2 | SSH 客户端 |
| mysql2 | MySQL 连接池 |
| sql.js | SQLite WASM 引擎 |
| bcryptjs | 密码哈希 |
| esbuild | 旧版 JS 打包 |

## 数据库架构

双引擎设计：SQLite（事实源）+ MySQL（可观测同步目标）

```
所有读写 → SQLite（事实源）
              │ syncFromSQLite() 实时同步
              ▼
           MySQL（可选）
              │ 不可达时
              ▼
         SQLite 继续工作（无感知回退）
```

13 张数据表：`ddns_config` | `ddns_records` | `ssl_certs` | `proxy_rules` | `ssh_config` | `cron_jobs` | `operation_logs` | `settings` | `users`

## 目录结构

```
home-server-panel/
├── src/                    # 后端
│   ├── server.js           # 入口
│   ├── routes/             # 17 个路由文件
│   ├── services/           # 17 个服务文件
│   └── services/v2/        # v2.0 设备中心
├── client/                 # Vue 3 SPA 前端
│   └── src/
│       ├── pages/          # 15 个业务页面
│       ├── components/     # 通用组件
│       ├── stores/         # Pinia 状态
│       ├── locales/        # 中/英翻译
│       └── router/         # SPA 路由
├── agent/                  # Go Agent
│   ├── main.go
│   ├── metrics_linux.go
│   ├── metrics_darwin.go
│   ├── plugin.go
│   └── release/            # 预编译二进制
├── docs/                   # 文档
├── public/                 # 旧版前端（兼容）
├── data/                   # SQLite 数据库
├── build.mjs               # esbuild 构建
└── package.json
```

## 核心设计决策

| 决策 | 理由 |
|------|------|
| SQL.js WASM 而非 better-sqlite3 | iStoreOS 无原生编译链，WASM 零依赖 |
| SQLite 事实源 + MySQL 同步 | 单机可靠 + 远程可观测；MySQL 不可达自动回退 |
| Vue 3 SPA 替代旧 jQuery | 组件化 + 懒加载 + 暗色模式 |
| bcryptjs 而非原生 bcrypt | 免编译，跨平台一致 |
| Go Agent 零依赖 | 单文件部署，降低设备端门槛 |
| BUILD_ID 缓存破坏 | 每次构建注入唯一 ID，防浏览器缓存 |

## 版本号

`v0.X.Y-beta`，X=大版本，Y=小版本。每 3 个版本更新一次文档。
