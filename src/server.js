require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const auth = require('./services/auth');
const logService = require('./services/log-service');
const dbService = require('./services/db-service');

const app = express();
const PORT = process.env.SERVER_PORT || 3456;

// 永久缓存爆破：每次启动生成唯一版本号，注入 index.html
// 浏览器端所有 JS/CSS URL 携带此版本号，重启即刷新缓存
const BUILD_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
console.log('🔑 构建版本: ' + BUILD_ID);

// Cookie 解析
app.use(cookieParser());

// Body parser + 操作日志
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logService.middleware());

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

  // 检查 .env 是否存在（不存在 = 未安装）
  const envPath = require('path').join(__dirname, '..', '.env');
  if (!require('fs').existsSync(envPath)) {
    return res.redirect('/install.html');
  }
  next();
});

// Auth 中间件
app.use(auth.middleware());

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
  console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2 Docker SSH`);
  require('./services/cron-service'); // 启动定时任务

});