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

module.exports = router;