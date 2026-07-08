# HSP Panel 打包发行

支持两种安装包格式，适用于 iStoreOS / OpenWrt 及通用 Linux。

## 格式

| 格式 | 平台 | 安装 | 体积 |
|------|------|------|------|
| `.ipk` | iStoreOS / OpenWrt x86_64 | `opkg install hsp-panel_*.ipk` | ~82MB |
| `.run` | 任何 Linux（含 BusyBox） | `chmod +x hsp-panel_*.run && ./hsp-panel_*.run` | ~82MB |

## 打包

```bash
./packaging/build.sh
```

产物在 `./dist/` 目录下。

## ipk 打包原理

使用 OpenWrt 标准 ipk 格式：

```
hsp-panel_x.x.x_x86_64.ipk
├── debian-binary          ("2.0")
├── control.tar.gz
│   └── control            (包元数据)
└── data.tar.gz
    ├── etc/init.d/hsp-panel   (procd init 脚本)
    ├── etc/config/hsp-panel   (uci 配置文件)
    └── usr/share/hsp-panel/   (所有应用文件)
```

## run 打包原理

Shell 脚本头部 + `uuencode`/直接 `tar.gz` 尾部，自解压到 `/opt/hsp-panel/`，自动创建 init.d 链接。

## 文件布局（打包后）

```
/opt/hsp-panel/          ← .run 或 .ipk data.tar.gz
├── app/                 ← src/ + package.json + node_modules
│   ├── src/
│   ├── node_modules/
│   └── package.json
├── client/              ← 前端 SPA
│   └── dist/
├── agent/               ← Go Agent 二进制
│   └── hsp-agent-*
└── .env                 ← 由安装器或首次启动生成
```
