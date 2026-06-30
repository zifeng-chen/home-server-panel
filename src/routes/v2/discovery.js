// V2 设备发现 API — /api/v2/discovery
const express = require('express');
const router = express.Router();
const discoveryService = require('../../services/v2/discovery-service');

// POST /api/v2/discovery/scan — 发起网络扫描
router.post('/scan', async (req, res) => {
  try {
    const { method, range } = req.body;
    const scanMethod = method || 'auto';
    const scanId = await discoveryService.scan(scanMethod, range);
    res.json({ success: true, data: { scan_id: scanId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/discovery/scan/:scanId — 查询扫描进度/结果
router.get('/scan/:scanId', async (req, res) => {
  try {
    const scan = discoveryService.getScan(req.params.scanId);
    if (!scan) {
      return res.status(404).json({ success: false, message: '扫描状态已过期或不存在' });
    }
    res.json({ success: true, data: scan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/discovery/identify — 单个 IP 识别（手动添加用）
router.get('/identify', async (req, res) => {
  try {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ success: false, message: '缺少 ip 参数' });
    const device = await discoveryService.identify(ip);
    res.json({ success: true, data: device });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v2/discovery/oui/:prefix — MAC OUI 厂商查询
router.get('/oui/:prefix', (req, res) => {
  try {
    const prefix = req.params.prefix.toUpperCase().replace(/[^0-9A-F]/g, '');
    const OUI_DB = require('../../services/v2/oui-db.json');
    const vendor = OUI_DB[prefix] || null;
    res.json({ success: true, data: { prefix, vendor } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
