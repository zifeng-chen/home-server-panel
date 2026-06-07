// 引导安装服务
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class SetupService {

  async testDbConnection({ host, port, user, password, database }) {
    let conn;
    try {
      // 先尝试连接（不指定数据库）
      conn = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
      // 检查数据库是否存在（用 query 避免 INFORMATION_SCHEMA 预处理兼容问题）
      const [rows] = await conn.query(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [database]
      );
      return { success: true, dbExists: rows.length > 0 };
    } catch (err) {
      return { success: false, message: err.code === 'ER_ACCESS_DENIED_ERROR'
        ? '数据库用户名或密码错误'
        : err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED'
        ? `无法连接 ${host}:${port}`
        : `数据库连接失败: ${err.message}` };
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }

  async install(config) {
    const { dbMode, adminUser, adminPass, dbHost, dbPort, dbUser, dbPass, dbName } = config;

    // 验证
    if (!adminUser || !adminPass || adminPass.length < 6) {
      return { success: false, message: '管理员用户名/密码无效（密码至少6位）' };
    }

    // 确保 data 目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 读取现有 .env（保留非系统管理的配置）
    let existingEnv = '';
    try {
      existingEnv = fs.readFileSync(ENV_FILE, 'utf-8');
    } catch (e) {
      // .env 不存在，从 .env.example 读取模板
      try {
        existingEnv = fs.readFileSync(ENV_FILE + '.example', 'utf-8');
      } catch (e2) { /* 无模板则空白开始 */ }
    }

    // 生成随机 SESSION_SECRET
    const sessionSecret = crypto.randomBytes(32).toString('hex');

    // 更新/替换 .env 中的关键字段
    const updates = {
      'ADMIN_USER': adminUser,
      'ADMIN_PASS': adminPass,
      'SESSION_SECRET': sessionSecret,
      'DB_MODE': dbMode
    };

    // MySQL 相关配置
    if (dbMode === 'mysql') {
      updates['DB_HOST'] = dbHost || '127.0.0.1';
      updates['DB_PORT'] = String(dbPort || 3306);
      updates['DB_USER'] = dbUser || 'root';
      updates['DB_PASSWORD'] = dbPass || '';
      updates['DB_NAME'] = dbName || 'server_panel';

      // 建立数据库和表
      const dbResult = await this._initMysql(updates);
      if (!dbResult.success) return dbResult;
    } else {
      // 本地模式：清除 MySQL 配置
      ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(k => delete updates[k]);
    }

    // 写入 .env
    const newEnv = this._patchEnv(existingEnv, updates);
    fs.writeFileSync(ENV_FILE, newEnv, 'utf-8');

    // 创建初始 sessions 文件
    const sessionsFile = path.join(DATA_DIR, 'sessions.json');
    if (!fs.existsSync(sessionsFile)) {
      fs.writeFileSync(sessionsFile, '{}', 'utf-8');
    }

    return { success: true, message: '安装完成' };
  }

  async _initMysql(config) {
    let conn;
    try {
      const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = config;
      // 先连接 MySQL（不指定数据库）
      conn = await mysql.createConnection({
        host: DB_HOST, port: parseInt(DB_PORT) || 3306,
        user: DB_USER, password: DB_PASSWORD,
        connectTimeout: 5000
      });

      // 创建数据库（如不存在）— 用 query 避免预处理兼容问题
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

      // 切换到目标数据库
      await conn.query(`USE \`${DB_NAME}\``);

      // 创建初始表
      await this._createTables(conn);

      return { success: true };
    } catch (err) {
      return { success: false, message: `数据库初始化失败: ${err.message}` };
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }

  async _createTables(conn) {
    // 系统设置表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(64) PRIMARY KEY,
        \`value\` TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 操作日志表（后续功能使用）
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(64) NOT NULL,
        detail TEXT,
        operator VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // DDNS 记录表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ddns_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        type ENUM('A', 'AAAA') DEFAULT 'A',
        record_id VARCHAR(128),
        enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 反向代理规则表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS proxy_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL,
        target VARCHAR(500) NOT NULL,
        ssl TINYINT(1) DEFAULT 0,
        websocket TINYINT(1) DEFAULT 0,
        enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  _patchEnv(existingEnv, updates) {
    const lines = existingEnv.split('\n');
    const seen = new Set();
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) {
        result.push(line);
        continue;
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) { result.push(line); continue; }
      const key = line.substring(0, eqIdx).trim();
      if (updates[key] !== undefined) {
        result.push(`${key}=${updates[key]}`);
        seen.add(key);
      } else {
        result.push(line);
      }
    }

    // 追加未见过的 key
    for (const [key, value] of Object.entries(updates)) {
      if (!seen.has(key)) {
        result.push(`${key}=${value}`);
      }
    }

    return result.join('\n') + '\n';
  }
}

module.exports = new SetupService();
