#!/bin/bash
# ============================================================
# NAS Agent 部署脚本
# 用法: ./deploy-nas-agent.sh
# 流程: 编译 → HTTP 上传 iStoreOS → NAS curl 拉取 → 替换 → 重启
# ============================================================
set -e

NAS_HOST="192.168.100.110"
NAS_USER="陈子疯"
NAS_PASS="CHAOYUE8feng"
NAS_BIN="/volume1/docker/hsp-agent-amd64"
NAS_LOG="/volume1/docker/hsp-agent.log"
ISTOREOS_HOST="192.168.100.1"
ISTOREOS_USER="root"
ISTOREOS_HTTP="http://192.168.100.1:9801"
HTTP_FILE="hsp-agent-nas-$(date +%Y%m%d_%H%M%S)"

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)/agent"
echo "🔨 编译 Agent..."
cd "$AGENT_DIR"
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "release/$HTTP_FILE" . && echo "✅ 编译完成"

echo "📤 上传到 iStoreOS HTTP..."
sshpass -p "$NAS_PASS" scp -o StrictHostKeyChecking=no "release/$HTTP_FILE" "${ISTOREOS_USER}@${ISTOREOS_HOST}:/tmp/${HTTP_FILE}"

echo "📥 NAS 下载新二进制..."
sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "${NAS_USER}@${NAS_HOST}" "
  curl -sLo /home/陈子疯/hsp-up ${ISTOREOS_HTTP}/${HTTP_FILE} && \
  chmod +x /home/陈子疯/hsp-up && \
  cp /home/陈子疯/hsp-up ${NAS_BIN} && \
  chmod +x ${NAS_BIN} && \
  echo '✅ 新二进制就绪'
"

echo "🔄 重启 Agent..."
sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "${NAS_USER}@${NAS_HOST}" "
  kill \$(pgrep -f hsp-agent) 2>/dev/null || true
  sleep 2
  nohup ${NAS_BIN} -server http://${ISTOREOS_HOST}:3456 > ${NAS_LOG} 2>&1 &
  sleep 3
  pid=\$(pgrep -f hsp-agent)
  if [ -n \"\$pid\" ]; then
    echo \"✅ Agent 已启动 PID=\$pid\"
    tail -3 ${NAS_LOG}
  else
    echo '❌ 启动失败'
  fi
"

echo "🎉 NAS Agent 部署完成！"
