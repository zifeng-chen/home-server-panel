const express = require('express');
const fs = require('fs');
const router = express.Router();
const nginxService = require('../services/nginx-service');

// 推送通知（静默，失败不影响业务）
function _tryNotify(action) {
  try { require('../services/notify-service').notifyNginxAction(action).catch(() => {}); } catch (_) {}
}

// GET /api/nginx - 根路由，返回状态
router.get('/', async (req, res) => {
  try {
    const status = await nginxService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/nginx/status - Nginx 完整状态
router.get('/status', async (req, res) => {
  try {
    const status = await nginxService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/nginx/install-guide - 安装引导
router.get('/install-guide', async (req, res) => {
  const guide = await nginxService.getInstallGuide();
  res.json({ success: true, data: guide });
});

// POST /api/nginx/start - 启动
router.post('/start', async (req, res) => {
  try {
    const result = await nginxService.start();
    res.json(result);
    if (result.success) _tryNotify('start');
  } catch (err) {
    res.status(500).json({success: false, message: '启动失败: ' + err.message });
  }
});

// POST /api/nginx/stop - 停止
router.post('/stop', async (req, res) => {
  try {
    const result = await nginxService.stop();
    res.json(result);
    if (result.success) _tryNotify('stop');
  } catch (err) {
    res.status(500).json({success: false, message: '停止失败: ' + err.message });
  }
});

// POST /api/nginx/reload - 重载
router.post('/reload', async (req, res) => {
  try {
    const result = await nginxService.reload();
    res.json(result);
    if (result.success) _tryNotify('reload');
  } catch (err) {
    res.status(500).json({success: false, message: '重载失败: ' + err.message });
  }
});

// POST /api/nginx/restart - 重启
router.post('/restart', async (req, res) => {
  try {
    const result = await nginxService.restart();
    res.json(result);
    if (result.success) _tryNotify('restart');
  } catch (err) {
    res.status(500).json({success: false, message: '重启失败: ' + err.message });
  }
});

// POST /api/nginx/test - 配置测试
router.post('/test', async (req, res) => {
  try {
    const result = await nginxService.testConfig();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/nginx/sites - 站点列表（含类型标记：manual/auto）
router.get('/sites', async (req, res) => {
  try {
    var result = await nginxService.getSites();
    var sites = result.sites || [];
    // 检测站点类型：如果 server_name 匹配某条反向代理规则的 sourceHost，则为 auto
    var proxySvc = require('../services/proxy-service');
    var proxyRules = [];
    try { proxyRules = proxySvc.listRules() || []; } catch (_) {}
    var proxyDomains = new Set(proxyRules.filter(function(r) { return r.enabled !== false; }).map(function(r) { return r.sourceHost || ''; }));
    sites = sites.map(function(s) {
      var isAuto = proxyDomains.has(s.serverName || '');
      // 同时检查文件名是否匹配已知代理规则名
      if (!isAuto && s.name) {
        isAuto = proxyRules.some(function(r) {
          var safeName = (r.sourceHost || '').replace(/[^a-zA-Z0-9_-]/g, '-');
          return s.name === safeName + '-proxy' || s.name === safeName;
        });
      }
      return Object.assign({}, s, { siteType: isAuto ? 'auto' : 'manual', proxyRuleId: isAuto ? (proxyRules.find(function(r) { return (r.sourceHost || '') === s.serverName; }) || {}).id || null : null });
    });
    res.json({ success: true, data: { sites: sites } });
  } catch (err) {
    res.status(500).json({success: false, message: err.message, data: { sites: [] } });
  }
});

// DELETE /api/nginx/sites/:name - 删除站点（自动同步删除关联代理规则）
router.delete('/sites/:name', async (req, res) => {
  try {
    var name = req.params.name;
    if (!name) return res.status(400).json({ success: false, message: '缺少站点名称' });

    // 查询站点获取 filePath
    var result = await nginxService.getSites();
    var sites = result.sites || [];
    var site = sites.find(function(s) { return s.name === name; });
    if (!site) return res.status(404).json({ success: false, message: '站点不存在' });

    // 如果是 auto 类型，同步删除关联代理规则
    var proxyRuleId = null;
    try {
      var proxySvc = require('../services/proxy-service');
      var proxyRules = proxySvc.listRules() || [];
      var matchedRule = proxyRules.find(function(r) {
        var safeName = (r.sourceHost || '').replace(/[^a-zA-Z0-9_-]/g, '-');
        return (r.sourceHost === site.serverName) || (name === safeName + '-proxy') || (name === safeName);
      });
      if (matchedRule) {
        proxyRuleId = matchedRule.id;
        proxySvc.deleteRule(proxyRuleId);
      }
    } catch (_) {}

    var delResult = await nginxService.deleteSite(site.filePath);
    res.json({ success: true, message: '✅ 站点已删除' + (proxyRuleId ? '，已同步删除关联代理规则' : ''), data: { name: name, path: delResult.path, proxyRuleId: proxyRuleId } });
  } catch (err) {
    res.status(500).json({ success: false, message: '删除失败: ' + err.message });
  }
});

// GET /api/nginx/site-config - 读取站点配置文件内容
router.get('/site-config', async (req, res) => {
  try {
    const fp = req.query.path;
    if (!fp) return res.status(400).json({ success: false, message: '缺少配置文件路径' });
    // 安全：限制路径范围
    const path = require('path');
    const normalized = path.resolve(path.normalize(fp));
    const allowDirs = [
      '/etc/nginx', '/usr/local/etc/nginx', '/opt/etc/nginx',
      '/usr/local/nginx/conf', '/etc/nginx/conf.d', '/etc/nginx/sites-available',
      '/etc/nginx/sites-enabled'
    ];
    const allowed = allowDirs.some(function(dir) {
      return normalized === path.resolve(dir) || normalized.startsWith(path.resolve(dir) + path.sep);
    });
    if (!allowed) {
      return res.status(400).json({ success: false, message: '禁止的路径范围' });
    }
    const content = fs.readFileSync(normalized, 'utf8');
    res.json({ success: true, data: { path: fp, content: content } });
  } catch (err) {
    res.status(500).json({ success: false, message: '读取配置文件失败: ' + err.message });
  }
});

// POST /api/nginx/site-config - 保存站点配置文件
router.post('/site-config', async (req, res) => {
  try {
    const { path: fp, content } = req.body;
    if (!fp || content === undefined) return res.status(400).json({ success: false, message: '缺少文件路径或内容' });
    // 安全：限制路径范围（同上）
    const path = require('path');
    const normalized = path.resolve(path.normalize(fp));
    const allowDirs = [
      '/etc/nginx', '/usr/local/etc/nginx', '/opt/etc/nginx',
      '/usr/local/nginx/conf', '/etc/nginx/conf.d', '/etc/nginx/sites-available',
      '/etc/nginx/sites-enabled'
    ];
    const allowed = allowDirs.some(function(dir) {
      return normalized === path.resolve(dir) || normalized.startsWith(path.resolve(dir) + path.sep);
    });
    if (!allowed) {
      return res.status(400).json({ success: false, message: '禁止的路径范围' });
    }
    if (content.length > 1024 * 1024) {
      return res.status(400).json({ success: false, message: '配置文件过大（上限1MB）' });
    }
    fs.writeFileSync(normalized, content, 'utf8');
    // 保存后自动测试配置
    try {
      const testResult = await nginxService.testConfig();
      if (!testResult.ok) {
        return res.json({ success: false, message: '保存成功但配置测试失败: ' + (testResult.error || '未知错误'), data: { saved: true, configError: testResult.error } });
      }
    } catch (_) {}
    res.json({ success: true, message: '✅ 配置文件已保存', data: { path: fp } });
    _tryNotify('config-update');
  } catch (err) {
    res.status(500).json({ success: false, message: '保存失败: ' + err.message });
  }
});

// GET /api/nginx/logs - 查看日志
router.get('/logs', async (req, res) => {
  try {
    const type = req.query.type || 'access';
    const lines = parseInt(req.query.lines) || 50;
    const logs = await nginxService.getLogs(type, lines);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/nginx/install/stream - SSE 实时安装进度
router.get('/install/stream', (req, res) => {
  const platform = nginxService.platform;
  const distro = nginxService.distro;
  let { method } = req.query;

  // 平台/发行版默认安装方式
  if (!method) {
    if (distro === 'openwrt') method = 'opkg';
    else if (distro === 'alpine') method = 'apk';
    else method = platform === 'darwin' ? 'brew' : 'apt';
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  // 检查是否已安装
  if (nginxService.nginxBin) {
    send('done', { message: 'Nginx 已安装', installed: true });
    _tryNotify('install');
    return res.end();
  }

  // 构建安装命令
  let cmd;
  if (method === 'brew' && platform === 'darwin') {
    cmd = 'brew install nginx 2>&1';
  } else if (method === 'opkg') {
    // OpenWRT / iStoreOS: 不需要 sudo，root 自带权限
    send('start', { command: 'opkg update && opkg install nginx', platform, distro, note: 'iStoreOS/OpenWRT 检测到，使用 opkg（无需 sudo）' });
    cmd = 'opkg update 2>&1 && opkg install nginx 2>&1';
  } else if (method === 'apt' && platform === 'linux') {
    cmd = 'sudo apt-get update -qq 2>&1 && sudo apt-get install -y nginx 2>&1';
  } else if (method === 'yum' && platform === 'linux') {
    cmd = 'sudo yum install -y nginx 2>&1';
  } else if (method === 'apk' && platform === 'linux') {
    // Alpine 也可能以 root 运行
    cmd = 'apk add nginx 2>&1';
  } else {
    send('error', { message: `不支持的平台(${platform})或安装方式(${method})` });
    return res.end();
  }

  send('start', { command: cmd, platform, method });

  const { exec } = require('child_process');
  const child = exec(cmd, { timeout: 600000, maxBuffer: 1024 * 1024 });

  let buffer = '';
  const flushLines = (data, type) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 不完整行保留
    for (const line of lines) {
      if (line.trim()) {
        send('output', { text: line, stream: type });
      }
    }
  };

  child.stdout.on('data', (data) => flushLines(data, 'stdout'));
  child.stderr.on('data', (data) => flushLines(data, 'stderr'));

  child.on('close', (code) => {
    // flush remaining buffer
    if (buffer.trim()) {
      send('output', { text: buffer.trim(), stream: 'stdout' });
    }
    if (code === 0) {
      nginxService._detectPaths();
      send('done', { message: '安装成功!', installed: true, code });
      _tryNotify('install');
    } else {
      send('error', { message: `安装失败 (退出码: ${code})`, code });
    }
    res.end();
  });

  child.on('error', (err) => {
    send('error', { message: err.message });
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
});

// POST /api/nginx/install - 安装引导（返回推荐命令）
router.post('/install', async (req, res) => {
  try {
    const guide = await nginxService.getInstallGuide();
    if (guide.installed) {
      return res.json({ success: true, data: { installed: true, message: 'Nginx 已安装' } });
    }
    const distro = nginxService.distro;
    const recommended = distro === 'openwrt' ? 'opkg'
      : distro === 'alpine' ? 'apk'
      : nginxService.platform === 'darwin' ? 'brew'
      : 'apt';
    const methods = distro === 'openwrt' ? ['opkg']
      : distro === 'alpine' ? ['apk']
      : nginxService.platform === 'linux' ? ['apt', 'yum', 'apk']
      : ['brew'];
    res.json({
      success: true,
      data: {
        installed: false,
        platform: nginxService.platform,
        distro: nginxService.distro,
        isRoot: nginxService._isRoot(),
        recommended,
        methods,
        commands: guide.guide?.commands || []
      }
    });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});


// 手动部署项目到 Nginx
router.post('/manual-deploy', async (req, res) => {
  try {
    var { name, domain, target, websocket } = req.body;
    if (!name || !domain || !target) return res.json({ success: false, message: '参数不完整' });
    var result = await nginxService.manualDeploy({ name, domain, target, websocket: !!websocket });
    res.json(result);
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

module.exports = router;