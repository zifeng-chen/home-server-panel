const express = require('express');
const fs = require('fs');
const router = express.Router();
const nginxService = require('../services/nginx-service');

// GET /api/nginx/status - Nginx 完整状态
router.get('/status', async (req, res) => {
  try {
    const status = await nginxService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.json({ success: false, message: err.message });
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
    res.json({ success: false, message: '启动失败: ' + err.message });
  }
});

// POST /api/nginx/stop - 停止
router.post('/stop', async (req, res) => {
  try {
    const result = await nginxService.stop();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: '停止失败: ' + err.message });
  }
});

// POST /api/nginx/reload - 重载
router.post('/reload', async (req, res) => {
  try {
    const result = await nginxService.reload();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: '重载失败: ' + err.message });
  }
});

// POST /api/nginx/restart - 重启
router.post('/restart', async (req, res) => {
  try {
    const result = await nginxService.restart();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: '重启失败: ' + err.message });
  }
});

// POST /api/nginx/test - 配置测试
router.post('/test', async (req, res) => {
  try {
    const result = await nginxService.testConfig();
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/nginx/sites - 站点列表
router.get('/sites', async (req, res) => {
  try {
    const sites = await nginxService.getSites();
    res.json({ success: true, data: sites });
  } catch (err) {
    res.json({ success: false, message: err.message, data: { sites: [] } });
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
    res.json({ success: false, message: err.message });
  }
});

// POST /api/nginx/install - 安装 Nginx（引导执行）
router.post('/install', async (req, res) => {
  try {
    const { method } = req.body;
    const guide = await nginxService.getInstallGuide();
    
    if (guide.installed) {
      return res.json({ success: true, message: 'Nginx 已安装' });
    }

    // 只支持 Homebrew 自动安装
    if (method === 'brew' && nginxService.platform === 'darwin') {
      const { exec } = require('child_process');
      exec('brew install nginx', { timeout: 300000 }, (err, stdout, stderr) => {
        if (err && !fs.existsSync('/opt/homebrew/sbin/nginx') && !fs.existsSync('/usr/local/sbin/nginx')) {
          return res.json({ success: false, message: '安装失败: ' + (stderr || err.message).slice(-200) });
        }
        nginxService._detectPaths();
        res.json({ success: true, message: 'Nginx 安装完成' });
      });
      return; // response sent in callback
    }

    res.json({
      success: false,
      message: '请手动执行安装命令',
      data: { commands: guide.guide?.commands || [] }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;