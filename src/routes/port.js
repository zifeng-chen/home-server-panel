const express = require('express');
const router = express.Router();
const portService = require('../services/port-service');

// GET /api/port - 端口列表
router.get('/', async (req, res) => {
  try {
    const ports = await portService.scan();
    const stats = portService.getStats(ports);
    res.json({ success: true, data: { ports, stats } });
  } catch (err) {
    res.json({ success: false, message: err.message, data: { ports: [], stats: { total: 0 } } });
  }
});

// GET /api/port/scan - 触发扫描（同 / 但语义更明确）
router.get('/scan', async (req, res) => {
  try {
    const ports = await portService.scan();
    const stats = portService.getStats(ports);
    res.json({ success: true, data: { ports, stats }, message: `扫描完成，发现 ${ports.length} 个监听端口` });
  } catch (err) {
    res.json({ success: false, message: err.message, data: { ports: [], stats: { total: 0 } } });
  }
});

// GET /api/port/check/:port - 检查指定端口
router.get('/check/:port', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.json({ success: false, message: '端口号不合法 (1-65535)' });
    }
    const result = await portService.checkPort(port);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});


// 终止端口进程
router.post('/kill/:port', (req, res) => {
  portService.killPort(req.params.port).then(r => res.json(r));
});

// 执行启动命令（恢复端口服务）
router.post('/start', (req, res) => {
  const { command } = req.body;
  if (!command) return res.json({ success: false, message: '请输入启动命令' });
  portService.startService(command).then(r => res.json(r));
});

module.exports = router;