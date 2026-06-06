// SQLite 统一数据库服务 - 替换所有 JSON 文件存储
// 使用 sql.js (WASM) 而非 better-sqlite3，避免原生编译依赖

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'panel.db');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class SqliteService {
  constructor() {
    this._db = null;
    this._ready = false;
    this._initPromise = null;
  }

  /** 初始化数据库（异步，必须在服务启动前调用） */
  async init() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();

      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        this._db = new SQL.Database(buffer);
        this._ready = true;
        this._db.run('PRAGMA foreign_keys = ON');
      } else {
        this._db = new SQL.Database();
        this._ready = true;
        this._db.run('PRAGMA foreign_keys = ON');
        this._createTables();
        this._migrateFromJsonIfNeeded();
      }
      this._initPromise = null;
      console.log('[SQLite] 数据库初始化完成');
    })();

    return this._initPromise;
  }

  _ensureReady() {
    if (!this._ready || !this._db) throw new Error('SQLite 未初始化，请先调用 init()');
  }

  _save() {
    if (this._db) {
      const data = this._db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }

  // --- 查询辅助 ---

  _run(sql, params = []) {
    this._ensureReady();
    this._db.run(sql, params);
    this._save();
  }

  _runMulti(sqls) {
    this._ensureReady();
    for (const s of sqls) {
      if (typeof s === 'string') this._db.run(s);
      else this._db.run(s.sql, s.params || []);
    }
    this._save();
  }

  _get(sql, params = []) {
    this._ensureReady();
    const results = this._db.exec(sql, params);
    if (!results.length || !results[0].values.length) return null;
    const cols = results[0].columns;
    const vals = results[0].values[0];
    const obj = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return obj;
  }

  _all(sql, params = []) {
    this._ensureReady();
    const results = this._db.exec(sql, params);
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  }

  _getScalar(sql, params = []) {
    this._ensureReady();
    const results = this._db.exec(sql, params);
    if (!results.length || !results[0].values.length) return null;
    return results[0].values[0][0];
  }

  // ==================== 表初始化 ====================

  _createTables() {
    this._db.run(`
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
      )
    `);
    this._db.run(`
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
      )
    `);
    this._db.run(`
      CREATE TABLE IF NOT EXISTS ssl_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        alias TEXT,
        wildcard INTEGER DEFAULT 0,
        created_at TEXT
      )
    `);
    this._db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT,
        created_at TEXT
      )
    `);
    this._db.run(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT,
        interval_ms INTEGER DEFAULT 3600000,
        enabled INTEGER DEFAULT 1,
        "type" TEXT DEFAULT 'manual',
        last_run TEXT,
        last_result TEXT,
        created_at TEXT
      )
    `);
    this._db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      )
    `);
    this._save();
  }

  // ==================== 自动迁移 ====================

  _jsonFile(name) {
    return path.join(DATA_DIR, `${name}.json`);
  }

  _migrateFromJsonIfNeeded() {
    const ddnsCount = this._getScalar('SELECT COUNT(*) AS c FROM ddns_config');
    const proxyCount = this._getScalar('SELECT COUNT(*) AS c FROM proxy_rules');
    const sslCount = this._getScalar('SELECT COUNT(*) AS c FROM ssl_config');
    const sessionCount = this._getScalar('SELECT COUNT(*) AS c FROM sessions');
    const cronCount = this._getScalar('SELECT COUNT(*) AS c FROM cron_jobs');

    if ((ddnsCount || 0) + (proxyCount || 0) + (sslCount || 0) + (sessionCount || 0) + (cronCount || 0) > 0) {
      return;
    }

    const jsonFiles = ['ddns-config', 'proxy-config', 'ssl-config', 'sessions', 'cron-jobs'];
    const hasJson = jsonFiles.some(f => fs.existsSync(this._jsonFile(f)));
    if (!hasJson) return;

    console.log('[SQLite] 检测到 JSON 文件，开始自动迁移...');
    const result = this.migrateFromJson();
    if (result.errors.length > 0) {
      console.warn('[SQLite] 迁移警告:', result.errors.join('; '));
    }
  }

  migrateFromJson() {
    this._ensureReady();
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
        fs.renameSync(fpath, fpath + '.bak');
        result.migrated.push(`${filename}.json`);
      } catch (e) {
        result.errors.push(`${filename}.json: ${e.message}`);
      }
    };

    // DDNS config
    tryMigrate('ddns-config', (data) => {
      const domains = data.domains || [];
      for (const d of domains) {
        this._run(
          'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [d.name || '', d.subdomain || '@', d.recordType || 'A', d.ttl || 600, d.line || 'default', d.createdAt || now, d.lastUpdate || null, d.lastIp || null]
        );
      }
      if (data.lastRefresh) this._setSetting('ddns_last_refresh', data.lastRefresh);
    });

    // Proxy rules
    tryMigrate('proxy-config', (data) => {
      const rules = data.rules || [];
      for (const r of rules) {
        this._run(
          `INSERT OR REPLACE INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
            target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.id || 'proxy-' + Date.now(), r.name || '', r.description || '',
            r.enabled ? 1 : 0, r.sourceProtocol || 'http', r.sourceHost || '',
            r.sourcePort || 80, r.targetProtocol || 'http', r.targetHost || '',
            r.targetPort || 80, r.ssl ? 1 : 0, r.sslCert || null, r.sslKey || null,
            r.websocket ? 1 : 0, JSON.stringify(r.customHeaders || []),
            r.createdAt || now, r.updatedAt || now]
        );
      }
    });

    // SSL config
    tryMigrate('ssl-config', (data) => {
      const domains = data.domains || [];
      for (const d of domains) {
        this._run('INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)',
          [d.domain || '', d.alias || d.domain, d.wildcard ? 1 : 0, d.createdAt || now]);
      }
    });

    // Sessions
    tryMigrate('sessions', (data) => {
      for (const [token, session] of Object.entries(data)) {
        const ts = typeof session.createdAt === 'number'
          ? new Date(session.createdAt).toISOString()
          : (session.createdAt || now);
        this._run('INSERT OR REPLACE INTO sessions (token, username, created_at) VALUES (?, ?, ?)',
          [token, session.username || 'admin', ts]);
      }
    });

    // Cron jobs
    tryMigrate('cron-jobs', (data) => {
      const jobs = Array.isArray(data) ? data : [];
      for (const j of jobs) {
        this._run(
          `INSERT OR REPLACE INTO cron_jobs (id, name, interval_ms, enabled, "type", last_run, last_result, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [j.id || 'cron-' + Date.now(), j.name || '', j.interval || 3600000,
            j.enabled !== false ? 1 : 0, j.type || 'manual',
            j.lastRun || null, j.lastResult ? JSON.stringify(j.lastResult) : null, now]
        );
      }
    });

    this._setSetting('migration_completed_at', now);
    this._save();
    console.log('[SQLite] JSON → SQLite 迁移完成');
    return result;
  }

  // ==================== 设置 ====================

  _setSetting(key, value) {
    const now = new Date().toISOString();
    this._run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, String(value), now]
    );
  }

  _getSetting(key) {
    const row = this._get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  // ==================== DDNS 配置 ====================

  getDdnsDomains() {
    const rows = this._all('SELECT * FROM ddns_config ORDER BY id');
    return rows.map(r => ({
      name: r.name, subdomain: r.subdomain, recordType: r.record_type,
      ttl: r.ttl, line: r.line, createdAt: r.created_at,
      lastUpdate: r.last_update, lastIp: r.last_ip
    }));
  }

  getDdnsLastRefresh() { return this._getSetting('ddns_last_refresh'); }

  setDdnsLastRefresh(timestamp) {
    this._setSetting('ddns_last_refresh', timestamp || new Date().toISOString());
  }

  setDdnsDomains(domains) {
    const now = new Date().toISOString();
    this._run('DELETE FROM ddns_config');
    for (const d of (domains || [])) {
      this._run(
        'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [d.name || '', d.subdomain || '@', d.recordType || 'A', d.ttl || 600, d.line || 'default', d.createdAt || now, d.lastUpdate || null, d.lastIp || null]
      );
    }
    this.setDdnsLastRefresh(now);
  }

  addDdnsDomain(domain) {
    const c = this._getScalar('SELECT COUNT(*) AS c FROM ddns_config WHERE name = ? AND subdomain = ? AND record_type = ?',
      [domain.name, domain.subdomain || '@', domain.recordType || 'A']);
    if (c > 0) throw new Error('该域名 + 记录类型组合已存在');

    this._run(
      'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [domain.name, domain.subdomain || '@', domain.recordType || 'A', domain.ttl || 600, domain.line || 'default', new Date().toISOString(), null, null]
    );
    return this.getDdnsDomains();
  }

  removeDdnsDomain(name, subdomain, recordType) {
    this._run('DELETE FROM ddns_config WHERE name = ? AND subdomain = ?',
      [name, subdomain || '@']);
    // SQLite doesn't support conditional WHERE so just delete by name+subdomain
  }

  // ==================== 代理规则 ====================

  _rowToProxyRule(r) {
    let customHeaders = [];
    try { customHeaders = JSON.parse(r.custom_headers || '[]'); } catch {}
    return {
      id: r.id, name: r.name, description: r.description || '',
      enabled: r.enabled === 1, sourceProtocol: r.source_protocol || 'http',
      sourceHost: r.source_host || '', sourcePort: r.source_port || 80,
      targetProtocol: r.target_protocol || 'http', targetHost: r.target_host || '',
      targetPort: r.target_port || 80, ssl: r.ssl === 1,
      sslCert: r.ssl_cert || null, sslKey: r.ssl_key || null,
      websocket: r.websocket === 1, customHeaders,
      createdAt: r.created_at, updatedAt: r.updated_at
    };
  }

  getProxyRules() {
    return this._all('SELECT * FROM proxy_rules ORDER BY created_at').map(r => this._rowToProxyRule(r));
  }

  getProxyRule(id) {
    const row = this._get('SELECT * FROM proxy_rules WHERE id = ?', [id]);
    return row ? this._rowToProxyRule(row) : null;
  }

  addProxyRule(rule) {
    const id = rule.id || ('proxy-' + Math.random().toString(36).substring(2, 10));
    const now = new Date().toISOString();
    this._run(
      `INSERT INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
        target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, rule.name || '', rule.description || '', rule.enabled !== false ? 1 : 0,
        rule.sourceProtocol || 'http', rule.sourceHost || '', rule.sourcePort || 80,
        rule.targetProtocol || 'http', rule.targetHost || '', rule.targetPort || 80,
        rule.ssl ? 1 : 0, rule.sslCert || null, rule.sslKey || null,
        rule.websocket ? 1 : 0, JSON.stringify(rule.customHeaders || []), now, now]
    );
    return this.getProxyRule(id);
  }

  updateProxyRule(id, updates) {
    const row = this._get('SELECT * FROM proxy_rules WHERE id = ?', [id]);
    if (!row) throw new Error('规则不存在');

    const now = new Date().toISOString();
    const name = updates.name !== undefined ? updates.name : row.name;
    const desc = updates.description !== undefined ? updates.description : row.description;
    const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : row.enabled;
    const sp = updates.sourceProtocol !== undefined ? updates.sourceProtocol : row.source_protocol;
    const sh = updates.sourceHost !== undefined ? updates.sourceHost : row.source_host;
    const sPort = updates.sourcePort !== undefined ? updates.sourcePort : row.source_port;
    const tp = updates.targetProtocol !== undefined ? updates.targetProtocol : row.target_protocol;
    const th = updates.targetHost !== undefined ? updates.targetHost : row.target_host;
    const tPort = updates.targetPort !== undefined ? updates.targetPort : row.target_port;
    const ssl = updates.ssl !== undefined ? (updates.ssl ? 1 : 0) : row.ssl;
    const sslCert = updates.sslCert !== undefined ? updates.sslCert : row.ssl_cert;
    const sslKey = updates.sslKey !== undefined ? updates.sslKey : row.ssl_key;
    const ws = updates.websocket !== undefined ? (updates.websocket ? 1 : 0) : row.websocket;
    const ch = updates.customHeaders !== undefined ? JSON.stringify(updates.customHeaders) : row.custom_headers;

    this._run(
      `UPDATE proxy_rules SET name=?, description=?, enabled=?, source_protocol=?, source_host=?, source_port=?,
        target_protocol=?, target_host=?, target_port=?, ssl=?, ssl_cert=?, ssl_key=?, websocket=?,
        custom_headers=?, updated_at=? WHERE id=?`,
      [name, desc, enabled, sp, sh, sPort, tp, th, tPort, ssl, sslCert, sslKey, ws, ch, now, id]
    );
    return this.getProxyRule(id);
  }

  deleteProxyRule(id) { this._run('DELETE FROM proxy_rules WHERE id = ?', [id]); }

  // ==================== SSL 配置 ====================

  getSslDomains() {
    return this._all('SELECT * FROM ssl_config ORDER BY id').map(r => ({
      domain: r.domain, alias: r.alias, wildcard: r.wildcard === 1, createdAt: r.created_at
    }));
  }

  addSslDomain(domain, opts = {}) {
    const existing = this._get('SELECT id FROM ssl_config WHERE domain = ?', [domain]);
    if (existing) return;
    this._run('INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)',
      [domain, opts.alias || domain, opts.wildcard ? 1 : 0, new Date().toISOString()]);
  }

  removeSslDomain(domain) { this._run('DELETE FROM ssl_config WHERE domain = ?', [domain]); }

  // ==================== 会话 ====================

  getSession(token) {
    const row = this._get('SELECT * FROM sessions WHERE token = ?', [token]);
    return row ? { username: row.username, createdAt: new Date(row.created_at).getTime() } : null;
  }

  getAllSessions() {
    const rows = this._all('SELECT * FROM sessions');
    const obj = {};
    for (const r of rows) {
      obj[r.token] = { username: r.username, createdAt: new Date(r.created_at).getTime() };
    }
    return obj;
  }

  createSession(token, username) {
    this._run('INSERT OR REPLACE INTO sessions (token, username, created_at) VALUES (?, ?, ?)',
      [token, username, new Date().toISOString()]);
  }

  deleteSession(token) { this._run('DELETE FROM sessions WHERE token = ?', [token]); }

  deleteExpiredSessions(maxAgeMs) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    this._run('DELETE FROM sessions WHERE created_at < ?', [cutoff]);
  }

  // ==================== 定时任务 ====================

  getCronJobs() {
    return this._all('SELECT * FROM cron_jobs ORDER BY created_at').map(r => {
      let lastResult = null;
      try { lastResult = JSON.parse(r.last_result); } catch {}
      return {
        id: r.id, name: r.name, interval: r.interval_ms,
        enabled: r.enabled === 1, type: r.type,
        lastRun: r.last_run, lastResult, createdAt: r.created_at
      };
    });
  }

  addCronJob(job) {
    const id = job.id || ('cron-' + Date.now());
    const now = new Date().toISOString();
    this._run(
      `INSERT OR REPLACE INTO cron_jobs (id, name, interval_ms, enabled, "type", last_run, last_result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, job.name || '', job.interval || 3600000, job.enabled !== false ? 1 : 0,
        job.type || 'manual', job.lastRun || null,
        job.lastResult ? JSON.stringify(job.lastResult) : null, now]
    );
    return this._get('SELECT * FROM cron_jobs WHERE id = ?', [id]);
  }

  updateCronJob(id, updates) {
    const row = this._get('SELECT * FROM cron_jobs WHERE id = ?', [id]);
    if (!row) throw new Error('任务不存在');

    this._run(
      `UPDATE cron_jobs SET name=?, interval_ms=?, enabled=?, "type"=?, last_run=?, last_result=? WHERE id=?`,
      [
        updates.name !== undefined ? updates.name : row.name,
        updates.interval !== undefined ? updates.interval : row.interval_ms,
        updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : row.enabled,
        updates.type !== undefined ? updates.type : row.type,
        updates.lastRun !== undefined ? updates.lastRun : row.last_run,
        updates.lastResult !== undefined ? JSON.stringify(updates.lastResult) : row.last_result,
        id
      ]
    );
    return this._get('SELECT * FROM cron_jobs WHERE id = ?', [id]);
  }

  deleteCronJob(id) { this._run('DELETE FROM cron_jobs WHERE id = ?', [id]); }

  setCronJobs(jobs) {
    this._run('DELETE FROM cron_jobs');
    const now = new Date().toISOString();
    for (const j of (jobs || [])) {
      this._run(
        `INSERT INTO cron_jobs (id, name, interval_ms, enabled, "type", last_run, last_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [j.id, j.name || '', j.interval || 3600000, j.enabled !== false ? 1 : 0,
          j.type || 'manual', j.lastRun || null,
          j.lastResult ? JSON.stringify(j.lastResult) : null, j.createdAt || now]
      );
    }
  }

  // ==================== 统计 ====================

  getProxyStats() {
    const rows = this._all('SELECT enabled, source_protocol, ssl, websocket FROM proxy_rules');
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

  exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      ddnsDomains: this._all('SELECT * FROM ddns_config'),
      proxyRules: this._all('SELECT * FROM proxy_rules').map(r => {
        let ch = [];
        try { ch = JSON.parse(r.custom_headers || '[]'); } catch {}
        return { ...r, custom_headers: ch };
      }),
      sslDomains: this._all('SELECT * FROM ssl_config'),
      sessions: this._all('SELECT * FROM sessions'),
      cronJobs: this._all('SELECT * FROM cron_jobs').map(r => {
        let lr = null;
        try { lr = JSON.parse(r.last_result); } catch {}
        return { ...r, last_result: lr };
      }),
      settings: this._all('SELECT * FROM settings')
    };
  }

  importAll(data) {
    if (!data) throw new Error('导入数据为空');

    const actions = [];

    if (data.ddnsDomains && Array.isArray(data.ddnsDomains)) {
      actions.push({ sql: 'DELETE FROM ddns_config' });
      for (const d of data.ddnsDomains) {
        actions.push({
          sql: 'INSERT INTO ddns_config (name, subdomain, record_type, ttl, line, created_at, last_update, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [d.name, d.subdomain || '@', d.record_type || 'A', d.ttl || 600, d.line || 'default', d.created_at || new Date().toISOString(), d.last_update, d.last_ip]
        });
      }
    }

    if (data.proxyRules && Array.isArray(data.proxyRules)) {
      actions.push({ sql: 'DELETE FROM proxy_rules' });
      for (const r of data.proxyRules) {
        const ch = typeof r.custom_headers === 'string' ? r.custom_headers : JSON.stringify(r.custom_headers || []);
        actions.push({
          sql: `INSERT INTO proxy_rules (id, name, description, enabled, source_protocol, source_host, source_port,
            target_protocol, target_host, target_port, ssl, ssl_cert, ssl_key, websocket, custom_headers, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [r.id, r.name, r.description || '', r.enabled ?? 1, r.source_protocol || 'http', r.source_host,
            r.source_port || 80, r.target_protocol || 'http', r.target_host, r.target_port || 80,
            r.ssl ?? 0, r.ssl_cert, r.ssl_key, r.websocket ?? 0, ch,
            r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString()]
        });
      }
    }

    if (data.sslDomains && Array.isArray(data.sslDomains)) {
      actions.push({ sql: 'DELETE FROM ssl_config' });
      for (const d of data.sslDomains) {
        actions.push({ sql: 'INSERT INTO ssl_config (domain, alias, wildcard, created_at) VALUES (?, ?, ?, ?)',
          params: [d.domain, d.alias, d.wildcard ?? 0, d.created_at || new Date().toISOString()] });
      }
    }

    if (data.sessions && Array.isArray(data.sessions)) {
      actions.push({ sql: 'DELETE FROM sessions' });
      for (const s of data.sessions) {
        actions.push({ sql: 'INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)',
          params: [s.token, s.username, s.created_at || new Date().toISOString()] });
      }
    }

    if (data.cronJobs && Array.isArray(data.cronJobs)) {
      actions.push({ sql: 'DELETE FROM cron_jobs' });
      for (const j of data.cronJobs) {
        const lr = j.last_result ? JSON.stringify(j.last_result) : null;
        actions.push({
          sql: `INSERT INTO cron_jobs (id, name, interval_ms, enabled, "type", last_run, last_result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [j.id, j.name, j.interval_ms || 3600000, j.enabled ?? 1, j.type || 'manual', j.last_run, lr, j.created_at || new Date().toISOString()]
        });
      }
    }

    if (data.settings && Array.isArray(data.settings)) {
      for (const s of data.settings) {
        actions.push({
          sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          params: [s.key, s.value, s.updated_at || new Date().toISOString()]
        });
      }
    }

    this._runMulti(actions);
  }

  // ==================== 工具方法 ====================

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._ready = false;
    }
  }
}

// 单例
module.exports = new SqliteService();
