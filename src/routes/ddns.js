const express = require('express');
const router = express.Router();
const ddnsAliyun = require('../services/ddns-service');
const ddnsTencent = require('../services/ddns-tencent');

// 根据 provider 获取对应服务
function _svc(provider) {
  return provider === 'tencent' ? ddnsTencent : ddnsAliyun;
}

// 从记录 ID 推断 provider（tencent 记录 ID 格式为 tx-xxxxx-xxxxx）
function _inferProvider(recordId) {
  if (recordId && recordId.startsWith('tx-')) return 'tencent';
  return 'aliyun';
}

// 推送通知（静默，失败不影响业务）
function _tryNotify(action, record) {
  try { require('../services/notify-service').notifyDdnsAction(action, record).catch(() => {}); } catch (_) {}
}

// GET /api/ddns - 获取所有 DDNS 记录及公网 IP（合并双云）
router.get('/', async (req, res) => {
  try {
    const [aliyunData, tencentData] = await Promise.allSettled([
      ddnsAliyun.getAllRecords(),
      ddnsTencent.getAllRecords()
    ]);

    const records = [];
    let publicIpv4 = null;
    let publicIpv6 = null;

    if (aliyunData.status === 'fulfilled' && aliyunData.value) {
      const d = aliyunData.value;
      if (d.records) records.push(...d.records.map(r => ({ ...r, provider: 'aliyun' })));
      publicIpv4 = publicIpv4 || d.publicIpv4;
      publicIpv6 = publicIpv6 || d.publicIpv6;
    } else {
      records.push({ domain: '阿里云', error: aliyunData.reason?.message || '阿里云服务不可用', provider: 'aliyun' });
    }

    if (tencentData.status === 'fulfilled' && tencentData.value) {
      const d = tencentData.value;
      if (d.records) records.push(...d.records.map(r => ({ ...r, provider: r.provider || 'tencent' })));
      publicIpv4 = publicIpv4 || d.publicIpv4;
      publicIpv6 = publicIpv6 || d.publicIpv6;
    } else {
      records.push({ domain: '腾讯云', error: tencentData.reason?.message || '腾讯云服务不可用', provider: 'tencent' });
    }

    res.json({ success: true, data: { records, publicIpv4, publicIpv6 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: { records: [], publicIpv4: null, publicIpv6: null } });
  }
});

// GET /api/ddns/ip - 获取公网 IP (IPv4)
router.get('/ip', async (req, res) => {
  try {
    const ip = await ddnsAliyun.getPublicIp();
    res.json({ success: true, data: { ip } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ddns/ipv6 - 获取公网 IPv6
router.get('/ipv6', async (req, res) => {
  try {
    const ip = await ddnsAliyun.getPublicIpv6();
    res.json({ success: true, data: { ip } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ddns/refresh - 手动刷新所有 DDNS 记录（双云并行）
router.post('/refresh', async (req, res) => {
  try {
    const [aliyunRes, tencentRes] = await Promise.allSettled([
      ddnsAliyun.refreshAll(),
      ddnsTencent.refreshAll()
    ]);

    const allResults = [];
    const errors = [];

    if (aliyunRes.status === 'fulfilled') {
      const r = aliyunRes.value;
      if (r.results) allResults.push(...r.results.map(item => ({ ...item, provider: 'aliyun' })));
    } else {
      errors.push('阿里云: ' + (aliyunRes.reason?.message || '刷新失败'));
    }

    if (tencentRes.status === 'fulfilled') {
      const r = tencentRes.value;
      if (r.results) allResults.push(...r.results.map(item => ({ ...item, provider: 'tencent' })));
    } else {
      errors.push('腾讯云: ' + (tencentRes.reason?.message || '刷新失败'));
    }

    const updated = allResults.filter(r => r.updated);
    const message = updated.length > 0
      ? `已更新 ${updated.length} 条记录`
      : '所有记录 IP 已是最新，无需更新';

    res.json({
      success: true,
      message: errors.length > 0 ? message + ' (' + errors.join('; ') + ')' : message,
      data: { results: allResults, errors }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'DDNS 刷新失败: ' + err.message });
  }
});

// POST /api/ddns/record/:recordId/toggle - 启停 DNS 记录
router.post('/record/:recordId/toggle', async (req, res) => {
  try {
    const { provider } = req.body;
    const recordId = req.params.recordId;
    const { status } = req.body;
    const svc = _svc(provider || _inferProvider(recordId));

    // Get records to find the current status
    const data = await svc.getAllRecords();
    const records = data.records || [];
    const record = records.find(r => r.id === recordId);
    if (!record) return res.status(400).json({ success: false, message: '记录不存在' });

    const newStatus = status || (record.enabled ? 'DISABLE' : 'ENABLE');
    // For tencent, setRecordStatus needs domain
    if (svc === ddnsTencent) {
      const domain = record.domain || record.name || '';
      const mainDomain = domain.replace(/^[^.]+\./, '');
      await svc.setRecordStatus(recordId, newStatus, mainDomain);
    } else {
      await svc.setRecordStatus(recordId, newStatus);
    }
    res.json({ success: true, message: newStatus === 'ENABLE' ? '已启用' : '已停用' });
    _tryNotify('toggle', { domain: record.domain || '', rr: record.rr || '', type: record.recordType || '', value: record.value || '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ddns/record/:recordId - 编辑 DNS 记录
router.put('/record/:recordId', async (req, res) => {
  try {
    const { provider, rr, type, value, ttl, line } = req.body;
    const recordId = req.params.recordId;
    const svc = _svc(provider || _inferProvider(recordId));

    if (svc === ddnsTencent) {
      // Tencent needs domain; extract from rr or get from records
      const data = await svc.getAllRecords();
      const records = data.records || [];
      const record = records.find(r => r.id === recordId);
      if (!record) return res.status(400).json({ success: false, message: '记录不存在' });
      const domain = record.domain || '';
      const mainDomain = domain.replace(/^[^.]+\./, '');
      await svc.editRecord(recordId, mainDomain, { rr, type, value, ttl, line });
    } else {
      await svc.editRecord(recordId, { rr, type, value, ttl, line });
    }
    res.json({ success: true, message: 'DNS 记录已更新' });
    _tryNotify('update', { domain: recordId, rr: rr || '', type: type || '', value: value || '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/record/:recordId - 删除 DNS 解析记录
router.delete('/record/:recordId', async (req, res) => {
  try {
    const recordId = req.params.recordId;
    const provider = req.query.provider || _inferProvider(recordId);
    const localOnly = req.query.localOnly === 'true';
    const svc = _svc(provider);

    if (localOnly) {
      // 仅从面板移除，不删除云记录
      const data = await svc.getAllRecords();
      const records = data.records || [];
      const record = records.find(r => r.id === recordId);
      if (!record) return res.status(400).json({ success: false, message: '记录不存在' });
      const domain = record.domain || '';
      const mainDomain = domain.replace(/^[^.]+\./, '');
      svc.removeDomain(mainDomain, record.rr || '@', record.recordType);
      res.json({ success: true, message: '已从面板移除（云 DNS 记录保留）' });
      _tryNotify('delete', { domain: record.domain || '', rr: record.rr || '', type: record.recordType || '', value: '' });
    } else {
      if (svc === ddnsTencent) {
        const data = await svc.getAllRecords();
        const records = data.records || [];
        const record = records.find(r => r.id === recordId);
        if (!record) return res.status(400).json({ success: false, message: '记录不存在' });
        const domain = record.domain || '';
        const mainDomain = domain.replace(/^[^.]+\./, '');
        await svc.deleteRecord(recordId, mainDomain);
      } else {
        await svc.deleteRecord(recordId);
      }
      res.json({ success: true, message: 'DNS 记录已从云服务商删除' });
      _tryNotify('delete', { domain: recordId, rr: '', type: '', value: '' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ddns/domains - 获取已配置的域名列表（支持按 provider 过滤）
router.get('/domains', (req, res) => {
  const provider = req.query.provider;
  let domains;
  if (provider) {
    domains = _svc(provider).getDomains();
  } else {
    const aliDomains = ddnsAliyun.getDomains().map(d => ({ ...d, provider: 'aliyun' }));
    const txDomains = ddnsTencent.getDomains().map(d => ({ ...d, provider: 'tencent' }));
    domains = [...aliDomains, ...txDomains];
  }
  res.json({ success: true, data: { domains } });
});

// POST /api/ddns/domains - 添加 DDNS 域名
router.post('/domains', async (req, res) => {
  try {
    const { name, subdomain, recordType, ttl, value, provider } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '域名不能为空' });

    const svc = _svc(provider || 'aliyun');
    const cloudName = provider === 'tencent' ? '腾讯云' : '阿里云';

    // 保存到本地配置
    const domain = svc.addDomain({
      name: name.replace(/^@\./, ''),
      subdomain: subdomain || '@',
      recordType: recordType || 'A',
      ttl: ttl || 600,
      provider: provider || 'aliyun'
    });

    // 同时在云服务商上创建 DNS 记录
    let dnsRecord = null;
    let dnsWarning = null;
    try {
      let currentIp;
      if (svc === ddnsTencent) {
        currentIp = recordType === 'AAAA'
          ? await ddnsTencent._getIpv6()
          : await ddnsTencent._getIpv4();
      } else {
        currentIp = recordType === 'AAAA'
          ? await ddnsAliyun.getPublicIpv6()
          : await ddnsAliyun.getPublicIp();
      }
      const v = value || currentIp;
      const rr = subdomain === '@' ? '@' : (subdomain || '@');
      dnsRecord = await svc.addRecord(name.replace(/^@\./, ''), rr, recordType || 'A', v, ttl || 600);
    } catch (dnsErr) {
      dnsWarning = `${cloudName} DNS 记录创建失败: ${dnsErr.message}`;
      console.warn('[DDNS]', dnsWarning);
    }

    res.json({
      success: true,
      message: `域名 ${subdomain === '@' ? name : subdomain + '.' + name} 已添加` + (dnsWarning ? ` (但${cloudName}同步失败)` : ''),
      data: { domain, dnsRecord },
      warning: dnsWarning || null
    });
    _tryNotify('create', { domain: name, rr: subdomain || '@', type: recordType || 'A', value: value || (dnsRecord && dnsRecord.Value) || '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ddns/domains - 删除 DDNS 域名
router.delete('/domains', (req, res) => {
  try {
    const { name, subdomain, recordType, provider } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '域名不能为空' });

    _svc(provider || 'aliyun').removeDomain(name, subdomain || '@', recordType);
    res.json({ success: true, message: '域名已删除' });
    _tryNotify('delete', { domain: name, rr: subdomain || '@', type: recordType || '', value: '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
