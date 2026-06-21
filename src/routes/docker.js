const express = require('express');
const router = express.Router();
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

const docker = require('../services/docker-service');

// GET /api/docker - Docker 概览
router.get('/', async (req, res) => {
  try {
    const [info, containers, images, networks, volumes, stats] = await Promise.all([
      docker.getInfo(),
      docker.listContainers(true),
      docker.listImages(),
      docker.listNetworks(),
      docker.listVolumes(),
      docker.getAllStats().catch(() => [])
    ]);

    // 合并 stats (CPU/内存) 到容器列表 (按 name 匹配)
    const statsMap = {};
    for (const s of stats) { statsMap[s.name] = s; }
    for (const c of containers) {
      const s = statsMap[c.name];
      if (s) {
        c.cpu = (s.cpuPercent || 0) + '%';
        c.memUsage = s.memoryUsage || '--';
        c.mem = s.memoryLimit || '--';
        c.memPercent = (s.memoryPercent || 0) + '%';
      }
    }

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
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/docker/info
router.get('/info', async (req, res) => {
  try {
    const info = await docker.getInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/docker/containers
router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers(req.query.all !== 'false');
    res.json({ success: true, data: containers });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/docker/containers/:id - 容器详情
router.get('/containers/:id', async (req, res) => {
  try {
    const container = await docker.getContainer(req.params.id);
    if (!container) return res.status(400).json({success: false, message: '容器不存在' });
    const stats = container.state === 'running' ? await docker.getStats(container.fullId) : null;
    res.json({ success: true, data: { container, stats } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/docker/containers/:id/:action - 操作
[`start`, `stop`, `restart`, `pause`, `unpause`, `kill`].forEach(action => {
  router.post(`/containers/:id/${action}`, async (req, res) => {
    try {
      const result = await docker.containerAction(req.params.id, action);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({success: false, message: _safeErr(err) });
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
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/docker/containers/:id/update - 更新容器
router.post('/containers/:id/update', async (req, res) => {
  try {
    var result = await docker.updateContainer(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/docker/containers/:id/logs
router.get('/containers/:id/logs', async (req, res) => {
  try {
    const logs = await docker.getLogs(req.params.id, parseInt(req.query.lines) || 100);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
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
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/docker/images
router.get('/images', async (req, res) => {
  try {
    const images = await docker.listImages();
    res.json({ success: true, data: images });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

module.exports = router;
