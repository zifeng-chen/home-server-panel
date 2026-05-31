// 反向代理服务 - 群晖风格 Reverse Proxy
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'proxy-config.json');

class ProxyService {
  constructor() {
    this.config = this._loadConfig();
  }

  // ========== 规则 CRUD ==========

  listRules() {
    return this.config.rules || [];
  }

  getRule(id) {
    return (this.config.rules || []).find(r => r.id === id);
  }

  addRule(rule) {
    if (!rule.sourceHost || !rule.targetHost) {
      throw new Error('来源域名和目标地址不能为空');
    }

    if (!this.config.rules) this.config.rules = [];

    const newRule = {
      id: this._generateId(),
      name: rule.name || `${rule.sourceHost} → ${rule.targetHost}`,
      description: rule.description || '',
      enabled: rule.enabled !== false,
      // 来源
      sourceProtocol: rule.sourceProtocol || 'http',
      sourceHost: rule.sourceHost,
      sourcePort: parseInt(rule.sourcePort) || 80,
      // 目标
      targetProtocol: rule.targetProtocol || 'http',
      targetHost: rule.targetHost,
      targetPort: parseInt(rule.targetPort) || 80,
      // 高级
      ssl: rule.ssl || false,
      sslCert: rule.sslCert || null,
      sslKey: rule.sslKey || null,
      websocket: rule.websocket || false,
      customHeaders: rule.customHeaders || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.config.rules.push(newRule);
    this._saveConfig();
    return newRule;
  }

  updateRule(id, updates) {
    const idx = (this.config.rules || []).findIndex(r => r.id === id);
    if (idx === -1) throw new Error('规则不存在');

    const rule = this.config.rules[idx];
    const allowed = [
      'name', 'description', 'enabled',
      'sourceProtocol', 'sourceHost', 'sourcePort',
      'targetProtocol', 'targetHost', 'targetPort',
      'ssl', 'sslCert', 'sslKey', 'websocket', 'customHeaders'
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) rule[key] = updates[key];
    }
    rule.updatedAt = new Date().toISOString();

    this.config.rules[idx] = rule;
    this._saveConfig();
    return rule;
  }

  deleteRule(id) {
    this.config.rules = (this.config.rules || []).filter(r => r.id !== id);
    this._saveConfig();
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
    const rules = this.config.rules || [];
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
    const config = this.generateAllConfig();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, config, 'utf-8');
    return { path: filePath, size: config.length, rules: (this.config.rules || []).filter(r => r.enabled).length };
  }

  // ========== 统计 ==========

  getStats() {
    const rules = this.config.rules || [];
    return {
      total: rules.length,
      enabled: rules.filter(r => r.enabled).length,
      disabled: rules.filter(r => !r.enabled).length,
      http: rules.filter(r => r.sourceProtocol === 'http').length,
      https: rules.filter(r => r.ssl).length,
      websocket: rules.filter(r => r.websocket).length
    };
  }

  // ========== 内部 ==========

  _generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'proxy-';
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[Proxy] 配置文件读取失败:', err.message);
    }
    return { rules: [] };
  }

  _saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Proxy] 配置文件保存失败:', err.message);
    }
  }
}

module.exports = new ProxyService();