const express = require('express');
const router = express.Router();
const proxyService = require('../services/proxy-service');
const nginxService = require('../services/nginx-service');
const sslService = require('../services/ssl-service');

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
    res.status(500).json({success: false, message: err.message });
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
    // 部署已排入防抖队列，500ms内批量操作仅重载一次
    _scheduleDeploy();
    res.json({ success: true, message: '代理规则已添加（部署已排入队列）', data: { rule } });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// PUT /api/proxy/:id - 编辑规则
router.put('/:id', async (req, res) => {
  try {
    const rule = proxyService.updateRule(req.params.id, req.body);
    // 部署已排入防抖队列，500ms内批量操作仅重载一次
    _scheduleDeploy();
    res.json({ success: true, message: '代理规则已更新（部署已排入队列）', data: { rule } });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// DELETE /api/proxy/:id - 删除规则
router.delete('/:id', async (req, res) => {
  try {
    proxyService.deleteRule(req.params.id);
    // 部署已排入防抖队列，500ms内批量操作仅重载一次
    _scheduleDeploy();
    res.json({ success: true, message: '代理规则已删除（部署已排入队列）' });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// POST /api/proxy/:id/toggle - 启用/停用
router.post('/:id/toggle', async (req, res) => {
  try {
    const rule = proxyService.toggleRule(req.params.id);
    // 部署已排入防抖队列，500ms内批量操作仅重载一次
    _scheduleDeploy();
    res.json({ success: true, message: (rule.enabled ? '已启用' : '已停用') + '（部署已排入队列）', data: { rule } });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
  }
});

// GET /api/proxy/config/preview - 预览 Nginx 配置
router.get('/config/preview', (req, res) => {
  try {
    const config = proxyService.generateAllConfig();
    res.json({ success: true, data: { config } });
  } catch (err) {
    res.status(500).json({success: false, message: err.message });
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
    res.status(500).json({success: false, message: err.message });
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
    res.status(500).json({success: false, message: '导出失败: ' + err.message });
  }
});

// GET /api/proxy/cert-match?domain=example.com - 获取匹配的 SSL 证书
router.get('/cert-match', async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ success: false, message: '请提供域名' });

    const certData = await sslService.listCertificates().catch(() => ({ certificates: [] }));
    const allCerts = certData.certificates || [];

    // 域名匹配逻辑：证书的 domain 或 sanDomains 包含目标域名
    const matchDomain = (certDomain, target) => {
      if (certDomain === target) return true;
      // 通配符匹配 *.example.com 匹配 sub.example.com
      if (certDomain.startsWith('*.')) {
        const suffix = certDomain.slice(2);
        if (target.endsWith(suffix)) return true;
      }
      return false;
    };

    const matched = allCerts.filter(cert => {
      // 主域名匹配
      if (matchDomain(cert.domain, domain)) return true;
      // SAN 域名匹配
      if (cert.sanDomains && Array.isArray(cert.sanDomains)) {
        return cert.sanDomains.some(san => matchDomain(san, domain));
      }
      return false;
    });

    // 同时查找 acme.sh 证书的实际文件路径
    const { exec } = require('child_process');
    const findCerts = async (cert) => {
      // 从 acme.sh 目录查找证书文件
      const acmeHome = process.env.LE_WORKING_DIR || require('os').homedir() + '/.acme.sh';
      const domainDir = cert.domain.replace(/^\*+\./g, '');
      const dirs = [
        `${acmeHome}/${domainDir}_ecc`,
        `${acmeHome}/${domainDir}`,
        `/home/${require('os').userInfo().username}/.acme.sh/${domainDir}_ecc`,
        `/home/${require('os').userInfo().username}/.acme.sh/${domainDir}`,
        `/root/.acme.sh/${domainDir}_ecc`,
        `/root/.acme.sh/${domainDir}`
      ];
      const fs = require('fs');
      for (const dir of dirs) {
        const fullchain = `${dir}/fullchain.cer`;
        const privkey = `${dir}/${domainDir}.key`;
        if (fs.existsSync(fullchain) && fs.existsSync(privkey)) {
          return { cert: fullchain, key: privkey };
        }
      }
      return null;
    };

    const results = await Promise.all(matched.map(async cert => {
      const paths = await findCerts(cert).catch(() => null);
      return {
        domain: cert.domain,
        sanDomains: cert.sanDomains,
        issuer: cert.issuer,
        expiresAt: cert.expiresAt,
        daysRemaining: cert.daysRemaining,
        status: cert.status,
        certPath: paths?.cert || null,
        keyPath: paths?.key || null
      };
    }));

    res.json({ success: true, data: { domain, matched: results, total: allCerts.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;