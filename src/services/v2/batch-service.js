// V2 批量命令服务 — Phase 3 FR-3.4
// 多选设备 → 命令模板/自由输入 → 并行执行 → 聚合结果 + 差异对比 + 历史记录
//
// 说明：
//   - 远程设备经 WS 命令通道（commandService.sendMany，带并发上限）
//   - 本地设备（dev_local）走本机 shell，与 Agent 行为一致
//   - 历史落盘到 data/batch-history.json（最多 100 条），无需改表结构
const fs = require('fs');
const path = require('path');
const os = require('os');

const commandService = require('./command-service');

const HISTORY_FILE = path.join(__dirname, '..', '..', '..', 'data', 'batch-history.json');
const MAX_HISTORY = 100;
const MAX_COMMAND_LEN = 2000;
const MAX_DEVICES = 50;
const DEFAULT_TIMEOUT = 30000;

// 预定义命令模板（家庭服务器高频巡检）
const TEMPLATES = [
  { id: 'disk', label: '磁盘空间', command: 'df -h', icon: '💾' },
  { id: 'mem', label: '内存占用', command: 'free -m 2>/dev/null || vm_stat', icon: '🧠' },
  { id: 'uptime', label: '运行时长', command: 'uptime', icon: '⏱' },
  { id: 'top', label: 'CPU Top 进程', command: 'ps -eo pid,pcpu,pmem,args --sort=-pcpu 2>/dev/null | head -6 || ps ww | head -8', icon: '🔥' },
  { id: 'disk_top', label: '大目录占用', command: 'du -sh /tmp /var/log /overlay 2>/dev/null | sort -h', icon: '📦' },
  { id: 'docker', label: 'Docker 容器', command: 'docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null || echo "docker 未运行"', icon: '🐳' },
  { id: 'net', label: '已建立连接数', command: "netstat -an 2>/dev/null | grep -c ESTABLISHED", icon: '🌐' },
  { id: 'agent', label: 'Agent 运行状态', command: 'pgrep -f hsp-agent >/dev/null && echo running || echo stopped', icon: '🤖' },
  { id: 'temp', label: '温度 / 频率', command: 'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo n/a', icon: '🌡' },
  { id: 'load', label: '系统负载', command: 'cat /proc/loadavg 2>/dev/null || uptime', icon: '📈' },
];

class BatchService {
  constructor() {
    this.seq = 0;
  }

  templates() {
    return TEMPLATES;
  }

  /**
   * 批量执行
   * @param {{deviceIds:string[], command:string, label?:string, timeout?:number, concurrency?:number}} req
   */
  async run({ deviceIds, command, label = '', timeout, concurrency }) {
    const ids = [...new Set((deviceIds || []).filter(x => typeof x === 'string' && x))];
    if (!ids.length) throw new Error('请至少选择一台设备');
    if (ids.length > MAX_DEVICES) throw new Error(`单次最多 ${MAX_DEVICES} 台设备`);

    const cmd = String(command || '').trim();
    if (!cmd) throw new Error('命令不能为空');
    if (cmd.length > MAX_COMMAND_LEN) throw new Error(`命令过长 (>${MAX_COMMAND_LEN} 字符)`);

    const nameMap = await this._deviceNames();
    const startedAt = Date.now();

    const localIds = ids.filter(id => id === 'dev_local');
    const remoteIds = ids.filter(id => id !== 'dev_local');

    const tasks = [];
    if (remoteIds.length) {
      tasks.push(commandService.sendMany(remoteIds, {
        action: 'run_command',
        command: cmd,
      }, {
        timeout: timeout || DEFAULT_TIMEOUT,
        concurrency: concurrency || 5,
      }));
    }
    const localTasks = localIds.map(id => this._runLocal(id, cmd, timeout || DEFAULT_TIMEOUT));
    const settled = await Promise.all([...tasks, ...localTasks]);

    let results = [];
    if (remoteIds.length) results = results.concat(settled[0].results);
    if (localIds.length) results = results.concat(settled.slice(remoteIds.length ? 1 : 0));

    // 保持与入参一致的顺序
    const order = new Map(ids.map((id, i) => [id, i]));
    results.sort((a, b) => (order.get(a.deviceId) ?? 0) - (order.get(b.deviceId) ?? 0));

    for (const r of results) {
      r.deviceName = nameMap.get(r.deviceId) || r.deviceId;
    }

    const totalMs = Date.now() - startedAt;
    const summary = {
      total: results.length,
      ok: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      totalMs,
    };

    const record = {
      id: `b${(++this.seq).toString(36)}_${Date.now().toString(36)}`,
      at: fmtTime(new Date()),
      command: cmd,
      label: label || '',
      summary,
      results,
    };
    this._appendHistory(record);

    return record;
  }

  history(limit = 20) {
    const list = this._readHistory();
    return list.slice(0, Math.max(1, Math.min(limit, MAX_HISTORY)));
  }

  clearHistory() {
    try { fs.writeFileSync(HISTORY_FILE, '[]', 'utf8'); } catch (_) { /* ignore */ }
    return { ok: true };
  }

  // ===== 本地设备执行 =====
  _runLocal(deviceId, cmd, timeout) {
    const { exec } = require('child_process');
    const t0 = Date.now();
    return new Promise((resolve) => {
      exec(cmd, { shell: '/bin/sh', timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        const out = {
          deviceId,
          ok: !err,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: 0,
          error: '',
          duration: Date.now() - t0,
        };
        if (err) {
          out.exitCode = typeof err.code === 'number' ? err.code : 1;
          if (err.killed) { out.exitCode = 124; out.error = `命令超时 (${timeout}ms)`; }
          else out.error = String(stderr || err.message || '').trim();
        }
        resolve(out);
      });
    });
  }

  async _deviceNames() {
    const map = new Map();
    map.set('dev_local', os.hostname() + ' (本机)');
    try {
      const deviceService = require('./device-service');
      const devices = await deviceService.listWithMetrics();
      for (const d of devices || []) {
        map.set(d.id, d.name || d.hostname || d.ip || d.id);
      }
    } catch (_) { /* 数据库不可用时退化为 deviceId 展示 */ }
    return map;
  }

  _readHistory() {
    try {
      if (!fs.existsSync(HISTORY_FILE)) return [];
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  _appendHistory(record) {
    try {
      const list = this._readHistory();
      list.unshift(record);
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(list.slice(0, MAX_HISTORY), null, 0), 'utf8');
    } catch (_) { /* 落盘失败不影响执行结果 */ }
  }
}

function fmtTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = new BatchService();
