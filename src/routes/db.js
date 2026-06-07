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

// GET /api/db/export - 导出 SQLite 数据库文件 (.db)
router.get('/export', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const dbPath = path.join(__dirname, '..', '..', 'data', 'panel.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, message: '数据库文件不存在' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="home-server-panel.db"');
    fs.readFile(dbPath, (err, data) => {
      if (err) return res.status(500).json({ success: false, message: '读取数据库文件失败' });
      res.send(data);
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/db/import - 导入数据（支持 .db / .json）
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    if (!req.file) {
      return res.json({ success: false, message: '请上传文件' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.db') {
      // 直接替换 SQLite 数据库文件
      const dbPath = path.join(__dirname, '..', '..', 'data', 'panel.db');
      const backupPath = dbPath + '.backup.' + Date.now();
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
      fs.copyFileSync(req.file.path, dbPath);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, message: 'SQLite 数据库导入成功，请重启服务以生效' });
    } else if (ext === '.json') {
      const data = JSON.parse(fs.readFileSync(req.file.path, 'utf-8'));
      sqliteService.importAll(data);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, message: 'JSON 数据导入成功' });
    } else {
      fs.unlinkSync(req.file.path);
      res.json({ success: false, message: '不支持的文件格式，请上传 .db 或 .json 文件' });
    }
  } catch (err) {
    if (req.file) { try { require('fs').unlinkSync(req.file.path); } catch(e){} }
    res.json({ success: false, message: '导入失败: ' + err.message });
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
