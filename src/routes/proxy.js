const express = require('express');
const router = express.Router();
const proxyService = require('../services/proxy-service');
const nginxService = require('../services/nginx-service');

// 自动部署 Nginx 配置
async function _autoDeploy() {
  try {
    const config = proxyService.generateAllConfig();
    const result = await nginxService.deployProxyConfig(config);
    console.log('[Proxy] 自动部署结果:', result.success ? '成功' : result.message);
    return result;
  } catch (err) {
    console.warn('[Proxy] 自动部署异常:', err.message);
    return { success: false, message: err.message };
  }
}

// GET /api/proxy - 代理规则列表
router.get('/', (req, res) => {
  try {
    const rules = proxyService.listRules();
    const stats = proxyService.getStats();
    res.json({ success: true, data: { rules, stats } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/proxy/stats - 统计
router.get('/stats', (req, res) => {
  res.json({ success: true, data: proxyService.getStats() });
});

// POST /api/proxy - 添加规则
router.post('/', async (req, res) => {
  try {
    // 兼容两种字段命名 (前端可能用 domain/target，后端存 sourceHost/targetHost)
    const body = { ...req.body };
    if (!body.sourceHost && body.domain) body.sourceHost = body.domain;
    if (!body.targetHost) {
      if (body.target) {
        // 解析 http://localhost:8080 格式
        const m = body.target.match(/^https?:\/\/([^:/]+)(?::(\d+))?/);
        if (m) {
          body.targetHost = m[1];
          if (m[2]) body.targetPort = parseInt(m[2]);
          body.targetProtocol = body.target.startsWith('https') ? 'https' : 'http';
        } else {
          body.targetHost = body.target;
        }
      }
    }
    const rule = proxyService.addRule(body);
    const deployResult = await _autoDeploy();
    res.json({ success: true, message: '代理规则已添加' + (deployResult.success ? '并部署生效' : '，但部署失败'), data: { rule, deploy: deployResult } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// PUT /api/proxy/:id - 编辑规则
router.put('/:id', async (req, res) => {
  try {
    const rule = proxyService.updateRule(req.params.id, req.body);
    const deployResult = await _autoDeploy();
    res.json({ success: true, message: '代理规则已更新' + (deployResult.success ? '并部署生效' : '，但部署失败'), data: { rule, deploy: deployResult } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// DELETE /api/proxy/:id - 删除规则
router.delete('/:id', async (req, res) => {
  try {
    proxyService.deleteRule(req.params.id);
    const deployResult = await _autoDeploy();
    res.json({ success: true, message: '代理规则已删除' + (deployResult.success ? '并部署生效' : '') });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/proxy/:id/toggle - 启用/停用
router.post('/:id/toggle', async (req, res) => {
  try {
    const rule = proxyService.toggleRule(req.params.id);
    const deployResult = await _autoDeploy();
    res.json({ success: true, message: (rule.enabled ? '已启用' : '已停用') + (deployResult.success ? '并部署生效' : ''), data: { rule, deploy: deployResult } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/proxy/config/preview - 预览 Nginx 配置
router.get('/config/preview', (req, res) => {
  try {
    const config = proxyService.generateAllConfig();
    res.json({ success: true, data: { config } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// GET /api/proxy/config/preview/:id - 预览单条规则配置
router.get('/config/preview/:id', (req, res) => {
  try {
    const rule = proxyService.getRule(req.params.id);
    if (!rule) return res.json({ success: false, message: '规则不存在' });
    const config = proxyService.generateNginxConfig(rule);
    res.json({ success: true, data: { config } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/proxy/config/export - 导出配置到文件
router.post('/config/export', (req, res) => {
  try {
    const { filePath } = req.body;
    const dest = filePath || '/tmp/proxy-nginx.conf';
    const result = proxyService.exportToFile(dest);
    res.json({ success: true, message: `配置已导出到 ${result.path} (${result.rules} 条规则)`, data: result });
  } catch (err) {
    res.json({ success: false, message: '导出失败: ' + err.message });
  }
});

module.exports = router;