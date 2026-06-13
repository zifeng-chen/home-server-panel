// 定时任务调度
const { exec } = require("child_process");

const sqliteService = require('./sqlite-service');

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

  addJob(job) {
    const j = {
      id: job.id || "cron-" + Date.now(),
      name: job.name || "未命名",
      interval: job.interval || 3600000,
      enabled: job.enabled !== false,
      type: job.type || "manual",
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
      if (j.type === "ddns") {
        const ddns = require("../services/ddns-service");
        const result = await ddns.checkAndUpdate();
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

  _startJob(job) {
    if (this.timers[job.id]) return;
    const ms = parseInt(job.interval) || 3600000;
    this.timers[job.id] = setInterval(() => {
      job.lastRun = new Date().toISOString();
      if (job.type === "ddns") {
        require("../services/ddns-service").checkAndUpdate().catch(() => {});
      }
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
