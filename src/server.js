require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const auth = require('./services/auth');
const logService = require('./services/log-service');
const nginxService = require('./services/nginx-service');
const proxyService = require('./services/proxy-service');
const db = require('./services/db');

const app = express();
const PORT = process.env.SERVER_PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

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
    modules: ['DDNS','SSL','Nginx','Proxy','Port','Notify','Log','Cron','PM2'],
    panelVersion: '1.7.3'
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

// Cookie 解析
app.use(cookieParser());

// Body parser + 操作日志
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET API JSONP fallback for constrained embedded browsers without fetch/XHR.
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

// Auth 路由（无需认证）
const authRouter = require('./routes/auth');
authRouter._auth = auth; // 注入 auth 实例
app.use('/api/auth', (req, res, next) => {
  req.app.locals.auth = auth;
  next();
}, authRouter);

// ===== 以下所有路由都需要认证 =====

// Auth 中间件
app.use(auth.middleware());

// 静态文件
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC_DIR));

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
app.use('/api/v1/device', require('./routes/api/v1/device'));
app.use('/api/v1/metrics', require('./routes/api/v1/metrics'));
app.use('/api/v1/command', require('./routes/api/v1/command'));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/login') || req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
    return next();
  }
  sendIndex(req, res, next);
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${err.stack}`);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

const server = http.createServer(app);

async function startServer() {
  // 初始化 MySQL 连接
  try {
    const ok = await db.testConnection();
    if (ok) {
      console.log('[V2] MySQL 连接成功，HSP V2.0 设备管理已启用');
      // 启动离线检测定时器
      const DeviceManager = require('./services/device-manager');
      setInterval(() => DeviceManager.detectOffline(), 60000);
    }
  } catch (err) {
    console.warn('[V2] MySQL 连接失败，V2.0 设备管理功能不可用:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`🏠 家庭服务器管理面板已启动: http://0.0.0.0:${PORT}`);
    console.log(`📅 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`👤 默认账号: admin / admin123`);
    console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2 V2Devices`);
    require('./services/cron-service'); // 启动定时任务
  });
}

startServer().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
