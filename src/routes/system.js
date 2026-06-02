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
    nodeVersion: process.version,
    modules: ['DDNS','SSL','Nginx','Proxy','Port','Notify','Log','Cron','PM2','Docker','SSH'],
    panelVersion: '1.8.6-diag+1780379661'
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
      const re = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;
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
    res.json({ success: true, message: '配置已保存，重启后生效' });
  } catch (err) {
    res.json({ success: false, message: '保存失败: ' + err.message });
  }
});

module.exports = router;