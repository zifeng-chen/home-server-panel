const express = require('express');
const router = express.Router();
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

const cronService = require('../services/cron-service');

// GET /api/cron - 任务列表
router.get('/', (req, res) => {
  try {
    const jobs = cronService.listJobs();
    res.json({ success: true, data: { jobs, count: jobs.length } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron - 添加任务
router.post('/', (req, res) => {
  try {
    const job = cronService.addJob(req.body);
    res.json({ success: true, message: '定时任务已添加', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// PUT /api/cron/:id - 修改任务
router.put('/:id', (req, res) => {
  try {
    const job = cronService.updateJob(req.params.id, req.body);
    res.json({ success: true, message: '任务已更新', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// DELETE /api/cron/:id - 删除任务
router.delete('/:id', (req, res) => {
  try {
    cronService.removeJob(req.params.id);
    res.json({ success: true, message: '任务已删除' });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron/:id/toggle - 启用/停用
router.post('/:id/toggle', (req, res) => {
  try {
    const job = cronService.toggleJob(req.params.id);
    res.json({ success: true, message: job.enabled ? '已启用' : '已停用', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron/:id/run - 立即执行
router.post('/:id/run', async (req, res) => {
  try {
    const result = await cronService.runJob(req.params.id);
    res.json({ success: true, message: '任务已执行', data: { result } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

module.exports = router;