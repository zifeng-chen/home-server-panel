require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

// ========== 数据库偏好持久化 ==========
// 优先级: .env DB_MODE > data/.db-preference.json > 默认 local
// 确保引导安装选定的数据库模式在 .env 丢失后仍被记住
const fs = require('fs');
const DB_PREF_FILE = path.join(__dirname, '..', 'data', '.db-preference.json');

function loadDbPreference() {
  if (process.env.DB_MODE) return { mode: process.env.DB_MODE, source: '.env' };
  try {
    if (fs.existsSync(DB_PREF_FILE)) {
      const pref = JSON.parse(fs.readFileSync(DB_PREF_FILE, 'utf-8'));
      if (pref.mode) return { mode: pref.mode, source: 'preference-file' };
    }
  } catch (e) { /* 文件损坏，忽略 */ }
  return { mode: 'local', source: 'default' };
}

function saveDbPreference(mode) {
  try {
    const dir = path.dirname(DB_PREF_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PREF_FILE, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (e) { console.warn('[DB] 无法写入偏好文件:', e.message); }
}

// 初始化数据库（根据 DB_MODE 选择 SQLite 或 MySQL）
// SQLite 始终初始化（auth sessions 依赖），MySQL 作为业务数据存储
const sqliteService = require('./services/sqlite-service');
await sqliteService.init();

const dbPref = loadDbPreference();
let dbMode = dbPref.mode;
let dbFallbackReason = null;

const dbServicePreInit = require('./services/db-service');

if (dbMode === 'mysql') {
  try {
    const mysqlRes = await dbServicePreInit.initMySQL();
    if (mysqlRes.success) {
      console.log('[DB] ✅ MySQL 连接成功 (' + dbPref.source + ')');
      saveDbPreference('mysql');
      dbServicePreInit.setPreferred('mysql');
      setImmediate(() => dbServicePreInit.syncFromSQLite().catch(() => {}));
    } else {
      dbFallbackReason = mysqlRes.message;
      console.log('[DB] ⚠️  MySQL 不可达 (' + mysqlRes.message + ')，已回退到 SQLite');
      console.log('[DB] 💡 SQLite 数据仅保存在本机。MySQL 恢复后重启服务即可自动切换。');
      dbServicePreInit.setPreferred('mysql', mysqlRes.message);
      dbMode = 'local';
    }
  } catch (e) {
    dbFallbackReason = e.message;
    console.log('[DB] ⚠️  MySQL 初始化异常 (' + e.message + ')，已回退到 SQLite');
    dbServicePreInit.setPreferred('mysql', e.message);
    dbMode = 'local';
  }
} else {
  console.log('[DB] 📦 使用 SQLite (' + dbPref.source + ')');
  dbServicePreInit.setPreferred('local');
}

const auth = require('./services/auth');
const logService = require('./services/log-service');
const dbService = require('./services/db-service');

// 创建默认管理员（如果不存在）
sqliteService.seedDefaultAdmin();

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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
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
const apiRateLimit = rateLimiter(300, 60000);
const slowRateLimit = rateLimiter(60, 60000);

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
// 优先使用 Vue 构建产物，回退到旧版 public
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const fs = require('fs');
    // 优先从 client/dist (Vue build) 读取，回退到旧 public/
    const vueIdx = path.join(__dirname, '..', 'client', 'dist', 'index.html');
    const legacyIdx = path.join(__dirname, '..', 'public', 'index.html');
    const filePath = (fs.existsSync(vueIdx) ? vueIdx : legacyIdx);
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

// 静态文件 - 优先使用 Vue 构建产物 (client/dist/)，回退到旧 public/
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const hasVueBuild = require('fs').existsSync(path.join(clientDist, 'index.html'));
const staticDir = hasVueBuild ? clientDist : publicDir;
console.log(`[Server] 静态文件目录: ${staticDir}${hasVueBuild ? ' (Vue build)' : ' (legacy public)'}`);

app.use(express.static(staticDir, {
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
app.use('/api/process', require('./routes/process'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/ssh', require('./routes/ssh'));
app.use('/api/db', require('./routes/db'));
app.use('/api/users', require('./routes/users'));
app.use('/api/monitor', require('./routes/monitor'));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    return next();
  }
  const idx = path.join(staticDir, 'index.html');
  if (require('fs').existsSync(idx)) {
    res.sendFile(idx);
  } else {
    next();
  }
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);
  // 🔒 安全：对外脱敏，不暴露内部 err.message（可能含路径/栈) 
  // 但保留已知的错误类型消息（由 route 层抛出的用户可读错误）
  const safeMsg = err.expose ? err.message : '服务器内部错误';
  res.status(err.status || 500).json({ success: false, message: safeMsg });
});

const server = http.createServer(app);

// WebSocket 初始化（SSH 终端）
const wsService = require('./services/ws-service');
wsService.init(server);

server.listen(PORT, () => {
  // 写入 PID 文件，供部署脚本精准 kill，避免误杀 pppd 等关键进程
  try { require('fs').writeFileSync('/tmp/hsp.pid', String(process.pid)); } catch {}
  console.log(`🏠 家庭服务器管理面板已启动: http://0.0.0.0:${PORT}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`👤 默认账号: admin / admin123`);
  console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2 Docker SSH Monitor`);
  logService.log({ module: 'system', action: 'STARTUP', level: 'info',
    message: `服务已启动，端口 ${PORT}，数据库模式 ${dbMode}`,
    detail: `Node ${process.version} | ${process.platform} ${process.arch}` });
  logService.log({ module: 'system', action: 'STARTUP', level: 'info',
    message: `静态文件目录: ${hasVueBuild ? 'Vue build (client/dist)' : 'legacy public'}`,
    detail: `BUILD_ID: ${BUILD_ID}` });
  logService.log({ module: 'system', action: 'STARTUP', level: 'info',
    message: '安全模块已加载',
    detail: 'CSP | HSTS | RateLimit | CSRF-Origin Check' });
  logService.log({ module: 'system', action: 'STARTUP', level: 'info',
    message: `API 路由已挂载: DDNS SSL Nginx Proxy Port Notify Log Cron PM2 Docker SSH Monitor` });
  logService.log({ module: 'system', action: 'STARTUP', level: 'info',
    message: 'WebSocket 服务已就绪',
    detail: 'path: /ws/ssh (SSH 终端实时通道)' });
  require('./services/cron-service'); // 启动定时任务
  require('./services/ssl-renew-service'); // 启动 SSL 自动续期
});

// 优雅关闭
let _shuttingDown = false;
async function _gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`\n🛑 收到 ${signal} 信号，正在优雅关闭...`);
  logService.log({ module: 'system', action: 'SHUTDOWN', level: 'warn',
    message: `收到 ${signal} 信号，开始优雅关闭` });
  try {
    const monitor = require('./services/monitor-service');
    monitor.stop();
    console.log('  ✅ 监控采集已停止');
  } catch (_) {}
  try {
    if (dbMode === 'mysql') {
      const dbService = require('./services/db-service');
      await dbService.close();
      console.log('  ✅ MySQL 连接池已关闭');
    }
  } catch (_) {}
  try {
    const sqliteService = require('./services/sqlite-service');
    sqliteService.close();
    console.log('  ✅ SQLite 已关闭');
  } catch (_) {}
  server.close(() => {
    console.log('  ✅ HTTP 服务已停止');
    process.exit(0);
  });
  // 超时强制退出
  setTimeout(() => { console.log('  ⚠️ 超时强制退出'); process.exit(1); }, 5000);
}
process.on('SIGTERM', () => _gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => _gracefulShutdown('SIGINT'));

} // end async main()

main().catch(err => {
  console.error('❌ 服务启动失败:', err);
  process.exit(1);
});