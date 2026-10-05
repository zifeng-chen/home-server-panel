// V2 远程 Docker 路由 — /api/v2/docker （挂载于认证区，需 JWT）
const express = require('express');
const router = express.Router();
const dockerRemote = require('../../services/v2/docker-remote');

const fail = (res, err) => res.status(400).json({ success: false, message: err.message });
const ok = (res, data) => res.json({ success: true, data });

// GET /api/v2/docker/:id/status — Docker 可用性 + 概览
router.get('/:id/status', async (req, res) => {
  try { ok(res, await dockerRemote.status(req.params.id)); } catch (err) { fail(res, err); }
});

// GET /api/v2/docker/:id/containers?all=1 — 容器列表
router.get('/:id/containers', async (req, res) => {
  try {
    ok(res, await dockerRemote.listContainers(req.params.id, { all: req.query.all !== '0' }));
  } catch (err) { fail(res, err); }
});

// GET /api/v2/docker/:id/containers/:name/logs?tail=200&since=10m
router.get('/:id/containers/:name/logs', async (req, res) => {
  try {
    ok(res, await dockerRemote.logs(req.params.id, req.params.name, {
      tail: req.query.tail, since: req.query.since,
    }));
  } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/containers/:name/action — { action: start|stop|restart|kill|pause|unpause }
router.post('/:id/containers/:name/action', async (req, res) => {
  try {
    ok(res, await dockerRemote.action(req.params.id, req.params.name, req.body.action));
  } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/containers/:name/remove — { force }
router.post('/:id/containers/:name/remove', async (req, res) => {
  try {
    ok(res, await dockerRemote.removeContainer(req.params.id, req.params.name, !!req.body.force));
  } catch (err) { fail(res, err); }
});

// GET /api/v2/docker/:id/stats — 容器资源占用快照
router.get('/:id/stats', async (req, res) => {
  try { ok(res, await dockerRemote.stats(req.params.id)); } catch (err) { fail(res, err); }
});

// GET /api/v2/docker/:id/images — 镜像列表
router.get('/:id/images', async (req, res) => {
  try { ok(res, await dockerRemote.listImages(req.params.id)); } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/images/pull — { image }
router.post('/:id/images/pull', async (req, res) => {
  try { ok(res, await dockerRemote.pullImage(req.params.id, req.body.image)); } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/images/remove — { image, force }（镜像引用含 / 和 :，走 body 而非路径）
router.post('/:id/images/remove', async (req, res) => {
  try {
    ok(res, await dockerRemote.removeImage(req.params.id, req.body.image, !!req.body.force));
  } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/images/prune — { target, confirm }
router.post('/:id/images/prune', async (req, res) => {
  try {
    ok(res, await dockerRemote.prune(req.params.id, req.body.target, !!req.body.confirm));
  } catch (err) { fail(res, err); }
});

// POST /api/v2/docker/:id/compose — { file, action, service }
router.post('/:id/compose', async (req, res) => {
  try {
    const { file, action, service } = req.body;
    ok(res, await dockerRemote.compose(req.params.id, file, action, service));
  } catch (err) { fail(res, err); }
});

module.exports = router;
