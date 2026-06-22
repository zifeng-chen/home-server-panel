const express = require('express');
const router = express.Router();
const DeviceManager = require('../../../services/device-manager');

// GET /api/v1/device/stats - 设备统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await DeviceManager.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/device - 设备列表
router.get('/', async (req, res) => {
  try {
    const { status, page, pageSize } = req.query;
    const result = await DeviceManager.list({
      status,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/device/register - 设备注册（Agent 调用）
router.post('/register', async (req, res) => {
  try {
    const { hostname, os, arch, agent_version, ip } = req.body;
    if (!hostname || !os || !arch) {
      return res.status(400).json({ success: false, message: '缺少必填字段: hostname, os, arch' });
    }
    const result = await DeviceManager.register({
      hostname, os, arch, agentVersion: agent_version, ip
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/device/heartbeat - 心跳（Agent 调用）
router.post('/heartbeat', async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) {
      return res.status(400).json({ success: false, message: '缺少 device_id' });
    }
    const ok = await DeviceManager.heartbeat(device_id);
    res.json({ success: ok, data: { status: ok ? 'ok' : 'device_not_found' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/device/:id - 设备详情
router.get('/:id', async (req, res) => {
  try {
    const device = await DeviceManager.get(req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, message: '设备不存在' });
    }
    res.json({ success: true, data: device });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/device/:id - 更新设备
router.put('/:id', async (req, res) => {
  try {
    const { name, ip } = req.body;
    await DeviceManager.update(req.params.id, { name, ip });
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/v1/device/:id - 删除设备
router.delete('/:id', async (req, res) => {
  try {
    // 禁止删除本地设备
    if (req.params.id === 'dev_local') {
      return res.status(400).json({ success: false, message: '不能删除本机设备' });
    }
    await DeviceManager.remove(req.params.id);
    res.json({ success: true, message: '设备已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/device/:id/metrics - 设备指标历史
router.get('/:id/metrics', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 60;
    const metrics = await DeviceManager.getMetricsHistory(req.params.id, Math.min(limit, 500));
    res.json({ success: true, data: metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/device/:id/commands - 命令历史
router.get('/:id/commands', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const commands = await DeviceManager.getCommandHistory(req.params.id, Math.min(limit, 200));
    res.json({ success: true, data: commands });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
