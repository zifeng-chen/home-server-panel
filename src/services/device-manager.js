/**
 * Device Manager - 设备管理服务
 *
 * 负责：设备注册、认证、心跳、状态管理、指标存储
 */

const db = require('./db');
const crypto = require('crypto');

// 设备离线判定超时 (秒)
const OFFLINE_TIMEOUT = 180;

const DeviceManager = {
  /**
   * 注册新设备
   */
  async register({ hostname, os, arch, agentVersion, ip }) {
    const deviceId = 'dev_' + crypto.randomBytes(12).toString('hex');
    const deviceSecret = crypto.randomBytes(16).toString('hex');

    await db.execute(
      `INSERT INTO devices (id, name, hostname, ip, os, arch, version, status, last_seen, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'online', NOW(), NOW())`,
      [deviceId, hostname, hostname, ip || '', os, arch, agentVersion || '1.0.0']
    );

    console.log(`[DeviceManager] 新设备注册: ${deviceId} (${hostname})`);
    return { device_id: deviceId, device_secret: deviceSecret };
  },

  /**
   * 验证设备凭证
   */
  async verify(deviceId, deviceSecret) {
    const device = await db.queryOne(
      'SELECT * FROM devices WHERE id = ?',
      [deviceId]
    );
    if (!device) return null;

    // 注意：实际部署时 secret 应存储在单独的表或加密存储中
    // V1 阶段简化：通过 device_secret 查找（后续可改为 devices 表加 secret_hash 字段）
    return device;
  },

  /**
   * 心跳上报
   */
  async heartbeat(deviceId) {
    const result = await db.execute(
      'UPDATE devices SET status = ?, last_seen = NOW() WHERE id = ?',
      ['online', deviceId]
    );
    return result.affectedRows > 0;
  },

  /**
   * 检测离线设备
   */
  async detectOffline() {
    const result = await db.execute(
      `UPDATE devices SET status = 'offline'
       WHERE status = 'online'
       AND last_seen < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [OFFLINE_TIMEOUT]
    );
    if (result.affectedRows > 0) {
      console.log(`[DeviceManager] ${result.affectedRows} 台设备标记为离线`);
    }
    return result.affectedRows;
  },

  /**
   * 获取设备列表
   */
  async list({ status, page = 1, pageSize = 20 } = {}) {
    let sql = 'SELECT * FROM devices';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY last_seen DESC';

    const offset = (page - 1) * pageSize;
    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    const rows = await db.query(sql, params);

    // 总数
    let countSql = 'SELECT COUNT(*) as total FROM devices';
    let countParams = [];
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
      countParams = conditions.map(() => params[0]); // 仅 status 参数
    }
    const countResult = await db.queryOne(countSql, countParams);

    return {
      devices: rows,
      total: countResult ? countResult.total : 0,
      page,
      pageSize
    };
  },

  /**
   * 获取单个设备
   */
  async get(deviceId) {
    const device = await db.queryOne('SELECT * FROM devices WHERE id = ?', [deviceId]);
    if (!device) return null;

    // 获取最新指标
    const latestMetric = await db.queryOne(
      'SELECT * FROM device_metrics WHERE device_id = ? ORDER BY created_at DESC LIMIT 1',
      [deviceId]
    );

    // 获取启用的插件
    const plugins = await db.query(
      'SELECT plugin_name, version, enabled FROM device_plugins WHERE device_id = ?',
      [deviceId]
    );

    return { ...device, latestMetric: latestMetric || null, plugins: plugins || [] };
  },

  /**
   * 更新设备信息
   */
  async update(deviceId, { name, ip }) {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (ip !== undefined) { fields.push('ip = ?'); params.push(ip); }
    if (fields.length === 0) return false;

    params.push(deviceId);
    await db.execute(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`, params);
    return true;
  },

  /**
   * 删除设备
   */
  async remove(deviceId) {
    await db.execute('DELETE FROM device_metrics WHERE device_id = ?', [deviceId]);
    await db.execute('DELETE FROM device_commands WHERE device_id = ?', [deviceId]);
    await db.execute('DELETE FROM device_plugins WHERE device_id = ?', [deviceId]);
    await db.execute('DELETE FROM devices WHERE id = ?', [deviceId]);
    console.log(`[DeviceManager] 设备已删除: ${deviceId}`);
  },

  /**
   * 保存指标
   */
  async saveMetrics(deviceId, metrics) {
    await db.execute(
      `INSERT INTO device_metrics (device_id, cpu, memory, disk, temperature, load_avg, network_rx, network_tx, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        deviceId,
        metrics.cpu || 0,
        metrics.memory || 0,
        metrics.disk || 0,
        metrics.temperature || 0,
        metrics.load || 0,
        metrics.network?.rx || 0,
        metrics.network?.tx || 0
      ]
    );
  },

  /**
   * 获取设备指标历史
   */
  async getMetricsHistory(deviceId, limit = 60) {
    return await db.query(
      'SELECT * FROM device_metrics WHERE device_id = ? ORDER BY created_at DESC LIMIT ?',
      [deviceId, limit]
    );
  },

  /**
   * 获取设备统计概览
   */
  async getStats() {
    const [online, offline, total] = await Promise.all([
      db.queryOne("SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'"),
      db.queryOne("SELECT COUNT(*) as cnt FROM devices WHERE status = 'offline'"),
      db.queryOne('SELECT COUNT(*) as cnt FROM devices')
    ]);
    return {
      online: online ? online.cnt : 0,
      offline: offline ? offline.cnt : 0,
      total: total ? total.cnt : 0
    };
  },

  /**
   * 记录命令
   */
  async recordCommand(commandId, deviceId, command, status = 'pending') {
    await db.execute(
      'INSERT INTO device_commands (id, device_id, command, status, created_at) VALUES (?, ?, ?, ?, NOW())',
      [commandId, deviceId, command, status]
    );
  },

  /**
   * 更新命令结果
   */
  async updateCommandResult(commandId, { success, message, result }) {
    const status = success ? 'success' : 'failed';
    await db.execute(
      'UPDATE device_commands SET status = ?, result = ? WHERE id = ?',
      [status, result || message || '', commandId]
    );
  },

  /**
   * 获取命令历史
   */
  async getCommandHistory(deviceId, limit = 50) {
    return await db.query(
      'SELECT * FROM device_commands WHERE device_id = ? ORDER BY created_at DESC LIMIT ?',
      [deviceId, limit]
    );
  }
};

module.exports = DeviceManager;
