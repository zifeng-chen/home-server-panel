// V2 告警规则 API — /api/v2/alert
const express = require('express');
const router = express.Router();
const alertService = require('../../services/v2/alert-service');

// GET /api/v2/alert/metrics — 可用指标列表
router.get('/metrics', (req, res) => {
  res.json({ success: true, data: alertService.getMetrics() });
});

// GET /api/v2/alert/rules
router.get('/rules', async (req, res) => {
  try {
    const rules = await alertService.listRules();
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/alert/rule
router.post('/rule', async (req, res) => {
  try {
    const { name, metric, operator, threshold, device_id, target } = req.body;
    if (!name || !metric || !operator || threshold == null) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    const result = await alertService.createRule({ name, metric, operator, threshold, device_id, target });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v2/alert/rule/:id
router.put('/rule/:id', async (req, res) => {
  try {
    await alertService.updateRule(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/v2/alert/rule/:id
router.delete('/rule/:id', async (req, res) => {
  try {
    await alertService.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/alert/rule/:id/toggle
router.post('/rule/:id/toggle', async (req, res) => {
  try {
    await alertService.toggleRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v2/alert/check — 手动触发检查
router.post('/check', async (req, res) => {
  try {
    const { device_id } = req.body;
    const triggered = await alertService.checkAlerts(device_id || null);
    res.json({ success: true, data: { triggered } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
