const express = require('express');
const router = express.Router();
const notifyService = require('../services/notify-service');
const ddnsService = require('../services/ddns-service');
const sslService = require('../services/ssl-service');

// GET /api/notify - 根路由，返回通知服务状态
router.get('/', async (req, res) => {
  try {
    const status = await notifyService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/notify/test - 测试推送
router.post('/test', async (req, res) => {
  try {
    const result = await notifyService.test();
    res.json({ success: result.success !== false, message: result.message || '测试推送已发送' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/notify/ddns - DDNS 变更通知
router.post('/ddns', async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.json({ success: false, message: 'records 参数格式错误' });
    }
    const result = await notifyService.notifyDdnsChange(records);
    res.json({ success: result.success !== false, message: 'DDNS 变更通知已发送' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/notify/ssl - SSL 到期通知
router.post('/ssl', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.json({ success: false, message: 'domain 不能为空' });

    // 从证书列表找到对应证书
    const certs = await sslService.listCertificates();
    const cert = (certs.certificates || []).find(c => c.domain === domain);
    if (!cert) return res.json({ success: false, message: '未找到该域名的证书' });

    const result = await notifyService.notifySslExpire(cert);
    res.json({ success: result.success !== false, message: 'SSL 到期通知已发送' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/notify/service - 服务异常通知
router.post('/service', async (req, res) => {
  try {
    const { service, error } = req.body;
    if (!service) return res.json({ success: false, message: 'service 不能为空' });

    const result = await notifyService.notifyServiceDown(service, error);
    res.json({ success: result.success !== false, message: '服务异常通知已发送' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// PUT /api/notify/config - 更新 PushPlus Token
router.put('/config', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: false, message: 'token 不能为空' });

    notifyService.setToken(token);

    // 写入 .env
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
      if (envContent.includes('PUSHPLUS_TOKEN=')) {
        envContent = envContent.replace(/PUSHPLUS_TOKEN=.*\n?/, `PUSHPLUS_TOKEN=${token}\n`);
      } else {
        envContent += `\nPUSHPLUS_TOKEN=${token}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');
    }

    res.json({ success: true, message: 'PushPlus Token 已更新' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;