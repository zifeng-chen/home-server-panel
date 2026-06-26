// ============================================================
// CommandService — WS 命令下发（双向 WebSocket 通道）
// ============================================================

const crypto = require('crypto');

const pending = new Map(); // command_id → { resolve, reject, timer, deviceId }
const DEFAULT_TIMEOUT = 30000;

/**
 * 向指定设备发送命令，返回 Promise
 * @param {string} deviceId
 * @param {string} command
 * @param {number} timeoutMs
 * @returns {Promise<{device_id:string, result:any}>}
 */
function send(deviceId, command, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const ws = getDeviceSocket(deviceId);
    if (!ws) {
      return reject(new Error(`设备 ${deviceId} 不在线`));
    }

    const commandId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(commandId);
      reject(new Error(`命令超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    pending.set(commandId, { resolve, reject, timer, deviceId });

    try {
      ws.send(JSON.stringify({ command_id: commandId, command }));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(commandId);
      reject(err);
    }
  });
}

/**
 * 批量向多台设备发送命令
 * @param {string[]} deviceIds
 * @param {string} command
 * @param {number} timeoutMs
 * @returns {Promise<Array>}
 */
async function broadcast(deviceIds, command, timeoutMs = DEFAULT_TIMEOUT) {
  const results = await Promise.allSettled(
    deviceIds.map(id => send(id, command, timeoutMs))
  );
  return results.map((r, i) => ({
    deviceId: deviceIds[i],
    status: r.status === 'fulfilled' ? 'completed' : 'failed',
    result: r.status === 'fulfilled' ? r.value.result : undefined,
    error: r.status === 'rejected' ? r.reason?.message || String(r.reason) : undefined,
  }));
}

/**
 * 处理 WS 命令回复
 */
function handleReply(msg) {
  try {
    const { command_id, result, device_id, error } = typeof msg === 'string' ? JSON.parse(msg) : msg;
    if (!command_id || !pending.has(command_id)) return;

    const p = pending.get(command_id);
    clearTimeout(p.timer);
    pending.delete(command_id);

    if (error) {
      p.reject(new Error(error));
    } else {
      p.resolve({ device_id: device_id || p.deviceId, result });
    }
  } catch (e) { /* 非 JSON 消息，忽略 */ }
}

/** 注入 WS 连接管理器引用 */
let _getSocket = () => null;
function setSocketGetter(fn) { _getSocket = fn; }
function getDeviceSocket(deviceId) { return _getSocket(deviceId); }

module.exports = { send, broadcast, handleReply, setSocketGetter, pending };
