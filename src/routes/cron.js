const express = require('express');
const router = express.Router();
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e?.message || '操作失败').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

const cronService = require('../services/cron-service');

// 管理员权限检查（定时任务中的自定义脚本有任意代码执行风险）
function adminRequired(req, res, next) {
  const token = req.headers['x-auth-token'] || req.cookies?.hsp_token;
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  const auth = require('../services/auth');
  const role = auth.getUserRole(token);
  if (role !== 'admin') return res.status(403).json({ success: false, message: '无权限，仅管理员可操作定时任务' });
  next();
}

// GET /api/cron - 任务列表（所有登录用户可查看）
router.get('/', (req, res) => {
  try {
    const jobs = cronService.listJobs();
    res.json({ success: true, data: { jobs, count: jobs.length } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron - 添加任务（仅管理员）
router.post('/', adminRequired, (req, res) => {
  try {
    const job = cronService.addJob(req.body);
    res.json({ success: true, message: '定时任务已添加', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// PUT /api/cron/:id - 修改任务（仅管理员）
router.put('/:id', adminRequired, (req, res) => {
  try {
    const job = cronService.updateJob(req.params.id, req.body);
    res.json({ success: true, message: '任务已更新', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// DELETE /api/cron/:id - 删除任务（仅管理员）
router.delete('/:id', adminRequired, (req, res) => {
  try {
    cronService.removeJob(req.params.id);
    res.json({ success: true, message: '任务已删除' });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron/:id/toggle - 启用/停用（仅管理员）
router.post('/:id/toggle', adminRequired, (req, res) => {
  try {
    const job = cronService.toggleJob(req.params.id);
    res.json({ success: true, message: job.enabled ? '已启用' : '已停用', data: { job } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/cron/:id/run - 立即执行（仅管理员）
router.post('/:id/run', adminRequired, async (req, res) => {
  try {
    const result = await cronService.runJob(req.params.id);
    res.json({ success: true, message: '任务已执行', data: { result } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

module.exports = router;