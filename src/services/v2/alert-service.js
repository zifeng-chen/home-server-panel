// V2 设备阈值告警服务
// 检查设备指标是否触发告警规则，通过 PushPlus 推送通知

const dbService = require('../db-service');
let _notify = null;
function _getNotify() {
  if (!_notify) {
    try { _notify = require('../notify-service'); } catch (_) { _notify = null; }
  }
  return _notify;
}

// 告警冷却：同一规则对同一设备 30 分钟内不再重复发送
const COOLDOWN_MS = 30 * 60 * 1000;

class AlertService {
  _pool() {
    const pool = dbService.getPool();
    if (!pool) throw new Error('MySQL 未连接');
    return pool;
  }

  /** 获取所有告警规则 */
  async listRules() {
    const pool = this._pool();
    const [rules] = await pool.query(
      'SELECT id, name, metric, operator, threshold, device_id, enabled, last_triggered, created_at FROM alert_rules ORDER BY id ASC'
    );
    return rules;
  }

  /** 创建告警规则 */
  async createRule({ name, metric, operator, threshold, device_id }) {
    const pool = this._pool();
    if (!['cpu', 'memory', 'disk'].includes(metric)) throw new Error('指标类型无效');
    if (!['gt', 'lt'].includes(operator)) throw new Error('运算符无效');
    if (!threshold || threshold <= 0) throw new Error('阈值必须大于0');
    const [res] = await pool.query(
      'INSERT INTO alert_rules (name, metric, operator, threshold, device_id, enabled) VALUES (?, ?, ?, ?, ?, 1)',
      [name, metric, operator, threshold, device_id || null]
    );
    return { id: res.insertId };
  }

  /** 更新告警规则 */
  async updateRule(id, patch) {
    const pool = this._pool();
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(patch)) {
      if (['name', 'metric', 'operator', 'enabled'].includes(k)) {
        fields.push(`${k}=?`); vals.push(v);
      } else if (k === 'threshold' && typeof v === 'number') {
        fields.push('threshold=?'); vals.push(v);
      } else if (k === 'device_id') {
        fields.push('device_id=?'); vals.push(v || null);
      }
    }
    if (fields.length === 0) return { ok: true };
    vals.push(id);
    await pool.query(`UPDATE alert_rules SET ${fields.join(',')} WHERE id=?`, vals);
    return { ok: true };
  }

  /** 删除告警规则 */
  async deleteRule(id) {
    const pool = this._pool();
    await pool.query('DELETE FROM alert_rules WHERE id=?', [id]);
    return { ok: true };
  }

  /** 切换规则启用状态 */
  async toggleRule(id) {
    const pool = this._pool();
    await pool.query('UPDATE alert_rules SET enabled = NOT enabled WHERE id=?', [id]);
    return { ok: true };
  }

  /**
   * 检查所有告警规则（每次指标采集后调用，或定时调用）
   * @param {string} [deviceId] - 可选，只检查特定设备
   */
  async checkAlerts(deviceId = null) {
    const pool = this._pool();
    const notify = _getNotify();

    // 获取启用的规则
    let rulesQuery = 'SELECT * FROM alert_rules WHERE enabled=1';
    const params = [];
    if (deviceId) {
      rulesQuery += ' AND (device_id IS NULL OR device_id=?)';
      params.push(deviceId);
    }
    const [rules] = await pool.query(rulesQuery, params);

    if (rules.length === 0) return [];

    const triggered = [];

    for (const rule of rules) {
      // 冷却检查
      if (rule.last_triggered) {
        const ts = new Date(rule.last_triggered).getTime();
        if (Date.now() - ts < COOLDOWN_MS) continue;
      }

      // 获取目标设备列表
      let targetDevices;
      if (rule.device_id) {
        targetDevices = [rule.device_id];
      } else {
        const [devs] = await pool.query("SELECT id FROM devices WHERE status='online'");
        targetDevices = devs.map(d => d.id);
      }

      for (const devId of targetDevices) {
        // 获取最新指标
        const [metrics] = await pool.query(
          'SELECT cpu, memory_pct, disk_pct FROM device_metrics WHERE device_id=? ORDER BY id DESC LIMIT 1',
          [devId]
        );
        if (metrics.length === 0) continue;

        const m = metrics[0];
        const valMap = { cpu: m.cpu, memory: m.memory_pct, disk: m.disk_pct };
        const value = valMap[rule.metric];
        if (value == null) continue;

        const op = rule.operator;
        const threshold = rule.threshold;
        let fired = false;

        if (op === 'gt' && value > threshold) fired = true;
        if (op === 'lt' && value < threshold) fired = true;

        if (fired) {
          // 更新 last_triggered
          await pool.query('UPDATE alert_rules SET last_triggered=NOW() WHERE id=?', [rule.id]);

          const metricLabel = { cpu: 'CPU', memory: '内存', disk: '磁盘' }[rule.metric];
          const opLabel = op === 'gt' ? '超过' : '低于';
          const title = `⚠️ ${rule.name || '设备告警'}`;
          const content = `<p><b>${metricLabel} 告警</b></p>
<p>设备: ${devId}</p>
<p>当前值: <span style="color:red;font-size:18px">${value.toFixed(1)}%</span></p>
<p>条件: ${opLabel}阈值 ${threshold}%</p>
<p>时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>`;

          if (notify && process.env.PUSHPLUS_TOKEN) {
            try {
              await notify.send({ title, content });
            } catch (_) { /* 静默 */ }
          }

          triggered.push({
            device_id: devId,
            rule_name: rule.name,
            metric: rule.metric,
            value: value,
            threshold: rule.threshold,
            operator: rule.operator
          });
        }
      }
    }

    return triggered;
  }
}

module.exports = new AlertService();
