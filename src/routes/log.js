const express = require('express');
const router = express.Router();
const logService = require('../services/log-service');

// GET /api/log - 查询日志
router.get('/', async (req, res) => {
  try {
    const { module, level, search, limit, offset } = req.query;
    const result = await logService.query({
      module,
      level,
      search,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/log/export - 导出日志（CSV / JSON）
router.get('/export', async (req, res) => {
  try {
    const { module, level, search, format = 'json' } = req.query;
    const result = await logService.query({
      module: module || 'all',
      level: level || 'all',
      search: search || '',
      limit: 100000, // 导出全部
      offset: 0
    });

    const list = result.list || [];
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'csv') {
      const headers = ['时间', '模块', '操作', '级别', '消息', '详情', 'IP', '方法', '路径', '状态码', '耗时ms', '用户'];
      const fmtTime = (t) => {
        if (!t) return '';
        try { return new Date(t).toISOString().replace('T', ' ').slice(0, 23); }
        catch (_) { return String(t); }
      };
      const csv = [
        '\ufeff' + headers.join(','), // BOM for Excel 中文兼容
        ...list.map(r => [
          fmtTime(r.time),
          r.module || '',
          r.action || '',
          r.level || '',
          `"${(r.message || '').replace(/"/g, '""')}"`,
          `"${(r.detail || '').replace(/"/g, '""')}"`,
          r.ip || '',
          r.method || '',
          r.path || '',
          r.statusCode || '',
          r.duration || '',
          r.user || ''
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hsp-logs-${now}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hsp-logs-${now}.json"`);
      res.json({
        exportedAt: new Date().toISOString(),
        total: list.length,
        filters: { module, level, search },
        logs: list
      });
    }
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// DELETE /api/log - 清空日志
router.delete('/', (req, res) => {
  try {
    const result = logService.clear();
    res.json(result);
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

module.exports = router;