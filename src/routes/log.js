const express = require('express');
const router = express.Router();
const logService = require('../services/log-service');

// GET /api/log - 查询日志
router.get('/', async (req, res) => {
  try {
    const { module, level, search, limit, offset } = req.query;
    const result = await logService.query({
      module,
      level,
      search,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// DELETE /api/log - 清空日志
router.delete('/', (req, res) => {
  try {
    const result = logService.clear();
    res.json(result);
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

module.exports = router;