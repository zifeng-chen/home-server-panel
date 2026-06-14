// 操作日志服务
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const LOG_FILE = path.join(__dirname, "..", "..", "data", "logs", "current.json");
const MAX = 500;
const BODY_MAX_LEN = 500;       // 请求体最大记录长度
const RESP_MAX_LEN = 300;       // 响应体最大记录长度

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
      ip: entry.ip || "-",
      method: entry.method || "-",
      path: entry.path || "-",
      query: entry.query || "",
      body: entry.body || "",
      statusCode: entry.statusCode || 0,
      duration: entry.duration || 0,
      respSize: entry.respSize || 0,
      user: entry.user || "admin"
    };
    this.entries.unshift(r);
    if (this.entries.length > MAX) this.entries = this.entries.slice(0, MAX);
    setImmediate(() => {
      this._save();
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
    try {
      const dbService = require("./db-service");
      if (dbService.mode === "mysql" && dbService.getPool()) {
        const dbResult = await dbService.queryLogs({ module, level, search, limit, offset });
        if (dbResult) return dbResult;
      }
    } catch (_) {}

    let list = [...this.entries];
    if (module && module !== "all") list = list.filter(e => e.module === module);
    if (level && level !== "all") list = list.filter(e => e.level === level);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e =>
        (e.message + " " + e.action + " " + e.detail + " " + e.ip + " " + e.body + " " + e.query).toLowerCase().includes(s)
      );
    }
    return { total: list.length, list: list.slice(offset, offset + limit) };
  }

  /** 构建可读的动作描述 */
  _describeAction(req) {
    const method = req.method;
    const rawPath = req.originalUrl || req.url;
    const parsed = (() => { try { return new URL(rawPath, "http://x"); } catch (_) { return { pathname: rawPath }; } })();
    const segments = (parsed.pathname || rawPath).split("/").filter(Boolean);

    // 动作映射表
    const verbs = {
      GET:    { default: "查询", list: "列出", status: "查看状态", logs: "查看日志" },
      POST:   { default: "创建", login: "登录", logout: "登出", setup: "安装配置",
                install: "安装", uninstall: "卸载", toggle: "切换状态",
                enable: "启用", disable: "停用", deploy: "部署", save: "保存",
                start: "启动", stop: "停止", restart: "重启", reload: "重载",
                test: "测试", export: "导出", import: "导入", backup: "备份",
                restore: "恢复", upload: "上传", refresh: "刷新" },
      PUT:    { default: "更新" },
      DELETE: { default: "删除" }
    };
    const verbSet = verbs[method] || { default: method };

    // 从路径和最后一段猜测动作
    let action = verbSet.default;
    if (segments.length >= 2) {
      const last = segments[segments.length - 1];
      if (verbSet[last]) { action = verbSet[last]; }
      else if (last === "config") { action = method === "GET" ? "查看配置" : "更新配置"; }
      else if (last === "records" || last === "rules" || last === "processes") { action = "查询"; }
    }

    // 模块名 → 中文
    const moduleNames = {
      ddns: "DDNS", cert: "SSL证书", ssl: "SSL证书", certificate: "SSL证书",
      nginx: "Nginx", proxy: "反向代理", port: "端口", pm2: "PM2进程",
      docker: "Docker", ssh: "SSH终端", cron: "定时任务", monitor: "系统监控",
      system: "系统", auth: "认证", log: "操作日志", db: "数据库",
      setup: "安装引导", config: "配置管理", notify: "通知"
    };
    const mod = segments[1] || "";
    const cn = moduleNames[mod] || mod;

    return `${action}${cn}`;
  }

  /** 截断字符串 */
  _trunc(s, max) {
    if (!s) return "";
    const str = typeof s === "string" ? s : JSON.stringify(s);
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  /** 脱敏：隐藏敏感字段 */
  _sanitizeBody(body) {
    if (!body || typeof body !== "object") return "";
    const clone = { ...body };
    const sensitive = ["password", "pass", "pwd", "secret", "token", "key", "apiKey", "accessKey", "accessSecret"];
    for (const k of sensitive) {
      if (clone[k]) clone[k] = "***";
      // 驼峰/下划线变体
      const camel = k.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (camel !== k && clone[camel]) clone[camel] = "***";
    }
    return this._trunc(clone, BODY_MAX_LEN);
  }

  middleware() {
    const self = this;

    // GET 静默路径：高频轮询不记录日志
    const silentGets = new Set([
      "/api/monitor", "/api/system", "/api/auth/status",
      "/api/dashboard", "/api/db/status", "/api/log/export"
    ]);

    return (req, res, next) => {
      const reqPath = (req.originalUrl || req.url).split("?")[0];

      // 静默 GET 轮询直接跳过
      if (req.method === "GET" && silentGets.has(reqPath)) {
        return next();
      }

      // 只记录 /api/ 路径
      if (!reqPath.startsWith("/api/")) return next();

      const start = Date.now();
      const clientIP = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
        || req.headers["x-real-ip"]
        || req.socket?.remoteAddress
        || "-";

      // 解析请求体
      let reqBody = "";
      if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        reqBody = self._sanitizeBody(req.body);
      }

      // 解析 query string
      const queryStr = req.originalUrl || req.url;
      const qIdx = queryStr.indexOf("?");
      const query = qIdx >= 0 ? self._trunc(queryStr.slice(qIdx + 1), 200) : "";

      const moduleRaw = reqPath.split("/").slice(2, 3)[0] || "system";
      const moduleMap = { cert: "ssl", certificate: "ssl" };
      const module = moduleMap[moduleRaw] || moduleRaw;

      // 动作描述
      const actionDesc = self._describeAction(req);

      const origJson = res.json.bind(res);
      res.json = function (obj) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        // 只有非成功 GET 和所有 POST/PUT/DELETE 记录
        if (req.method === "GET" && statusCode === 200 && obj && obj.success === true) {
          return origJson(obj);
        }

        // ---- 构建日志信息 ----
        let level = "info";
        let message = "";

        if (statusCode >= 500) {
          level = "error";
          message = obj?.message || "服务器内部错误";
        } else if (statusCode >= 400) {
          level = "warn";
          message = obj?.message || "请求被拒绝";
        } else if (obj && obj.success === true) {
          level = "success";
          // 成功时生成可读消息
          const moduleCN = { ddns: "DDNS", ssl: "SSL", nginx: "Nginx", proxy: "反向代理",
            port: "端口", pm2: "PM2", docker: "Docker", ssh: "SSH", cron: "定时任务",
            monitor: "监控", system: "系统", auth: "认证", log: "日志", db: "数据库",
            setup: "安装", notify: "通知" };
          const cn = moduleCN[module] || module;

          message = `${actionDesc}`;
          if (obj.message && obj.message !== "操作成功" && obj.message !== `${cn}操作成功`) {
            message += `: ${obj.message}`;
          } else {
            message += "成功";
          }
          if (reqBody) {
            message += ` (${reqBody})`;
          }
        } else {
          level = "warn";
          message = obj?.message || "操作失败";
        }

        // detail 包含扩展信息
        const detailParts = [`${duration}ms`, `IP:${clientIP}`, `HTTP ${statusCode}`];
        const respStr = self._trunc(obj, RESP_MAX_LEN);
        if (respStr) detailParts.push(`响应:${respStr}`);

        const detail = detailParts.join(" | ");

        // 服务端控制台日志（实时可见）
        const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false, timeZone: 'Asia/Shanghai' });
        const levelIcon = { success: "✅", info: "ℹ️", warn: "⚠️", error: "❌" }[level] || "📝";
        console.log(`${levelIcon} [${timestamp}] ${req.method} ${reqPath} → ${statusCode} (${duration}ms) | IP:${clientIP} | ${message}`);

        self.log({
          module,
          action: `${req.method} ${reqPath}`,
          level,
          message,
          detail,
          ip: clientIP,
          method: req.method,
          path: reqPath,
          query,
          body: reqBody,
          statusCode,
          duration,
          respSize: respStr.length
        });

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
