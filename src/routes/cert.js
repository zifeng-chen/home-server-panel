const express = require('express');
const router = express.Router();
const sslService = require('../services/ssl-service');
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e.message || '').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

// 推送通知（静默，失败不影响业务）
function _tryNotify(action, domain, details) {
  try { require('../services/notify-service').notifySslAction(action, domain, details).catch(() => {}); } catch (_) {}
}

// GET /api/cert/acme - 检查 acme.sh 状态
router.get('/acme', async (req, res) => {
  try {
    const status = await sslService.checkAcme();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
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
    res.status(500).json({success: false, message: '安装失败: ' + _safeErr(err) });
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
    send('error', { message: _safeErr(err) });
  }
  res.end();
});

// POST /api/cert/acme/uninstall - 卸载 acme.sh
router.post('/acme/uninstall', async (req, res) => {
  try {
    const result = await sslService.uninstallAcme();
    res.json({ success: true, message: result.message, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: '卸载失败: ' + _safeErr(err) });
  }
});

// GET /api/cert - 证书列表（含状态）
router.get('/', async (req, res) => {
  try {
    const data = await sslService.listCertificates();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err), data: { certificates: [], acmeInstalled: false } });
  }
});

// POST /api/cert/issue - 申请证书
router.post('/issue', async (req, res) => {
  try {
    const { domain, wildcard } = req.body;
    if (!domain) return res.status(400).json({success: false, message: '域名不能为空' });

    const result = await sslService.issueCertificate(domain, { wildcard });
    res.json({ success: true, message: `证书申请成功: ${domain}`, data: result });
    _tryNotify('issue', domain, wildcard ? '通配符证书' : '');
  } catch (err) {
    res.status(500).json({success: false, message: '证书申请失败: ' + _safeErr(err) });
  }
});

// GET /api/cert/issue/stream - SSE 实时证书申请进度
router.get('/issue/stream', async (req, res) => {
  const domain = req.query.domain;
  const wildcard = req.query.wildcard === 'true';
  const force = req.query.force === 'true';
  const provider = req.query.provider || 'zerossl';
  const dnsMode = req.query.dnsMode || process.env.ACME_DNS_PROVIDER || 'alidns';
  const confirmDns = req.query.confirm === 'true';

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
    const result = await sslService.issueCertificateSSE(domain, { wildcard, force, provider, dnsMode, confirmDns }, (type, data) => send(type, data));
    if (result.success) {
      send('done', { message: result.message || '证书申请完成', alreadyExists: result.alreadyExists || false });
    } else {
      send('error', { message: result.message || '证书申请失败' });
    }
  } catch (err) {
    send('error', { message: _safeErr(err) });
  }
  res.end();
});

// POST /api/cert/renew - 续期证书
router.post('/renew', async (req, res) => {
  try {
    const { domain, force } = req.body;
    if (!domain) return res.status(400).json({success: false, message: '域名不能为空' });

    const result = await sslService.renewCertificate(domain, { force: !!force });
    const action = force ? '🔁 强制续期' : '🔄 续期';
    const status = result.skipped ? '跳过（未到期）' : result.alreadyExists ? '已存在' : '成功';
    res.json({ success: true, message: `${action}: ${domain} → ${status}`, data: result });
    if (!result.skipped) _tryNotify('renew', domain, force ? '强制续期' : '自动续期');
  } catch (err) {
    res.status(500).json({success: false, message: '证书续期失败: ' + _safeErr(err) });
  }
});

// POST /api/cert/renew-all - 续期全部证书
router.post('/renew-all', async (req, res) => {
  try {
    const result = await sslService.renewAllCertificates();
    res.json({ success: true, message: '批量续期完成', data: result });
    _tryNotify('renew', (result.domains || []).join(', ') || '全部', '批量续期');
  } catch (err) {
    res.status(500).json({success: false, message: '批量续期失败: ' + _safeErr(err) });
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
    _tryNotify('deploy', domain);
  } catch (err) {
    res.status(500).json({success: false, message: '部署失败: ' + _safeErr(err) });
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
  const domain = req.params.domain;
  sslService.removeConfigDomain(domain, deleteFiles);
  res.json({ success: true, message: deleteFiles ? '域名及证书文件已删除' : '域名已从配置中移除（证书文件保留）' });
  _tryNotify('delete', domain, deleteFiles ? '已删除证书文件' : '仅移除配置');
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

    // Nginx 方案：打包证书+私钥+Nginx配置片段
    if (format === 'nginx') {
      const { execSync } = require('child_process');
      const tmpDir = `/tmp/nginx-cert-${domain}-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      // 收集文件
      const collect = (key) => { for (const f of fileMap[key] || []) { const fp = path.join(certDir, f); if (fs.existsSync(fp)) return { name: f, path: fp }; } return null; };
      const fc = collect('fullchain') || collect('cert');
      const keyFile = collect('key');
      if (!fc || !keyFile) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(404).json({ success: false, message: '缺少必要的证书文件（fullchain.cer / .key）' });
      }
      fs.copyFileSync(fc.path, path.join(tmpDir, fc.name));
      fs.copyFileSync(keyFile.path, path.join(tmpDir, keyFile.name));
      // 生成 Nginx 配置片段
      const nginxConf = `# ===== Nginx SSL 配置 —— ${domain} =====
# 将以下内容放入 server { } 块中

ssl_certificate     /etc/nginx/ssl/${fc.name};
ssl_certificate_key /etc/nginx/ssl/${keyFile.name};

# 推荐的安全配置
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
`;
      fs.writeFileSync(path.join(tmpDir, 'nginx-ssl.conf'), nginxConf, 'utf8');
      // 打包
      const tmpFile = `/tmp/cert-export-${domain}-nginx-${Date.now()}.tar.gz`;
      execSync(`cd "${tmpDir}" && tar -czf "${tmpFile}" *`, { timeout: 10000 });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${domain}-nginx-ssl.tar.gz"`);
      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('end', () => fs.unlink(tmpFile, () => {}));
      return;
    }

    // Apache 方案：打包证书+私钥+Apache配置片段
    if (format === 'apache') {
      const { execSync } = require('child_process');
      const tmpDir = `/tmp/apache-cert-${domain}-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      const collect = (key) => { for (const f of fileMap[key] || []) { const fp = path.join(certDir, f); if (fs.existsSync(fp)) return { name: f, path: fp }; } return null; };
      const certFile = collect('cert');
      const keyFile = collect('key');
      const chainFile = collect('fullchain') || collect('ca');
      if (!certFile || !keyFile) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(404).json({ success: false, message: '缺少必要的证书文件（.cer / .key）' });
      }
      fs.copyFileSync(certFile.path, path.join(tmpDir, certFile.name));
      fs.copyFileSync(keyFile.path, path.join(tmpDir, keyFile.name));
      if (chainFile) fs.copyFileSync(chainFile.path, path.join(tmpDir, chainFile.name));
      const chainName = chainFile ? chainFile.name : 'fullchain.cer';
      // 生成 Apache 配置片段
      const apacheConf = `# ===== Apache SSL 配置 —— ${domain} =====
# 将以下内容放入 <VirtualHost *:443> 块中

SSLEngine on
SSLCertificateFile      /etc/ssl/certs/${certFile.name}
SSLCertificateKeyFile   /etc/ssl/private/${keyFile.name}
SSLCertificateChainFile /etc/ssl/certs/${chainName}

# Apache 2.4.8+ 可用 SSLCACertificateFile 替代 SSLCertificateChainFile
# SSLCACertificateFile /etc/ssl/certs/${chainName}
`;
      fs.writeFileSync(path.join(tmpDir, 'apache-ssl.conf'), apacheConf, 'utf8');
      // 打包
      const tmpFile = `/tmp/cert-export-${domain}-apache-${Date.now()}.tar.gz`;
      execSync(`cd "${tmpDir}" && tar -czf "${tmpFile}" *`, { timeout: 10000 });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${domain}-apache-ssl.tar.gz"`);
      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('end', () => fs.unlink(tmpFile, () => {}));
      return;
    }

    const candidates = fileMap[format];
    if (!candidates) {
      return res.status(400).json({ success: false, message: '无效的文件类型: ' + format + '，支持: cert, key, fullchain, ca, all, nginx, apache' });
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
    res.status(500).json({ success: false, message: '导出失败: ' + _safeErr(err) });
  }
});

module.exports = router;