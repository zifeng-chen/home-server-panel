const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hsp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
    console.log('[DB] MySQL 连接池已创建:', DB_CONFIG.host + ':' + DB_CONFIG.port + '/' + DB_CONFIG.database);
  }
  return pool;
}

async function query(sql, params = []) {
  const conn = await getPool();
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const conn = await getPool();
  const [result] = await conn.execute(sql, params);
  return result;
}

async function testConnection() {
  try {
    const conn = await getPool();
    await conn.query('SELECT 1');
    console.log('[DB] MySQL 连接成功');
    return true;
  } catch (err) {
    console.error('[DB] MySQL 连接失败:', err.message);
    return false;
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] MySQL 连接池已关闭');
  }
}

module.exports = { getPool, query, queryOne, execute, testConnection, close };
