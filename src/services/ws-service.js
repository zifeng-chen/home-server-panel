// WebSocket 服务 - SSH 终端 + V2 设备命令通道
const { WebSocketServer } = require('ws');
const auth = require('./auth');
const sshService = require('./ssh-service');
const commandService = require('./v2/command-service');

let deviceWss = null;

// 设备连接映射 (deviceId → ws) — 使用独立模块避免循环依赖
const deviceConns = require('./v2/device-connections');

/**
 * 初始化 WebSocket 服务（绑定到 HTTP server）
 */
function init(httpServer) {
  console.log('[WS] init called, httpServer:', !!httpServer);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    console.log('[WS] upgrade event:', request.url);
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    console.log('[WS] pathname:', pathname);

    if (pathname === '/ws/ssh') {
      // SSH 终端通道 — Cookie 认证
      const cookieToken = (request.headers.cookie || '').split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('hsp_token='))
        ?.split('=')[1];
      if (!cookieToken || !auth.verifyToken(cookieToken)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleSshConnection(ws);
      });
    } else if (pathname === '/api/v2/device/ws') {
      // V2 设备命令通道 — Device ID + Secret 认证
      const deviceId = request.headers['x-device-id'];
      const deviceSecret = request.headers['x-device-secret'];
      console.log('[WS] 设备升级请求:', deviceId);
      if (!deviceId || !deviceSecret) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
      }

      const deviceService = require('./v2/device-service');
      deviceService.verifyDevice(deviceId, deviceSecret)
        .then(valid => {
          if (!valid) {
            console.log('[WS] 设备认证失败:', deviceId);
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
            socket.destroy();
            return;
          }
          wss.handleUpgrade(request, socket, head, (ws) => {
            console.log(`[WS] 设备 WS 已连接: ${deviceId}`);
            deviceConns.set(deviceId, ws);
            // commandService 直接引用 device-connections 模块，无需 init

            ws.on('close', () => {
              console.log(`[WS] 设备 WS 断开: ${deviceId}`);
              deviceConns.delete(deviceId);
            });
            ws.on('message', (raw) => {
              try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'cmd_result') {
                  // 转发给命令服务（Promise 回调）
                  commandService.handleReply(msg);
                  // 同时持久化到数据库
                  const { command_id, result } = msg;
                  deviceService.updateCommandResult(command_id, {
                    status: result && result.error ? 'failed' : 'completed',
                    result: JSON.stringify(result),
                    exitCode: result && result.error ? 1 : 0
                  }).catch(() => {});
                }
              } catch (e) { /* ignore */ }
            });
            ws.on('error', () => deviceConns.delete(deviceId));
          });
        })
        .catch(err => {
          console.error('[WS] 设备认证异常:', deviceId, err.message, err.stack);
          socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
          socket.destroy();
        });
    } else {
      // Unknown path, destroy
      socket.destroy();
    }
  });

  deviceWss = wss;
  return wss;
}

/**
 * 向设备发送命令
 */
function sendToDevice(deviceId, command) {
  const ws = deviceConns.get(deviceId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(command));
  return true;
}

function isDeviceOnline(deviceId) {
  const ws = deviceConns.get(deviceId);
  return ws && ws.readyState === ws.OPEN;
}

function getOnlineDeviceCount() {
  return deviceConns.size;
}

// === SSH 终端连接处理 ===
function handleSshConnection(ws) {
  let sessionId = null;
  let listeners = [];
  let cols = 80, rows = 24;

  const onStatus = (sid, status) => {
    if (sid === sessionId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'status', status }));
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
    if (sid === sessionId && ws.readyState === ws.OPEN) ws.send(data);
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
          cols = msg.cols || 80; rows = msg.rows || 24;
          sessionId = sshService.connect({
            host: msg.host, port: msg.port || 22,
            username: msg.username, password: msg.password
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
        case 'input': if (sessionId) sshService.write(sessionId, msg.data); break;
        case 'resize':
          cols = msg.cols; rows = msg.rows;
          if (sessionId) sshService.resize(sessionId, msg.cols, msg.rows); break;
        case 'disconnect':
          if (sessionId) { sshService.disconnect(sessionId); sessionId = null; }
          break;
      }
    } catch (e) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: '协议错误: ' + e.message }));
      }
    }
  });

  ws.on('close', () => {
    for (const { event, fn } of listeners) sshService.off(event, fn);
    if (sessionId) { sshService.disconnect(sessionId); sessionId = null; }
  });
  ws.on('error', () => {
    for (const { event, fn } of listeners) sshService.off(event, fn);
    if (sessionId) { sshService.disconnect(sessionId); sessionId = null; }
  });
}

module.exports = { init, sendToDevice, isDeviceOnline, getOnlineDeviceCount };
