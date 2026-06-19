// 进程聚合路由
const express = require('express');
const router = express.Router();
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

const processService = require('../services/process-service');
const pm2Service = require('../services/pm2-service');

// GET /api/process - 聚合所有进程（PM2 + Docker + 系统服务）
router.get('/', async (req, res) => {
  try {
    const data = await processService.listAll();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: _safeErr(err) });
  }
});

// PM2 操作委托（保持原有 API 兼容）
router.get('/pm2/status', (req, res) => res.json({ success: true, data: pm2Service.getDaemonStatus() }));
router.get('/pm2/guide', (req, res) => res.json(pm2Service.getInstallGuide()));
router.post('/pm2/install', (req, res) => res.json(pm2Service.install()));
router.post('/pm2/uninstall', (req, res) => res.json(pm2Service.uninstall()));
router.post('/pm2/start-daemon', (req, res) => res.json(pm2Service.startDaemon()));
router.post('/pm2/:id/restart', (req, res) => res.json(pm2Service.restart(req.params.id)));
router.post('/pm2/:id/stop', (req, res) => res.json(pm2Service.stop(req.params.id)));
router.post('/pm2/:id/start', (req, res) => res.json(pm2Service.start(req.params.id)));
router.delete('/pm2/:id', (req, res) => res.json(pm2Service.delete(req.params.id)));
router.post('/pm2/save', (req, res) => res.json(pm2Service.save()));

module.exports = router;
