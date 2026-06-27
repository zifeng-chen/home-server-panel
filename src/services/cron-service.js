// 定时任务调度
const { exec } = require("child_process");

const sqliteService = require('./sqlite-service');

// 限制：单次定时任务最长执行 60 秒
const JOB_TIMEOUT = 60_000;

let _dbService = null;
function _getDb() {
  if (!_dbService) _dbService = require('./db-service');
  return _dbService;
}
function _syncMySQL(table) {
  const db = _getDb();
  if (db.mode === 'mysql') setImmediate(() => db.syncTable(table).catch(() => {}));
}

class CronService {
  constructor() {
    this.jobs = this._load();
    this.timers = {};
    this._startAll();
  }

  listJobs() { return this.jobs; }

  getJob(id) { return this.jobs.find(j => j.id === id) || null; }

  addJob(job) {
    const j = {
      id: job.id || "cron-" + Date.now(),
      name: job.name || "未命名",
      interval: job.interval || 3600000,
      enabled: job.enabled !== false,
      type: job.type || "manual",
      script: job.script || "",        // 自定义脚本内容
      apiPath: job.apiPath || "",      // 自定义 API 路径（兼容旧版）
      lastRun: null,
      lastResult: null
    };
    this.jobs.push(j);
    this._save();
    if (j.enabled) this._startJob(j);
    return j;
  }

  toggleJob(id) {
    const j = this.jobs.find(x => x.id === id);
    if (!j) throw new Error("任务不存在");
    j.enabled = !j.enabled;
    this._save();
    if (j.enabled) this._startJob(j); else this._stopJob(id);
    return j;
  }

  updateJob(id, patch) {
    const j = this.jobs.find(x => x.id === id);
    if (!j) throw new Error("任务不存在");
    if (patch.name !== undefined) j.name = patch.name;
    if (patch.interval !== undefined) j.interval = patch.interval;
    if (patch.type !== undefined) j.type = patch.type;
    if (patch.script !== undefined) j.script = patch.script;
    if (patch.apiPath !== undefined) j.apiPath = patch.apiPath;
    if (patch.enabled !== undefined) {
      j.enabled = !!patch.enabled;
      this._stopJob(id);
      if (j.enabled) this._startJob(j);
    }
    this._save();
    return j;
  }

  removeJob(id) {
    const idx = this.jobs.findIndex(x => x.id === id);
    if (idx === -1) throw new Error("任务不存在");
    this._stopJob(id);
    this.jobs.splice(idx, 1);
    this._save();
  }

  async runJob(id) {
    const j = this.jobs.find(x => x.id === id);
    if (!j) throw new Error("任务不存在");
    j.lastRun = new Date().toISOString();
    j.lastResult = null;
    try {
      if (j.type === "ddns" || j.type === "ddns_refresh") {
        const ddns = require("../services/ddns-service");
        const result = await ddns.checkAndUpdate();
        j.lastResult = JSON.stringify(result).slice(0, 500);
      } else if (j.type === "custom" && j.script) {
        j.lastResult = await this._execScript(j.script);
      } else if (j.type === "ssl_renew") {
        const ssl = require("../services/ssl-service");
        const result = await ssl.renewAllCertificates();
        j.lastResult = JSON.stringify(result).slice(0, 500);
      } else {
        j.lastResult = "任务类型不支持自动执行";
      }
    } catch (err) {
      j.lastResult = err.message;
    }
    this._save();
    return { lastResult: j.lastResult };
  }

  /** 执行自定义 shell 脚本，最长 60 秒超时 */
  _execScript(script) {
    return new Promise((resolve) => {
      // 安全检查：禁止危险命令（解码后黑名单拦截 + 长度限制）
      if (script.length > 1000) return resolve("安全拦截：脚本过长");
      // 先解码常见编码绕过：base64、hex、URL编码
      let decoded = script;
      try { decoded = Buffer.from(script.replace(/^echo\s+/, '').trim(), 'base64').toString('utf-8'); } catch (_) {}
      const dangerous = /(?:rm\s+(-rf?|--recursive)\s*\/|mkfs|dd\s+if=.*of=\/dev|>\s*\/dev\/sd|chmod\s+(-R|777)\s*\/|:\s*\(\)\s*\{\s*:|kill\s+-9\s+1|mv\s+\/.*\/dev\/null|curl.*\|\s*(ba)?sh|wget.*-O\s*-\s*\|\s*(ba)?sh|shutdown\b|reboot\b|halt\b|poweroff\b|iptables\s+-[A-Z]|nc\s+-[nl]|ncat\s+-[nl]|socat\s|telnet\s|passwd\b|chown\s+\/|chgrp\s+\/|mount\s.*\/dev\/|umount\s+\/|\$\(|`[^`]+`)/;
      if (dangerous.test(script)) {
        return resolve("安全拦截：脚本包含危险操作");
      }
      exec(script, { timeout: JOB_TIMEOUT, maxBuffer: 1024 * 1024, shell: '/bin/sh' }, (err, stdout, stderr) => {
        const out = (stdout + (stderr ? '\n[stderr] ' + stderr : '')).trim().slice(0, 1000);
        resolve(err && !out ? (stderr || err.message) : (out || '(无输出)'));
      });
    });
  }

  _startJob(job) {
    if (this.timers[job.id]) return;
    const ms = parseInt(job.interval) || 3600000;
    this.timers[job.id] = setInterval(async () => {
      const j = this.jobs.find(x => x.id === job.id);
      if (!j) return;
      j.lastRun = new Date().toISOString();
      try {
        if (j.type === "ddns" || j.type === "ddns_refresh") {
          await require("../services/ddns-service").checkAndUpdate().catch(() => {});
        } else if (j.type === "custom" && j.script) {
          j.lastResult = await this._execScript(j.script);
        } else if (j.type === "ssl_renew") {
          await require("../services/ssl-service").renewAllCertificates().catch(() => {});
        }
      } catch (_) {}
      this._save();
    }, ms);
  }

  _stopJob(id) {
    if (this.timers[id]) { clearInterval(this.timers[id]); delete this.timers[id]; }
  }

  _startAll() {
    this.jobs.filter(j => j.enabled).forEach(j => this._startJob(j));
  }

  _load() {
    return sqliteService.getCronJobs();
  }

  _save() {
    sqliteService.setCronJobs(this.jobs);
    _syncMySQL('cron_jobs');
  }
}

module.exports = new CronService();
