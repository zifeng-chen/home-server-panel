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
    setImmediate(() => this._save());
    return r;
  }

  query({ module, level, search, limit = 100, offset = 0 } = {}) {
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
    return (req, res, next) => {
      const start = Date.now();
      const origJson = res.json.bind(res);
      res.json = function(obj) {
        const duration = Date.now() - start;
        const path = req.originalUrl || req.url;
        if (!path.startsWith("/api/")) return origJson(obj);
        let module = path.split("/").slice(2, 3)[0] || "system";
        // 模块名映射
        const moduleMap = { cert: 'ssl', certificate: 'ssl' };
        module = moduleMap[module] || module;

        let level = "info", message = req.method + " " + module;
        if (res.statusCode >= 500) { level = "error"; message = obj.message || "服务器错误"; }
        else if (res.statusCode >= 400) { level = "warn"; message = obj.message || "请求被拒绝"; }
        else if (obj && obj.success === true) { level = "success"; message = obj.message || module + " 成功"; }
        else if (obj && obj.success === false) { level = "warn"; message = obj.message || "操作失败"; }
        self.log({ module, action: req.method + " " + path, level, message, detail: duration + "ms" });
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
