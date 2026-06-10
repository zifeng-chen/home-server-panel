require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

// 初始化数据库（根据 DB_MODE 选择 SQLite 或 MySQL）
// SQLite 始终初始化（auth sessions 依赖），MySQL 作为业务数据存储
const sqliteService = require('./services/sqlite-service');
await sqliteService.init();

const dbMode = process.env.DB_MODE || 'local';
if (dbMode === 'mysql') {
  try {
    const dbService = require('./services/db-service');
    const mysqlRes = await dbService.initMySQL();
    if (mysqlRes.success) {
      console.log('[DB] MySQL 连接成功');
    } else {
      console.log('[DB] MySQL 连接失败: ' + mysqlRes.message);
      dbService.mode = 'local';
    }
  } catch (e) {
    console.log('[DB] MySQL 初始化异常: ' + e.message);
    require('./services/db-service').mode = 'local';
  }
}

const auth = require('./services/auth');
const logService = require('./services/log-service');
const dbService = require('./services/db-service');

const app = express();
const PORT = process.env.SERVER_PORT || 3456;

// 隐藏 Express 指纹
app.disable('x-powered-by');

// 永久缓存爆破：每次启动生成唯一版本号，注入 index.html
// 浏览器端所有 JS/CSS URL 携带此版本号，重启即刷新缓存
const BUILD_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
console.log('🔑 构建版本: ' + BUILD_ID);

// Cookie 解析
app.use(cookieParser());

// 安全头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // CSP: 允许本站 + xterm CDN + 内联样式(骨架屏/全局CSS)
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data:; " +
    "font-src 'self' https://cdn.jsdelivr.net; " +
    "connect-src 'self' ws: wss: https://api.map.baidu.com; " +
    "frame-ancestors 'self'"
  );
  // HSTS: 如通过 HTTPS 访问则启用
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Body parser — 限制大小防 DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ==================== API 速率限制 ====================
const rateLimiter = (function() {
  const windows = new Map();
  const CLEANUP_MS = 60000;
  let lastCleanup = Date.now();

  return function createLimiter(maxReqs, windowMs) {
    return function(req, res, next) {
      const now = Date.now();
      if (now - lastCleanup > CLEANUP_MS) {
        lastCleanup = now;
        for (const [k, v] of windows) {
          if (now > v.resetAt) windows.delete(k);
        }
      }
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      let win = windows.get(ip);
      if (!win || now > win.resetAt) {
        win = { count: 0, resetAt: now + windowMs };
        windows.set(ip, win);
      }
      win.count++;
      res.setHeader('X-RateLimit-Limit', maxReqs);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxReqs - win.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(win.resetAt / 1000));
      if (win.count > maxReqs) {
        return res.status(429).json({
          success: false, code: 'RATE_LIMITED',
          message: '请求过于频繁，请' + Math.ceil((win.resetAt - now) / 1000) + '秒后重试',
          retryAfter: Math.ceil((win.resetAt - now) / 1000)
        });
      }
      next();
    };
  };
})();
const apiRateLimit = rateLimiter(120, 60000);
const slowRateLimit = rateLimiter(20, 60000);

// Auth 路由（无需认证）
const authRouter = require('./routes/auth');
authRouter._auth = auth; // 注入 auth 实例
app.use('/api/auth', (req, res, next) => {
  req.app.locals.auth = auth;
  next();
}, authRouter);

// Setup 路由（无需认证）
app.use('/api/setup', require('./routes/setup'));

// ===== 以下所有路由都需要认证 =====

// 安装检查中间件：未安装则跳转到安装页面
app.use((req, res, next) => {
  const skipPaths = ['/install.html', '/login.html'];
  const skipPrefixes = ['/api/setup', '/api/auth', '/css/', '/js/', '/favicon'];
  const path = req.path;

  if (skipPaths.includes(path) || skipPrefixes.some(p => path.startsWith(p))) {
    return next();
  }

  // 检查 .env 是否存在
  const envPath = require('path').join(__dirname, '..', '.env');
  const fs = require('fs');
  if (!fs.existsSync(envPath)) {
    return res.redirect('/install.html');
  }
  next();
});

// API 速率限制（防批量抓取，必须在认证前运行以拦截未认证请求）
app.use('/api/', (req, res, next) => {
  if (req.path.includes('/stream')) return next();
  apiRateLimit(req, res, next);
});

// Auth 中间件
app.use(auth.middleware());

// 操作日志中间件（仅在认证后记录）
app.use(logService.middleware());

// 缓存爆破中间件：拦截 index.html 请求，注入 BUILD_ID
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const fs = require('fs');
    const filePath = path.join(__dirname, '..', 'public', 'index.html');
    try {
      let html = fs.readFileSync(filePath, 'utf-8');
      html = html.replace(/\{BUILD_ID\}/g, BUILD_ID);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache'); // index.html 每次验证，其他静态文件用 ?v=BUILD_ID 长缓存
      return res.send(html);
    } catch (e) {
      return next();
    }
  }
  next();
});

// 将 BUILD_ID 注入 app 以供其他模块使用
app.locals.buildId = BUILD_ID;

// 静态文件 - 显式设置 MIME 类型（兼容 NAS 环境下 mime-types 数据库缺失）
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    // JS/CSS 文件携带 BUILD_ID 参数，可安全长缓存（变更会自动生成新 ID）
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
    } else if (filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
    } else if (filePath.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
    }
  }
}));

// 昂贵操作更严格限速
app.use('/api/port', slowRateLimit);
app.use('/api/docker/stats', slowRateLimit);
app.use('/api/docker/containers', slowRateLimit);
app.use('/api/db/export', slowRateLimit);
app.use('/api/cert/issue', slowRateLimit);
app.use('/api/cron', slowRateLimit);
app.use('/api/nginx/install', slowRateLimit);

// API 路由
app.use('/api/ddns', require('./routes/ddns'));
app.use('/api/cert', require('./routes/cert'));
app.use('/api/nginx', require('./routes/nginx'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/api/notify', require('./routes/notify'));
app.use('/api/port', require('./routes/port'));
app.use('/api/system', require('./routes/system'));
app.use('/api/log', require('./routes/log'));
app.use('/api/cron', require('./routes/cron'));
app.use('/api/pm2', require('./routes/pm2'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/ssh', require('./routes/ssh'));
app.use('/api/db', require('./routes/db'));
app.use('/api/monitor', require('./routes/monitor'));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/login') || req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

const server = http.createServer(app);

// WebSocket 初始化（SSH 终端）
const wsService = require('./services/ws-service');
wsService.init(server);

server.listen(PORT, () => {
  console.log(`🏠 家庭服务器管理面板已启动: http://0.0.0.0:${PORT}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`👤 默认账号: admin / admin123`);
  console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2 Docker SSH Monitor`);
  require('./services/cron-service'); // 启动定时任务
});

} // end async main()

main().catch(err => {
  console.error('❌ 服务启动失败:', err);
  process.exit(1);
});