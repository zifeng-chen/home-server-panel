// 系统监控路由
const express = require('express');
const router = express.Router();
const monitor = require('../services/monitor-service');

// 启动自动采集
monitor.start();

// GET /api/monitor — 完整快照 (实时 + 历史)
router.get('/', (req, res) => {
  try {
    const data = monitor.snapshot();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/monitor/live — 仅实时数据
router.get('/live', (req, res) => {
  try {
    const data = monitor.snapshot();
    res.json({ success: true, data: data.live });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

module.exports = router;
