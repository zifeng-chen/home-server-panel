const express = require('express');
const router = express.Router();
const sslService = require('../services/ssl-service');

// GET /api/cert/acme - 检查 acme.sh 状态
router.get('/acme', async (req, res) => {
  try {
    const status = await sslService.checkAcme();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// POST /api/cert/acme/install - 安装 acme.sh（普通请求）
router.post('/acme/install', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({success: false, message: '请提供联系邮箱' });
    
    const result = await sslService.installAcme(email);
    res.json({ success: true, message: result.message, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '安装失败: ' + err.message });
  }
});

// GET /api/cert/acme/install/stream - SSE 实时安装进度
router.get('/acme/install/stream', async (req, res) => {
  const email = req.query.email || 'admin@izifeng.com';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    send('start', { message: '开始安装 acme.sh...' });
    const result = await sslService.installAcmeSSE(email, (type, data) => send(type, data));
    send('done', { message: result.message || 'acme.sh 安装完成' });
  } catch (err) {
    send('error', { message: err.message });
  }
  res.end();
});

// POST /api/cert/acme/uninstall - 卸载 acme.sh
router.post('/acme/uninstall', async (req, res) => {
  try {
    const result = await sslService.uninstallAcme();
    res.json({ success: true, message: result.message, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '卸载失败: ' + err.message });
  }
});

// GET /api/cert - 证书列表（含状态）
router.get('/', async (req, res) => {
  try {
    const data = await sslService.listCertificates();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({success: false, message: err.message, data: { certificates: [], acmeInstalled: false } });
  }
});

// POST /api/cert/issue - 申请证书
router.post('/issue', async (req, res) => {
  try {
    const { domain, wildcard } = req.body;
    if (!domain) return res.status(400).json({success: false, message: '域名不能为空' });

    const result = await sslService.issueCertificate(domain, { wildcard });
    res.json({ success: true, message: `证书申请成功: ${domain}`, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '证书申请失败: ' + err.message });
  }
});

// GET /api/cert/issue/stream - SSE 实时证书申请进度
router.get('/issue/stream', async (req, res) => {
  const domain = req.query.domain;
  const wildcard = req.query.wildcard === 'true';
  const force = req.query.force === 'true';

  if (!domain) {
    return res.status(400).json({ success: false, message: '域名不能为空' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    send('start', { message: `开始为 ${domain} ${force ? '强制 ' : ''}申请证书...` });
    const result = await sslService.issueCertificateSSE(domain, { wildcard, force }, (type, data) => send(type, data));
    if (result.success) {
      send('done', { message: result.message || '证书申请完成', alreadyExists: result.alreadyExists || false });
    } else {
      send('error', { message: result.message || '证书申请失败' });
    }
  } catch (err) {
    send('error', { message: err.message });
  }
  res.end();
});

// POST /api/cert/renew - 续期证书
router.post('/renew', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({success: false, message: '域名不能为空' });

    const result = await sslService.renewCertificate(domain);
    res.json({ success: true, message: `证书续期成功: ${domain}`, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '证书续期失败: ' + err.message });
  }
});

// POST /api/cert/renew-all - 续期全部证书
router.post('/renew-all', async (req, res) => {
  try {
    const result = await sslService.renewAllCertificates();
    res.json({ success: true, message: '批量续期完成', data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '批量续期失败: ' + err.message });
  }
});

// POST /api/cert/deploy - 部署证书到 Nginx
router.post('/deploy', async (req, res) => {
  try {
    const { domain, keyFile, fullchainFile } = req.body;
    if (!domain) return res.status(400).json({success: false, message: '域名不能为空' });
    if (!keyFile) return res.status(400).json({success: false, message: '请提供 key 文件路径' });
    if (!fullchainFile) return res.status(400).json({success: false, message: '请提供 fullchain 文件路径' });

    const result = await sslService.deployCertificate(domain, keyFile, fullchainFile);
    res.json({ success: true, message: result.message, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '部署失败: ' + err.message });
  }
});

// GET /api/cert/domains - 获取配置的域名
router.get('/domains', (req, res) => {
  const domains = sslService.getConfigDomains();
  res.json({ success: true, data: { domains } });
});

// DELETE /api/cert/domains/:domain - 删除域名及证书文件
router.delete('/domains/:domain', (req, res) => {
  const deleteFiles = req.query.deleteFiles === 'true';
  sslService.removeConfigDomain(req.params.domain, deleteFiles);
  res.json({ success: true, message: deleteFiles ? '域名及证书文件已删除' : '域名已从配置中移除（证书文件保留）' });
});

// GET /api/cert/export/:domain - 导出证书文件
router.get('/export/:domain', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const domain = req.params.domain.replace(/[^a-zA-Z0-9.*_-]/g, '');
    // 安全：拒绝路径穿越
    if (domain.includes('..') || domain.startsWith('/') || domain.startsWith('.')) {
      return res.status(400).json({ success: false, message: '无效的域名格式' });
    }
    const format = req.query.format || 'fullchain';

    // acme.sh 证书目录: ~/.acme.sh/<domain>_ecc/ 或 ~/.acme.sh/<domain>/
    const acmeHome = path.resolve(path.normalize(path.join(os.homedir(), '.acme.sh')));
    const certDirEcc = path.resolve(path.normalize(path.join(acmeHome, domain + '_ecc')));
    const certDirPlain = path.resolve(path.normalize(path.join(acmeHome, domain)));
    // 三重确认未逃逸出 acme.sh 目录
    if (!certDirEcc.startsWith(acmeHome + path.sep) && !certDirEcc.startsWith(acmeHome)) {
      return res.status(400).json({ success: false, message: '无效的域名格式' });
    }
    let certDir = certDirEcc;
    if (!fs.existsSync(certDir)) certDir = certDirPlain;
    if (!fs.existsSync(certDir)) {
      return res.status(404).json({ success: false, message: '证书目录不存在: ' + domain });
    }

    const fileMap = {
      cert: [domain + '.cer', domain + '.pem', 'fullchain.cer', 'fullchain.pem'],
      key: [domain + '.key', domain + '.key.pem'],
      fullchain: ['fullchain.cer', 'fullchain.pem'],
      ca: ['ca.cer', 'ca.cer.pem']
    };

    if (format === 'zip' || format === 'all') {
      // 打包为 tar.gz
      const { execSync } = require('child_process');
      const tmpFile = `/tmp/cert-export-${domain}-${Date.now()}.tar.gz`;
      const allFiles = [];
      for (const key of Object.keys(fileMap)) {
        for (const f of fileMap[key]) {
          if (fs.existsSync(path.join(certDir, f))) { allFiles.push(f); break; }
        }
      }
      if (allFiles.length === 0) {
        return res.status(404).json({ success: false, message: '证书目录为空' });
      }
      execSync(`cd "${certDir}" && tar -czf "${tmpFile}" ${allFiles.join(' ')}`, { timeout: 10000 });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${domain}-certs.tar.gz"`);
      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('end', () => fs.unlink(tmpFile, () => {}));
      return;
    }

    const candidates = fileMap[format];
    if (!candidates) {
      return res.status(400).json({ success: false, message: '无效的文件类型: ' + format + '，支持: cert, key, fullchain, ca, all' });
    }

    let filePath = null;
    let fileName = null;
    for (const f of candidates) {
      const fp = path.join(certDir, f);
      if (fs.existsSync(fp)) { filePath = fp; fileName = f; break; }
    }

    if (!filePath) {
      return res.status(404).json({ success: false, message: '文件不存在，尝试的文件: ' + candidates.join(', ') });
    }

    const mimeTypes = { '.cer': 'application/x-pem-file', '.key': 'application/x-pem-file', '.pem': 'application/x-pem-file' };
    const ext = path.extname(fileName);
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${domain}-${fileName}"`);
    // 使用 readFile + send 替代 sendFile 避免中文路径问题
    fs.readFile(filePath, (err, data) => {
      if (err) return res.status(500).json({ success: false, message: '读取证书文件失败' });
      res.send(data);
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '导出失败: ' + err.message });
  }
});

module.exports = router;