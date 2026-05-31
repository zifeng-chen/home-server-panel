require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const auth = require('./services/auth');
const logService = require('./services/log-service');

const app = express();
const PORT = process.env.SERVER_PORT || 3456;

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

// ===== 以下所有路由都需要认证 =====

// Auth 中间件
app.use(auth.middleware());

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

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
server.listen(PORT, () => {
  console.log(`🏠 家庭服务器管理面板已启动: http://0.0.0.0:${PORT}`);
  console.log(`📅 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`👤 默认账号: admin / admin123`);
  console.log(`📦 模块: DDNS SSL Nginx Proxy Port Notify Log Cron PM2`);
  require('./services/cron-service'); // 启动定时任务

});