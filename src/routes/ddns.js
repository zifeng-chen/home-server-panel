const express = require('express');
const router = express.Router();
const ddnsService = require('../services/ddns-service');

// GET /api/ddns - 获取所有 DDNS 记录及公网 IP
router.get('/', async (req, res) => {
  try {
    const data = await ddnsService.getAllRecords();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, message: err.message, data: { records: [], publicIp: '0.0.0.0' } });
  }
});

// GET /api/ddns/ip - 仅获取公网 IP
router.get('/ip', async (req, res) => {
  try {
    const ip = await ddnsService.getPublicIp();
    res.json({ success: true, data: { ip } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/ddns/refresh - 手动刷新所有 DDNS 记录
router.post('/refresh', async (req, res) => {
  try {
    const results = await ddnsService.refreshAll();
    const updated = results.results.filter(r => r.updated);
    res.json({
      success: true,
      message: updated.length > 0
        ? `已更新 ${updated.length} 条记录`
        : '所有记录 IP 已是最新，无需更新',
      data: results
    });
  } catch (err) {
    res.json({ success: false, message: 'DDNS 刷新失败: ' + err.message });
  }
});

// GET /api/ddns/domains - 获取已配置的域名列表
router.get('/domains', (req, res) => {
  const domains = ddnsService.getDomains();
  res.json({ success: true, data: { domains } });
});

// POST /api/ddns/domains - 添加 DDNS 域名
router.post('/domains', (req, res) => {
  try {
    const { name, subdomain, recordType, ttl } = req.body;
    if (!name) return res.json({ success: false, message: '域名不能为空' });

    const domain = ddnsService.addDomain({
      name: name.replace(/^@\./, ''),
      subdomain: subdomain || '@',
      recordType: recordType || 'A',
      ttl: ttl || 600
    });
    res.json({ success: true, message: `域名 ${subdomain === '@' ? name : subdomain + '.' + name} 已添加`, data: { domain } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/domains - 删除 DDNS 域名
router.delete('/domains', (req, res) => {
  try {
    const { name, subdomain } = req.body;
    if (!name) return res.json({ success: false, message: '域名不能为空' });

    ddnsService.removeDomain(name, subdomain || '@');
    res.json({ success: true, message: '域名已删除' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/record/:recordId - 删除 DNS 解析记录
router.delete('/record/:recordId', async (req, res) => {
  try {
    await ddnsService.deleteRecord(req.params.recordId);
    res.json({ success: true, message: 'DNS 记录已删除' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;