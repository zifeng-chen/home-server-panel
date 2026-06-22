// V2 设备管理 API — /api/v2/device
const express = require('express');
const router = express.Router();
const deviceService = require('../../services/v2/device-service');
const LocalProvider = require('../../services/v2/local-provider');

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
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/device/:id — 设备详情（含指标 + 命令历史）
router.get('/:id', async (req, res) => {
  try {
    const detail = await deviceService.getDetail(req.params.id);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(err.message === '设备不存在' ? 404 : 500).json({ success: false, message: err.message });
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
    const result = await deviceService.createCommand(deviceId, command);
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

// GET /api/v2/device/:id/metrics/local — 获取本地设备实时指标
router.get('/:id/metrics/local', async (req, res) => {
  if (req.params.id !== 'dev_local') {
    return res.status(400).json({ success: false, message: '仅本地设备支持实时指标' });
  }
  try {
    const provider = new LocalProvider();
    const metrics = await provider.getMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
