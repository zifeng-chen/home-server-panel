# 安全架构

## 认证体系

| 层级 | 措施 |
|------|------|
| 密码存储 | bcryptjs（saltRounds=10） |
| SSH 密码 | AES-256-GCM 加密（随机 IV + auth tag） |
| 认证通道 | `x-auth-token` 请求头 + Cookie `hsp_token` 双重验证 |
| 会话 | Cookie httpOnly + sameSite=strict |
| 登录保护 | IP 速率限制：30秒内 5 次失败 → 冷却 60 秒 |

## 权限模型

| 角色 | 权限 |
|------|------|
| admin（管理员） | 全部读/写，包括用户管理、Cron 自定义脚本 |
| user（普通用户） | 只读访问，不可修改配置 |

## 接口防护

| 措施 | 范围 |
|------|------|
| 全局限流 | 120 req/min（普通 API）、20 req/min（昂贵操作） |
| Cron 脚本 | 黑名单拦截（rm -rf /、shutdown、mkfs 等）+ 管理员权限 |
| 命令注入 | 端口号 1-65535 校验、Nginx method 白名单 |
| 路径遍历 | path.resolve + path.normalize + startsWith 三重确认 |
| 错误脱敏 | 生产环境替换文件路径和内网 IP 为 `[PATH]` / `[IP]` |

## 前端安全

| 措施 | 说明 |
|------|------|
| CSP | `script-src 'self' 'unsafe-eval'`（Vue 3 运行时需 eval） |
| HSTS | max-age=31536000; includeSubDomains |
| XSS | Vue 模板自动转义，escapeHtml 兜底 |
| 环境变量 | `.env` 不提交到 git |

## Agent 安全

| 措施 | 说明 |
|------|------|
| 设备身份 | hostname + arch 生成唯一 Device ID |
| 认证 | HTTP `x-device-id` + `x-device-secret` 双 header |
| 密钥生成 | SHA256(deviceID + salt) 自动生成，无需人为配置 |
| 插件沙箱 | 命令模板变量替换（`{target}` → 用户输入），超时硬限制（5-10s） |
| 心跳超限 | 连续 10 次失败自动重新注册 |

## 数据保护

- 云凭据（阿里云/腾讯云 AccessKey）存储在 `.env` 和 SQLite settings 表，前端接口返回脱敏版本（仅保留前 8 位 + `****`）
- PushPlus Token 返回脱敏（前 6 位 + `****`）
- SSH 私钥和密码采用 AES-256-GCM 加密后存储

---

> 安全审计评分：7.5/10（v0.9.2-beta）— 无远程代码执行漏洞，核心防护到位
