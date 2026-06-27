# API 接口参考

> 所有 API 需 `x-auth-token` 请求头（`/api/setup/*` 除外）

---

## 认证 & 用户

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|:--:|
| POST | `/api/auth/login` | 登录，返回 token | - |
| POST | `/api/auth/logout` | 登出 | 登录用户 |
| POST | `/api/auth/change-password` | 修改密码 | 登录用户 |
| GET | `/api/auth/status` | 当前认证状态 | 登录用户 |
| GET | `/api/users` | 用户列表 | 管理员 |
| GET | `/api/users/me` | 当前用户信息 | 登录用户 |
| POST | `/api/users` | 创建用户 | 管理员 |
| PUT | `/api/users/:id` | 更新用户 | 管理员 |
| DELETE | `/api/users/:id` | 删除用户 | 管理员 |

## 系统 & 监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/system/info` | 系统信息（版本/CPU/内存/OS） |
| GET | `/api/system/uptime` | 服务运行时长 |
| GET | `/api/system/config` | 获取配置（已脱敏） |
| POST | `/api/system/config` | 保存配置并立即生效 |
| POST | `/api/system/restart` | 重启面板 |
| GET | `/api/monitor` | 实时监控数据 |
| GET | `/api/monitor/live` | 当前快照 |
| GET | `/api/monitor/history` | 历史数据 |
| GET | `/api/process` | 系统进程列表 |

## DDNS（阿里云 + 腾讯云）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ddns` | 双云记录列表 |
| GET | `/api/ddns/credentials-status` | 云密钥状态 |
| POST | `/api/ddns/domains` | 添加域名 |
| PUT | `/api/ddns/record/:id` | 编辑记录 |
| DELETE | `/api/ddns/record/:id` | 删除记录 |
| POST | `/api/ddns/record/:id/toggle` | 启停记录 |
| POST | `/api/ddns/refresh` | 手动刷新全量 |

## SSL 证书

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cert` | 证书列表（含到期状态） |
| POST | `/api/cert/issue` | 申请证书 |
| GET | `/api/cert/issue/stream` | 申请进度（SSE） |
| POST | `/api/cert/renew` | 续期单个 |
| POST | `/api/cert/renew-all` | 批量续期 |
| DELETE | `/api/cert/domains/:domain` | 删除域名+证书 |
| GET | `/api/cert/export/:domain` | 导出（cert/key/fullchain/ca/nginx/apache/zip） |

## Nginx & 反向代理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/nginx` | Nginx 状态 |
| POST | `/api/nginx/install` | 安装 |
| POST | `/api/nginx/uninstall` | 卸载 |
| POST | `/api/nginx/start\|stop\|reload\|config-test` | 启停/配置测试 |
| GET | `/api/nginx/sites` | 站点列表 |
| GET | `/api/nginx/logs` | 访问日志 |
| GET | `/api/proxy` | 代理规则列表 |
| POST | `/api/proxy` | 添加规则（自动部署） |
| PUT | `/api/proxy/:id` | 编辑规则（自动部署） |
| DELETE | `/api/proxy/:id` | 删除规则（自动部署） |
| GET | `/api/proxy/check/:id` | 检测规则可访问性 |

## Docker

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/docker` | 概览（容器+镜像+网络+存储卷） |
| GET | `/api/docker/containers` | 容器列表 |
| GET | `/api/docker/containers/:id` | 容器详情+实时 Stats |
| GET | `/api/docker/containers/:id/logs` | 容器日志 |
| GET | `/api/docker/containers/:id/logs/stream` | 日志流（SSE） |
| POST | `/api/docker/containers/:id/start\|stop\|restart\|pause\|unpause\|kill` | 容器操作 |
| POST | `/api/docker/containers/:id/update` | 重建容器 |
| DELETE | `/api/docker/containers/:id` | 删除容器 |
| GET | `/api/docker/images` | 镜像列表 |

## SSH 终端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ssh/config` | 连接配置列表 |
| POST | `/api/ssh/config` | 新增配置 |
| PUT | `/api/ssh/config/:id` | 更新配置 |
| DELETE | `/api/ssh/config/:id` | 删除配置 |
| POST | `/api/ssh/connect` | 建立连接 |
| GET | `/api/ssh/sessions` | 活跃会话 |
| POST | `/api/ssh/disconnect/:id` | 断开 |

WebSocket 终端：`ws://host:port/ws/ssh`（通过 Cookie `hsp_token` 认证）

## 设备中心（v2.0）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v2/device` | 设备列表+在线状态 |
| GET | `/api/v2/device/stats` | 设备统计（online/offline/total） |
| GET | `/api/v2/device/:id` | 设备详情+指标+进程+连接 |
| GET | `/api/v2/device/:id/metrics` | 历史指标（range: 1h/12h/7d） |
| GET | `/api/v2/device/:id/processes` | 进程列表 |
| GET | `/api/v2/device/:id/connections` | 网络连接 |
| GET | `/api/v2/device/:id/commands` | 命令历史 |
| POST | `/api/v2/device/register` | 设备注册（Agent 用） |
| POST | `/api/v2/device/heartbeat` | 心跳上报 |
| POST | `/api/v2/device/report` | 指标上报 |
| POST | `/api/v2/device/commands/batch` | 批量命令（多选发送） |
| POST | `/api/v2/device/:id/command` | 向设备发送命令 |
| PUT | `/api/v2/device/:id/tags` | 更新设备标签 |
| DELETE | `/api/v2/device/:id` | 删除设备（级联） |

### 告警规则

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v2/alert/rules` | 告警规则列表 |
| POST | `/api/v2/alert/rules` | 创建规则 |
| PUT | `/api/v2/alert/rules/:id` | 更新规则 |
| DELETE | `/api/v2/alert/rules/:id` | 删除规则 |

WebSocket 命令通道：`ws://host:port/api/v2/device/ws`（`x-device-id` + `x-device-secret` 认证）

## 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/port` | TCP+UDP 端口扫描 |
| POST | `/api/notify/test` | 测试推送通知 |
| GET | `/api/log` | 操作日志（分页+筛选） |
| GET | `/api/log/export` | 日志导出（JSON/CSV） |
| GET\|POST\|PUT\|DELETE | `/api/cron` | 定时任务 CRUD |
| POST | `/api/cron/:id/run` | 立即执行 |
| GET\|POST | `/api/pm2/*` | PM2 进程管理+安装/卸载 |
| GET\|POST | `/api/db/*` | 数据库状态/同步/导入/导出 |
| POST | `/api/setup/*` | 引导安装（无需认证） |
