# HSP Agent

HSP 设备代理 — Go 单文件，零依赖，运行在被管理设备上。

**版本**: v2.0.0

## 一句话说明

把这程序装到设备上，设备就自动出现在 HSP 面板的设备中心里，能看到实时指标，能远程发命令。

## 快速使用

```bash
# 1. 下载（选对应架构）
# agent/release/hsp-agent-linux-amd64   → x86_64 Linux
# agent/release/hsp-agent-linux-arm64   → ARM64 Linux
# agent/release/hsp-agent-darwin-arm64  → Apple Silicon Mac

# 2. 丢到 /usr/local/bin/，加执行权限
chmod +x /usr/local/bin/hsp-agent

# 3. 启动（填你 HSP 面板的地址）
hsp-agent -server http://192.168.100.1:3456
```

## 参数

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `-server` | HSP 面板地址 | `http://192.168.100.1:3456` |
| `-name` | 显示名称 | 系统 hostname |
| `-secret` | 认证密钥 | 自动生成 |

## 完整文档

→ **[docs/AGENT.md](../docs/AGENT.md)** — 详细说明、自启动配置（systemd/launchd）、故障排查

→ **[docs/INSTALL.md](../docs/INSTALL.md)** — HSP 服务端 + Agent 完整部署流程

## 从源码编译

```bash
cd agent
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o release/hsp-agent-linux-amd64
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o release/hsp-agent-linux-arm64
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o release/hsp-agent-darwin-arm64
```

需要 Go 1.24+。
