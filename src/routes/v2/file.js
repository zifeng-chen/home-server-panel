// V2 文件操作路由 — /api/v2/file （挂载于认证区，需 JWT）
const express = require('express');
const router = express.Router();
const fileService = require('../../services/v2/file-service');

const fail = (res, err) => res.status(400).json({ success: false, message: err.message });

// POST /api/v2/file/:id/list — 列出目录
router.post('/:id/list', async (req, res) => {
  try {
    const data = await fileService.list(req.params.id, req.body.path);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /api/v2/file/:id/read — 读取文本文件
router.post('/:id/read', async (req, res) => {
  try {
    const data = await fileService.read(req.params.id, req.body.path);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /api/v2/file/:id/write — 写入文本文件
router.post('/:id/write', async (req, res) => {
  try {
    const data = await fileService.write(req.params.id, req.body.path, req.body.content);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /api/v2/file/:id/delete — 删除文件/空目录
router.post('/:id/delete', async (req, res) => {
  try {
    const data = await fileService.remove(req.params.id, req.body.path);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// POST /api/v2/file/:id/upload — 上传文件（base64）
router.post('/:id/upload', async (req, res) => {
  try {
    const { path: dir, name, content } = req.body;
    const data = await fileService.upload(req.params.id, dir, name, content);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// GET /api/v2/file/:id/download?path=... — 下载文件
router.get('/:id/download', async (req, res) => {
  try {
    const { path: file } = req.query;
    const { buffer, path: abs } = await fileService.download(req.params.id, file);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(require('path').basename(abs))}"`);
    res.send(buffer);
  } catch (err) { fail(res, err); }
});

module.exports = router;
