#!/bin/bash
set -e
echo "========================================="
echo "  Home Server Panel - 一键安装脚本"
echo "  v1.6.1"
echo "========================================="
echo ""

# Node.js check
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Install Node.js v18+ first."
    echo "        https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js $(node -v)"

# npm check
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found"
    exit 1
fi
echo "[OK] npm $(npm -v)"

# Install dir
INSTALL_DIR="${1:-/opt/home-server-panel}"
echo "[INFO] Install to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    read -p "[WARN] Directory exists. Overwrite? (y/N) " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "[ABORT] Cancelled"
        exit 0
    fi
    rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"
cp -r . "$INSTALL_DIR/" 2>/dev/null || cp -r * "$INSTALL_DIR/"
cd "$INSTALL_DIR"

echo "[INSTALL] npm install..."
npm install --production 2>&1 | tail -3

# Init config
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    echo "[CONFIG] Edit $INSTALL_DIR/.env to set your keys"
fi

mkdir -p data/logs

echo ""
echo "========================================="
echo "  Install complete!"
echo "========================================="
echo "  Config: $INSTALL_DIR/.env"
echo "  Start:  cd $INSTALL_DIR && node src/server.js"
echo "  PM2:    pm2 start src/server.js --name hsp"
echo "  Access: http://localhost:3456"
echo "  Login:  admin / admin123"
echo "========================================="
