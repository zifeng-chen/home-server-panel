const express = require('express');
const os = require('os');
const router = express.Router();
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');


// 推送通知（静默，失败不影响业务）
function _tryNotify(action) {
  try { require('../services/notify-service').notifySystemAction(action).catch(() => {}); } catch (_) {}
}

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
      os: `${os.type()} ${os.release()}`,
      kernel: os.release(),
      cpus: os.cpus().length,
      nodeVersion: process.version,
      panelVersion: pkg.version,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
        free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100
      },
      uptime: Math.floor(os.uptime()),
      panelUptime: process.uptime(),
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
  const sqliteService = require('../services/sqlite-service');
  const aliCreds = sqliteService.getAliyunCredentials();
  const txCreds = sqliteService.getTencentCredentials();

  const aliKeyId = aliCreds.accessKeyId || '';
  const txSecretId = txCreds.secretId || '';

  const config = {
    aliKeyId: aliKeyId ? aliKeyId.slice(0, 8) + '****' : '',
    aliKeySecret: aliCreds.accessKeySecret ? '****' : '',
    tencentSecretId: txSecretId ? txSecretId.slice(0, 8) + '****' : '',
    tencentSecretKey: txCreds.secretKey ? '****' : '',
    ddnsDomains: process.env.DDNS_DOMAINS || '',
    acmeEmail: process.env.ACME_EMAIL || '',
    acmeDnsProvider: process.env.ACME_DNS_PROVIDER || '',
    pushplusToken: (process.env.PUSHPLUS_TOKEN || '').length > 0 ? (process.env.PUSHPLUS_TOKEN.slice(0, 6) + '****') : '未配置',
    pushplusTitle: process.env.PUSHPLUS_TITLE || '',
    pushplusChannel: process.env.PUSHPLUS_CHANNEL || 'wechat',
    certExpireDays: parseInt(process.env.CERT_EXPIRE_WARN_DAYS || '30'),
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
    const sqliteService = require('../services/sqlite-service');

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

    const { aliKeyId, aliKeySecret, tencentSecretId, tencentSecretKey, pushplusToken, pushplusTitle, pushplusChannel, acmeEmail, acmeDns, certExpireDays } = req.body;
    // 前端传空字符串 = 用户未修改，保持不变
    if (aliKeyId) updater('ALIYUN_ACCESS_KEY_ID', aliKeyId);
    if (aliKeySecret) updater('ALIYUN_ACCESS_KEY_SECRET', aliKeySecret);
    if (tencentSecretId) updater('TENCENT_SECRET_ID', tencentSecretId);
    if (tencentSecretKey) updater('TENCENT_SECRET_KEY', tencentSecretKey);
    if (pushplusToken) updater('PUSHPLUS_TOKEN', pushplusToken);
    if (pushplusTitle !== undefined) updater('PUSHPLUS_TITLE', pushplusTitle);
    if (pushplusChannel) updater('PUSHPLUS_CHANNEL', pushplusChannel);
    if (acmeEmail) updater('ACME_EMAIL', acmeEmail);
    if (acmeDns) updater('ACME_DNS_PROVIDER', acmeDns);
    if (certExpireDays) updater('CERT_EXPIRE_WARN_DAYS', certExpireDays);

    fs.writeFileSync(dotenvPath, envContent.trim() + '\n', 'utf-8');

    // 🔥 同步到 SQLite settings 表
    if (aliKeyId) sqliteService.setAliyunCredentials(aliKeyId, aliKeySecret);
    if (tencentSecretId) sqliteService.setTencentCredentials(tencentSecretId, tencentSecretKey);

    // 🔥 同步到 MySQL settings 表（用于备份恢复）
    const dbService = require('../services/db-service');
    const syncKeys = ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'PUSHPLUS_TOKEN', 'ACME_EMAIL', 'ACME_DNS_PROVIDER', 'SERVER_PORT', 'LOG_LEVEL'];
    for (const k of syncKeys) {
      if (req.body[k] || process.env[k]) {
        const v = req.body[k] || process.env[k];
        if (v.indexOf('****') === -1) {
          dbService.saveSetting(k.toLowerCase(), v).catch(() => {});
        }
      }
    }

    // 🔥 立即生效：更新 process.env 并重载相关服务
    if (aliKeyId && aliKeyId.indexOf('****') === -1) process.env.ALIYUN_ACCESS_KEY_ID = aliKeyId;
    if (aliKeySecret && aliKeySecret !== '****') process.env.ALIYUN_ACCESS_KEY_SECRET = aliKeySecret;
    if (tencentSecretId && tencentSecretId.indexOf('****') === -1) process.env.TENCENT_SECRET_ID = tencentSecretId;
    if (tencentSecretKey && tencentSecretKey !== '****') process.env.TENCENT_SECRET_KEY = tencentSecretKey;
    if (pushplusToken) {
      process.env.PUSHPLUS_TOKEN = pushplusToken;
      try { require('../services/notify-service').setToken(pushplusToken); } catch (_) {}
    }
    if (pushplusTitle !== undefined) process.env.PUSHPLUS_TITLE = pushplusTitle;
    if (pushplusChannel) process.env.PUSHPLUS_CHANNEL = pushplusChannel;
    if (acmeEmail) process.env.ACME_EMAIL = acmeEmail;
    if (acmeDns) process.env.ACME_DNS_PROVIDER = acmeDns;
    if (certExpireDays) {
      updater('CERT_EXPIRE_WARN_DAYS', certExpireDays);
      process.env.CERT_EXPIRE_WARN_DAYS = certExpireDays;
    }

    res.json({ success: true, message: '配置已保存并立即生效' });
    _tryNotify('config');
  } catch (err) {
    res.status(500).json({success: false, message: '保存失败: ' + _safeErr(err) });
  }
});

// POST /api/system/restart - 重启服务
router.post('/restart', (req, res) => {
  // 先响应客户端
  res.json({ success: true, message: '服务正在重启...' });
  _tryNotify('restart');
  
  // 1秒后通过 shell 重启
  setTimeout(() => {
    const { exec } = require('child_process');
    const cwd = require('path').join(__dirname, '..', '..');
    exec(`cd ${cwd} && nohup node src/server.js > /tmp/hsp.log 2>&1 &`, () => {
      process.exit(0);
    });
  }, 1000);
});

module.exports = router;