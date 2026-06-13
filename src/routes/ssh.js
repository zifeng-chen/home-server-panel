// SSH 终端 REST API
const express = require('express');
const router = express.Router();
const sshService = require('../services/ssh-service');
const sqliteService = require('../services/sqlite-service');
const dbService = require('../services/db-service');

// ==================== SSH 配置 CRUD ====================

// GET /api/ssh/config - 列出所有 SSH 连接配置
router.get('/config', (req, res) => {
  try {
    const configs = sqliteService.getSshConfigs();
    // 脱敏：不返回密码明文（前端编辑时需要自行回填）
    const safe = configs.map(c => ({ ...c, password: c.password ? '••••••' : '' }));
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ssh/config/:id - 获取单个配置（含密码，用于连接）
router.get('/config/:id', (req, res) => {
  try {
    const config = sqliteService.getSshConfig(parseInt(req.params.id));
    if (!config) return res.status(404).json({ success: false, message: '配置不存在' });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ssh/config - 新增 SSH 配置
router.post('/config', (req, res) => {
  try {
    const cfg = sqliteService.addSshConfig(req.body);
    if (dbService.mode === 'mysql') {
      setImmediate(() => dbService.syncTable('ssh_config').catch(() => {}));
    }
    res.json({ success: true, data: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ssh/config/:id - 更新 SSH 配置
router.put('/config/:id', (req, res) => {
  try {
    const cfg = sqliteService.updateSshConfig(parseInt(req.params.id), req.body);
    if (dbService.mode === 'mysql') {
      setImmediate(() => dbService.syncTable('ssh_config').catch(() => {}));
    }
    res.json({ success: true, data: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ssh/config/:id - 删除配置
router.delete('/config/:id', (req, res) => {
  try {
    sqliteService.deleteSshConfig(parseInt(req.params.id));
    if (dbService.mode === 'mysql') {
      setImmediate(() => dbService.syncTable('ssh_config').catch(() => {}));
    }
    res.json({ success: true, message: '已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ssh/connect - 使用持久化配置建立连接
router.post('/connect', (req, res) => {
  try {
    const { configId, password } = req.body;

    let opts;
    if (configId) {
      const cfg = sqliteService.getSshConfig(parseInt(configId));
      if (!cfg) return res.status(404).json({ success: false, message: '配置不存在' });
      opts = { host: cfg.host, port: cfg.port, username: cfg.username, password: password || cfg.password };
    } else {
      opts = req.body;
    }

    const sessionId = sshService.connect(opts);
    res.json({ success: true, data: { sessionId, host: opts.host, user: opts.username } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 活跃会话 ====================

// GET /api/ssh/sessions - 活跃会话列表
router.get('/sessions', (req, res) => {
  try {
    const sessions = [];
    for (const [id] of sshService._connections) {
      sessions.push(sshService.getStatus(id));
    }
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ssh/disconnect/:sessionId - 断开指定会话
router.post('/disconnect/:sessionId', (req, res) => {
  try {
    sshService.disconnect(req.params.sessionId);
    res.json({ success: true, message: '已断开' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
