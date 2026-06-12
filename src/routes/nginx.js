const express = require('express');
const fs = require('fs');
const router = express.Router();
const nginxService = require('../services/nginx-service');

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
  } catch (err) {
    res.status(500).json({success: false, message: '启动失败: ' + err.message });
  }
});

// POST /api/nginx/stop - 停止
router.post('/stop', async (req, res) => {
  try {
    const result = await nginxService.stop();
    res.json(result);
  } catch (err) {
    res.status(500).json({success: false, message: '停止失败: ' + err.message });
  }
});

// POST /api/nginx/reload - 重载
router.post('/reload', async (req, res) => {
  try {
    const result = await nginxService.reload();
    res.json(result);
  } catch (err) {
    res.status(500).json({success: false, message: '重载失败: ' + err.message });
  }
});

// POST /api/nginx/restart - 重启
router.post('/restart', async (req, res) => {
  try {
    const result = await nginxService.restart();
    res.json(result);
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

// GET /api/nginx/sites - 站点列表
router.get('/sites', async (req, res) => {
  try {
    const sites = await nginxService.getSites();
    res.json({ success: true, data: sites });
  } catch (err) {
    res.status(500).json({success: false, message: err.message, data: { sites: [] } });
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