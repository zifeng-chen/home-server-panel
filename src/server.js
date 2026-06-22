require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ========== 数据库偏好持久化 ==========
const DB_PREF_FILE = path.join(__dirname, '..', 'data', '.db-preference.json');

function loadDbPreference() {
  if (process.env.DB_MODE) return { mode: process.env.DB_MODE, source: '.env' };
  try {
    if (fs.existsSync(DB_PREF_FILE)) {
      const pref = JSON.parse(fs.readFileSync(DB_PREF_FILE, 'utf-8'));
      if (pref.mode) return { mode: pref.mode, source: 'preference-file' };
    }
  } catch (e) { /* ignore */ }
  return { mode: 'local', source: 'default' };
}

function saveDbPreference(mode) {
  try {
    const dir = path.dirname(DB_PREF_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PREF_FILE, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (e) { console.warn('[DB] 无法写入偏好文件:', e.message); }
}

// ========== 初始化 SQLite（auth sessions 必需） ==========
const sqliteService = require('./services/sqlite-service');
await sqliteService.init();
console.log('[DB] SQLite 初始化完成');

// ========== 初始化 MySQL（业务数据，包括 V2 设备管理） ==========
const dbPref = loadDbPreference();
let dbMode = dbPref.mode;
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
      console.log('[DB] ⚠️ MySQL 不可达 (' + mysqlRes.message + ')，已回退到 SQLite');
      dbServicePreInit.setPreferred('mysql', mysqlRes.message);
      dbMode = 'local';
    }
  } catch (e) {
    console.log('[DB] ⚠️ MySQL 初始化异常 (' + e.message + ')，已回退到 SQLite');
    dbServicePreInit.setPreferred('mysql', e.message);
    dbMode = 'local';
  }
} else {
  console.log('[DB] 📦 使用 SQLite (' + dbPref.source + ')');
  dbServicePreInit.setPreferred('local');
}

// ========== V2 设备管理：初始化专用 MySQL 连接池 ==========
const db = require('./services/db');
let v2Enabled = false;
try {
  const v2Ok = await db.testConnection();
  if (v2Ok) {
    console.log('[V2] MySQL 设备管理已启用');
    v2Enabled = true;
  }
} catch (err) {
  console.warn('[V2] 设备管理 MySQL 不可用，V2 功能跳过:', err.message);
}

// ========== 加载服务 ==========
const auth = require('./services/auth');
const logService = require('./services/log-service');
const nginxService = require('./services/nginx-service');
const proxyService = require('./services/proxy-service');
const dbService = require('./services/db-service');

// 创建默认管理员
sqliteService.seedDefaultAdmin();

// ========== Express 配置 ==========
const app = express();
const PORT = process.env.SERVER_PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

app.disable('x-powered-by');

// 构建版本（缓存爆破）
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
  res.setHeader('X-Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:;");
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:;");
  next();
});

// 严格传输安全（生产环境）
if (!process.env.NO_HSTS) {
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

// Body parser + 操作日志
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JSONP 兼容
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (obj) => {
    const callback = req.method === 'GET' ? req.query.callback : null;
    if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      const payload = JSON.stringify(obj).replace(/</g, '\\u003c');
      res.type('application/javascript');
      return res.send(`${callback}(${payload});`);
    }
    return json(obj);
  };
  next();
});

app.use(logService.middleware());

// ========== 首页 Bootstrap（嵌入首屏数据避免 Ajax 请求） ==========
function readJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Bootstrap] JSON 读取失败:', filePath, err.message);
  }
  return fallback;
}

async function buildDashboardBootstrap() {
  const ddnsConfig = readJsonFile(path.join(__dirname, '..', 'data', 'ddns-config.json'), { domains: [] });
  const systemInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: {
      total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
      free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100
    },
    uptime: Math.floor(os.uptime()),
    loadavg: os.loadavg(),
    nodeVersion: process.version,
    modules: ['DDNS','SSL','Nginx','Proxy','Port','Notify','Log','Cron','PM2','Devices'],
    panelVersion: process.env.npm_package_version || '2.0.0-beta1'
  };

  let nginxStatus = { installed: false, running: false };
  try {
    nginxStatus = await nginxService.getStatus();
  } catch (err) {
    nginxStatus = { installed: false, running: false, error: err.message };
  }

  return {
    generatedAt: new Date().toISOString(),
    responses: {
      '/system/info': { success: true, data: systemInfo },
      '/system/uptime': {
        success: true,
        data: {
          uptime: process.uptime(),
          startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
        }
      },
      '/ddns': { success: true, data: { domains: ddnsConfig.domains || [], records: [] } },
      '/cert': { success: true, data: { certificates: [], certs: [] } },
      '/nginx/status': { success: true, data: nginxStatus },
      '/proxy': { success: true, data: { rules: proxyService.listRules(), stats: proxyService.getStats() } },
      '/port': { success: true, data: { ports: [], stats: { total: 0 } } }
    }
  };
}

async function sendIndex(req, res, next) {
  try {
    const html = fs.readFileSync(INDEX_FILE, 'utf-8');
    const bootstrap = await buildDashboardBootstrap();
    const payload = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    res.type('html').send(html.replace(
      '<script src="/js/utils.js',
      `<script>window.__HSP_DASHBOARD__=${payload};</script>\n  <script src="/js/utils.js`
    ));
  } catch (err) {
    next(err);
  }
}

// ========== 认证路由（无需登录） ==========
const authRouter = require('./routes/auth');
authRouter._auth = auth;
app.use('/api/auth', (req, res, next) => {
  req.app.locals.auth = auth;
  next();
}, authRouter);

// ========== 认证中间件 ==========
app.use(auth.middleware());

// ========== 静态文件 + SPA ==========
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC_DIR));

// ========== API 路由 ==========
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

// ========== V2 设备管理 API（需要 MySQL 可用） ==========
if (v2Enabled) {
  app.use('/api/v1/device', require('./routes/api/v1/device'));
  app.use('/api/v1/metrics', require('./routes/api/v1/metrics'));
  app.use('/api/v1/command', require('./routes/api/v1/command'));

  // 启动离线检测定时器
  const DeviceManager = require('./services/device-manager');
  setInterval(() => DeviceManager.detectOffline(), 60000);
}

// ========== SPA fallback ==========
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/login') || req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
    return next();
  }
  sendIndex(req, res, next);
});

// ========== 全局错误处理 ==========
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

// ========== 启动服务器 ==========
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`🏠 家庭服务器管理面板已启动: http://0.0.0.0:${PORT}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`👤 默认账号: admin / admin123`);
  console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2${v2Enabled ? ' V2Devices' : ''}`);
  require('./services/cron-service'); // 启动定时任务
});

} // end main()

main().catch(err => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
