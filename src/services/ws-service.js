// WebSocket 服务 - SSH 终端实时通道
const { WebSocketServer } = require('ws');
const auth = require('./auth');
const sshService = require('./ssh-service');

let wss = null;

/**
 * 初始化 WebSocket 服务器（绑定到 HTTP server）
 */
function init(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws/ssh' });

  wss.on('connection', (ws, req) => {
    // 认证：优先从 Cookie 读取，fallback 到 URL 参数（兼容旧版）
    const url = new URL(req.url, 'http://localhost');
    const cookieToken = (req.headers.cookie || '').split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('hsp_token='))
      ?.split('=')[1];
    const token = cookieToken || url.searchParams.get('token');

    if (!token || !auth.verifyToken(token)) {
      ws.send(JSON.stringify({ type: 'error', message: '未登录或 token 已过期' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    let sessionId = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // 具名监听器引用，用于断开时清理
        const listeners = [];
        const onStatus = (sid, status) => {
          if (sid === sessionId && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'status', status }));
          }
        };
        const onData = (sid, data) => {
          if (sid === sessionId && ws.readyState === ws.OPEN) {
            ws.send(data);
          }
        };
        const onError = (sid, errMsg) => {
          if (sid === sessionId && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: errMsg }));
          }
        };

        switch (msg.type) {
          case 'connect': {
            sessionId = sshService.connect({
              host: msg.host,
              port: msg.port || 22,
              username: msg.username,
              password: msg.password
            });

            sshService.on('status', onStatus);
            sshService.on('data', onData);
            sshService.on('error', onError);
            listeners.push(
              { event: 'status', fn: onStatus },
              { event: 'data', fn: onData },
              { event: 'error', fn: onError }
            );
            break;
          }

          case 'shell': {
            if (!sessionId) {
              ws.send(JSON.stringify({ type: 'error', message: '请先建立 SSH 连接' }));
              return;
            }
            sshService.startShell(sessionId, {
              cols: msg.cols || 80,
              rows: msg.rows || 24
            }).then(() => {
              ws.send(JSON.stringify({ type: 'ready', sessionId }));
            }).catch(err => {
              ws.send(JSON.stringify({ type: 'error', message: err.message }));
            });
            break;
          }

          case 'input': {
            if (sessionId) sshService.write(sessionId, msg.data);
            break;
          }

          case 'resize': {
            if (sessionId) sshService.resize(sessionId, msg.cols, msg.rows);
            break;
          }

          case 'disconnect': {
            if (sessionId) {
              sshService.disconnect(sessionId);
              sessionId = null;
            }
            break;
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: '协议错误: ' + e.message }));
      }
    });

    ws.on('close', () => {
      // 清理所有 SSH 事件监听器
      for (const { event, fn } of listeners) {
        sshService.off(event, fn);
      }
      if (sessionId) {
        sshService.disconnect(sessionId);
        sessionId = null;
      }
    });

    ws.on('error', () => {
      for (const { event, fn } of listeners) {
        sshService.off(event, fn);
      }
      if (sessionId) {
        sshService.disconnect(sessionId);
        sessionId = null;
      }
    });
  });

  return wss;
}

module.exports = { init };