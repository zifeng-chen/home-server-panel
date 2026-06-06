const express = require('express');
const router = express.Router();
const dbService = require('../services/db-service');
const sqliteService = require('../services/sqlite-service');

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

// GET /api/db/export - 导出所有数据
router.get('/export', (req, res) => {
  try {
    const data = sqliteService.exportAll();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/db/import - 导入数据
router.post('/import', (req, res) => {
  try {
    sqliteService.importAll(req.body);
    res.json({ success: true, message: '数据导入成功' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/db/migrate-to-sqlite - JSON → SQLite 迁移
router.post('/migrate-to-sqlite', (req, res) => {
  try {
    const result = sqliteService.migrateFromJson();
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/db/info - SQLite 统计信息
router.get('/info', (req, res) => {
  try {
    const proxyStats = sqliteService.getProxyStats();
    const ddnsCount = sqliteService.getDdnsDomains().length;
    const sslCount = sqliteService.getSslDomains().length;
    const sessionCount = Object.keys(sqliteService.getAllSessions()).length;
    const cronCount = sqliteService.getCronJobs().length;
    res.json({
      success: true,
      data: {
        mode: dbService.getMode(),
        sqlite: { ddnsDomains: ddnsCount, proxyRules: proxyStats.total, sslDomains: sslCount, sessions: sessionCount, cronJobs: cronCount }
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
