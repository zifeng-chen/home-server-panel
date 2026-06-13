// 数据库抽象层 - 支持本地 JSON + SQLite + MySQL 多模式
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class DbService {
  constructor() {
    this._pool = null;
    this.mode = 'local'; // local | mysql
  }

  // ========== MySQL 连接 ==========

  async initMySQL(config = {}) {
    const host = config.host || process.env.DB_HOST || '127.0.0.1';
    const port = parseInt(config.port || process.env.DB_PORT || 3306);
    const user = config.user || process.env.DB_USER || 'root';
    const password = config.password || process.env.DB_PASSWORD || '';
    const database = config.database || process.env.DB_NAME || 'server_panel';

    try {
      // 先连接（不指定数据库）来创建数据库
      // 用 query() 不用 execute()：CREATE DATABASE 不适合 MySQL 预处理
      const tmpPool = mysql.createPool({ host, port, user, password, waitForConnections: true, connectionLimit: 2 });
      await tmpPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await tmpPool.end();

      // 用指定数据库重新连接
      this._pool = mysql.createPool({
        host, port, user, password, database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4'
      });

      await this._initSchema();
      this.mode = 'mysql';
      return { success: true, message: 'MySQL 连接成功' };
    } catch (err) {
      this._pool = null;
      return { success: false, message: 'MySQL 连接失败: ' + err.message };
    }
  }

  async _initSchema() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS ddns_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        type ENUM('A','AAAA') DEFAULT 'A',
        value VARCHAR(255),
        \`enabled\` TINYINT(1) DEFAULT 1,
        last_updated TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS proxy_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(255) NOT NULL,
        source_host VARCHAR(255),
        target_host VARCHAR(255),
        target VARCHAR(1024),
        port INT,
        \`ssl\` TINYINT(1) DEFAULT 0,
        \`websocket\` TINYINT(1) DEFAULT 0,
        \`enabled\` TINYINT(1) DEFAULT 1,
        remark VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS ssl_certs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL UNIQUE,
        alias VARCHAR(255),
        wildcard TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS operation_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        time TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
        module VARCHAR(50) DEFAULT 'system',
        action VARCHAR(100) DEFAULT 'unknown',
        level VARCHAR(20) DEFAULT 'info',
        message TEXT,
        detail TEXT,
        \`user\` VARCHAR(100) DEFAULT 'admin',
        INDEX idx_module (module),
        INDEX idx_time (time),
        INDEX idx_level (level)
      )`,

      `CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(128) PRIMARY KEY,
        username VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS system_config (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS monitor_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ts BIGINT NOT NULL,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      await this._pool.query(sql);
    }
  }

  async testConnection(config = {}) {
    const host = config.host || process.env.DB_HOST || '127.0.0.1';
    const port = parseInt(config.port || process.env.DB_PORT || 3306);
    const user = config.user || process.env.DB_USER || 'root';
    const password = config.password || process.env.DB_PASSWORD || '';
    const database = config.database || process.env.DB_NAME || 'server_panel';

    let tmpPool;
    try {
      // 用 query() 不用 execute()：避免 MySQL 预处理语句对 SHOW/CREATE 等不支持
      tmpPool = mysql.createPool({ host, port, user, password, waitForConnections: true, connectionLimit: 1 });
      await tmpPool.query('SELECT 1 AS ok');

      // SHOW DATABASES 不支持参数化预处理，用 query() 直接拼接
      const safeDb = database.replace(/[^a-zA-Z0-9_]/g, '');
      const [dbs] = await tmpPool.query(`SHOW DATABASES LIKE '${safeDb}'`);

      return { success: true, dbExists: dbs.length > 0 };
    } catch (err) {
      return { success: false, message: '连接失败: ' + err.message };
    } finally {
      if (tmpPool) { try { await tmpPool.end(); } catch (e) {} }
    }
  }

  getPool() { return this._pool; }
  getMode() { return this.mode; }

  // ========== 日志操作 ==========

  async addLog(entry) {
    if (this.mode === 'mysql' && this._pool) {
      try {
        await this._pool.query(
          `INSERT INTO operation_logs (module, action, level, message, detail, \`user\`) VALUES (?, ?, ?, ?, ?, ?)`,
          [entry.module || 'system', entry.action || 'unknown', entry.level || 'info', entry.message || '', entry.detail || '', entry.user || 'admin']
        );
      } catch (e) { /* MySQL 日志写入失败不阻塞主流程 */ }
    }
  }

  async queryLogs({ module, level, search, limit = 100, offset = 0 } = {}) {
    if (this.mode === 'mysql' && this._pool) {
      try {
        const conditions = [];
        const params = [];
        if (module && module !== 'all') { conditions.push('module = ?'); params.push(module); }
        if (level && level !== 'all') { conditions.push('level = ?'); params.push(level); }
        if (search) { conditions.push('(message LIKE ? OR action LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

        const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

        const countSql = `SELECT COUNT(*) AS total FROM operation_logs${where}`;
        const [countResult] = await this._pool.query(countSql, params);

        const dataSql = `SELECT time, module, action, level, message, detail, user FROM operation_logs${where} ORDER BY time DESC LIMIT ? OFFSET ?`;
        const dataParams = [...params, limit, offset];
        const [rows] = await this._pool.query(dataSql, dataParams);

        return { total: countResult[0]?.total || 0, list: rows };
      } catch (e) {
        console.error('[DB] 日志查询失败:', e.message);
      }
    }
    return null;
  }

  // ========== 监控历史 ==========

  async saveMonitorHistory(history) {
    if (this.mode === 'mysql' && this._pool) {
      try {
        const json = JSON.stringify(history);
        // 删旧存新，只保留最新一条
        await this._pool.query('DELETE FROM monitor_history');
        await this._pool.query('INSERT INTO monitor_history (ts, data) VALUES (?, ?)', [Date.now(), json]);
      } catch (e) { /* 静默 */ }
    }
  }

  async loadMonitorHistory() {
    if (this.mode === 'mysql' && this._pool) {
      try {
        const [rows] = await this._pool.query('SELECT data FROM monitor_history ORDER BY ts DESC LIMIT 1');
        if (rows.length > 0) return JSON.parse(rows[0].data);
      } catch (e) { /* 静默 */ }
    }
    return null;
  }

  // ========== 配置持久化 ==========

  async saveSetting(key, value) {
    if (this.mode === 'mysql' && this._pool) {
      try {
        await this._pool.query(
          'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
          [key, String(value)]
        );
      } catch (e) { /* 静默 */ }
    }
  }

  async getSetting(key) {
    if (this.mode === 'mysql' && this._pool) {
      try {
        const [rows] = await this._pool.query('SELECT `value` FROM settings WHERE `key` = ?', [key]);
        return rows.length > 0 ? rows[0].value : null;
      } catch (e) { return null; }
    }
    return null;
  }

  async getAllSettings() {
    if (this.mode === 'mysql' && this._pool) {
      try {
        const [rows] = await this._pool.query('SELECT `key`, `value` FROM settings');
        const obj = {};
        rows.forEach(r => obj[r.key] = r.value);
        return obj;
      } catch (e) { return {}; }
    }
    return {};
  }

  // ========== 数据库完整检查 ==========

  async checkIntegrity() {
    const tables = ['ddns_records', 'proxy_rules', 'ssl_certs', 'operation_logs',
      'settings', 'system_config', 'sessions', 'monitor_history'];
    const result = { mode: this.mode, tables: {} };

    if (this.mode === 'mysql' && this._pool) {
      try {
        for (const t of tables) {
          try {
            const [rows] = await this._pool.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
            result.tables[t] = { exists: true, rows: rows[0]?.cnt || 0 };
          } catch (e) {
            result.tables[t] = { exists: false, error: e.message };
          }
        }
      } catch (e) {
        result.error = e.message;
      }
    } else {
      result.message = 'MySQL 未连接';
    }

    return result;
  }

  // ========== 导入/导出/迁移 ==========

  // 从 SQLite/JSON 迁移到 MySQL
  async migrateFromLocal() {
    if (this.mode !== 'mysql' || !this._pool) {
      throw new Error('MySQL 未连接，无法迁移');
    }

    const results = { migrated: [], skipped: [], errors: [] };

    // 优先从 SQLite 读取，如果不存在则从 JSON 读取
    const sqliteService = require('./sqlite-service');

    // 1. 迁移 settings
    try {
      const envConfig = {
        aliKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
        aliKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        pushplusToken: process.env.PUSHPLUS_TOKEN || '',
        acmeEmail: process.env.ACME_EMAIL || '',
        acmeDnsProvider: process.env.ACME_DNS_PROVIDER || ''
      };
      for (const [key, value] of Object.entries(envConfig)) {
        await this._pool.query(
          'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
          [key, value]
        );
      }
      results.migrated.push(`settings (${Object.keys(envConfig).length} 项)`);
    } catch (e) { results.errors.push(`settings: ${e.message}`); }

    // 2. 迁移 DDNS records (从 SQLite)
    try {
      const ddnsDomains = sqliteService.getDdnsDomains();
      if (ddnsDomains.length > 0) {
        for (const r of ddnsDomains) {
          await this._pool.query(
            'INSERT INTO ddns_records (domain, type, value, \`enabled\`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE type=VALUES(type), value=VALUES(value), \`enabled\`=VALUES(\`enabled\`)',
            [r.name, r.recordType || 'A', r.lastIp || '', 1]
          );
        }
        results.migrated.push(`ddns_records (${ddnsDomains.length} 条)`);
      } else {
        // 回退到 JSON 文件
        const ddnsFile = path.join(DATA_DIR, 'ddns-config.json');
        if (fs.existsSync(ddnsFile)) {
          const ddnsData = JSON.parse(fs.readFileSync(ddnsFile, 'utf-8'));
          const records = ddnsData.domains || [];
          for (const r of records) {
            await this._pool.query(
              'INSERT INTO ddns_records (domain, type, value, \`enabled\`) VALUES (?, ?, ?, ?)',
              [r.name, r.recordType || 'A', r.lastIp || '', 1]
            );
          }
          results.migrated.push(`ddns_records (${records.length} 条, from JSON)`);
        } else {
          results.skipped.push('ddns_records (无数据)');
        }
      }
    } catch (e) { results.errors.push(`ddns_records: ${e.message}`); }

    // 3. 迁移 Proxy rules (从 SQLite)
    try {
      const proxyRules = sqliteService.getProxyRules();
      if (proxyRules.length > 0) {
        for (const r of proxyRules) {
          await this._pool.query(
            `INSERT INTO proxy_rules (source, source_host, target_host, target, port, \`ssl\`, \`websocket\`, \`enabled\`, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [r.sourceHost, r.sourceHost, r.targetHost, `${r.targetProtocol}://${r.targetHost}:${r.targetPort}`, r.sourcePort, r.ssl ? 1 : 0, r.websocket ? 1 : 0, r.enabled ? 1 : 0, r.description || '']
          );
        }
        results.migrated.push(`proxy_rules (${proxyRules.length} 条)`);
      } else {
        // 回退到 JSON 文件
        const proxyFile = path.join(DATA_DIR, 'proxy-config.json');
        if (fs.existsSync(proxyFile)) {
          const proxyData = JSON.parse(fs.readFileSync(proxyFile, 'utf-8'));
          const rules = proxyData.rules || [];
          for (const r of rules) {
            await this._pool.query(
              `INSERT INTO proxy_rules (source, source_host, target_host, target, port, \`ssl\`, \`websocket\`, \`enabled\`, remark)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [r.sourceHost, r.sourceHost, r.targetHost, `${r.targetProtocol}://${r.targetHost}:${r.targetPort}`, r.sourcePort, r.ssl ? 1 : 0, r.websocket ? 1 : 0, r.enabled ? 1 : 0, r.description || '']
            );
          }
          results.migrated.push(`proxy_rules (${rules.length} 条, from JSON)`);
        } else {
          results.skipped.push('proxy_rules (无数据)');
        }
      }
    } catch (e) { results.errors.push(`proxy_rules: ${e.message}`); }

    // 4. 迁移 SSL certs (从 SQLite)
    try {
      const sslDomains = sqliteService.getSslDomains();
      if (sslDomains.length > 0) {
        for (const d of sslDomains) {
          await this._pool.query(
            'INSERT INTO ssl_certs (domain, alias, wildcard) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE alias=VALUES(alias), wildcard=VALUES(wildcard)',
            [d.domain, d.alias || d.domain, d.wildcard ? 1 : 0]
          );
        }
        results.migrated.push(`ssl_certs (${sslDomains.length} 条)`);
      } else {
        // 回退到 JSON 文件
        const sslFile = path.join(DATA_DIR, 'ssl-config.json');
        if (fs.existsSync(sslFile)) {
          const sslData = JSON.parse(fs.readFileSync(sslFile, 'utf-8'));
          const domains = sslData.domains || [];
          for (const d of domains) {
            await this._pool.query(
              'INSERT INTO ssl_certs (domain, alias, wildcard) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE alias=VALUES(alias), wildcard=VALUES(wildcard)',
              [d.domain, d.alias || d.domain, d.wildcard ? 1 : 0]
            );
          }
          results.migrated.push(`ssl_certs (${domains.length} 条, from JSON)`);
        } else {
          results.skipped.push('ssl_certs (无数据)');
        }
      }
    } catch (e) { results.errors.push(`ssl_certs: ${e.message}`); }

    return results;
  }

  // 获取迁移状态
  async getMigrationStatus() {
    if (this.mode !== 'mysql' || !this._pool) {
      return { ready: false, message: 'MySQL 未连接' };
    }
    try {
      const [ddns] = await this._pool.query('SELECT COUNT(*) AS cnt FROM ddns_records');
      const [proxy] = await this._pool.query('SELECT COUNT(*) AS cnt FROM proxy_rules');
      const [ssl] = await this._pool.query('SELECT COUNT(*) AS cnt FROM ssl_certs');
      return {
        ready: true,
        tables: {
          ddns_records: ddns[0]?.cnt || 0,
          proxy_rules: proxy[0]?.cnt || 0,
          ssl_certs: ssl[0]?.cnt || 0
        }
      };
    } catch (e) {
      return { ready: false, message: e.message };
    }
  }

  // 运行时增量同步：SQLite → MySQL（服务器启动时调用）
  async syncFromSQLite() {
    if (this.mode !== 'mysql' || !this._pool) return { synced: 0 };

    const sqliteService = require('./sqlite-service');
    let synced = 0;

    // DDNS
    try {
      const ddns = sqliteService.getDdnsDomains();
      for (const d of ddns) {
        await this._pool.query(
          'INSERT INTO ddns_records (domain, type, value, \`enabled\`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE type=VALUES(type), value=VALUES(value), \`enabled\`=VALUES(\`enabled\`)',
          [d.name, d.recordType || 'A', d.lastIp || '', d.enabled !== false ? 1 : 0]
        );
        synced++;
      }
    } catch (e) { console.error('[DB] DDNS sync error:', e.message); }

    // Proxy
    try {
      const proxy = sqliteService.getProxyRules();
      for (const r of proxy) {
        await this._pool.query(
          `INSERT INTO proxy_rules (source, source_host, target_host, target, port, \`ssl\`, \`websocket\`, \`enabled\`, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE target_host=VALUES(target_host), target=VALUES(target), port=VALUES(port), \`ssl\`=VALUES(\`ssl\`), \`websocket\`=VALUES(\`websocket\`), \`enabled\`=VALUES(\`enabled\`), remark=VALUES(remark)`,
          [r.sourceHost, r.sourceHost, r.targetHost, `${r.targetProtocol}://${r.targetHost}:${r.targetPort}`, r.sourcePort, r.ssl ? 1 : 0, r.websocket ? 1 : 0, r.enabled ? 1 : 0, r.description || '']
        );
        synced++;
      }
    } catch (e) { console.error('[DB] Proxy sync error:', e.message); }

    // SSL
    try {
      const ssl = sqliteService.getSslDomains();
      for (const d of ssl) {
        await this._pool.query(
          'INSERT INTO ssl_certs (domain, alias, wildcard) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE alias=VALUES(alias), wildcard=VALUES(wildcard)',
          [d.domain, d.alias || d.domain, d.wildcard ? 1 : 0]
        );
        synced++;
      }
    } catch (e) { console.error('[DB] SSL sync error:', e.message); }

    console.log('[DB] SQLite → MySQL 同步完成:', synced, '条记录');
    return { synced };
  }
  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
      this.mode = 'local';
    }
    return { success: true, message: '数据库连接已关闭' };
  }
}

module.exports = new DbService();
