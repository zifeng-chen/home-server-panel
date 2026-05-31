const express = require('express');
const os = require('os');
const router = express.Router();

// GET /api/system/info - 系统信息
router.get('/info', (req, res) => {
  const info = {
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
    nodeVersion: process.version
  };
  res.json({ success: true, data: info });
});

// GET /api/system/uptime
router.get('/uptime', (req, res) => {
  res.json({
    success: true,
    data: { uptime: process.uptime(), startTime: new Date(Date.now() - process.uptime() * 1000).toISOString() }
  });
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
  res.json({ success: false, message: '功能开发中' });
});

module.exports = router;