// 操作日志服务
const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "..", "data", "logs", "current.json");
const MAX = 500;

class LogService {
  constructor() { this.entries = this._load(); }

  log(entry) {
    const r = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      time: new Date().toISOString(),
      module: entry.module || "system",
      action: entry.action || "unknown",
      level: entry.level || "info",
      message: entry.message || "",
      detail: entry.detail || "",
      user: entry.user || "admin"
    };
    this.entries.unshift(r);
    if (this.entries.length > MAX) this.entries = this.entries.slice(0, MAX);
    setImmediate(() => {
      this._save();
      // 同时写 MySQL（如果已连接）
      try {
        const dbService = require("./db-service");
        if (dbService.mode === "mysql" && dbService.getPool()) {
          dbService.addLog(r).catch(() => {});
        }
      } catch (_) {}
    });
    return r;
  }

  async query({ module, level, search, limit = 100, offset = 0 } = {}) {
    // MySQL 模式：优先读数据库
    try {
      const dbService = require("./db-service");
      if (dbService.mode === "mysql" && dbService.getPool()) {
        const dbResult = await dbService.queryLogs({ module, level, search, limit, offset });
        if (dbResult) return dbResult;
      }
    } catch (_) {}

    // fallback: 内存数据
    let list = [...this.entries];
    if (module && module !== "all") list = list.filter(e => e.module === module);
    if (level && level !== "all") list = list.filter(e => e.level === level);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => (e.message + e.action + e.detail).toLowerCase().includes(s));
    }
    return { total: list.length, list: list.slice(offset, offset + limit) };
  }


  middleware() {
    const self = this;
    // GET 静默路径：高频轮询不记录日志
    const silentGets = new Set([
      '/api/monitor', '/api/system', '/api/auth/status',
      '/api/dashboard', '/api/db/status'
    ]);
    return (req, res, next) => {
      // GET 请求：仅记录有错误或非轮询路径
      if (req.method === 'GET') {
        const strippedPath = (req.originalUrl || req.url).split('?')[0];
        if (silentGets.has(strippedPath)) return next();
      }

      const start = Date.now();
      const origJson = res.json.bind(res);
      res.json = function(obj) {
        const duration = Date.now() - start;
        const reqPath = req.originalUrl || req.url;
        if (!reqPath.startsWith("/api/")) return origJson(obj);
        let module = reqPath.split("/").slice(2, 3)[0] || "system";
        const moduleMap = { cert: 'ssl', certificate: 'ssl' };
        module = moduleMap[module] || module;

        // GET 成功不记日志，只记错误（减少日志噪音）
        if (req.method === 'GET' && obj && obj.success === true) {
          return origJson(obj);
        }

        let level = "info", message = req.method + " " + module;
        if (res.statusCode >= 500) { level = "error"; message = obj.message || "服务器错误"; }
        else if (res.statusCode >= 400) { level = "warn"; message = obj.message || "请求被拒绝"; }
        else if (obj && obj.success === true) { level = "success"; message = obj.message || module + " 成功"; }
        else if (obj && obj.success === false) { level = "warn"; message = obj.message || "操作失败"; }
        self.log({ module, action: req.method + " " + reqPath, level, message, detail: duration + "ms" });
        return origJson(obj);
      };
      next();
    };
  }


  clear() { this.entries = []; this._save(); return { success: true }; }

  _load() {
    try {
      if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    } catch (e) {}
    return [];
  }

  _save() {
    try {
      const dir = path.dirname(LOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(LOG_FILE, JSON.stringify(this.entries, null, 2), "utf8");
    } catch (e) {}
  }
}

module.exports = new LogService();
