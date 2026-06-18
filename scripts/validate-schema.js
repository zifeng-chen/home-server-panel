#!/usr/bin/env node
/**
 * 数据库 Schema 一致性校验
 * 
 * 校验内容:
 *   1. db-service.js ↔ setup-service.js MySQL 表定义100%对齐
 *   2. MySQL TEXT/BLOB 列无 DEFAULT 值（违反则建表失败）
 *   3. SQLite ↔ MySQL 同步字段映射完整性检查
 *
 * 用法: node scripts/validate-schema.js [--quiet]
 *   退出码 0 = 通过, 1 = 有差异
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  db: path.join(ROOT, 'src/services/db-service.js'),
  setup: path.join(ROOT, 'src/services/setup-service.js'),
  sqlite: path.join(ROOT, 'src/services/sqlite-service.js'),
};

const quiet = process.argv.includes('--quiet');

// ========== 解析 ==========

function extractMySQLTables(content) {
  const tables = {};
  const re = /`CREATE TABLE IF NOT EXISTS (\x60?\w+\x60?)\s*\(([\s\S]*?)\n\s*\)`/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rawName = m[1];
    const name = rawName.replace(/`/g, '');
    const body = m[2];
    const cols = [];
    const indexes = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/,\s*$/, '');
      if (!trimmed) continue;
      const colMatch = trimmed.match(/^\x60?(\w+)\x60?\s+(\S[\s\S]*)/);
      if (colMatch && !/^(PRIMARY|INDEX|UNIQUE|FOREIGN)/i.test(trimmed)) {
        const colName = colMatch[1];
        const definition = colMatch[2].trim().replace(/\s+/g, ' ').replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP.*/, '');
        cols.push({ name: colName, def: definition });
      } else if (/^(INDEX|UNIQUE|PRIMARY)/i.test(trimmed) || /^\s*(INDEX|UNIQUE|PRIMARY)/.test(trimmed)) {
        indexes.push(trimmed);
      }
    }
    tables[name] = { cols, indexes };
  }
  return tables;
}

function extractSQLiteTables(content) {
  const tables = {};
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    const body = m[2];
    const cols = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/,\s*$/, '');
      if (!trimmed) continue;
      const colMatch = trimmed.match(/^"?(\w+)"?\s+(\S[\s\S]*)/);
      if (colMatch && !/^(PRIMARY|FOREIGN)/i.test(trimmed)) {
        cols.push({ name: colMatch[1], def: colMatch[2].trim().replace(/\s+/g, ' ') });
      }
    }
    tables[name] = cols;
  }
  return tables;
}

// ========== 规则校验 ==========

let errors = 0;
let warnings = 0;

function err(msg) { if (!quiet) console.error('  ❌', msg); errors++; }
function warn(msg) { if (!quiet) console.warn('  ⚠️', msg); warnings++; }
function ok(msg) { if (!quiet) console.log('  ✅', msg); }

// ── 规则1: db.js ↔ setup.js 表列表 + 列列表对齐 ──
function checkMySQLPair(dbTables, suTables) {
  const allNames = new Set([...Object.keys(dbTables), ...Object.keys(suTables)]);
  for (const name of [...allNames].sort()) {
    const dbCols = (dbTables[name]?.cols || []).map(c => c.name);
    const suCols = (suTables[name]?.cols || []).map(c => c.name);
    const dbSet = new Set(dbCols);
    const suSet = new Set(suCols);

    if (!dbTables[name]) { err(`${name}: 仅存在于 setup-service.js`); continue; }
    if (!suTables[name]) { err(`${name}: 仅存在于 db-service.js`); continue; }
    if (dbSet.size !== suSet.size || ![...dbSet].every(c => suSet.has(c))) {
      const onlyDb = [...dbSet].filter(c => !suSet.has(c));
      const onlySu = [...suSet].filter(c => !dbSet.has(c));
      err(`${name}: 列定义不一致 — db-only=${JSON.stringify(onlyDb)}, setup-only=${JSON.stringify(onlySu)}`);
    } else {
      ok(`${name}: ${dbSet.size} 列一致`);
    }
  }
}

// ── 规则2: MySQL TEXT/BLOB 列不得有 DEFAULT ──
function checkTextDefaults(tables, source) {
  for (const [tname, tdef] of Object.entries(tables)) {
    for (const col of (tdef.cols || [])) {
      const type = col.def.toLowerCase();
      // Check if this is a TEXT/BLOB type
      if (/\b(text|tinytext|mediumtext|longtext|blob|tinyblob|mediumblob|longblob|json|geometry)\b/i.test(type)) {
        // Check for DEFAULT
        if (/\bdefault\b/i.test(type)) {
          err(`${tname}.${col.name}: TEXT/BLOB 列有 DEFAULT — ${col.def} (会导致 MySQL 建表失败)`);
        }
      }
    }
  }
}

// ── 规则3: SQLite → MySQL 同步关键字段存在性 ──
const SYNC_MAP = {
  ddns_config: { mysql: 'ddns_records', fields: ['name', 'record_type', 'subdomain', 'ttl', 'line', 'last_ip', 'provider'] },
  proxy_rules: { mysql: 'proxy_rules', fields: ['name', 'description', 'enabled', 'source_protocol', 'source_host', 'source_port', 'target_protocol', 'target_host', 'target_port', 'ssl', 'ssl_cert', 'ssl_key', 'websocket', 'custom_headers'] },
  ssl_config: { mysql: 'ssl_certs', fields: ['domain', 'alias', 'wildcard', 'notified_at'] },
  cron_jobs: { mysql: 'cron_jobs', fields: ['id', 'name', 'interval_ms', 'enabled', 'type', 'last_run', 'last_result'] },
  ssh_config: { mysql: 'ssh_config', fields: ['name', 'host', 'port', 'username', 'password'] },
};

function checkSyncFields(sqTables, dbTables) {
  for (const [sqName, cfg] of Object.entries(SYNC_MAP)) {
    const sqCols = (sqTables[sqName] || []).map(c => c.name);
    const myCols = (dbTables[cfg.mysql]?.cols || []).map(c => c.name);
    for (const f of cfg.fields) {
      if (!sqCols.includes(f)) err(`同步字段: SQLite.${sqName} 缺列 ${f}`);
    }
    // MySQL side mapping is more complex (different names), so just check table exists
    if (!dbTables[cfg.mysql]) err(`同步字段: MySQL.${cfg.mysql} 表不存在`);
  }
}

// ========== 主流程 ==========

const dbContent = fs.readFileSync(FILES.db, 'utf-8');
const suContent = fs.readFileSync(FILES.setup, 'utf-8');
const sqContent = fs.readFileSync(FILES.sqlite, 'utf-8');

const dbTables = extractMySQLTables(dbContent);
const suTables = extractMySQLTables(suContent);
const sqTables = extractSQLiteTables(sqContent);

console.log('\n🔍 数据库 Schema 一致性校验\n');
console.log(`  db-service.js:    ${Object.keys(dbTables).length} 表`);
console.log(`  setup-service.js: ${Object.keys(suTables).length} 表`);
console.log(`  sqlite-service.js:${Object.keys(sqTables).length} 表\n`);

console.log('  规则1: db.js ↔ setup.js 对齐');
checkMySQLPair(dbTables, suTables);

console.log('\n  规则2: MySQL TEXT 默认值检查');
checkTextDefaults(dbTables, 'db-service.js');
checkTextDefaults(suTables, 'setup-service.js');

console.log('\n  规则3: SQLite → MySQL 同步字段');
checkSyncFields(sqTables, dbTables);

console.log(`\n${errors ? '❌' : '✅'} 校验结果: ${errors} 错误, ${warnings} 警告`);
process.exit(errors > 0 ? 1 : 0);
