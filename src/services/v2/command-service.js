// V2 命令下发服务 — 通过 WebSocket 向远程 Agent 发送命令并等待结果
const crypto = require('crypto');
const genId = () => 'cmd_' + crypto.randomBytes(4).toString('hex');

// WS 设备连接池（由 ws-service.js 维护）
let deviceConns = null; // Map<deviceId, WebSocket>

// 待处理回调 Map<commandId, { resolve, reject, timer }>
const pending = new Map();

// 超时默认 15s
const DEFAULT_TIMEOUT = 15000;

class CommandService {
  /**
   * 初始化（由 ws-service.js 调用）
   */
  init(connsMap) {
    deviceConns = connsMap;
  }

  /**
   * 处理 Agent 返回的命令结果
   */
  handleReply(msg) {
    try {
      const { command_id, result, device_id, error } = typeof msg === 'string' ? JSON.parse(msg) : msg;
      if (!command_id || !pending.has(command_id)) return;

      const p = pending.get(command_id);
      clearTimeout(p.timer);
      pending.delete(command_id);

      if (error) {
        p.reject(new Error(error));
      } else {
        p.resolve({ device_id, result });
      }
    } catch (e) {
      // 非 JSON 消息，忽略
    }
  }

  /**
   * 向设备下发命令并等待返回
   * @param {string} deviceId - 目标设备 ID
   * @param {object} command - { action, plugin?, data? }
   * @param {number} timeout - 超时毫秒
   * @returns {Promise<object>} { device_id, result }
   */
  async send(deviceId, command, timeout = DEFAULT_TIMEOUT) {
    if (!deviceConns) throw new Error('CommandService 未初始化');

    const ws = deviceConns.get(deviceId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`设备 ${deviceId} 不在线或 WS 未连接`);
    }

    const commandId = genId();
    const msg = JSON.stringify({
      type: 'command',
      command_id: commandId,
      action: command.action,
      plugin: command.plugin || '',
      data: command.data || {}
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(commandId);
        reject(new Error(`命令 ${command.action} 超时 (${timeout}ms)`));
      }, timeout);

      pending.set(commandId, { resolve, reject, timer, deviceId, action: command.action });

      try {
        ws.send(msg);
      } catch (err) {
        clearTimeout(timer);
        pending.delete(commandId);
        reject(new Error(`发送命令失败: ${err.message}`));
      }
    });
  }

  /**
   * 简易广播命令（不等待回复，fire-and-forget）
   */
  broadcast(action, data) {
    if (!deviceConns) return;
    const msg = JSON.stringify({
      type: 'command',
      command_id: genId(),
      action,
      plugin: '',
      data: data || {}
    });
    for (const [deviceId, ws] of deviceConns) {
      if (ws.readyState === 1) {
        try { ws.send(msg); } catch (_) {}
      }
    }
  }

  /**
   * 获取在线设备列表
   */
  getOnlineDevices() {
    if (!deviceConns) return [];
    const online = [];
    for (const [deviceId, ws] of deviceConns) {
      if (ws.readyState === 1) {
        online.push(deviceId);
      }
    }
    return online;
  }

  /**
   * 是否为本地设备
   */
  isLocal(deviceId) {
    return deviceId === 'dev_local';
  }
}

module.exports = new CommandService();
