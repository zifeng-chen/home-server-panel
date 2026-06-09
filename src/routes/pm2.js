// PM2 进程管理路由
const express = require('express');
const router = express.Router();
const pm2Service = require('../services/pm2-service');

// PM2 状态检测（安装/守护进程）
router.get('/status', (req, res) => {
  res.json({ success: true, data: pm2Service.getDaemonStatus() });
});

// PM2 安装引导
router.get('/guide', (req, res) => {
  res.json(pm2Service.getInstallGuide());
});

// 获取所有进程
router.get('/', (req, res) => {
  res.json(pm2Service.getProcesses());
});

// 获取 PM2 概览
router.get('/overview', (req, res) => {
  res.json(pm2Service.getOverview());
});

// 重启进程
router.post('/:id/restart', (req, res) => {
  const name = req.params.id;
  res.json(pm2Service.restart(name));
});

// 停止进程
router.post('/:id/stop', (req, res) => {
  const name = req.params.id;
  res.json(pm2Service.stop(name));
});

// 启动进程
router.post('/:id/start', (req, res) => {
  const name = req.params.id;
  res.json(pm2Service.start(name));
});

// 删除进程
router.delete('/:id', (req, res) => {
  const name = req.params.id;
  res.json(pm2Service.delete(name));
});

// 保存 PM2 配置
router.post('/save', (req, res) => {
  res.json(pm2Service.save());
});

// 安装 PM2
router.post('/install', (req, res) => {
  res.json(pm2Service.install());
});

// GET /api/pm2/install/stream - SSE 实时安装进度
router.get('/install/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  if (pm2Service.isInstalled()) {
    const status = pm2Service.getDaemonStatus();
    send('done', { message: 'PM2 已安装', installed: true, version: status.version });
    return res.end();
  }

  send('start', { message: '开始安装 PM2...', command: 'npm install -g pm2' });

  const { spawn } = require('child_process');
  const child = spawn('npm', ['install', '-g', 'pm2'], {
    env: { ...process.env, PATH: process.env.PATH },
    timeout: 120000
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => send('output', { text: line.trim() }));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      // npm 的进度信息走 stderr
      if (line.includes('ERR') || line.includes('error')) {
        send('warn', { text: line.trim() });
      } else {
        send('output', { text: line.trim() });
      }
    });
  });

  child.on('close', (code) => {
    if (code === 0) {
      pm2Service._refreshBin();
      const installed = pm2Service.isInstalled();
      const status = installed ? pm2Service.getDaemonStatus() : { version: '' };
      send('done', { success: installed, message: installed ? 'PM2 安装成功' : '安装完成但检测失败', version: status.version });
    } else {
      send('error', { message: '安装失败 (exit code: ' + code + ')' });
    }
    res.end();
  });

  child.on('error', (err) => {
    send('error', { message: '安装进程错误: ' + err.message });
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
});

// 卸载 PM2
router.post('/uninstall', (req, res) => {
  res.json(pm2Service.uninstall());
});

// GET /api/pm2/uninstall/stream - SSE 实时卸载进度
router.get('/uninstall/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  if (!pm2Service.isInstalled()) {
    send('done', { message: 'PM2 未安装，无需卸载' });
    return res.end();
  }

  send('start', { message: '停止 PM2 守护进程...', command: 'pm2 kill && npm uninstall -g pm2' });

  const { spawn, execSync } = require('child_process');

  // 先 kill daemon
  try { pm2Service._pm2('kill 2>/dev/null', { timeout: 5000 }); } catch (e) {}
  send('output', { text: 'PM2 守护进程已停止' });

  send('output', { text: '开始卸载 PM2...' });

  const child = spawn('npm', ['uninstall', '-g', 'pm2'], {
    env: { ...process.env, PATH: process.env.PATH },
    timeout: 120000
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => send('output', { text: line.trim() }));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      if (line.includes('ERR') || line.includes('error')) {
        send('warn', { text: line.trim() });
      } else {
        send('output', { text: line.trim() });
      }
    });
  });

  child.on('close', (code) => {
    if (code === 0) {
      const stillInstalled = pm2Service.isInstalled();
      send('done', { success: !stillInstalled, message: stillInstalled ? '卸载完成但仍有残留，请手动清理' : 'PM2 已卸载' });
    } else {
      send('error', { message: '卸载失败 (exit code: ' + code + ')' });
    }
    res.end();
  });

  child.on('error', (err) => {
    send('error', { message: '卸载进程错误: ' + err.message });
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
});

// 启动 PM2 守护进程
router.post('/start-daemon', (req, res) => {
  res.json(pm2Service.startDaemon());
});

module.exports = router;