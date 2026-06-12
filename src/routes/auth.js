const express = require('express');
const router = express.Router();
const auth = require('../services/auth');

// POST /api/auth/login - 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({success: false, message: '用户名和密码不能为空' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress;
  const result = auth.verifyLogin(username, password, clientIp);
  if (result.success) {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('hsp_token', result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: '登录成功',
      data: { token: result.token }
    });
  }

  res.json({ success: false, message: result.message || '登录失败' });
});

// POST /api/auth/logout - 登出
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'] || req.cookies?.hsp_token;
  if (token) auth.logout(token);
  res.clearCookie('hsp_token');
  res.json({ success: true, message: '已登出' });
});

// GET /api/auth/status - 检查登录状态
router.get('/status', (req, res) => {
  const token = req.headers['x-auth-token'] || req.cookies?.hsp_token;
  const loggedIn = token && auth.verifyToken(token);
  const username = auth.sessions[token]?.username || process.env.ADMIN_USER || 'admin';
  res.json({
    success: true,
    data: { loggedIn, username: loggedIn ? username : null }
  });
});

module.exports = router;