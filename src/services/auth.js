// 认证中间件 - Session + Token 双重验证（单例模式）
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const sqliteService = require('./sqlite-service');

// 管理员账号
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'hsp-secret-' + Date.now();
const ENV_FILE = path.join(__dirname, '..', '..', '.env');

// 判断密码是否已是 bcrypt 哈希
const isBcryptHash = (s) => s && (s.startsWith('$2a$') || s.startsWith('$2b$'));
const USE_BCRYPT = isBcryptHash(ADMIN_PASS);

// 登录速率限制
const loginAttempts = new Map(); // IP → {count, firstAttempt}
const MAX_LOGIN_ATTEMPTS = 10;    // 每分钟最多 10 次
const LOGIN_WINDOW_MS = 60000;    // 1 分钟窗口
const LOGIN_BLOCK_MS = 300000;    // 封禁 5 分钟

let _instance = null;

class Auth {
  constructor() {
    if (_instance) return _instance;

    this.sessions = this._loadSessions();
    this._cleanSessions();
    setInterval(() => this._cleanSessions(), 3600000);
    // 定期清理过期速率限制条目（每 5 分钟）
    setInterval(() => this._cleanRateLimit(), 300000);
    _instance = this;
  }

  async verifyLogin(username, password, ip) {
    // 速率限制检查
    const rateCheck = this._checkRateLimit(ip || 'unknown');
    if (rateCheck.blocked) {
      return { success: false, message: `登录尝试过多，请 ${Math.ceil(rateCheck.remainingMs / 60000)} 分钟后再试` };
    }

    if (username !== ADMIN_USER) {
      return { success: false, message: '用户名或密码错误' };
    }

    let passwordOk = false;

    if (USE_BCRYPT) {
      // bcrypt 哈希模式
      passwordOk = await bcrypt.compare(password, ADMIN_PASS);
    } else {
      // 明文模式（兼容旧配置）
      passwordOk = (password === ADMIN_PASS);
      // 自动升级：登录成功后把密码哈希写入 .env
      if (passwordOk) {
        this._upgradeToBcrypt(password).catch(() => {});
      }
    }

    if (passwordOk) {
      this._clearRateLimit(ip || 'unknown');
      const token = this._generateToken(username);
      this._createSession(token);
      return { success: true, token };
    }
    return { success: false, message: '用户名或密码错误' };
  }

  // 自动升级：将 .env 中明文密码替换为 bcrypt 哈希
  async _upgradeToBcrypt(password) {
    try {
      const hash = await bcrypt.hash(password, 10);
      let content = fs.readFileSync(ENV_FILE, 'utf-8');
      // 替换 ADMIN_PASS 行
      content = content.replace(
        /^ADMIN_PASS=.*$/m,
        `ADMIN_PASS=${hash}`
      );
      fs.writeFileSync(ENV_FILE, content, 'utf-8');
      console.log('[Auth] 密码已自动升级为 bcrypt 哈希');
    } catch (e) {
      console.warn('[Auth] 密码自动升级失败:', e.message);
    }
  }

  _checkRateLimit(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry) {
      loginAttempts.set(ip, { count: 1, firstAttempt: now });
      return { blocked: false };
    }

    // 窗口过期，重置
    if (now - entry.firstAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.set(ip, { count: 1, firstAttempt: now });
      return { blocked: false };
    }

    // 检查是否在封禁期
    if (entry.blockedUntil && now < entry.blockedUntil) {
      return { blocked: true, remainingMs: entry.blockedUntil - now };
    }

    entry.count++;
    if (entry.count > MAX_LOGIN_ATTEMPTS) {
      entry.blockedUntil = now + LOGIN_BLOCK_MS;
      return { blocked: true, remainingMs: LOGIN_BLOCK_MS };
    }

    return { blocked: false };
  }

  _clearRateLimit(ip) {
    loginAttempts.delete(ip);
  }

  _cleanRateLimit() {
    const now = Date.now();
    for (const [ip, entry] of loginAttempts) {
      // 清除超过窗口期 + 封禁期 的条目
      if (now - entry.firstAttempt > LOGIN_WINDOW_MS + LOGIN_BLOCK_MS) {
        loginAttempts.delete(ip);
      }
    }
  }

  verifyToken(token) {
    if (!token) return false;
    return this.sessions[token] !== undefined;
  }

  middleware() {
    return (req, res, next) => {
      const publicPaths = ['/login.html', '/install.html', '/api/auth/login', '/api/db/status'];
      const publicPrefixes = ['/api/setup', '/css/', '/js/', '/favicon'];

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
    sqliteService.deleteSession(token);
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
    sqliteService.createSession(token, ADMIN_USER);
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
    if (changed) {
      sqliteService.deleteExpiredSessions(maxAge);
    }
  }

  _loadSessions() {
    return sqliteService.getAllSessions();
  }
}

module.exports = new Auth();