const express = require('express');
const router = express.Router();
const DeviceManager = require('../../../services/device-manager');

// POST /api/v1/metrics/report - 指标上报（Agent 调用）
router.post('/report', async (req, res) => {
  try {
    const { device_id, cpu, memory, disk, temperature, load, network } = req.body;
    if (!device_id) {
      return res.status(400).json({ success: false, message: '缺少 device_id' });
    }

    await DeviceManager.saveMetrics(device_id, {
      cpu, memory, disk, temperature, load, network
    });

    res.json({ success: true, message: 'ok' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
