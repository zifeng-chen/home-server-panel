// V2 设备管理服务 — 注册/心跳/状态/指标/命令
// 复用现有 db-service MySQL 连接池，零新依赖

const dbService = require('../db-service');
const LocalProvider = require('./local-provider');
const crypto = require('crypto');

class DeviceService {
  /**
   * 生成设备认证凭据
   */
  static generateCredentials() {
    return {
      deviceId: 'dev_' + crypto.randomBytes(8).toString('hex'),
      secret: crypto.randomBytes(32).toString('hex')
    };
  }

  /**
   * 获取 MySQL 连接池（确保已连接）
   */
  _pool() {
    const pool = dbService.getPool();
    if (!pool) throw new Error('MySQL 未连接，设备管理不可用');
    return pool;
  }

  /**
   * 设备注册（Agent 首次连接时调用）
   */
  async register({ deviceId, name, hostname, ip, os, arch, version, secret }) {
    const pool = this._pool();
    // 验证 secret
    const [existing] = await pool.query('SELECT id, secret FROM devices WHERE id = ?', [deviceId]);
    if (existing.length > 0) {
      if (existing[0].secret !== secret) throw new Error('设备密钥不匹配');
      // 已注册，更新信息
      await pool.query(
        `UPDATE devices SET name=?, hostname=?, ip=?, os=?, arch=?, version=?, status='online', last_seen=NOW()
         WHERE id=?`,
        [name, hostname, ip, os, arch, version, deviceId]
      );
      return { registered: false, deviceId };
    }
    // 新设备注册
    await pool.query(
      `INSERT INTO devices (id, name, hostname, ip, os, arch, version, secret, status, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', NOW())`,
      [deviceId, name, hostname, ip, os, arch, version, secret]
    );
    return { registered: true, deviceId };
  }

  /**
   * 心跳上报
   */
  async heartbeat(deviceId) {
    const pool = this._pool();
    const [result] = await pool.query(
      `UPDATE devices SET status='online', last_seen=NOW() WHERE id=?`,
      [deviceId]
    );
    if (result.affectedRows === 0) throw new Error('设备不存在: ' + deviceId);
    return { ok: true, at: new Date().toISOString() };
  }

  /**
   * 指标上报
   */
  async reportMetrics(deviceId, metrics) {
    const pool = this._pool();
    // 更新设备状态
    await pool.query(
      `UPDATE devices SET last_seen=NOW() WHERE id=?`, [deviceId]
    );
    // 存储指标
    await pool.query(
      `INSERT INTO device_metrics (device_id, cpu, memory_pct, disk_pct, net_rx, net_tx, uptime, collected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        deviceId,
        metrics.cpu || 0,
        metrics.memory?.pct || 0,
        metrics.disk?.pct || 0,
        metrics.net?.rx || 0,
        metrics.net?.tx || 0,
        metrics.uptime || 0
      ]
    );
    // 清理旧指标（保留最近 10080 条 = 7天 × 每分钟）
    await pool.query(
      `DELETE FROM device_metrics WHERE device_id=? AND id NOT IN
       (SELECT id FROM (SELECT id FROM device_metrics WHERE device_id=? ORDER BY id DESC LIMIT 10080) t)`,
      [deviceId, deviceId]
    );
    return { ok: true };
  }

  /**
   * 命令下发
   */
  async createCommand(deviceId, command) {
    const pool = this._pool();
    const [result] = await pool.query(
      `INSERT INTO device_commands (device_id, command, status) VALUES (?, ?, 'pending')`,
      [deviceId, command]
    );
    return { id: result.insertId, status: 'pending' };
  }

  /**
   * 更新命令执行结果（Agent 回报）
   */
  async updateCommandResult(commandId, { status, result: output, exitCode }) {
    const pool = this._pool();
    await pool.query(
      `UPDATE device_commands SET status=?, result=?, exit_code=?, executed_at=NOW()
       WHERE id=?`,
      [status, output || null, exitCode ?? null, commandId]
    );
    return { ok: true };
  }

  /**
   * 获取待执行命令（Agent 轮询）
   */
  async getPendingCommands(deviceId) {
    const pool = this._pool();
    const [rows] = await pool.query(
      `SELECT id, command, created_at FROM device_commands
       WHERE device_id=? AND status='pending' ORDER BY id ASC LIMIT 10`,
      [deviceId]
    );
    return rows;
  }

  /**
   * 设备列表（管理端）
   */
  async list({ status, page = 1, pageSize = 20 } = {}) {
    const pool = this._pool();
    let where = '';
    const params = [];
    if (status) { where = 'WHERE status=?'; params.push(status); }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM devices ${where}`, params);
    const [devices] = await pool.query(
      `SELECT id, name, hostname, ip, os, arch, version, status, last_seen, created_at
       FROM devices ${where} ORDER BY status='online' DESC, last_seen DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return { devices, total, page, pageSize };
  }

  /**
   * 设备详情
   */
  async getDetail(deviceId) {
    const pool = this._pool();
    const [devices] = await pool.query(
      `SELECT id, name, hostname, ip, os, arch, version, status, last_seen, created_at, updated_at
       FROM devices WHERE id=?`, [deviceId]
    );
    if (devices.length === 0) throw new Error('设备不存在');
    const device = devices[0];
    // 最近指标
    const [metrics] = await pool.query(
      `SELECT cpu, memory_pct, disk_pct, net_rx, net_tx, uptime, collected_at
       FROM device_metrics WHERE device_id=? ORDER BY id DESC LIMIT 60`,
      [deviceId]
    );
    // 最近命令
    const [commands] = await pool.query(
      `SELECT id, command, status, result, exit_code, created_at, executed_at
       FROM device_commands WHERE device_id=? ORDER BY id DESC LIMIT 20`,
      [deviceId]
    );
    return { ...device, metrics, commands };
  }

  /**
   * 设备统计
   */
  async getStats() {
    const pool = this._pool();
    const [[{ online }]] = await pool.query(`SELECT COUNT(*) as online FROM devices WHERE status='online'`);
    const [[{ offline }]] = await pool.query(`SELECT COUNT(*) as offline FROM devices WHERE status='offline'`);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM devices`);
    return { online, offline, total };
  }

  /**
   * 离线检测（定时任务调用）
   */
  async detectOffline(minutes = 5) {
    const pool = this._pool();
    const [result] = await pool.query(
      `UPDATE devices SET status='offline' WHERE status='online' AND last_seen < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [minutes]
    );
    if (result.affectedRows > 0) {
      console.log(`[V2] 检测到 ${result.affectedRows} 台设备离线`);
    }
  }

  /**
   * 初始化本地设备（iStoreOS 自身作为第一台设备）
   */
  async ensureLocalDevice() {
    const pool = this._pool();
    const [rows] = await pool.query(`SELECT id FROM devices WHERE id='dev_local'`);
    
    // 获取本机信息
    const os = require('os');
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    
    // 获取本机 IP（优先非回环 IPv4）
    let ip = '127.0.0.1';
    try {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            ip = net.address;
            break;
          }
        }
        if (ip !== '127.0.0.1') break;
      }
    } catch (_) { /* keep 127.0.0.1 */ }
    
    // 版本号
    let version = '0.0.0';
    try { version = require('../../../package.json').version; } catch (_) {}
    
    if (rows.length > 0) {
      // 更新心跳 + 刷新信息
      await pool.query(
        `UPDATE devices SET hostname=?, ip=?, os=?, arch=?, version=?, status='online', last_seen=NOW() WHERE id='dev_local'`,
        [hostname, ip, platform, arch, version]
      );
      return;
    }
    // 首次注册
    await pool.query(
      `INSERT INTO devices (id, name, hostname, ip, os, arch, version, secret, status, last_seen)
       VALUES ('dev_local', ?, ?, ?, ?, ?, ?, '', 'online', NOW())`,
      [
        hostname + ' (主路由)',
        hostname,
        ip,
        platform,
        arch,
        version
      ]
    );
  }
}

// 单例
module.exports = new DeviceService();
