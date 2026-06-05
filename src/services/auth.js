// 认证中间件 - Session + Token 双重验证（单例模式）
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '..', '..', 'data', 'sessions.json');

// 管理员账号
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'hsp-secret-' + Date.now();

let _instance = null;

class Auth {
  constructor() {
    if (_instance) return _instance;

    this.sessions = this._loadSessions();
    this._cleanSessions();
    setInterval(() => this._cleanSessions(), 3600000);
    _instance = this;
  }

  verifyLogin(username, password) {
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = this._generateToken(username);
      this._createSession(token);
      return { success: true, token };
    }
    return { success: false, message: '用户名或密码错误' };
  }

  verifyToken(token) {
    if (!token) return false;
    return this.sessions[token] !== undefined;
  }

  middleware() {
    return (req, res, next) => {
      const publicPaths = ['/login.html', '/install.html'];
      const publicPrefixes = ['/api/setup'];

      if (publicPaths.includes(req.path) || publicPrefixes.some(p => req.path.startsWith(p))) return next();

      const token =
        req.headers['x-auth-token'] ||
        req.cookies?.hsp_token ||
        req.query.token;

      if (token && this.verifyToken(token)) {
        req.user = { username: this.sessions[token]?.username || ADMIN_USER };
        return next();
      }

      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: '未登录', code: 'UNAUTHORIZED' });
      }

      res.redirect('/login.html');
    };
  }

  logout(token) {
    delete this.sessions[token];
    this._saveSessions();
    return { success: true };
  }

  _generateToken(username) {
    return crypto.createHmac('sha256', TOKEN_SECRET)
      .update(username + Date.now() + Math.random())
      .digest('hex');
  }

  _createSession(token) {
    this.sessions[token] = {
      username: ADMIN_USER,
      createdAt: Date.now()
    };
    this._saveSessions();
  }

  _cleanSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [token, session] of Object.entries(this.sessions)) {
      if (now - session.createdAt > maxAge) {
        delete this.sessions[token];
        changed = true;
      }
    }
    if (changed) this._saveSessions();
  }

  _loadSessions() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[Auth] Sessions 加载失败:', err.message);
    }
    return {};
  }

  _saveSessions() {
    try {
      const dir = path.dirname(SESSIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Auth] Sessions 保存失败:', err.message);
    }
  }
}

module.exports = new Auth();