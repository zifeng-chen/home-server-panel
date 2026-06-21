const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const sqliteService = require('../services/sqlite-service');
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

// 权限检查中间件 — 仅管理员可执行写操作
function adminRequired(req, res, next) {
  const token = req.headers['x-auth-token'] || req.cookies?.hsp_token;
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  const auth = require('../services/auth');
  const role = auth.getUserRole(token);
  if (role !== 'admin') return res.status(403).json({ success: false, message: '无权限，仅管理员可操作' });
  next();
}

// GET /api/users — 获取所有用户（仅管理员）
router.get('/', adminRequired, (req, res) => {
  try {
    const users = sqliteService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (e) {
    res.status(500).json({ success: false, message: _safeErr(e) });
  }
});

// GET /api/users/me — 获取当前用户信息
router.get('/me', (req, res) => {
  try {
    const token = req.headers['x-auth-token'] || req.cookies?.hsp_token;
    const auth = require('../services/auth');
    const username = auth.getUsername(token);
    const user = username ? sqliteService.getUserByUsername(username) : null;
    res.json({ success: true, data: { username, role: user?.role || 'user' } });
  } catch (e) {
    res.status(500).json({ success: false, message: _safeErr(e) });
  }
});

// POST /api/users — 创建用户（仅管理员）
router.post('/', adminRequired, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 50) {
      return res.status(400).json({ success: false, message: '用户名长度 2-50 字符' });
    }
    if (password.length < 4) {
      return res.status(400).json({ success: false, message: '密码至少 4 位' });
    }
    const existing = sqliteService.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    const hash = bcrypt.hashSync(password, 10);
    sqliteService.createUser(username, hash, role || 'user');
    res.json({ success: true, message: '用户创建成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: _safeErr(e) });
  }
});

// PUT /api/users/:id — 更新用户（仅管理员）
router.put('/:id', adminRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;
    const user = sqliteService.getUserById(id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const updates = {};
    if (username) updates.username = username;
    if (password) {
      if (password.length < 4) return res.status(400).json({ success: false, message: '密码至少 4 位' });
      updates.password = bcrypt.hashSync(password, 10);
    }
    if (role) updates.role = role;
    sqliteService.updateUser(id, updates);
    res.json({ success: true, message: '用户已更新' });
  } catch (e) {
    res.status(500).json({ success: false, message: _safeErr(e) });
  }
});

// DELETE /api/users/:id — 删除用户（仅管理员）
router.delete('/:id', adminRequired, (req, res) => {
  try {
    const { id } = req.params;
    const user = sqliteService.getUserById(id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    if (user.username === 'admin') return res.status(400).json({ success: false, message: '不能删除内置管理员' });
    sqliteService.deleteUser(id);
    res.json({ success: true, message: '用户已删除' });
  } catch (e) {
    res.status(500).json({ success: false, message: _safeErr(e) });
  }
});

module.exports = router;
