const express = require('express');
const router = express.Router();
const proxyService = require('../services/proxy-service');
const nginxService = require('../services/nginx-service');
const sslService = require('../services/ssl-service');
// 安全：脱敏错误消息中的文件路径
const _safeErr = (e) => (e.message || '').replace(/\b\/(?:[^\s,;:"'{}|\\]+\/?)+/g, '[PATH]');

// 推送通知（静默，失败不影响业务）
function _tryNotify(action, rule) {
  try { require('../services/notify-service').notifyProxyAction(action, rule).catch(() => {}); } catch (_) {}
}

// 防抖部署：500ms 内的多次操作合并为一次 deploy
let _deployTimer = null;
let _deployPending = false;

function _scheduleDeploy() {
  if (_deployPending) return; // 已有待执行部署
  if (!_deployTimer) {
    _deployTimer = setTimeout(async () => {
      _deployTimer = null;
      _deployPending = false;
      try {
        const config = proxyService.generateAllConfig();
        const result = await nginxService.deployProxyConfig(config);
        console.log('[Proxy] 防抖部署结果:', result.success ? '成功' : result.message);
      } catch (err) {
        console.warn('[Proxy] 防抖部署异常:', err.message);
      }
    }, 500);
    _deployPending = true;
  }
}

// GET /api/proxy - 代理规则列表
router.get('/', (req, res) => {
  try {
    const rules = proxyService.listRules();
    const stats = proxyService.getStats();
    res.json({ success: true, data: { rules, stats } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
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
    // 立即部署 Nginx 配置
    const deployResult = await nginxService.deployProxyConfig(proxyService.generateAllConfig()).catch(e => ({ success: false, message: e.message }));
    res.json({ success: true, message: deployResult.success ? '代理规则已添加并部署' : '规则已保存，但部署失败: ' + deployResult.message, data: { rule } });
    _tryNotify('create', { sourceHost: rule.sourceHost, targetHost: rule.targetHost, targetPort: rule.targetPort, ssl: rule.ssl });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// PUT /api/proxy/:id - 编辑规则
router.put('/:id', async (req, res) => {
  try {
    const rule = proxyService.updateRule(req.params.id, req.body);
    // 立即部署
    const deployResult = await nginxService.deployProxyConfig(proxyService.generateAllConfig()).catch(e => ({ success: false, message: e.message }));
    res.json({ success: true, message: deployResult.success ? '代理规则已更新并部署' : '规则已更新，但部署失败: ' + deployResult.message, data: { rule } });
    _tryNotify('update', { sourceHost: rule.sourceHost, targetHost: rule.targetHost, targetPort: rule.targetPort, ssl: rule.ssl });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// DELETE /api/proxy/:id - 删除规则
router.delete('/:id', async (req, res) => {
  try {
    const rule = proxyService.getRule(req.params.id);
    proxyService.deleteRule(req.params.id);
    // 立即部署
    const deployResult = await nginxService.deployProxyConfig(proxyService.generateAllConfig()).catch(e => ({ success: false, message: e.message }));
    res.json({ success: true, message: deployResult.success ? '代理规则已删除并部署' : '规则已删除，但部署失败: ' + deployResult.message });
    _tryNotify('delete', { sourceHost: req.params.id, targetHost: '' });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// POST /api/proxy/:id/toggle - 启用/停用
router.post('/:id/toggle', async (req, res) => {
  try {
    const rule = proxyService.toggleRule(req.params.id);
    // 立即部署
    const deployResult = await nginxService.deployProxyConfig(proxyService.generateAllConfig()).catch(e => ({ success: false, message: e.message }));
    res.json({ success: true, message: deployResult.success ? (rule.enabled ? '已启用并部署' : '已停用并部署') : '状态已切换，但部署失败: ' + deployResult.message, data: { rule } });
    _tryNotify('toggle', { sourceHost: rule.sourceHost, targetHost: rule.targetHost, targetPort: rule.targetPort, ssl: rule.ssl });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/proxy/config/preview - 预览 Nginx 配置
router.get('/config/preview', (req, res) => {
  try {
    const config = proxyService.generateAllConfig();
    res.json({ success: true, data: { config } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
  }
});

// GET /api/proxy/config/preview/:id - 预览单条规则配置
router.get('/config/preview/:id', (req, res) => {
  try {
    const rule = proxyService.getRule(req.params.id);
    if (!rule) return res.status(400).json({success: false, message: '规则不存在' });
    const config = proxyService.generateNginxConfig(rule);
    res.json({ success: true, data: { config } });
  } catch (err) {
    res.status(500).json({success: false, message: _safeErr(err) });
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
    res.status(500).json({success: false, message: '导出失败: ' + _safeErr(err) });
  }
});

// GET /api/proxy/cert-match?domain=example.com - 获取所有可用 SSL 证书（匹配的排在前面）
router.get('/cert-match', async (req, res) => {
  try {
    const { domain } = req.query;

    const certData = await sslService.listCertificates().catch(() => ({ certificates: [] }));
    const allCerts = certData.certificates || [];

    // 如果提供了 domain，标记匹配的证书（排在前面）
    let sorted = allCerts;
    if (domain) {
      const matchDomain = (certDomain, target) => {
        if (certDomain === target) return true;
        if (certDomain.startsWith('*.')) {
          const suffix = certDomain.slice(2);
          if (target.endsWith(suffix)) return true;
        }
        return false;
      };
      const matched = [], unmatched = [];
      allCerts.forEach(function(cert) {
        let isMatch = matchDomain(cert.domain, domain);
        if (!isMatch && cert.sanDomains && Array.isArray(cert.sanDomains)) {
          isMatch = cert.sanDomains.some(function(san) { return matchDomain(san, domain); });
        }
        (isMatch ? matched : unmatched).push(Object.assign({}, cert, { matched: isMatch }));
      });
      sorted = matched.concat(unmatched);
    } else {
      sorted = allCerts.map(function(c) { return Object.assign({}, c, { matched: false }); });
    }

    res.json({ success: true, data: { certificates: sorted, total: sorted.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: { certificates: [] } });
  }
});

module.exports = router;
