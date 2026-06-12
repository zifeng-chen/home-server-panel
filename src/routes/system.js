const express = require('express');
const os = require('os');
const router = express.Router();

// 简单内存缓存（60 秒 TTL）
const _cache = new Map();
function getCached(key, ttlMs, factory) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  const data = factory();
  _cache.set(key, { ts: Date.now(), data });
  return data;
}

// GET /api/system/info - 系统信息
router.get('/info', (req, res) => {
  const info = getCached('sys-info', 60000, () => {
    const pkg = require('../../package.json');
    const ips = [];
    const nets = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(nets)) {
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') ips.push(addr.address);
      }
    }
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      nodeVersion: process.version,
      panelVersion: pkg.version,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
        free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100
      },
      uptime: Math.floor(os.uptime()),
      loadavg: os.loadavg(),
      ips: ips,
      modules: ['DDNS','SSL','Nginx','Proxy','Port','Notify','Log','Cron','PM2','Docker','SSH']
    };
  });
  res.json({ success: true, data: info });
});

// GET /api/system/uptime
router.get('/uptime', (req, res) => {
  const data = getCached('sys-uptime', 15000, () => ({
    uptime: process.uptime(),
    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
  }));
  res.json({ success: true, data });
});

// GET /api/system/config - 获取配置（脱敏）
router.get('/config', (req, res) => {
  const config = {
    aliKeyId: (process.env.ALIYUN_ACCESS_KEY_ID || '').slice(0, 8) + '****',
    aliKeySecret: '****',
    ddnsDomains: process.env.DDNS_DOMAINS || '',
    acmeEmail: process.env.ACME_EMAIL || '',
    acmeDnsProvider: process.env.ACME_DNS_PROVIDER || '',
    pushplusToken: (process.env.PUSHPLUS_TOKEN || '').length > 0 ? '已配置' : '未配置',
    serverPort: process.env.SERVER_PORT || '3456',
    nginxConfDir: process.env.NGINX_CONF_DIR || '',
    modules: {
      ddns: process.env.MODULE_DDNS === 'true',
      ssl: process.env.MODULE_SSL === 'true',
      nginx: process.env.MODULE_NGINX === 'true',
      proxy: process.env.MODULE_PROXY === 'true',
      port: process.env.MODULE_PORT === 'true'
    }
  };
  res.json({ success: true, data: config });
});

// POST /api/system/config - 保存配置
router.post('/config', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dotenvPath = path.join(__dirname, '..', '..', '.env');

    // 读取现有 .env
    let envContent = '';
    if (fs.existsSync(dotenvPath)) {
      envContent = fs.readFileSync(dotenvPath, 'utf-8');
    }

    const updater = (key, value) => {
      // 安全：移除换行符防止 .env 注入
      const sanitized = String(value).replace(/[\r\n]/g, '');
      const re = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${sanitized}`;
      if (re.test(envContent)) {
        envContent = envContent.replace(re, line);
      } else {
        envContent += `\n${line}`;
      }
    };

    const { aliKeyId, aliKeySecret, pushplusToken, acmeEmail, acmeDns } = req.body;
    if (aliKeyId && aliKeyId.indexOf('****') === -1) updater('ALIYUN_ACCESS_KEY_ID', aliKeyId);
    if (aliKeySecret && aliKeySecret !== '****') updater('ALIYUN_ACCESS_KEY_SECRET', aliKeySecret);
    if (pushplusToken) updater('PUSHPLUS_TOKEN', pushplusToken);
    if (acmeEmail) updater('ACME_EMAIL', acmeEmail);
    if (acmeDns) updater('ACME_DNS_PROVIDER', acmeDns);

    fs.writeFileSync(dotenvPath, envContent.trim() + '\n', 'utf-8');

    // 🔥 立即生效：更新 process.env 并重载相关服务
    if (aliKeyId && aliKeyId.indexOf('****') === -1) process.env.ALIYUN_ACCESS_KEY_ID = aliKeyId;
    if (aliKeySecret && aliKeySecret !== '****') process.env.ALIYUN_ACCESS_KEY_SECRET = aliKeySecret;
    if (pushplusToken) {
      process.env.PUSHPLUS_TOKEN = pushplusToken;
      try { require('../services/notify-service').setToken(pushplusToken); } catch (_) {}
    }
    if (acmeEmail) process.env.ACME_EMAIL = acmeEmail;
    if (acmeDns) process.env.ACME_DNS_PROVIDER = acmeDns;

    res.json({ success: true, message: '配置已保存并立即生效' });
  } catch (err) {
    res.status(500).json({success: false, message: '保存失败: ' + err.message });
  }
});

module.exports = router;