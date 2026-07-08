#!/bin/bash
# HSP Panel 打包构建脚本
# 输出: dist/hsp-panel_*.ipk (iStoreOS/OpenWrt) + dist/hsp-panel_*.run (通用Linux自解压)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$SCRIPT_DIR/dist"

PACKAGE="hsp-panel"
VERSION="0.9.4-beta"
ARCH="${ARCH:-x86_64}"
APP_NAME="hsp-panel"

echo "╔══════════════════════════════════════════════╗"
echo "║   HSP Panel v$VERSION 打包 ($ARCH)"
echo "╚══════════════════════════════════════════════╝"

# ── 清理 ──
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# ══════════════════════════════════════════════════════════
# 1. 构建前端
# ══════════════════════════════════════════════════════════
echo ""
echo "[1/4] 构建前端..."
cd "$REPO_DIR/client"
npx vite build >/dev/null 2>&1 || { echo "  ✗ vite build 失败"; exit 1; }
echo "  ✓ SPA 构建完成"

cd "$REPO_DIR"
node build.mjs >/dev/null 2>&1 || { echo "  ✗ build.mjs 失败"; exit 1; }
echo "  ✓ Bundle 构建完成"

# ══════════════════════════════════════════════════════════
# 2. 准备 ipk 数据
# ══════════════════════════════════════════════════════════
echo ""
echo "[2/4] 准备数据..."
IPK_DATA_DIR="/tmp/hsp-ipk-data"
rm -rf "$IPK_DATA_DIR"
mkdir -p "$IPK_DATA_DIR/usr/share/$APP_NAME"/{app,client,agent}

# 后端
cp -r src "$IPK_DATA_DIR/usr/share/$APP_NAME/app/src"
cp package.json "$IPK_DATA_DIR/usr/share/$APP_NAME/app/"
cp -r node_modules "$IPK_DATA_DIR/usr/share/$APP_NAME/app/node_modules" 2>/dev/null || true

# 前端
cp -r client/dist "$IPK_DATA_DIR/usr/share/$APP_NAME/client/"
cp -r public "$IPK_DATA_DIR/usr/share/$APP_NAME/public/" 2>/dev/null || true

# Agent
AGENT_SRC="$REPO_DIR/agent/release/hsp-agent-amd64"
if [ -f "$AGENT_SRC" ]; then
  cp "$AGENT_SRC" "$IPK_DATA_DIR/usr/share/$APP_NAME/agent/hsp-agent"
  chmod +x "$IPK_DATA_DIR/usr/share/$APP_NAME/agent/hsp-agent"
fi

# ipk init.d (procd 兼容)
mkdir -p "$IPK_DATA_DIR/etc/init.d"
cp "$SCRIPT_DIR/ipk/etc/init.d/hsp-panel" "$IPK_DATA_DIR/etc/init.d/hsp-panel"
chmod +x "$IPK_DATA_DIR/etc/init.d/hsp-panel"

echo "  ✓ 数据准备完成 ($(du -sh $IPK_DATA_DIR | cut -f1))"

# ══════════════════════════════════════════════════════════
# 3. 打包 ipk（用 python3 生成标准 ar 格式）
# ══════════════════════════════════════════════════════════
echo ""
echo "[3/4] 打包 ipk (ar 格式)..."

IPK_WORK="/tmp/hsp-ipk-archive"
rm -rf "$IPK_WORK"
mkdir -p "$IPK_WORK"

cd "$IPK_DATA_DIR"
tar czf "$IPK_WORK/data.tar.gz" .

cd "$SCRIPT_DIR/ipk/CONTROL"
tar czf "$IPK_WORK/control.tar.gz" control

echo "2.0" > "$IPK_WORK/debian-binary"

# 用 python3 生成标准 ar 格式（Mac ar 输出 BSD 不兼容）
IPK_FILE="$DIST_DIR/${PACKAGE}_${VERSION}_${ARCH}.ipk"
WORK_DIR="$IPK_WORK" IPK_FILE="$IPK_FILE" python3 -c "
import struct, os, json
wd = os.environ['WORK_DIR']
out_path = os.environ.get('IPK_FILE', wd + '/result.ipk')
files = [
    ('debian-binary', os.path.getsize(os.path.join(wd, 'debian-binary'))),
    ('control.tar.gz', os.path.getsize(os.path.join(wd, 'control.tar.gz'))),
    ('data.tar.gz', os.path.getsize(os.path.join(wd, 'data.tar.gz'))),
]
with open(out_path, 'wb') as out:
    out.write(b'!<arch>\n')
    for fname, fsize in files:
        header = struct.pack('16s12s6s6s8s10s2s',
            fname.encode().ljust(16, b' '),
            b'0'.rjust(12, b' '),
            b'0'.rjust(6, b' '),
            b'0'.rjust(6, b' '),
            b'100644'.rjust(8, b' '),
            str(fsize).encode().rjust(10, b' '),
            b'\x60\x0a')
        out.write(header)
        with open(os.path.join(wd, fname), 'rb') as f:
            out.write(f.read())
        if fsize % 2 != 0:
            out.write(b'\n')
"

IPK_SIZE=$(stat -f%z "$IPK_FILE" 2>/dev/null || stat -c%s "$IPK_FILE" 2>/dev/null || echo 0)
if [ "$IPK_SIZE" -gt 1000 ]; then
  echo "  ✓ ipk: ${PACKAGE}_${VERSION}_${ARCH}.ipk ($(echo "scale=1; $IPK_SIZE/1024/1024" | bc)MB)"
else
  echo "  ✗ ipk 打包失败 (只有 $IPK_SIZE bytes)"
  exit 1
fi

# ══════════════════════════════════════════════════════════
# 4. 打包 .run (自解压安装器)
# ══════════════════════════════════════════════════════════
echo ""
echo "[4/4] 打包 .run 自解压安装器..."

RUN_DATA_DIR="/tmp/hsp-run-data"
rm -rf "$RUN_DATA_DIR"
mkdir -p "$RUN_DATA_DIR/app" "$RUN_DATA_DIR/client" "$RUN_DATA_DIR/agent"

# 平铺目录，解压到安装根目录
cp -r "$IPK_DATA_DIR/usr/share/$APP_NAME/app/"* "$RUN_DATA_DIR/app/"
cp -r "$IPK_DATA_DIR/usr/share/$APP_NAME/client/"* "$RUN_DATA_DIR/client/"
cp -r "$IPK_DATA_DIR/usr/share/$APP_NAME/agent/"* "$RUN_DATA_DIR/agent/" 2>/dev/null || true
cp -r "$IPK_DATA_DIR/usr/share/$APP_NAME/public/"* "$RUN_DATA_DIR/public/" 2>/dev/null || true

# init.d 脚本（standalone，不依赖 rc.common/procd）
mkdir -p "$RUN_DATA_DIR/etc/init.d"
cat > "$RUN_DATA_DIR/etc/init.d/$APP_NAME" <<-INITRUN
#!/bin/sh
# HSP Panel — 自解压安装版
# 程序在 /opt/hsp-panel/
APP_DIR="/opt/$APP_NAME/app"
PID_FILE="/var/run/$APP_NAME.pid"
LOG_FILE="/opt/$APP_NAME/hsp.log"

start() {
	[ -f "\$APP_DIR/.env" ] || {
		cat > "\$APP_DIR/.env" <<-EOF
PORT=3456
HOST=0.0.0.0
DB_MODE=sqlite
NODE_ENV=production
EOF
	}
	cd "\$APP_DIR"
	nohup node src/server.js >> "\$LOG_FILE" 2>&1 &
	echo \$! > \$PID_FILE
	sleep 1
	echo "HSP Panel started (PID \$(cat \$PID_FILE))"
}

stop() {
	pid=\$(cat \$PID_FILE 2>/dev/null)
	[ -n "\$pid" ] && kill "\$pid" 2>/dev/null
	rm -f \$PID_FILE
	echo "HSP Panel stopped"
}

restart() { stop; sleep 1; start; }

case "\$1" in
	start|stop|restart) "\$1" ;;
	*) echo "Usage: \$0 {start|stop|restart}"; exit 1 ;;
esac
INITRUN
chmod +x "$RUN_DATA_DIR/etc/init.d/$APP_NAME"

# 自解压安装器脚本
RUN_FILE="$DIST_DIR/${PACKAGE}_${VERSION}_${ARCH}.run"
cat > /tmp/hsp_installer.sh <<-RUNSH
#!/bin/sh
# HSP Panel v$VERSION — 自解压安装器
# 支持 iStoreOS / OpenWrt / 通用 Linux
# 用法: ./\$(basename \$0) [install|uninstall]

INSTALL_DIR="/opt/$APP_NAME"
APP_NAME="$APP_NAME"
VERSION="$VERSION"

install_pkg() {
	echo "========================================"
	echo "  HSP Panel v\$VERSION"
	echo "  家庭服务器管理面板"
	echo "========================================"
	echo ""
	echo "→ 安装到: \$INSTALL_DIR"
	
	mkdir -p "\$INSTALL_DIR"
	
	# 解压内嵌 tar 数据
	ARCHIVE_START=\$(awk '/^__TAR_ARCHIVE__/{print NR+1; exit}' "\$0")
	tail -n +\$ARCHIVE_START "\$0" | tar xzf - -C "\$INSTALL_DIR" 2>&1
	
	# 安装 init.d
	if [ -d /etc/init.d ]; then
		cp "\$INSTALL_DIR/etc/init.d/\$APP_NAME" /etc/init.d/\$APP_NAME
		chmod +x /etc/init.d/\$APP_NAME
	fi
	
	# 默认 .env
	if [ ! -f "\$INSTALL_DIR/app/.env" ]; then
		cat > "\$INSTALL_DIR/app/.env" <<-EOF
PORT=3456
HOST=0.0.0.0
DB_MODE=sqlite
NODE_ENV=production
EOF
	fi
	
	echo ""
	echo "✅ 安装完成！"
	echo ""
	echo "   启动: /etc/init.d/\$APP_NAME start"
	echo "   停止: /etc/init.d/\$APP_NAME stop"
	echo "   日志: tail -f \$INSTALL_DIR/hsp.log"
	echo "   访问: http://<路由器地址>:3456"
	echo "   （如有旧配置，请手动复制 .env 到 \$INSTALL_DIR/app/）"
	echo ""
}

uninstall_pkg() {
	echo "→ 卸载 HSP Panel..."
	/etc/init.d/\$APP_NAME stop 2>/dev/null || true
	rm -f /etc/init.d/\$APP_NAME
	rm -rf "\$INSTALL_DIR"
	echo "✅ 已卸载"
}

case "\${1:-install}" in
	install) install_pkg ;;
	uninstall) uninstall_pkg ;;
	*) echo "用法: \$0 {install|uninstall}"; exit 1 ;;
esac
exit 0
__TAR_ARCHIVE__
RUNSH

# 拼接 install 脚本 + tar 数据
cd "$RUN_DATA_DIR"
tar czf /tmp/hsp_run_payload.tar.gz .
cat /tmp/hsp_installer.sh /tmp/hsp_run_payload.tar.gz > "$RUN_FILE"
chmod +x "$RUN_FILE"

RUN_SIZE=$(stat -f%z "$RUN_FILE")
echo "  ✓ run: ${PACKAGE}_${VERSION}_${ARCH}.run ($(echo "scale=1; $RUN_SIZE/1024/1024" | bc)MB)"

# ── 清理 ──
rm -rf "$IPK_DATA_DIR" "$IPK_WORK" "$RUN_DATA_DIR" /tmp/hsp_installer.sh /tmp/hsp_run_payload.tar.gz

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   打包完成！                                   ║"
echo "╚══════════════════════════════════════════════╝"
ls -lh "$DIST_DIR/"
