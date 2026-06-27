#!/bin/bash
# ============================================================
# iStoreOS Agent 部署脚本
# 用法: ./deploy-istoreos-agent.sh
# ============================================================
set -e

ISTOREOS_HOST="192.168.100.1"
ISTOREOS_USER="root"
ISTOREOS_PASS="CHAOYUE8feng"
AGENT_BIN="/root/agent/hsp-agent-latest"
AGENT_LOG="/root/agent/agent.log"

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)/agent"
echo "🔨 编译 Agent..."
cd "$AGENT_DIR"
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /tmp/hsp-agent-istoreos . && echo "✅ 编译完成"

echo "🛑 停止旧 Agent..."
sshpass -p "$ISTOREOS_PASS" ssh -o StrictHostKeyChecking=no "${ISTOREOS_USER}@${ISTOREOS_HOST}" "
  kill \$(pgrep -f hsp-agent) 2>/dev/null || true
  sleep 2
  pgrep -f hsp-agent || echo '已停止'
"

echo "📤 上传新二进制..."
sshpass -p "$ISTOREOS_PASS" scp -o StrictHostKeyChecking=no /tmp/hsp-agent-istoreos "${ISTOREOS_USER}@${ISTOREOS_HOST}:${AGENT_BIN}"

echo "🚀 启动 Agent..."
sshpass -p "$ISTOREOS_PASS" ssh -o StrictHostKeyChecking=no "${ISTOREOS_USER}@${ISTOREOS_HOST}" "
  chmod +x ${AGENT_BIN}
  nohup ${AGENT_BIN} -server http://localhost:3456 > ${AGENT_LOG} 2>&1 &
  sleep 3
  pid=\$(pgrep -f hsp-agent)
  if [ -n \"\$pid\" ]; then
    echo \"✅ Agent PID=\$pid\"
    head -3 ${AGENT_LOG}
  else
    echo '❌ 启动失败'
  fi
"

rm -f /tmp/hsp-agent-istoreos
echo "🎉 iStoreOS Agent 部署完成！"
