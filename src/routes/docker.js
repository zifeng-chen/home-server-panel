const express = require('express');
const router = express.Router();
const docker = require('../services/docker-service');

// GET /api/docker - Docker 概览
router.get('/', async (req, res) => {
  try {
    const [info, containers, images, networks, volumes] = await Promise.all([
      docker.getInfo(),
      docker.listContainers(true),
      docker.listImages(),
      docker.listNetworks(),
      docker.listVolumes()
    ]);
    res.json({
      success: true,
      data: {
        info,
        containers,
        images,
        networks,
        volumes
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/info
router.get('/info', async (req, res) => {
  try {
    const info = await docker.getInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/containers
router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers(req.query.all !== 'false');
    res.json({ success: true, data: containers });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/containers/:id - 容器详情
router.get('/containers/:id', async (req, res) => {
  try {
    const container = await docker.getContainer(req.params.id);
    if (!container) return res.json({ success: false, message: '容器不存在' });
    const stats = container.state === 'running' ? await docker.getStats(container.fullId) : null;
    res.json({ success: true, data: { container, stats } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/docker/containers/:id/:action - 操作
[`start`, `stop`, `restart`, `pause`, `unpause`, `kill`].forEach(action => {
  router.post(`/containers/:id/${action}`, async (req, res) => {
    try {
      const result = await docker.containerAction(req.params.id, action);
      res.json({ success: true, ...result });
    } catch (err) {
      res.json({ success: false, message: err.message });
    }
  });
});

// DELETE /api/docker/containers/:id
router.delete('/containers/:id', async (req, res) => {
  try {
    var force = req.query.force === 'true' || req.query.force === '1';
    var result = await docker.removeContainer(req.params.id, force);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/docker/containers/:id/update - 更新容器
router.post('/containers/:id/update', async (req, res) => {
  try {
    var result = await docker.updateContainer(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/containers/:id/logs
router.get('/containers/:id/logs', async (req, res) => {
  try {
    const logs = await docker.getLogs(req.params.id, parseInt(req.query.lines) || 100);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/containers/:id/logs/stream - SSE 日志流
router.get('/containers/:id/logs/stream', (req, res) => {
  docker.streamLogs(req.params.id, parseInt(req.query.lines) || 50, res);
});

// GET /api/docker/stats - 全部运行容器 stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await docker.getAllStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/docker/images
router.get('/images', async (req, res) => {
  try {
    const images = await docker.listImages();
    res.json({ success: true, data: images });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
