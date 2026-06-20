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
    // 认证：从 Cookie 读取 token
    const cookieToken = (req.headers.cookie || '').split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('hsp_token='))
      ?.split('=')[1];
    const token = cookieToken;
    if (!token || !auth.verifyToken(token)) {
      ws.send(JSON.stringify({ type: 'error', message: '未登录或 token 已过期' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    let sessionId = null;
    let listeners = [];
    let cols = 80, rows = 24;

    // 具名监听器（定义在 connection 作用域，避免重复注册）
    const onStatus = (sid, status) => {
      if (sid === sessionId && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'status', status }));
        // SSH 连接就绪后自动开启交互式 shell
        if (status === 'connected') {
          sshService.startShell(sessionId, { cols, rows })
            .then(() => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'ready', sessionId }));
              }
            })
            .catch(err => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: err.message }));
              }
            });
        }
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

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'connect': {
            cols = msg.cols || 80;
            rows = msg.rows || 24;
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

          case 'input': {
            if (sessionId) sshService.write(sessionId, msg.data);
            break;
          }

          case 'resize': {
            cols = msg.cols;
            rows = msg.rows;
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
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: '协议错误: ' + e.message }));
        }
      }
    });

    ws.on('close', () => {
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
