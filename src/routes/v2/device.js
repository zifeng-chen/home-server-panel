// V2 设备管理 API — /api/v2/device
const express = require('express');
const router = express.Router();
const deviceService = require('../../services/v2/device-service');
const commandService = require('../../services/v2/command-service');
const LocalProvider = require('../../services/v2/local-provider');

// ===== 进程/连接输出解析 =====
// 兼容 GNU ps (pid,pcpu,pmem,args) 和 BusyBox ps (PID USER VSZ STAT COMMAND)
// 两种格式可能混合出现（Agent 同时跑两个 ps 命令）
const parsePsOutput = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const procMap = new Map(); // pid → proc 去重
  let inBusyBox = false;
  for (let i = 0; i < lines.length && procMap.size < 20; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // 跳过 header 行
    const lower = line.toLowerCase();
    if (lower.startsWith('pid') && (lower.includes('user') || lower.includes('%cpu') || lower.includes('pcpu'))) {
      inBusyBox = lower.includes('user') || lower.includes('vsz') || lower.includes('stat');
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const pid = parts[0];
    if (!/^\d+/.test(pid) || procMap.has(pid)) continue;
    if (inBusyBox) {
      // BusyBox ps:  PID  USER  VSZ   STAT  COMMAND...
      //             [0]  [1]   [2]   [3]   [4+]
      // VSZ = 虚拟内存(KB), 格式化为人类可读
      const vsz = parseInt(parts[2]) || 0;
      const vszStr = vsz > 1024 ? (vsz / 1024).toFixed(1) + 'M' : vsz + 'K';
      procMap.set(pid, {
        pid,
        user: parts[1] || '',
        cpu: '0',
        mem: vszStr,
        state: parts.length > 4 ? (parts[3] || 'R') : (parts[3] || 'R'),
        command: parts.length > 4 ? parts.slice(4).join(' ') : parts.slice(3).join(' ')
      });
    } else {
      // GNU: PID %CPU %MEM COMMAND...
      procMap.set(pid, {
        pid,
        cpu: parts[1] || '0',
        mem: parts[2] || '0',
        command: parts.slice(3).join(' ') || line
      });
    }
  }
  return Array.from(procMap.values());
};
// 兼容 GNU netstat 和 BusyBox netstat -an
const parseNetstatOutput = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lines = text.trim().split('\n');
  const conns = [];
  for (let i = 0; i < lines.length && conns.length < 25; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('Proto') || line.startsWith('Active')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    // netstat -an: Proto Recv-Q Send-Q LocalAddr ForeignAddr State
    // BusyBox: Proto RecvQ SendQ LocalAddr ForeignAddr State
    conns.push({
      proto: parts[0] || 'tcp',
      local: parts[3] || parts[2] || '',
      remote: parts[4] || parts[3] || '',
      state: parts[5] || parts[4] || 'LISTEN'
    });
  }
  return conns;
};

// MySQL TIMESTAMP 列存储在 UTC，读写时转回 CST
const toCst = (s) => {
  if (!s) return s;
  const d = s instanceof Date ? s : new Date(s.slice(-1) === 'Z' ? s : s + 'Z');
  if (isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fixDeviceTz = (dev) => { dev.last_seen = toCst(dev.last_seen); dev.created_at = toCst(dev.created_at); return dev; };
const fixListTz = (r) => { r.devices?.forEach(fixDeviceTz); return r; };

// GET /api/v2/device/stats — 设备统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await deviceService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device — 设备列表
router.get('/', async (req, res) => {
  try {
    const { status, page, pageSize } = req.query;
    const result = await deviceService.list({
      status,
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 20, 100)
    });
    res.json({ success: true, data: fixListTz(result) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/list-with-metrics — 设备列表 + 最新指标（卡片展示用）
router.get('/list-with-metrics', async (req, res) => {
  try {
    const devices = await deviceService.listWithMetrics();
    res.json({ success: true, data: devices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/device/commands/batch — 批量命令（在 :id 之前避免路由冲突）
router.post('/commands/batch', async (req, res) => {
  try {
    const { deviceIds, command } = req.body;
    if (!deviceIds || !command) return res.status(400).json({ success: false, message: '缺少 deviceIds 或 command' });
    const results = await deviceService.batchCommand(deviceIds, command);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id — 设备详情（含指标 + 命令历史）
router.get('/:id', async (req, res) => {
  try {
    const detail = await deviceService.getDetail(req.params.id);
    fixDeviceTz(detail);
    (detail.metrics || []).forEach(m => { m.collected_at = toCst(m.collected_at); });
    (detail.commands || []).forEach(c => { c.created_at = toCst(c.created_at); });
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(err.message === '设备不存在' ? 404 : 500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/metrics — 设备历史指标（趋势图数据）
router.get('/:id/metrics', async (req, res) => {
  try {
    const pool = deviceService._pool();
    const [rows] = await pool.query(
      `SELECT cpu, memory_pct, disk_pct, net_rx, net_tx, uptime, collected_at
       FROM device_metrics WHERE device_id=? ORDER BY id DESC LIMIT 180`,
      [req.params.id]
    );
    rows.forEach(m => { m.collected_at = toCst(m.collected_at); });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/device/register — 设备注册（Agent 调用）
router.post('/register', async (req, res) => {
  try {
    const { deviceId, name, hostname, ip, os, arch, version, secret } = req.body;
    if (!deviceId || !secret) {
      return res.status(400).json({ success: false, message: '缺少 deviceId 或 secret' });
    }
    const result = await deviceService.register({ deviceId, name, hostname, ip, os, arch, version, secret });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/device/heartbeat — 心跳（Agent 调用）
router.post('/heartbeat', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: '缺少 deviceId' });
    const result = await deviceService.heartbeat(deviceId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/device/report — 指标上报（Agent 调用）
router.post('/report', async (req, res) => {
  try {
    const { deviceId, metrics } = req.body;
    if (!deviceId || !metrics) return res.status(400).json({ success: false, message: '缺少 deviceId 或 metrics' });
    await deviceService.reportMetrics(deviceId, metrics);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/commands/pending — 获取待执行命令（Agent 轮询）
router.get('/:id/commands/pending', async (req, res) => {
  try {
    const commands = await deviceService.getPendingCommands(req.params.id);
    res.json({ success: true, data: commands });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/device/command — 下发命令（管理端 → Agent）
router.post('/command', async (req, res) => {
  try {
    const { deviceId, command } = req.body;
    if (!deviceId || !command) return res.status(400).json({ success: false, message: '缺少 deviceId 或 command' });
    // 记录到 DB
    const result = await deviceService.createCommand(deviceId, command);
    // 如果设备在线，通过 WS 推送
    try {
      const reply = await commandService.send(deviceId, {
        action: 'run_command',
        command
      }, 15000);
      result.result = reply.result || {};
      if (reply.result?.output) {
        const text = typeof reply.result.output === 'string' ? reply.result.output : JSON.stringify(reply.result.output);
        await deviceService.updateCommandResult(result.id, {
          status: 'completed',
          result: text,
          exitCode: reply.result.exit_code || 0
        });
        result.status = 'completed';
        result.result = text;
      }
    } catch (wsErr) {
      // WS 不在线则等待 Agent 轮询
      result._wsNote = wsErr.message;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v2/device/command/:id/result — 命令结果回报（Agent 调用）
router.put('/command/:id/result', async (req, res) => {
  try {
    const { status, result: output, exitCode } = req.body;
    await deviceService.updateCommandResult(req.params.id, { status, result: output, exitCode });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v2/device/:id/tags — 更新设备标签
router.put('/:id/tags', async (req, res) => {
  try {
    const { tags } = req.body;
    await deviceService.updateTags(req.params.id, tags || '');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/v2/device/:id — 删除设备
router.delete('/:id', async (req, res) => {
  try {
    await deviceService.deleteDevice(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/metrics/local — 获取本地设备实时指标
router.get('/:id/metrics/local', async (req, res) => {
  try {
    const provider = new LocalProvider();
    const metrics = await provider.getMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/processes — 进程列表（远程 Agent 或本地）
router.get('/:id/processes', async (req, res) => {
  try {
    let processes = [];
    if (req.params.id === 'dev_local') {
      processes = await new LocalProvider().getProcessList();
    } else {
      try {
        const reply = await commandService.send(req.params.id, { action: 'get_processes' }, 8000);
        const text = reply?.result?.stdout || reply?.result || '';
        processes = parsePsOutput(text);
      } catch { processes = [] }
    }
    res.json({ success: true, data: processes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/connections — 网络连接（远程 Agent 或本地）
router.get('/:id/connections', async (req, res) => {
  try {
    let conns = [];
    if (req.params.id === 'dev_local') {
      conns = await new LocalProvider().getConnections();
    } else {
      try {
        const reply = await commandService.send(req.params.id, { action: 'get_connections' }, 8000);
        const text = reply?.result?.stdout || reply?.result || '';
        conns = parseNetstatOutput(text);
      } catch { conns = [] }
    }
    res.json({ success: true, data: conns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id/plugins — Agent 插件列表
router.get('/:id/plugins', async (req, res) => {
  try {
    const reply = await commandService.send(req.params.id, { action: 'list_plugins' }, 8000);
    res.json({ success: true, data: reply?.result?.plugins || reply?.result || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
