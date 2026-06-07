const express = require('express');
const router = express.Router();
const ddnsService = require('../services/ddns-service');

// GET /api/ddns - 获取所有 DDNS 记录及公网 IP (含 IPv4+IPv6)
router.get('/', async (req, res) => {
  try {
    const data = await ddnsService.getAllRecords();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, message: err.message, data: { records: [], publicIpv4: null, publicIpv6: null } });
  }
});

// GET /api/ddns/ip - 获取公网 IP (IPv4)
router.get('/ip', async (req, res) => {
  try {
    const ip = await ddnsService.getPublicIp();
    res.json({ success: true, data: { ip } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/ddns/ipv6 - 获取公网 IPv6
router.get('/ipv6', async (req, res) => {
  try {
    const ip = await ddnsService.getPublicIpv6();
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

// POST /api/ddns/record/:recordId/toggle - 启停 DNS 记录
router.post('/record/:recordId/toggle', async (req, res) => {
  try {
    const { status } = req.body; // 'ENABLE' | 'DISABLE'
    // 先查当前状态，然后翻转
    const records = (await ddnsService.getAllRecords()).records;
    const record = records.find(r => r.id === req.params.recordId);
    if (!record) return res.json({ success: false, message: '记录不存在' });

    const newStatus = status || (record.enabled ? 'DISABLE' : 'ENABLE');
    await ddnsService.setRecordStatus(req.params.recordId, newStatus);
    res.json({ success: true, message: newStatus === 'ENABLE' ? '已启用' : '已停用' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// PUT /api/ddns/record/:recordId - 编辑 DNS 记录
router.put('/record/:recordId', async (req, res) => {
  try {
    const { rr, type, value, ttl, line } = req.body;
    await ddnsService.editRecord(req.params.recordId, { rr, type, value, ttl, line });
    res.json({ success: true, message: 'DNS 记录已更新' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/record/:recordId - 删除 DNS 解析记录
router.delete('/record/:recordId', async (req, res) => {
  try {
    const localOnly = req.query.localOnly === 'true';
    if (localOnly) {
      // Task 12: 仅从面板移除，不删除阿里云记录
      // 通过 recordId 找到对应域名并从本地配置移除
      const records = (await ddnsService.getAllRecords()).records;
      const record = records.find(r => r.id === req.params.recordId);
      if (!record) return res.json({ success: false, message: '记录不存在' });
      // 从域名提取主域名和子域名，从本地配置移除
      const parts = record.domain.split('.');
      // 简单处理：移除该域名（通过名字匹配）
      ddnsService.removeDomain(record.domain, '@', record.recordType);
      res.json({ success: true, message: '已从面板移除（阿里云 DNS 记录保留）' });
    } else {
      await ddnsService.deleteRecord(req.params.recordId);
      res.json({ success: true, message: 'DNS 记录已从阿里云删除' });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/ddns/domains - 获取已配置的域名列表
router.get('/domains', (req, res) => {
  const domains = ddnsService.getDomains();
  res.json({ success: true, data: { domains } });
});

// POST /api/ddns/domains - 添加 DDNS 域名
router.post('/domains', async (req, res) => {
  try {
    const { name, subdomain, recordType, ttl, value } = req.body;
    if (!name) return res.json({ success: false, message: '域名不能为空' });

    // 保存到本地配置
    const domain = ddnsService.addDomain({
      name: name.replace(/^@\./, ''),
      subdomain: subdomain || '@',
      recordType: recordType || 'A',
      ttl: ttl || 600
    });

    // 同时在阿里云上创建 DNS 记录
    let dnsRecord = null;
    try {
      const currentIp = recordType === 'AAAA'
        ? await ddnsService.getPublicIpv6()
        : await ddnsService.getPublicIp();
      const v = value || currentIp;
      const rr = subdomain === '@' ? '@' : (subdomain || '@');
      dnsRecord = await ddnsService.addRecord(name.replace(/^@\./, ''), rr, recordType || 'A', v, ttl || 600);
    } catch (dnsErr) {
      console.warn('[DDNS] 创建 DNS 记录失败(可能已存在):', dnsErr.message);
    }

    res.json({
      success: true,
      message: `域名 ${subdomain === '@' ? name : subdomain + '.' + name} 已添加`,
      data: { domain, dnsRecord }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/domains - 删除 DDNS 域名
router.delete('/domains', (req, res) => {
  try {
    const { name, subdomain, recordType } = req.body;
    if (!name) return res.json({ success: false, message: '域名不能为空' });

    ddnsService.removeDomain(name, subdomain || '@', recordType);
    res.json({ success: true, message: '域名已删除' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
