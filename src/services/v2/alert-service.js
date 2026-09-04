// V2 设备阈值告警服务 v2
// 支持系统指标 (cpu/memory/disk) + 自定义规则 (process/port/conn/custom)
// 通过 Agent 命令通道实时获取目标设备数据

const dbService = require('../db-service');
let _notify = null;
function _getNotify() {
  if (!_notify) { try { _notify = require('../notify-service'); } catch (_) { _notify = null; } }
  return _notify;
}

const COOLDOWN_MS = 30 * 60 * 1000;

// 自定义指标元数据
const METRICS = [
  { value: 'cpu',         label: 'CPU',       unit: '%',   source: 'metric',   defaultOp: 'gt', defaultThreshold: 90 },
  { value: 'memory',      label: '内存',       unit: '%',   source: 'metric',   defaultOp: 'gt', defaultThreshold: 90 },
  { value: 'disk',        label: '磁盘',       unit: '%',   source: 'metric',   defaultOp: 'gt', defaultThreshold: 90 },
  { value: 'process',     label: '进程存活',    unit: '',    source: 'command',  defaultOp: 'ne', defaultThreshold: 0, command: 'get_processes', help: '进程名必须包含target，不存在则告警' },
  { value: 'port',        label: '端口监听',    unit: '',    source: 'command',  defaultOp: 'ne', defaultThreshold: 0, command: 'get_connections', help: '端口号=target，未监听则告警' },
  { value: 'conn',        label: '连接数',      unit: '个',  source: 'command',  defaultOp: 'gt', defaultThreshold: 500, command: 'get_connections', help: 'ESTABLISHED连接总数超过阈值告警' },
];

class AlertService {
  _pool() {
    const pool = dbService.getPool();
    if (!pool) throw new Error('MySQL 未连接');
    return pool;
  }

  getMetrics() { return METRICS; }

  async listRules() {
    const pool = this._pool();
    const [rules] = await pool.query(
      'SELECT id, name, metric, operator, threshold, device_id, target, enabled, last_triggered, created_at FROM alert_rules ORDER BY id ASC'
    );
    return rules;
  }

  async createRule({ name, metric, operator, threshold, device_id, target }) {
    const pool = this._pool();
    const m = METRICS.find(x => x.value === metric);
    if (!m) throw new Error('不支持的指标类型: ' + metric);
    if (!['gt','lt','eq','ne'].includes(operator)) throw new Error('不支持的运算符');
    if (m.source === 'command' && !target) throw new Error('自定义规则必须填写 target');
    const [res] = await pool.query(
      'INSERT INTO alert_rules (name, metric, operator, threshold, device_id, target, enabled) VALUES (?,?,?,?,?,?,1)',
      [name, metric, operator, threshold, device_id || null, target || null]
    );
    return { id: res.insertId };
  }

  async updateRule(id, patch) {
    const pool = this._pool();
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(patch)) {
      if (['name','metric','operator','target'].includes(k)) { fields.push(`${k}=?`); vals.push(v); }
      else if (k === 'threshold' && typeof v === 'number') { fields.push('threshold=?'); vals.push(v); }
      else if (k === 'device_id') { fields.push('device_id=?'); vals.push(v || null); }
      else if (k === 'enabled') { fields.push('enabled=?'); vals.push(v ? 1 : 0); }
    }
    if (!fields.length) return { ok: true };
    vals.push(id);
    await pool.query(`UPDATE alert_rules SET ${fields.join(',')} WHERE id=?`, vals);
    return { ok: true };
  }

  async deleteRule(id) {
    await this._pool().query('DELETE FROM alert_rules WHERE id=?', [id]);
    return { ok: true };
  }

  async toggleRule(id) {
    await this._pool().query('UPDATE alert_rules SET enabled = NOT enabled WHERE id=?', [id]);
    return { ok: true };
  }

  /** 核心：检查设备指标/命令结果是否触发告警 */
  async checkAlerts(deviceId = null) {
    const pool = this._pool();
    const notify = _getNotify();

    let query = 'SELECT * FROM alert_rules WHERE enabled=1';
    const params = [];
    if (deviceId) { query += ' AND (device_id IS NULL OR device_id=?)'; params.push(deviceId); }
    const [rules] = await pool.query(query, params);
    if (!rules.length) return [];

    const triggered = [];
    for (const rule of rules) {
      if (rule.last_triggered && Date.now() - new Date(rule.last_triggered).getTime() < COOLDOWN_MS) continue;

      const m = METRICS.find(x => x.value === rule.metric);
      if (!m) continue;

      // system metric: 查询 device_metrics 表
      if (m.source === 'metric') {
        await this._checkMetric(pool, notify, rule, m, triggered);
      }
      // command-based: 发送 Agent 命令并解析结果
      else if (m.source === 'command') {
        await this._checkCommand(pool, notify, rule, m, triggered);
      }
    }
    return triggered;
  }

  // ── 系统指标：cpu / memory / disk ──
  async _checkMetric(pool, notify, rule, m, triggered) {
    let targetDevices = rule.device_id ? [rule.device_id] : [];
    if (!targetDevices.length) {
      const [devs] = await pool.query("SELECT id FROM devices WHERE status='online'");
      targetDevices = devs.map(d => d.id);
    }
    for (const devId of targetDevices) {
      const [metrics] = await pool.query(
        `SELECT cpu, memory_pct, disk_pct FROM device_metrics WHERE device_id=? ORDER BY id DESC LIMIT 1`, [devId]
      );
      if (!metrics.length) continue;
      const valMap = { cpu: metrics[0].cpu, memory: metrics[0].memory_pct, disk: metrics[0].disk_pct };
      const value = valMap[rule.metric];
      if (value == null) continue;
      if (this._compare(value, rule.operator, rule.threshold)) {
        await this._fire(pool, notify, rule, devId, value, m);
        triggered.push({ device_id: devId, rule_name: rule.name, metric: rule.metric, value, threshold: rule.threshold });
      }
    }
  }

  // ── 自定义命令：process / port / conn ──
  async _checkCommand(pool, notify, rule, m, triggered) {
    let targetDevices = rule.device_id ? [rule.device_id] : [];
    if (!targetDevices.length) {
      const [devs] = await pool.query("SELECT id FROM devices WHERE status='online'");
      targetDevices = devs.map(d => d.id);
    }
    const commandService = (() => { try { return require('./command-service'); } catch (_) { return null; } })();
    if (!commandService) return;

    for (const devId of targetDevices) {
      try {
        const reply = await commandService.send(devId, { action: m.command }, 8000);
        const text = typeof reply === 'string' ? reply : (reply?.stdout || reply?.result || '');
        const value = this._parseCommandResult(rule, m, text);
        if (this._compare(value, rule.operator, rule.threshold)) {
          await this._fire(pool, notify, rule, devId, value, m);
          triggered.push({ device_id: devId, rule_name: rule.name, metric: rule.metric, value, threshold: rule.threshold });
        }
      } catch (_) { /* Agent 离线或无响应，跳过 */ }
    }
  }

  /** 从命令输出中提取数值 */
  _parseCommandResult(rule, m, text) {
    if (!text) return 0;
    const target = (rule.target || '').toLowerCase();

    switch (rule.metric) {
      case 'process': {
        // 检查 target 是否出现在进程列表中
        const lower = text.toLowerCase();
        return lower.includes(target) ? 1 : 0; // 存在=1，不存在=0
      }
      case 'port': {
        // 检查端口是否在 LISTEN 状态
        const port = parseInt(target) || parseInt(rule.threshold) || 0;
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes(':' + port) && (line.includes('LISTEN') || line.includes('0.0.0.0:' + port) || line.includes(':::' + port))) {
            return 1;
          }
        }
        return 0;
      }
      case 'conn': {
        // 统计 ESTABLISHED 连接总数
        const lines = text.split('\n');
        let count = 0;
        for (const line of lines) {
          if (line.includes('ESTABLISHED')) count++;
        }
        return count;
      }
      default: return 0;
    }
  }

  _compare(value, operator, threshold) {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }

  async _fire(pool, notify, rule, devId, value, m) {
    await pool.query('UPDATE alert_rules SET last_triggered=NOW() WHERE id=?', [rule.id]);

    const unit = m.unit ? ' ' + m.unit : '';
    const opLabel = { gt: '超过', lt: '低于', eq: '等于', ne: '不等于' }[rule.operator] || rule.operator;
    const valStr = typeof value === 'number' ? value.toFixed(2).replace(/\.00$/, '') : String(value);
    const targetNote = rule.target ? ` (目标: ${rule.target})` : '';

    const title = `⚠️ ${rule.name || '设备告警'}`;
    const content = `<p><b>${m.label} 告警</b></p>
<p>设备: ${devId}</p>
<p>当前值: <span style="color:red;font-size:18px">${valStr}${unit}</span></p>
<p>条件: ${opLabel}阈值 ${rule.threshold}${unit}${targetNote}</p>
<p>时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>`;

    if (notify && process.env.PUSHPLUS_TOKEN) {
      try { await notify.send({ title, content }); } catch (_) {}
    }
  }
}

module.exports = new AlertService();
module.exports.METRICS = METRICS;
