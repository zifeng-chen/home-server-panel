// 反向代理服务 - 群晖风格 Reverse Proxy
const fs = require('fs');
const path = require('path');

const sqliteService = require('./sqlite-service');

class ProxyService {
  constructor() {
    // SQLite is the source of truth
  }

  // ========== 规则 CRUD ==========

  listRules() {
    return sqliteService.getProxyRules();
  }

  getRule(id) {
    return sqliteService.getProxyRule(id);
  }

  addRule(rule) {
    if (!rule.sourceHost || !rule.targetHost) {
      throw new Error('来源域名和目标地址不能为空');
    }

    const newRule = {
      id: this._generateId(),
      name: rule.name || `${rule.sourceHost} → ${rule.targetHost}`,
      description: rule.description || '',
      enabled: rule.enabled !== false,
      sourceProtocol: rule.sourceProtocol || 'http',
      sourceHost: rule.sourceHost,
      sourcePort: parseInt(rule.sourcePort) || 80,
      targetProtocol: rule.targetProtocol || 'http',
      targetHost: rule.targetHost,
      targetPort: parseInt(rule.targetPort) || 80,
      ssl: rule.ssl || false,
      sslCert: rule.sslCert || null,
      sslKey: rule.sslKey || null,
      websocket: rule.websocket || false,
      customHeaders: rule.customHeaders || []
    };

    return sqliteService.addProxyRule(newRule);
  }

  updateRule(id, updates) {
    return sqliteService.updateProxyRule(id, updates);
  }

  deleteRule(id) {
    sqliteService.deleteProxyRule(id);
  }

  toggleRule(id) {
    const rule = this.getRule(id);
    if (!rule) throw new Error('规则不存在');
    return this.updateRule(id, { enabled: !rule.enabled });
  }

  // ========== Nginx 配置生成 ==========

  generateNginxConfig(rule) {
    const lines = [];
    const serverName = rule.sourceHost;
    const listen = rule.sourcePort;
    const ssl = rule.ssl;

    lines.push(`# ${rule.name}`);
    lines.push(`# 由 Server Panel 自动生成 - ${new Date().toISOString()}`);
    lines.push(`# 规则ID: ${rule.id}`);

    lines.push('server {');
    
    if (ssl) {
      lines.push(`    listen ${listen} ssl;`);
      lines.push(`    listen [::]:${listen} ssl;`);
      if (rule.sslCert) lines.push(`    ssl_certificate     ${rule.sslCert};`);
      if (rule.sslKey) lines.push(`    ssl_certificate_key ${rule.sslKey};`);
    } else {
      lines.push(`    listen ${listen};`);
      lines.push(`    listen [::]:${listen};`);
    }

    lines.push(`    server_name ${serverName};`);

    // WebSocket 支持
    if (rule.websocket) {
      lines.push('');
      lines.push('    # WebSocket 升级头');
      lines.push('    proxy_set_header Upgrade $http_upgrade;');
      lines.push('    proxy_set_header Connection "upgrade";');
    }

    // 自定义 Headers
    if (rule.customHeaders && rule.customHeaders.length > 0) {
      lines.push('');
      lines.push('    # 自定义 Headers');
      for (const h of rule.customHeaders) {
        if (h.name && h.value) {
          lines.push(`    proxy_set_header ${h.name} ${h.value};`);
        }
      }
    }

    lines.push('');
    lines.push('    # 标准代理头');
    lines.push('    proxy_set_header Host $host;');
    lines.push('    proxy_set_header X-Real-IP $remote_addr;');
    lines.push('    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    lines.push('    proxy_set_header X-Forwarded-Proto $scheme;');
    lines.push('');
    lines.push(`    location / {`);
    lines.push(`        proxy_pass ${rule.targetProtocol}://${rule.targetHost}:${rule.targetPort};`);
    lines.push('        proxy_read_timeout 120s;');
    lines.push('        proxy_connect_timeout 10s;');
    lines.push('        proxy_buffering off;');

    if (rule.ssl && rule.targetProtocol === 'http') {
      lines.push('        # 后端是 HTTP 时重定向到 HTTPS');
      lines.push('        proxy_redirect http:// $scheme://;');
    }

    lines.push('    }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  generateAllConfig() {
    const rules = this.listRules();
    const enabled = rules.filter(r => r.enabled);
    
    const parts = [
      '# ============================================',
      '# 反向代理配置 - 由 Server Panel 自动生成',
      `# 生成时间: ${new Date().toISOString()}`,
      `# 总规则数: ${rules.length} (启用: ${enabled.length})`,
      '# ============================================',
      ''
    ];

    for (const rule of enabled) {
      parts.push(this.generateNginxConfig(rule));
    }

    return parts.join('\n');
  }

  // ========== 导出配置到文件 ==========

  exportToFile(filePath) {
    // 安全检查：仅允许写入项目目录或 /tmp
    const safeDirs = [
      path.resolve(__dirname, '..', '..'),
      '/tmp',
      '/var/tmp',
      '/opt/home-server-panel'
    ];
    const resolved = path.resolve(filePath);
    const allowed = safeDirs.some(dir => resolved.startsWith(path.resolve(dir)));
    if (!allowed) {
      throw new Error('安全限制：仅允许写入项目目录或 /tmp，请使用默认路径');
    }
    const config = this.generateAllConfig();
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, config, 'utf-8');
    return { path: resolved, size: config.length, rules: this.listRules().filter(r => r.enabled).length };
  }

  // ========== 统计 ==========

  getStats() {
    return sqliteService.getProxyStats();
  }

  // ========== 内部 ==========

  _generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'proxy-';
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

}

module.exports = new ProxyService();