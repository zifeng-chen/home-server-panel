// V2 命令下发服务 — 通过 WebSocket 向远程 Agent 发送命令并等待结果
const crypto = require('crypto');
const genId = () => 'cmd_' + crypto.randomBytes(4).toString('hex');

// WS 设备连接池 — 独立模块打破循环依赖
const deviceConns = require('./device-connections');

// 待处理回调 Map<commandId, { resolve, reject, timer }>
const pending = new Map();

// 超时默认 15s
const DEFAULT_TIMEOUT = 15000;

class CommandService {

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
    const ws = deviceConns.get(deviceId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`设备 ${deviceId} 不在线或 WS 未连接`);
    }

    const commandId = genId();
    const msg = JSON.stringify({
      type: 'command',
      command_id: commandId,
      action: command.action,
      command: command.command || '',
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
    const msg = JSON.stringify({
      type: 'command',
      command_id: genId(),
      action,
      plugin: '',
      data: data || {}
    });
    for (const [dId, ws] of deviceConns) {
      if (ws.readyState === 1) {
        try { ws.send(msg); } catch (_) {}
      }
    }
  }

  /**
   * 并行向多台设备下发命令，聚合逐设备结果（批量命令用）
   * @param {string[]} deviceIds
   * @param {object} command - { action, command, plugin, data }
   * @param {{timeout?:number, concurrency?:number}} opts
   * @returns {Promise<{results:Array, totalMs:number}>}
   */
  async sendMany(deviceIds, command, opts = {}) {
    const timeout = opts.timeout || DEFAULT_TIMEOUT;
    const concurrency = Math.max(1, Math.min(opts.concurrency || 5, 20));
    const list = [...new Set((deviceIds || []).filter(Boolean))];
    const results = new Array(list.length);
    let cursor = 0;
    const startedAt = Date.now();

    const worker = async () => {
      while (cursor < list.length) {
        const idx = cursor++;
        const deviceId = list[idx];
        const t0 = Date.now();
        try {
          const reply = await this.send(deviceId, command, timeout);
          const r = (reply && reply.result) || {};
          const stdout = typeof r.stdout === 'string' ? r.stdout
            : (typeof r.output === 'string' ? r.output : '');
          results[idx] = {
            deviceId,
            ok: !r.error && (typeof r.exit_code !== 'number' || r.exit_code === 0),
            stdout,
            stderr: typeof r.stderr === 'string' ? r.stderr : '',
            exitCode: typeof r.exit_code === 'number' ? r.exit_code : (r.error ? 1 : 0),
            error: r.error || '',
            duration: Date.now() - t0,
          };
        } catch (err) {
          results[idx] = {
            deviceId,
            ok: false,
            stdout: '',
            stderr: '',
            exitCode: -1,
            error: err.message,
            duration: Date.now() - t0,
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, list.length) }, () => worker())
    );
    return { results, totalMs: Date.now() - startedAt };
  }

  /**
   * 获取在线设备列表
   */
  getOnlineDevices() {
    const online = [];
    for (const [dId, ws] of deviceConns) {
      if (ws.readyState === 1) {
        online.push(dId);
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
