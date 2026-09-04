// V2 设备管理服务 — 注册/心跳/状态/指标/命令
// 复用现有 db-service MySQL 连接池，零新依赖

const dbService = require('../db-service');
const LocalProvider = require('./local-provider');
const crypto = require('crypto');

// MySQL 容器用 UTC 时钟，NOW() 差 8 小时 → 统一用 Node.js 本地时间
const nowStr = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

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
   * 验证设备身份（WS 连接用）
   */
  async verifyDevice(deviceId, secret) {
    const pool = this._pool();
    try {
      const [rows] = await pool.query('SELECT id FROM devices WHERE id = ? AND secret = ?', [deviceId, secret]);
      return rows.length > 0;
    } catch { return false; }
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
        `UPDATE devices SET name=?, hostname=?, ip=?, os=?, arch=?, version=?, status='online', last_seen=?
         WHERE id=?`,
        [name, hostname, ip, os, arch, version, nowStr(), deviceId]
      );
      return { registered: false, deviceId };
    }
    // 新设备注册
    await pool.query(
      `INSERT INTO devices (id, name, hostname, ip, os, arch, version, secret, status, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?)`,
      [deviceId, name, hostname, ip, os, arch, version, secret, nowStr()]
    );
    return { registered: true, deviceId };
  }

  /**
   * 心跳上报
   */
  async heartbeat(deviceId) {
    const pool = this._pool();
    const [result] = await pool.query(
      `UPDATE devices SET status='online', last_seen=? WHERE id=?`,
      [nowStr(), deviceId]
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
      `UPDATE devices SET last_seen=? WHERE id=?`, [nowStr(), deviceId]
    );
    // 存储指标
    await pool.query(
      `INSERT INTO device_metrics (device_id, cpu, memory_pct, disk_pct, net_rx, net_tx, uptime, collected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        metrics.cpu || 0,
        metrics.memory?.pct || 0,
        metrics.disk?.pct || 0,
        metrics.net?.rx || 0,
        metrics.net?.tx || 0,
        metrics.uptime || 0,
        nowStr()
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
      `UPDATE device_commands SET status=?, result=?, exit_code=?, executed_at=?
       WHERE id=?`,
      [status, output || null, exitCode ?? null, nowStr(), commandId]
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
      `SELECT id, name, hostname, ip, os, arch, version, status, tags, last_seen, created_at
       FROM devices ${where} ORDER BY status='online' DESC, last_seen DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return { devices, total, page, pageSize };
  }

  /**
   * 设备列表 + 每个设备的最新一条指标（前端卡片展示用）
   */
  async listWithMetrics() {
    const pool = this._pool();
    const [devices] = await pool.query(
      `SELECT id, name, hostname, ip, os, arch, version, status, tags, last_seen, created_at
       FROM devices ORDER BY status='online' DESC, last_seen DESC`
    );
    if (devices.length > 0) {
      const ids = devices.map(d => pool.escape(d.id)).join(',');
      const [metrics] = await pool.query(
        `SELECT m.device_id, m.cpu, m.memory_pct, m.disk_pct, m.net_rx, m.net_tx,
                m.uptime, m.collected_at
         FROM device_metrics m
         INNER JOIN (
           SELECT device_id, MAX(id) as max_id FROM device_metrics
           WHERE device_id IN (${ids}) GROUP BY device_id
         ) latest ON m.device_id = latest.device_id AND m.id = latest.max_id`
      );
      const metricMap = {};
      metrics.forEach(m => { metricMap[m.device_id] = m; });
      devices.forEach(d => { d.latest = metricMap[d.id] || null; });
    }
    // IP 去重：同一 IP 只保留一台（Go Agent 优先 > dev_local，在线优先 > 离线）
    const ipMap = new Map();
    devices.forEach(d => {
      if (!d.ip) { ipMap.set(d.id, d); return; }
      const existing = ipMap.get(d.ip);
      if (!existing) { ipMap.set(d.ip, d); }
      else if (d.id !== 'dev_local' && existing.id === 'dev_local') { ipMap.set(d.ip, d); }
      else if (d.status === 'online' && existing.status !== 'online') { ipMap.set(d.ip, d); }
    });
    return Array.from(ipMap.values());
  }

  /**
   * 设备详情
   */
  async getDetail(deviceId) {
    const pool = this._pool();
    const [devices] = await pool.query(
      `SELECT id, name, hostname, ip, os, arch, version, status, tags, last_seen, created_at, updated_at
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
      `UPDATE devices SET status='offline' WHERE status='online' AND last_seen < DATE_SUB(?, INTERVAL ? MINUTE)`,
      [nowStr(), minutes]
    );
    if (result.affectedRows > 0) {
      console.log(`[V2] 检测到 ${result.affectedRows} 台设备离线`);
    }
  }

  /**
   * 删除设备
   */
  async deleteDevice(deviceId) {
    const pool = this._pool();
    await pool.query('DELETE FROM device_metrics WHERE device_id = ?', [deviceId]);
    await pool.query('DELETE FROM device_commands WHERE device_id = ?', [deviceId]);
    await pool.query('DELETE FROM devices WHERE id = ?', [deviceId]);
    return { ok: true };
  }

  /**
   * 批量下发命令
   */
  async batchCommand(deviceIds, command) {
    const commandService = require('./command-service');
    return await commandService.broadcast(deviceIds, command);
  }

  /**
   * 更新设备标签
   */
  async updateTags(deviceId, tags) {
    const pool = this._pool();
    await pool.query('UPDATE devices SET tags=? WHERE id=?', [tags || '', deviceId]);
    return { ok: true };
  }

  /**
   * 获取指标历史（用于趋势图）
   */
  async getMetricHistory(deviceId, rangeMin = 60) {
    const pool = this._pool();
    const [rows] = await pool.query(
      `SELECT cpu, memory_pct, disk_pct, net_rx, net_tx, collected_at
       FROM device_metrics WHERE device_id=? AND collected_at >= DATE_SUB(?, INTERVAL ? MINUTE)
       ORDER BY id ASC`,
      [deviceId, nowStr(), rangeMin]
    );
    return rows;
  }

  /**
   * 初始化本地设备（iStoreOS 自身作为第一台设备）
   */
  async ensureLocalDevice() {
    const pool = this._pool();

    // 兼容旧表：添加 tags 列
    try {
      await pool.query(`ALTER TABLE devices ADD COLUMN tags VARCHAR(256) DEFAULT '' AFTER version`);
    } catch (_) { /* 列已存在 */ }

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
        `UPDATE devices SET hostname=?, ip=?, os=?, arch=?, version=?, status='online', last_seen=? WHERE id='dev_local'`,
        [hostname, ip, platform, arch, version, nowStr()]
      );
      return;
    }
    // 首次注册
    await pool.query(
      `INSERT INTO devices (id, name, hostname, ip, os, arch, version, secret, status, last_seen)
       VALUES ('dev_local', ?, ?, ?, ?, ?, ?, '', 'online', ?)`,
      [
        hostname + ' (主路由)',
        hostname,
        ip,
        platform,
        arch,
        version,
        nowStr()
      ]
    );
  }
  async ensureAlertTable() {
    try {
      const pool = this._pool();
      await pool.execute(`CREATE TABLE IF NOT EXISTS alert_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        metric VARCHAR(32) NOT NULL COMMENT '指标：cpu/memory/disk/process/port/conn/custom',
        operator ENUM('gt','lt','eq','ne') NOT NULL DEFAULT 'gt',
        threshold DECIMAL(10,2) NOT NULL,
        device_id VARCHAR(64) DEFAULT NULL,
        target VARCHAR(128) DEFAULT NULL COMMENT '自定义目标：进程名/端口号/正则等',
        enabled TINYINT(1) DEFAULT 1,
        last_triggered TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alert_device(device_id),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      // 存量表字段补丁（无 ALTER COLUMN 兼容低版本 MySQL）
      await this._migrateAlertSchema(pool);
      console.log('[V2] alert_rules 表已就绪');
    } catch (err) {
      console.warn('[V2] alert_rules 自动建表失败:', err.message?.slice(0, 100));
    }
  }

  async _migrateAlertSchema(pool) {
    // 按需追加 target 列
    try { await pool.query('ALTER TABLE alert_rules ADD COLUMN target VARCHAR(128) DEFAULT NULL COMMENT "自定义目标"'); } catch (_) {}
    // 扩宽 metric 字段
    try { await pool.query('ALTER TABLE alert_rules MODIFY COLUMN metric VARCHAR(32) NOT NULL COMMENT "指标"'); } catch (_) {}
    // 追加 eq/ne 操作符（ENUM 仅在 8.0+ 支持 ADD value，先忽略）
  }
}

// 单例
module.exports = new DeviceService();
