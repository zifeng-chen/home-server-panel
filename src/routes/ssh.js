// SSH 终端 REST API
const express = require('express');
const router = express.Router();
const sshService = require('../services/ssh-service');

// GET /api/ssh/sessions - 活跃会话列表
router.get('/sessions', (req, res) => {
  try {
    const sessions = [];
    for (const [id] of sshService._connections) {
      sessions.push(sshService.getStatus(id));
    }
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/ssh/disconnect/:sessionId - 断开指定会话
router.post('/disconnect/:sessionId', (req, res) => {
  try {
    sshService.disconnect(req.params.sessionId);
    res.json({ success: true, message: '已断开' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;