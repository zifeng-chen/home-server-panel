// V2 批量命令路由 — /api/v2/batch （挂载于认证区，需 JWT）
const express = require('express');
const router = express.Router();
const batchService = require('../../services/v2/batch-service');

const fail = (res, err) => res.status(400).json({ success: false, message: err.message });
const ok = (res, data) => res.json({ success: true, data });

// GET /api/v2/batch/templates — 预定义命令模板
router.get('/templates', (_req, res) => ok(res, batchService.templates()));

// POST /api/v2/batch/run — { deviceIds, command, label, timeout, concurrency }
router.post('/run', async (req, res) => {
  try {
    const { deviceIds, command, label, timeout, concurrency } = req.body;
    const record = await batchService.run({ deviceIds, command, label, timeout, concurrency });
    ok(res, record);
  } catch (err) { fail(res, err); }
});

// GET /api/v2/batch/history?limit=20 — 批量执行历史
router.get('/history', (req, res) => {
  try { ok(res, batchService.history(parseInt(req.query.limit) || 20)); }
  catch (err) { fail(res, err); }
});

// DELETE /api/v2/batch/history — 清空历史
router.delete('/history', (_req, res) => {
  try { ok(res, batchService.clearHistory()); } catch (err) { fail(res, err); }
});

module.exports = router;
