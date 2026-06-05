const express = require('express');
const router = express.Router();
const dbService = require('../services/db-service');

// POST /api/db/test - 测试 MySQL 连接
router.post('/test', async (req, res) => {
  try {
    const result = await dbService.testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/db/connect - 连接 MySQL
router.post('/connect', async (req, res) => {
  try {
    const result = await dbService.initMySQL(req.body);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/db/status - 获取数据库状态
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      mode: dbService.getMode(),
      connected: dbService.mode === 'mysql' && !!dbService.getPool()
    }
  });
});

// POST /api/db/migrate - 从本地 JSON 迁移到 MySQL
router.post('/migrate', async (req, res) => {
  try {
    const result = await dbService.migrateFromLocal();
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/db/migration-status - 获取迁移状态
router.get('/migration-status', async (req, res) => {
  try {
    const status = await dbService.getMigrationStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/db/disconnect - 断开 MySQL
router.post('/disconnect', async (req, res) => {
  try {
    const result = await dbService.close();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
