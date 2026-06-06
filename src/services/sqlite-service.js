// SQLite 统一数据库服务 - 替换所有 JSON 文件存储
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'panel.db');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class SqliteService {
  constructor() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this._createTables();
    this._migrateFromJsonIfNeeded();
  }

  // ==================== 表初始化 ====================

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ddns_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subdomain TEXT DEFAULT '@',
        record_type TEXT DEFAULT 'A',
        ttl INTEGER DEFAULT 600,
        line TEXT DEFAULT 'default',
        created_at TEXT,
        last_update TEXT,
        last_ip TEXT
      );

      CREATE TABLE IF NOT EXISTS proxy_rules (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        source_protocol TEXT DEFAULT 'http',
        source_host TEXT NOT NULL,
        source_port INTEGER DEFAULT 80,
        target_protocol TEXT DEFAULT 'http',
        target_host TEXT NOT NULL,
        target_port INTEGER DEFAULT 80,
        ssl INTEGER DEFAULT 0,
        ssl_cert TEXT,
        ssl_key TEXT,
        websocket INTEGER DEFAULT 0,
        custom_headers TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS ssl_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        alias TEXT,
        wildcard INTEGER DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT,
        interval_ms INTEGER DEFAULT 3600000,
        enabled INTEGER DEFAULT 1,
        type TEXT DEFAULT 'manual',
        last_run TEXT,
        last_result TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);
  }

  // ==================== 自动迁移 ====================

  _jsonFile(name) {
    return path.join(DATA_DIR, `${name}.json`);
  }

  _migrateFromJsonIfNeeded() {
    // 检查是否已有数据（任何表有数据就跳过迁移）
    const ddnsCount = this.db.prepare('SELECT COUNT(*) AS c FROM ddns_config').get().c;
    const proxyCount = this.db.prepare('SELECT COUNT(*) AS c FROM proxy_rules').get().c;
    const sslCount = this.db.prepare('SELECT COUNT(*) AS c FROM ssl_config').get().c;
    const sessionCount = this.db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
    const cronCount = this.db.prepare('SELECT COUNT(*) AS c FROM cron_jobs').get().c;

    if (ddnsCount + proxyCount + sslCount + sessionCount + cronCount > 0) {
      return; // 已有数据，跳过
    }

    // 检查是否有 JSON 文件存在
    const jsonFiles = ['ddns-config', 'proxy-config', 'ssl-config', 'sessions', 'cron-jobs'];
    const hasJson = jsonFiles.some(f => fs.existsSync(this._jsonFile(f)));

    if (hasJson) {
      console.log('[SQLite] 检测到 JSON 文件，开始自动迁移...');
      const result = this.migrateFromJson();
      if (result.errors.length > 0) {
        console.warn('[SQLite] 迁移警告:', result.errors.join('; '));
      }
    }
  }

  migrateFromJson() {
    const result = { migrated: [], skipped: [], errors: [] };
    const now = new Date().toISOString();

    const tryMigrate = (filename, fn) => {
      const fpath = this._jsonFile(filename);
      if (!fs.existsSync(fpath)) {
        result.skipped.push(`${filename}.json (文件不存在)`);
        return;
      }
      try {
        const data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
        fn(data);
        const bakPath = fpath + '.bak';
        fs.renameSync(fpath, bakPath);
        result.migrated.push(`${filename}.json`);
      } catch (e) {
        result.errors.push(`${filename}.json: ${e.message}`);
      }
    };

    // DDNS config
    tryMigrate('ddns-config', (data) => {
      const insert = this.db.prepare(
        'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const domains = data.domains || [];
      for (const d of domains) {
        insert.run(
          d.name || '', d.subdomain || '@', d.recordType || 'A', d.ttl || 600,
          d.line || 'default', d.createdAt || now, d.lastUpdate || null, d.lastIp || null
        );
      }
      // 保存 lastRefresh 到 settings
      if (data.lastRefresh) {
        this._setSetting('ddns_last_refresh', data.lastRefresh);
      }
      console.log(`[SQLite] 迁移 ddns-config: ${domains.length} 条`);
    });

    // Proxy rules
    tryMigrate('proxy-config', (data) => {
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
          target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const rules = data.rules || [];
      for (const r of rules) {
        insert.run(
          r.id || 'proxy-' + Date.now(), r.name || '', r.description || '',
          r.enabled ? 1 : 0, r.sourceProtocol || 'http', r.sourceHost || '',
          r.sourcePort || 80, r.targetProtocol || 'http', r.targetHost || '',
          r.targetPort || 80, r.ssl ? 1 : 0, r.sslCert || null, r.sslKey || null,
          r.websocket ? 1 : 0, JSON.stringify(r.customHeaders || []),
          r.createdAt || now, r.updatedAt || now
        );
      }
      console.log(`[SQLite] 迁移 proxy-config: ${rules.length} 条`);
    });

    // SSL config
    tryMigrate('ssl-config', (data) => {
      const insert = this.db.prepare(
        'INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)'
      );
      const domains = data.domains || [];
      for (const d of domains) {
        insert.run(d.domain || '', d.alias || d.domain, d.wildcard ? 1 : 0, d.createdAt || now);
      }
      console.log(`[SQLite] 迁移 ssl-config: ${domains.length} 条`);
    });

    // Sessions
    tryMigrate('sessions', (data) => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO sessions (token, username, created_at) VALUES (?, ?, ?)'
      );
      let count = 0;
      for (const [token, session] of Object.entries(data)) {
        const ts = typeof session.createdAt === 'number'
          ? new Date(session.createdAt).toISOString()
          : (session.createdAt || now);
        insert.run(token, session.username || 'admin', ts);
        count++;
      }
      console.log(`[SQLite] 迁移 sessions: ${count} 条`);
    });

    // Cron jobs
    tryMigrate('cron-jobs', (data) => {
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO cron_jobs (id, name, interval_ms, enabled, type, last_run, last_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const jobs = Array.isArray(data) ? data : [];
      for (const j of jobs) {
        insert.run(
          j.id || 'cron-' + Date.now(), j.name || '', j.interval || 3600000,
          j.enabled !== false ? 1 : 0, j.type || 'manual',
          j.lastRun || null, j.lastResult ? JSON.stringify(j.lastResult) : null,
          now
        );
      }
      console.log(`[SQLite] 迁移 cron-jobs: ${jobs.length} 条`);
    });

    // 保存迁移标记
    this._setSetting('migration_completed_at', now);
    console.log('[SQLite] JSON → SQLite 迁移完成');
    return result;
  }

  // ==================== 设置 (Settings) ====================

  _setSetting(key, value) {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    ).run(key, String(value), now);
  }

  _getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  // ==================== DDNS 配置 ====================

  /** 获取所有 DDNS 域名配置 */
  getDdnsDomains() {
    const rows = this.db.prepare('SELECT * FROM ddns_config ORDER BY id').all();
    return rows.map(r => ({
      name: r.name,
      subdomain: r.subdomain,
      recordType: r.record_type,
      ttl: r.ttl,
      line: r.line,
      createdAt: r.created_at,
      lastUpdate: r.last_update,
      lastIp: r.last_ip
    }));
  }

  /** 获取 DDNS lastRefresh */
  getDdnsLastRefresh() {
    return this._getSetting('ddns_last_refresh');
  }

  /** 设置 DDNS lastRefresh */
  setDdnsLastRefresh(timestamp) {
    this._setSetting('ddns_last_refresh', timestamp || new Date().toISOString());
  }

  /** 批量替换 DDNS 域名列表 */
  setDdnsDomains(domains) {
    const del = this.db.prepare('DELETE FROM ddns_config');
    const insert = this.db.prepare(
      'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const tx = this.db.transaction((list) => {
      del.run();
      const now = new Date().toISOString();
      for (const d of list) {
        insert.run(
          d.name || '', d.subdomain || '@', d.recordType || 'A', d.ttl || 600,
          d.line || 'default', d.createdAt || now, d.lastUpdate || null, d.lastIp || null
        );
      }
      this.setDdnsLastRefresh(now);
    });

    tx(domains || []);
  }

  /** 添加单个 DDNS 域名 */
  addDdnsDomain(domain) {
    const existing = this.db.prepare(
      'SELECT COUNT(*) AS c FROM ddns_config WHERE name = ? AND subdomain = ? AND record_type = ?'
    ).get(domain.name, domain.subdomain || '@', domain.recordType || 'A');
    
    if (existing.c > 0) throw new Error('该域名 + 记录类型组合已存在');

    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      domain.name, domain.subdomain || '@', domain.recordType || 'A',
      domain.ttl || 600, domain.line || 'default', now, null, null
    );
    return this.getDdnsDomains();
  }

  /** 删除 DDNS 域名 */
  removeDdnsDomain(name, subdomain, recordType) {
    let sql = 'DELETE FROM ddns_config WHERE name = ? AND subdomain = ?';
    const params = [name, subdomain || '@'];
    if (recordType) {
      sql += ' AND record_type = ?';
      params.push(recordType);
    }
    this.db.prepare(sql).run(...params);
  }

  // ==================== 代理规则 ====================

  _rowToProxyRule(r) {
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      enabled: r.enabled === 1,
      sourceProtocol: r.source_protocol || 'http',
      sourceHost: r.source_host || '',
      sourcePort: r.source_port || 80,
      targetProtocol: r.target_protocol || 'http',
      targetHost: r.target_host || '',
      targetPort: r.target_port || 80,
      ssl: r.ssl === 1,
      sslCert: r.ssl_cert || null,
      sslKey: r.ssl_key || null,
      websocket: r.websocket === 1,
      customHeaders: (() => { try { return JSON.parse(r.custom_headers || '[]'); } catch { return []; } })(),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  getProxyRules() {
    const rows = this.db.prepare('SELECT * FROM proxy_rules ORDER BY created_at').all();
    return rows.map(r => this._rowToProxyRule(r));
  }

  getProxyRule(id) {
    const row = this.db.prepare('SELECT * FROM proxy_rules WHERE id = ?').get(id);
    return row ? this._rowToProxyRule(row) : null;
  }

  addProxyRule(rule) {
    const id = rule.id || ('proxy-' + Math.random().toString(36).substring(2, 10));
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
        target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, rule.name || '', rule.description || '',
      rule.enabled !== false ? 1 : 0, rule.sourceProtocol || 'http', rule.sourceHost || '',
      rule.sourcePort || 80, rule.targetProtocol || 'http', rule.targetHost || '',
      rule.targetPort || 80, rule.ssl ? 1 : 0, rule.sslCert || null, rule.sslKey || null,
      rule.websocket ? 1 : 0, JSON.stringify(rule.customHeaders || []),
      now, now
    );
    return this.getProxyRule(id);
  }

  updateProxyRule(id, updates) {
    const row = this.db.prepare('SELECT * FROM proxy_rules WHERE id = ?').get(id);
    if (!row) throw new Error('规则不存在');

    const now = new Date().toISOString();
    const merged = { ...row };
    const fieldMap = {
      name: 'name', description: 'description', enabled: 'enabled',
      sourceProtocol: 'source_protocol', sourceHost: 'source_host', sourcePort: 'source_port',
      targetProtocol: 'target_protocol', targetHost: 'target_host', targetPort: 'target_port',
      ssl: 'ssl', sslCert: 'ssl_cert', sslKey: 'ssl_key', websocket: 'websocket',
      customHeaders: 'custom_headers'
    };

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (updates[jsKey] !== undefined) {
        merged[dbKey] = dbKey === 'custom_headers' ? JSON.stringify(updates[jsKey]) : updates[jsKey];
      }
    }
    merged.updated_at = now;

    this.db.prepare(
      `UPDATE proxy_rules SET name=?, description=?, enabled=?, source_protocol=?, source_host=?, source_port=?,
        target_protocol=?, target_host=?, target_port=?, ssl=?, ssl_cert=?, ssl_key=?, websocket=?,
        custom_headers=?, updated_at=? WHERE id=?`
    ).run(
      merged.name, merged.description, merged.enabled, merged.source_protocol, merged.source_host,
      merged.source_port, merged.target_protocol, merged.target_host, merged.target_port,
      merged.ssl, merged.ssl_cert, merged.ssl_key, merged.websocket,
      merged.custom_headers, now, id
    );
    return this.getProxyRule(id);
  }

  deleteProxyRule(id) {
    this.db.prepare('DELETE FROM proxy_rules WHERE id = ?').run(id);
  }

  getProxyRuleCount() {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM proxy_rules').get();
    return row.c;
  }

  // ==================== SSL 配置 ====================

  getSslDomains() {
    const rows = this.db.prepare('SELECT * FROM ssl_config ORDER BY id').all();
    return rows.map(r => ({
      domain: r.domain,
      alias: r.alias,
      wildcard: r.wildcard === 1,
      createdAt: r.created_at
    }));
  }

  addSslDomain(domain, opts = {}) {
    const existing = this.db.prepare('SELECT id FROM ssl_config WHERE domain = ?').get(domain);
    if (existing) return; // 已存在，跳过

    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)'
    ).run(domain, opts.alias || domain, opts.wildcard ? 1 : 0, now);
  }

  removeSslDomain(domain) {
    this.db.prepare('DELETE FROM ssl_config WHERE domain = ?').run(domain);
  }

  // ==================== 会话 (Sessions) ====================

  getSession(token) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    return row ? { username: row.username, createdAt: new Date(row.created_at).getTime() } : null;
  }

  getAllSessions() {
    const rows = this.db.prepare('SELECT * FROM sessions').all();
    const obj = {};
    for (const r of rows) {
      obj[r.token] = { username: r.username, createdAt: new Date(r.created_at).getTime() };
    }
    return obj;
  }

  createSession(token, username) {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT OR REPLACE INTO sessions (token, username, created_at) VALUES (?, ?, ?)'
    ).run(token, username, now);
  }

  deleteSession(token) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  deleteExpiredSessions(maxAgeMs) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    this.db.prepare('DELETE FROM sessions WHERE created_at < ?').run(cutoff);
  }

  // ==================== 定时任务 ====================

  getCronJobs() {
    const rows = this.db.prepare('SELECT * FROM cron_jobs ORDER BY created_at').all();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      interval: r.interval_ms,
      enabled: r.enabled === 1,
      type: r.type,
      lastRun: r.last_run,
      lastResult: (() => { try { return JSON.parse(r.last_result); } catch { return null; } })(),
      createdAt: r.created_at
    }));
  }

  addCronJob(job) {
    const id = job.id || ('cron-' + Date.now());
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR REPLACE INTO cron_jobs (id, name, interval_ms, enabled, type, last_run, last_result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, job.name || '', job.interval || 3600000,
      job.enabled !== false ? 1 : 0, job.type || 'manual',
      job.lastRun || null, job.lastResult ? JSON.stringify(job.lastResult) : null,
      now
    );
    return this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id);
  }

  updateCronJob(id, updates) {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id);
    if (!row) throw new Error('任务不存在');

    const name = updates.name !== undefined ? updates.name : row.name;
    const interval = updates.interval !== undefined ? updates.interval : row.interval_ms;
    const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : row.enabled;
    const type = updates.type !== undefined ? updates.type : row.type;
    const lastRun = updates.lastRun !== undefined ? updates.lastRun : row.last_run;
    const lastResult = updates.lastResult !== undefined ? JSON.stringify(updates.lastResult) : row.last_result;

    this.db.prepare(
      `UPDATE cron_jobs SET name=?, interval_ms=?, enabled=?, type=?, last_run=?, last_result=? WHERE id=?`
    ).run(name, interval, enabled, type, lastRun, lastResult, id);

    return this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id);
  }

  deleteCronJob(id) {
    this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
  }

  // ==================== 统计 ====================

  getProxyStats() {
    const rows = this.db.prepare('SELECT enabled, source_protocol, ssl, websocket FROM proxy_rules').all();
    return {
      total: rows.length,
      enabled: rows.filter(r => r.enabled === 1).length,
      disabled: rows.filter(r => r.enabled === 0).length,
      http: rows.filter(r => r.source_protocol === 'http').length,
      https: rows.filter(r => r.ssl === 1).length,
      websocket: rows.filter(r => r.websocket === 1).length
    };
  }

  // ==================== 导入/导出 ====================

  /** 导出所有数据为 JSON */
  exportAll() {
    const ddnsRows = this.db.prepare('SELECT * FROM ddns_config').all();
    const proxyRows = this.db.prepare('SELECT * FROM proxy_rules').all();
    const sslRows = this.db.prepare('SELECT * FROM ssl_config').all();
    const sessionRows = this.db.prepare('SELECT * FROM sessions').all();
    const cronRows = this.db.prepare('SELECT * FROM cron_jobs').all();
    const settingsRows = this.db.prepare('SELECT * FROM settings').all();

    return {
      exportedAt: new Date().toISOString(),
      ddnsDomains: ddnsRows,
      proxyRules: proxyRows.map(r => ({ ...r, custom_headers: JSON.parse(r.custom_headers || '[]') })),
      sslDomains: sslRows,
      sessions: sessionRows,
      cronJobs: cronRows.map(r => ({ ...r, last_result: r.last_result ? JSON.parse(r.last_result) : null })),
      settings: settingsRows
    };
  }

  /** 从 JSON 导入数据 */
  importAll(data) {
    if (!data) throw new Error('导入数据为空');
    const tx = this.db.transaction(() => {
      // DDNS
      if (data.ddnsDomains && Array.isArray(data.ddnsDomains)) {
        this.db.prepare('DELETE FROM ddns_config').run();
        const insert = this.db.prepare(
          'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const d of data.ddnsDomains) {
          insert.run(d.name, d.subdomain || '@', d.record_type || 'A', d.ttl || 600,
            d.line || 'default', d.created_at || new Date().toISOString(), d.last_update, d.last_ip);
        }
      }

      // Proxy
      if (data.proxyRules && Array.isArray(data.proxyRules)) {
        this.db.prepare('DELETE FROM proxy_rules').run();
        const insert = this.db.prepare(
          `INSERT INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
            target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of data.proxyRules) {
          const ch = typeof r.custom_headers === 'string' ? r.custom_headers : JSON.stringify(r.custom_headers || []);
          insert.run(r.id, r.name, r.description || '', r.enabled ?? 1,
            r.source_protocol || 'http', r.source_host, r.source_port || 80,
            r.target_protocol || 'http', r.target_host, r.target_port || 80,
            r.ssl ?? 0, r.ssl_cert, r.ssl_key, r.websocket ?? 0,
            ch, r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString());
        }
      }

      // SSL
      if (data.sslDomains && Array.isArray(data.sslDomains)) {
        this.db.prepare('DELETE FROM ssl_config').run();
        const insert = this.db.prepare(
          'INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)'
        );
        for (const d of data.sslDomains) {
          insert.run(d.domain, d.alias, d.wildcard ?? 0, d.created_at || new Date().toISOString());
        }
      }

      // Sessions
      if (data.sessions && Array.isArray(data.sessions)) {
        this.db.prepare('DELETE FROM sessions').run();
        const insert = this.db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)');
        for (const s of data.sessions) {
          insert.run(s.token, s.username, s.created_at || new Date().toISOString());
        }
      }

      // Cron
      if (data.cronJobs && Array.isArray(data.cronJobs)) {
        this.db.prepare('DELETE FROM cron_jobs').run();
        const insert = this.db.prepare(
          'INSERT INTO cron_jobs (id, name, interval_ms, enabled, type, last_run, last_result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const j of data.cronJobs) {
          const lr = j.last_result ? JSON.stringify(j.last_result) : null;
          insert.run(j.id, j.name, j.interval_ms || 3600000, j.enabled ?? 1,
            j.type || 'manual', j.last_run, lr, j.created_at || new Date().toISOString());
        }
      }

      // Settings
      if (data.settings && Array.isArray(data.settings)) {
        const upsert = this.db.prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        );
        for (const s of data.settings) {
          upsert.run(s.key, s.value, s.updated_at || new Date().toISOString());
        }
      }
    });

    tx();
  }

  // ==================== 工具方法 ====================

  /** 关闭数据库连接 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 单例
module.exports = new SqliteService();
