// 定时任务调度
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "..", "data", "cron-jobs.json");

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
    try {
      if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (e) {}
    return [];
  }

  _save() {
    try {
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.jobs, null, 2), "utf8");
    } catch (e) {}
  }
}

module.exports = new CronService();
