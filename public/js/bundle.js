(() => {
  // <stdin>
  var Utils = window.Utils = {
    notify(message, type = "info") {
      const bar = document.getElementById("notifyBar");
      if (!bar) return;
      bar.className = `notify-bar ${type}`;
      bar.textContent = message;
      bar.classList.remove("hidden");
      bar.classList.add("show");
      setTimeout(() => {
        bar.classList.remove("show");
        setTimeout(() => bar.classList.add("hidden"), 400);
      }, App.NOTIFY_DURATION);
    },
    openModal(title, body, footer) {
      const overlay = document.getElementById("modalOverlay");
      const titleEl = document.getElementById("modalTitle");
      const bodyEl = document.getElementById("modalBody");
      const footerEl = document.getElementById("modalFooter");
      if (overlay && titleEl && bodyEl) {
        titleEl.textContent = title;
        bodyEl.innerHTML = body || "";
        footerEl.innerHTML = footer || "";
        overlay.classList.remove("hidden");
      }
    },
    closeModal() {
      const overlay = document.getElementById("modalOverlay");
      if (overlay) overlay.classList.add("hidden");
    },
    confirm(title, message, onConfirm) {
      const footer = `<button class="btn btn-secondary" onclick="Utils.closeModal()">\u53D6\u6D88</button>
      <button class="btn btn-danger" id="modalConfirmBtn">\u786E\u8BA4</button>`;
      Utils.openModal(title, `<p>${message}</p>`, footer);
      document.getElementById("modalConfirmBtn")?.addEventListener("click", () => {
        Utils.closeModal();
        if (onConfirm) onConfirm();
      });
    },
    // 错误弹窗 - 支持一键复制
    showError(title, message, details) {
      const detailStr = details ? `

--- \u8BE6\u60C5 ---
${details}` : "";
      const displayMsg = (message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const displayDetails = (details || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const fullText = message + detailStr;
      const body = `
      <div style="margin-bottom:12px;padding:12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;max-height:360px;overflow-y:auto;font-size:13px;line-height:1.6;color:var(--text-primary);white-space:pre-wrap;word-break:break-all">${displayMsg}${details ? '\n\n<span style="color:var(--text-secondary);font-size:12px">---</span>\n<span style="color:var(--text-secondary);font-size:12px">' + displayDetails + "</span>" : ""}</div>
    `;
      const footer = `
      <button class="btn btn-secondary btn-sm" onclick="Utils.copyErrorText()">\u{1F4CB} \u4E00\u952E\u590D\u5236</button>
      <button class="btn btn-secondary" onclick="Utils.closeModal()">\u5173\u95ED</button>
    `;
      this._lastErrorText = fullText;
      Utils.openModal("\u274C " + (title || "\u9519\u8BEF"), body, footer);
    },
    copyErrorText() {
      const text = this._lastErrorText || "";
      if (!text) {
        this.notify("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u5185\u5BB9", "warn");
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => this.notify("\u2705 \u5DF2\u590D\u5236\u9519\u8BEF\u4FE1\u606F", "success")).catch(() => this.notify("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9", "error"));
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.notify("\u2705 \u9519\u8BEF\u4FE1\u606F\u5DF2\u590D\u5236", "success");
      }
    },
    // 显示操作日志弹窗（从后端 /api/log 查询）
    async showOpLog(module, title) {
      const body = `
      <div id="opLogLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">\u23F3 \u52A0\u8F7D\u4E2D...</div>
      <pre id="opLogContent" style="display:none;max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
      <div id="opLogSummary" style="display:none;margin-top:8px;font-size:11px;color:var(--text-secondary);"></div>
    `;
      const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyOpLog()">\u{1F4CB} \u4E00\u952E\u590D\u5236</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">\u5173\u95ED</button>`;
      Utils.openModal("\u{1F4CB} \u64CD\u4F5C\u65E5\u5FD7 - " + (title || module), body, footer);
      try {
        const api = window.Api;
        const res = await (api ? api.get("/log?module=" + encodeURIComponent(module || "all") + "&limit=200") : fetch("/api/log?module=" + encodeURIComponent(module || "all") + "&limit=200").then((r) => r.json()));
        const loaderEl = document.getElementById("opLogLoader");
        const contentEl = document.getElementById("opLogContent");
        const summaryEl = document.getElementById("opLogSummary");
        if (contentEl && loaderEl) {
          loaderEl.style.display = "none";
          contentEl.style.display = "block";
          if (res.success && res.data && res.data.list) {
            const list = res.data.list;
            if (list.length === 0) {
              contentEl.innerHTML = '<span style="color:var(--text-secondary);">\u6682\u65E0\u64CD\u4F5C\u65E5\u5FD7</span>';
              window._hspOpLogText = "";
            } else {
              const levelIcon = { success: "\u2705", info: "\u2139\uFE0F", warn: "\u26A0\uFE0F", error: "\u274C" };
              const lines = list.map((e) => {
                const time = e.timeCst || (e.time || "").replace("T", " ").substring(0, 19);
                const icon = levelIcon[e.level] || "\u{1F4DD}";
                const meta = [];
                if (e.ip && e.ip !== "-") meta.push(e.ip);
                if (e.duration) meta.push(e.duration + "ms");
                if (e.statusCode) meta.push("HTTP " + e.statusCode);
                const metaStr = meta.length ? " [" + meta.join(", ") + "]" : "";
                const bodyInfo = e.body ? "\n  \u{1F4E9} " + e.body : "";
                const detailStr = e.detail ? "\n  \u{1F4CE} " + e.detail : "";
                return `[${time}] ${icon} [${e.module}] ${e.action}${metaStr}: ${e.message}${bodyInfo}${detailStr}`;
              });
              contentEl.textContent = lines.join("\n");
              summaryEl.style.display = "block";
              summaryEl.textContent = `\u5171 ${res.data.total || list.length} \u6761\u64CD\u4F5C\u65E5\u5FD7`;
              window._hspOpLogText = lines.join("\n");
            }
          } else {
            contentEl.innerHTML = '<span style="color:var(--danger);">' + (res.message || "\u52A0\u8F7D\u5931\u8D25") + "</span>";
            window._hspOpLogText = "";
          }
        }
      } catch (err) {
        const loaderEl = document.getElementById("opLogLoader");
        if (loaderEl) loaderEl.textContent = "\u274C \u52A0\u8F7D\u5931\u8D25: " + err.message;
        window._hspOpLogText = "";
      }
    },
    copyOpLog() {
      const text = window._hspOpLogText || "";
      if (!text) {
        this.notify("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u65E5\u5FD7", "warn");
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => this.notify("\u2705 \u65E5\u5FD7\u5DF2\u590D\u5236", "success")).catch(() => this.notify("\u590D\u5236\u5931\u8D25", "error"));
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.notify("\u2705 \u65E5\u5FD7\u5DF2\u590D\u5236", "success");
      }
    },
    // 显示页面 API 诊断日志
    showPageDiagLog(title, pageFilter) {
      const filter = pageFilter || (window.Api ? Api._currentPage : "dashboard");
      const entries = window.Api ? Api.getDiagLog(filter) : [];
      if (entries.length === 0) {
        const allEntries = window.Api ? Api.getDiagLog() : [];
        if (allEntries.length === 0) {
          this.notify("\u6682\u65E0\u8BCA\u65AD\u65E5\u5FD7", "info");
          return;
        }
        const logText2 = allEntries.map((e) => `[${e.time}] [${e.page}] ${e.level.toUpperCase()} ${e.msg}`).join("\n");
        window._hspUtilsLog = logText2;
        const body2 = `
        <pre style="max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;">${logText2}</pre>
        <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);">\u5171 ${allEntries.length} \u6761 API \u8C03\u7528\u8BB0\u5F55\uFF08\u5168\u90E8\u9875\u9762\uFF09</div>
      `;
        const footer2 = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">\u{1F4CB} \u4E00\u952E\u590D\u5236</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">\u5173\u95ED</button>`;
        Utils.openModal("\u{1F4CB} API\u8BCA\u65AD - " + (title || ""), body2, footer2);
        return;
      }
      const logText = entries.map((e) => `[${e.time}] ${e.level.toUpperCase()} ${e.msg}`).join("\n");
      window._hspUtilsLog = logText;
      const body = `
      <pre style="max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;">${logText}</pre>
      <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);">\u5171 ${entries.length} \u6761 API \u8C03\u7528\u8BB0\u5F55</div>
    `;
      const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">\u{1F4CB} \u4E00\u952E\u590D\u5236</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">\u5173\u95ED</button>`;
      Utils.openModal("\u{1F4CB} API\u8BCA\u65AD - " + (title || ""), body, footer);
    },
    // 通用日志弹窗（供各页面使用）
    async showLog(apiPath, title) {
      const body = `
      <div id="utilsLogLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">\u23F3 \u52A0\u8F7D\u4E2D...</div>
      <pre id="utilsLogContent" style="display:none;max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
    `;
      const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">\u{1F4CB} \u4E00\u952E\u590D\u5236</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">\u5173\u95ED</button>`;
      Utils.openModal("\u{1F4CB} " + (title || "\u65E5\u5FD7"), body, footer);
      try {
        const api = window.Api;
        const res = await (api ? api.get(apiPath) : fetch(apiPath).then((r) => r.json()));
        const contentEl = document.getElementById("utilsLogContent");
        const loaderEl = document.getElementById("utilsLogLoader");
        if (contentEl && loaderEl) {
          loaderEl.style.display = "none";
          contentEl.style.display = "block";
          if (res.success && res.data) {
            contentEl.textContent = res.data.logs || "(\u7A7A)";
            window._hspUtilsLog = res.data.logs || "";
          } else {
            contentEl.innerHTML = '<span style="color:var(--danger)">' + (res.message || "\u52A0\u8F7D\u5931\u8D25") + "</span>";
            window._hspUtilsLog = "";
          }
        }
      } catch (err) {
        const loaderEl = document.getElementById("utilsLogLoader");
        if (loaderEl) loaderEl.textContent = "\u274C \u52A0\u8F7D\u5931\u8D25: " + err.message;
        window._hspUtilsLog = "";
      }
    },
    copyLog() {
      const text = window._hspUtilsLog || "";
      if (!text) {
        this.notify("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u65E5\u5FD7", "warn");
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => this.notify("\u2705 \u65E5\u5FD7\u5DF2\u590D\u5236", "success")).catch(() => this.notify("\u590D\u5236\u5931\u8D25", "error"));
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.notify("\u2705 \u65E5\u5FD7\u5DF2\u590D\u5236", "success");
      }
    }
  };
  window.closeModal = Utils.closeModal;
  window.openModal = Utils.openModal;
  document.addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay" || e.target.id === "modalClose") {
      Utils.closeModal();
    }
  });
  window.formatDate = function(dateStr) {
    if (!dateStr) return "--";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  };
  function escapeHtml(s) {
    return window.escapeHtml(s);
  }
  window.escapeHtml = function(s) {
    if (!s || typeof s !== "string") return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  var Api = {
    baseUrl: "/api",
    _diagLog: [],
    // 诊断日志 [{page, time, msg, level}]
    _currentPage: "dashboard",
    _diag(msg, level) {
      level = level || "info";
      const entry = { page: this._currentPage, time: (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }), msg, level };
      this._diagLog.push(entry);
      if (this._diagLog.length > 200) this._diagLog = this._diagLog.slice(-200);
      try {
        var d = document.getElementById("page-diag-content");
        if (d) d.innerHTML += '<br><span style="color:#38bdf8">\u{1F310} ' + msg + "</span>";
      } catch (e) {
      }
    },
    getDiagLog(filterPage) {
      if (filterPage) return this._diagLog.filter((e) => e.page === filterPage);
      return this._diagLog;
    },
    clearDiagLog() {
      this._diagLog = [];
    },
    _getToken() {
      return localStorage.getItem("hsp_token");
    },
    // opts.showError: true (default, modal) | false (page handles it) | 'notify' (toast only)
    async request(method, path, data, signal, opts) {
      opts = opts || {};
      const showError = opts.showError !== false;
      const headers = { "Content-Type": "application/json" };
      const token = this._getToken();
      if (token) headers["x-auth-token"] = token;
      const fetchOpts = {
        method,
        headers,
        credentials: "same-origin"
      };
      if (signal) fetchOpts.signal = signal;
      if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOpts.body = JSON.stringify(data);
      }
      const url = this.baseUrl + path;
      this._diag(method + " " + url + " | token=" + (token ? "\u2705" : "\u274C"));
      try {
        const res = await fetch(url, fetchOpts);
        const ct = res.headers.get("content-type") || "?";
        const ok = res.ok && ct.includes("json");
        this._diag(method + " " + url + " \u2192 HTTP " + res.status + " ct=" + ct, ok ? "success" : "warn");
        if (res.status === 401) {
          localStorage.removeItem("hsp_token");
          this._diag("\u{1F534} 401 \u672A\u767B\u5F55\uFF0C\u8DF3\u8F6C\u767B\u5F55\u9875", "error");
          window.location.href = "/login.html";
          return { success: false, message: "\u672A\u767B\u5F55" };
        }
        const text = await res.text();
        try {
          const result = JSON.parse(text);
          if (!result.success && showError && typeof Utils !== "undefined") {
            if (showError === "notify") {
              Utils.notify(result.message || "\u8BF7\u6C42\u5931\u8D25", "error");
            } else {
              Utils.showError("\u8BF7\u6C42\u5931\u8D25", result.message || "\u672A\u77E5\u9519\u8BEF", method + " " + url);
            }
          }
          return result;
        } catch (e) {
          this._diag("\u{1F7E0} JSON\u89E3\u6790\u5931\u8D25! \u54CD\u5E94\u4E0D\u662FJSON: " + text.substring(0, 100), "error");
          if (showError && typeof Utils !== "undefined") {
            Utils.showError("\u6570\u636E\u89E3\u6790\u5931\u8D25", "\u670D\u52A1\u5668\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94", "URL: " + url + "\nContent: " + text.substring(0, 500));
          }
          return { success: false, message: "Invalid JSON: " + text.substring(0, 80) };
        }
      } catch (err) {
        this._diag("\u{1F534} fetch\u5F02\u5E38: " + (err.name || "?") + " " + (err.message || ""), "error");
        if (showError && typeof Utils !== "undefined") {
          Utils.showError("\u7F51\u7EDC\u8BF7\u6C42\u5F02\u5E38", err.message || "\u8BF7\u6C42\u5931\u8D25", method + " " + url);
        }
        return { success: false, message: err.message };
      }
    },
    get(path, signal, opts) {
      return this.request("GET", path, null, signal, opts);
    },
    post(path, data, opts) {
      return this.request("POST", path, data, null, opts);
    },
    put(path, data, opts) {
      return this.request("PUT", path, data, null, opts);
    },
    del(path, data, opts) {
      return this.request("DELETE", path, data || {}, null, opts);
    }
  };
  window.Api = Api;
  var dbMode = "local";
  var dbConnected = false;
  var dbPreferred = "local";
  var dbFallbackReason = null;
  async function loadSettings() {
    try {
      const [cfgRes, dbRes] = await Promise.all([
        Api.get("/system/config"),
        Api.get("/db/status")
      ]);
      if (cfgRes.success && cfgRes.data) {
        const cfg = cfgRes.data;
        setVal("cfgAliKeyId", cfg.aliKeyId || "");
        setVal("cfgAliKeySecret", cfg.aliKeySecret || "");
        setVal("cfgPushplusToken", cfg.pushplusToken);
        var tokEl = document.getElementById("cfgPushplusToken");
        if (tokEl && cfg.pushplusToken === "\u5DF2\u914D\u7F6E") {
          tokEl.value = "";
          tokEl.placeholder = "\u2705 \u5DF2\u914D\u7F6E\uFF08\u4FEE\u6539\u8BF7\u91CD\u65B0\u8F93\u5165\uFF09";
          tokEl.style.borderColor = "var(--success)";
        } else if (tokEl) {
          tokEl.placeholder = "\u8F93\u5165 Token";
          tokEl.style.borderColor = "";
        }
        setVal("cfgAcmeEmail", cfg.acmeEmail || "");
        setVal("cfgAcmeDns", cfg.acmeDnsProvider || "alidns");
      }
      if (dbRes.success && dbRes.data) {
        dbMode = dbRes.data.mode || "local";
        dbConnected = dbRes.data.connected;
        dbPreferred = dbRes.data.preferred || dbMode;
        dbFallbackReason = dbRes.data.fallback || null;
      }
      renderDbStatus();
      setTimeout(function() {
        _loadSettingsOpLog("all");
      }, 300);
    } catch (err) {
      App.log("error", "\u52A0\u8F7D\u8BBE\u7F6E\u5931\u8D25:", err);
    }
  }
  function renderDbStatus() {
    const el = document.getElementById("dbStatusText");
    const warnEl = document.getElementById("dbFallbackNote");
    if (!el) return;
    if (dbPreferred === "mysql" && dbMode === "local") {
      el.innerHTML = '<span style="color:var(--warning)">\u26A0\uFE0F \u5DF2\u56DE\u9000\u5230 SQLite\uFF08MySQL \u4E0D\u53EF\u8FBE\uFF09</span>';
      if (warnEl) {
        var reason = dbFallbackReason ? "\uFF08" + dbFallbackReason + "\uFF09" : "";
        warnEl.innerHTML = '<div class="alert alert-warning" style="font-size:13px;padding:10px 14px;">\u{1F4A1} \u7CFB\u7EDF\u504F\u597D\u4F7F\u7528 MySQL \u5B58\u50A8\uFF0C\u4F46\u5F53\u524D MySQL \u4E0D\u53EF\u8FBE' + reason + '\uFF0C\u5DF2\u81EA\u52A8\u56DE\u9000\u5230\u672C\u5730 SQLite\u3002MySQL \u6062\u590D\u540E<a href="#" onclick="location.reload()">\u91CD\u542F\u670D\u52A1</a>\u5373\u53EF\u81EA\u52A8\u5207\u6362\u3002</div>';
        warnEl.style.display = "block";
      }
      var migrateSection = document.getElementById("dbMigrateSection");
      var btnSwitch = document.getElementById("btnDbSwitch");
      if (migrateSection) migrateSection.style.display = "none";
      if (btnSwitch) btnSwitch.style.display = "none";
      return;
    }
    if (warnEl) warnEl.style.display = "none";
    if (dbMode === "mysql" && dbConnected) {
      el.innerHTML = '<span style="color:var(--success)">\u2705 MySQL \u5DF2\u8FDE\u63A5</span>';
      const migrateSection2 = document.getElementById("dbMigrateSection");
      const btnSwitch2 = document.getElementById("btnDbSwitch");
      if (migrateSection2) migrateSection2.style.display = "none";
      if (btnSwitch2) btnSwitch2.style.display = "inline-flex";
    } else if (dbMode === "mysql" && !dbConnected) {
      el.innerHTML = '<span style="color:var(--warning)">\u26A0\uFE0F MySQL \u8FDE\u63A5\u65AD\u5F00</span>';
      const migrateSection2 = document.getElementById("dbMigrateSection");
      const btnSwitch2 = document.getElementById("btnDbSwitch");
      if (migrateSection2) migrateSection2.style.display = "none";
      if (btnSwitch2) btnSwitch2.style.display = "none";
    } else {
      el.innerHTML = '<span style="color:var(--text-secondary)">\u{1F5C4}\uFE0F SQLite \u672C\u5730\u5B58\u50A8</span>';
      const migrateSection2 = document.getElementById("dbMigrateSection");
      const btnSwitch2 = document.getElementById("btnDbSwitch");
      if (migrateSection2) migrateSection2.style.display = "block";
      if (btnSwitch2) btnSwitch2.style.display = "none";
    }
  }
  window.toggleDbConfig = () => {
    if (dbMode === "mysql" && dbConnected) {
      Utils.confirm("\u65AD\u5F00 MySQL", "\u786E\u5B9A\u65AD\u5F00\u6570\u636E\u5E93\u8FDE\u63A5\u5E76\u5207\u56DE SQLite \u6A21\u5F0F\u5417\uFF1F<br><small>\u6570\u636E\u4ECD\u5728 MySQL \u4E2D\uFF0C\u4E0D\u4F1A\u4E22\u5931</small>", async () => {
        Utils.notify("\u6B63\u5728\u65AD\u5F00\u8FDE\u63A5...", "info");
        const res = await Api.post("/db/disconnect");
        if (res.success) {
          dbMode = "local";
          dbConnected = false;
          renderDbStatus();
          Utils.notify("\u5DF2\u5207\u56DE SQLite \u672C\u5730\u5B58\u50A8\u6A21\u5F0F", "success");
        } else {
          Utils.notify(res.message || "\u64CD\u4F5C\u5931\u8D25", "error");
        }
      });
      return;
    }
    showDbConfigModal();
  };
  window.showDbConfigModal = () => {
    const body = `
    <div class="form-group">
      <label>MySQL \u4E3B\u673A</label>
      <input type="text" id="dbMigHost" class="form-input" value="192.168.100.110" placeholder="127.0.0.1">
    </div>
    <div class="form-group">
      <label>\u7AEF\u53E3</label>
      <input type="number" id="dbMigPort" class="form-input" value="3306" placeholder="3306">
    </div>
    <div class="form-group">
      <label>\u7528\u6237\u540D</label>
      <input type="text" id="dbMigUser" class="form-input" value="root" placeholder="root">
    </div>
    <div class="form-group">
      <label>\u5BC6\u7801</label>
      <input type="password" id="dbMigPass" class="form-input" placeholder="MySQL \u5BC6\u7801">
    </div>
    <div class="form-group">
      <label>\u6570\u636E\u5E93\u540D</label>
      <input type="text" id="dbMigName" class="form-input" value="server_panel" placeholder="server_panel">
    </div>
    <div id="dbMigResult" style="font-size:12px;margin-top:8px;min-height:20px"></div>
  `;
    const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">\u53D6\u6D88</button>
    <button class="btn btn-info" id="btnDbTest">\u{1F9EA} \u6D4B\u8BD5\u8FDE\u63A5</button>
    <button class="btn btn-success" id="btnDbConnect" onclick="migrateToMySQL()">\u{1F680} \u8FDE\u63A5\u5E76\u8FC1\u79FB</button>
  `;
    Utils.openModal("\u{1F517} \u8FC1\u79FB\u81F3 MySQL", body, footer);
    document.getElementById("btnDbTest").addEventListener("click", async () => {
      const host = document.getElementById("dbMigHost").value.trim();
      const port = document.getElementById("dbMigPort").value.trim() || "3306";
      const user = document.getElementById("dbMigUser").value.trim();
      const password = document.getElementById("dbMigPass").value;
      const database = document.getElementById("dbMigName").value.trim() || "server_panel";
      const resultEl = document.getElementById("dbMigResult");
      if (!host || !user) {
        resultEl.textContent = "\u274C \u8BF7\u8F93\u5165\u4E3B\u673A\u548C\u7528\u6237\u540D";
        return;
      }
      resultEl.textContent = "\u{1F504} \u6D4B\u8BD5\u8FDE\u63A5...";
      const res = await Api.post("/db/test", { host, port: parseInt(port), user, password, database });
      resultEl.textContent = res.success ? res.dbExists ? `\u2705 \u8FDE\u63A5\u6210\u529F\uFF01\u6570\u636E\u5E93"${database}"\u5DF2\u5B58\u5728` : `\u2705 \u8FDE\u63A5\u6210\u529F\uFF01\u6570\u636E\u5E93"${database}"\u5C06\u81EA\u52A8\u521B\u5EFA` : "\u274C " + (res.message || "\u8FDE\u63A5\u5931\u8D25");
    });
  };
  window.migrateToMySQL = async () => {
    const host = document.getElementById("dbMigHost").value.trim();
    const port = document.getElementById("dbMigPort").value.trim() || "3306";
    const user = document.getElementById("dbMigUser").value.trim();
    const password = document.getElementById("dbMigPass").value;
    const database = document.getElementById("dbMigName").value.trim() || "server_panel";
    const resultEl = document.getElementById("dbMigResult");
    if (!host || !user) {
      Utils.notify("\u8BF7\u8F93\u5165\u6570\u636E\u5E93\u8FDE\u63A5\u4FE1\u606F", "error");
      return;
    }
    resultEl.textContent = "\u{1F504} \u6B63\u5728\u8FDE\u63A5 MySQL \u5E76\u521D\u59CB\u5316...";
    const res = await Api.post("/db/connect", { host, port: parseInt(port), user, password, database });
    if (!res.success) {
      resultEl.textContent = "\u274C " + (res.message || "\u8FDE\u63A5\u5931\u8D25");
      return;
    }
    resultEl.textContent = "\u{1F504} \u6B63\u5728\u8FC1\u79FB\u6570\u636E...";
    const migRes = await Api.post("/db/migrate");
    if (migRes.success) {
      dbMode = "mysql";
      dbConnected = true;
      renderDbStatus();
      resultEl.textContent = "\u2705 \u8FC1\u79FB\u5B8C\u6210\uFF01" + (migRes.data?.migrated?.join(", ") || "");
      Utils.notify("\u2705 MySQL \u8FC1\u79FB\u5B8C\u6210", "success");
      setTimeout(() => Utils.closeModal(), 2e3);
    } else {
      resultEl.textContent = "\u274C " + (migRes.message || "\u8FC1\u79FB\u5931\u8D25");
    }
  };
  window.testDbConnection = async () => {
    const host = document.getElementById("dbHost")?.value.trim() || "";
    const port = document.getElementById("dbPort")?.value.trim() || "3306";
    const user = document.getElementById("dbUser")?.value.trim() || "";
    const password = document.getElementById("dbPass")?.value || "";
    const database = document.getElementById("dbName")?.value.trim() || "server_panel";
    const resultEl = document.getElementById("dbTestResult");
    if (!host || !user) {
      if (resultEl) {
        resultEl.textContent = "\u274C \u8BF7\u8F93\u5165\u4E3B\u673A\u548C\u7528\u6237\u540D";
        resultEl.className = "test-result error";
      }
      return;
    }
    if (resultEl) {
      resultEl.textContent = "\u{1F504} \u6D4B\u8BD5\u8FDE\u63A5...";
      resultEl.className = "test-result info";
    }
    const res = await Api.post("/db/test", { host, port: parseInt(port) || 3306, user, password, database });
    if (res.success) {
      if (resultEl) {
        resultEl.textContent = res.dbExists ? `\u2705 \u8FDE\u63A5\u6210\u529F\uFF01\u6570\u636E\u5E93 "${database}" \u5DF2\u5B58\u5728` : `\u2705 \u8FDE\u63A5\u6210\u529F\uFF01\u6570\u636E\u5E93 "${database}" \u5C06\u5728\u8FDE\u63A5\u65F6\u81EA\u52A8\u521B\u5EFA`;
        resultEl.className = "test-result success";
      }
    } else {
      if (resultEl) {
        resultEl.textContent = "\u274C " + (res.message || "\u8FDE\u63A5\u5931\u8D25");
        resultEl.className = "test-result error";
      }
    }
  };
  window.connectDb = async () => {
    const host = document.getElementById("dbHost")?.value.trim() || "";
    const port = document.getElementById("dbPort")?.value.trim() || "3306";
    const user = document.getElementById("dbUser")?.value.trim() || "";
    const password = document.getElementById("dbPass")?.value || "";
    const database = document.getElementById("dbName")?.value.trim() || "server_panel";
    const resultEl = document.getElementById("dbTestResult");
    const btn = document.getElementById("btnDbConnect");
    if (!host || !user) {
      Utils.notify("\u8BF7\u8F93\u5165\u6570\u636E\u5E93\u8FDE\u63A5\u4FE1\u606F", "error");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> \u8FDE\u63A5\u4E2D...';
    }
    Utils.notify("\u6B63\u5728\u8FDE\u63A5 MySQL \u5E76\u521D\u59CB\u5316\u8868\u7ED3\u6784...", "info");
    const res = await Api.post("/db/connect", { host, port: parseInt(port) || 3306, user, password, database });
    if (res.success) {
      dbMode = "mysql";
      dbConnected = true;
      renderDbStatus();
      Utils.notify("\u2705 MySQL \u8FDE\u63A5\u6210\u529F\uFF01\u73B0\u5728\u53EF\u4EE5\u8FC1\u79FB\u6570\u636E", "success");
      document.getElementById("cardDbConfig").style.display = "none";
      const migrateBtn = document.getElementById("btnMigrate");
      if (migrateBtn) migrateBtn.style.display = "inline-flex";
    } else {
      if (resultEl) {
        resultEl.textContent = "\u274C " + (res.message || "\u8FDE\u63A5\u5931\u8D25");
        resultEl.className = "test-result error";
      }
      Utils.notify(res.message || "\u8FDE\u63A5\u5931\u8D25", "error");
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "\u{1F517} \u8FDE\u63A5 MySQL";
    }
  };
  window.startMigration = async () => {
    Utils.confirm("\u6570\u636E\u8FC1\u79FB", "\u786E\u5B9A\u5C06\u672C\u5730 JSON \u6570\u636E\u8FC1\u79FB\u5230 MySQL \u5417\uFF1F<br><small>\u8FC1\u79FB\u4E0D\u4F1A\u5220\u9664\u672C\u5730\u6587\u4EF6\uFF0C\u6570\u636E\u4F1A\u5408\u5E76\u5230 MySQL</small>", async () => {
      Utils.notify("\u6B63\u5728\u8FC1\u79FB\u6570\u636E...", "info");
      const res = await Api.post("/db/migrate");
      if (res.success && res.data) {
        const d = res.data;
        let msg = "\u2705 \u8FC1\u79FB\u5B8C\u6210";
        if (d.migrated.length > 0) msg += "\n\u5DF2\u8FC1\u79FB: " + d.migrated.join(", ");
        if (d.errors.length > 0) msg += "\n\u5931\u8D25: " + d.errors.join(", ");
        if (d.skipped.length > 0) msg += "\n\u8DF3\u8FC7: " + d.skipped.join(", ");
        Utils.notify(msg, "success");
      } else {
        Utils.notify(res.message || "\u8FC1\u79FB\u5931\u8D25", "error");
      }
    });
  };
  window.showSettingsOpLog = () => {
    var filterEl = document.getElementById("opLogModuleFilter");
    var filter = filterEl ? filterEl.value : "all";
    if (!filter || filter === "all") filter = "all";
    _loadSettingsOpLog(filter);
  };
  async function _loadSettingsOpLog(module) {
    var logDiv = document.getElementById("opLogContainer");
    if (!logDiv) return;
    try {
      var params = "limit=8";
      if (module && module !== "all") params += "&module=" + module;
      var res = await Api.get("/log?" + params, null, { showError: false });
      if (!res.success || !res.data) {
        logDiv.innerHTML = '<span style="color:#64748b;">\u6682\u65E0\u64CD\u4F5C\u8BB0\u5F55</span>';
        return;
      }
      var entries = res.data.list || res.data.records || res.data.entries || [];
      if (!Array.isArray(entries) || entries.length === 0) {
        logDiv.innerHTML = '<span style="color:#64748b;">\u6682\u65E0\u64CD\u4F5C\u8BB0\u5F55</span>';
        return;
      }
      var recent = entries.slice(0, 8);
      logDiv.innerHTML = recent.map(function(e) {
        var time = e.timeCst || "";
        if (!time) {
          time = e.time || e.timestamp || e.createdAt || "";
          if (time && time.length > 16) time = new Date(time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
        } else {
          var m = time.match(/(\d{2}:\d{2}:\d{2})/);
          if (m) time = m[1].slice(0, 5);
        }
        var modIcon = { ddns: "\u{1F4E1}", ssl: "\u{1F512}", nginx: "\u{1F5A5}\uFE0F", proxy: "\u{1F504}", port: "\u{1F50C}", pm2: "\u26A1", docker: "\u{1F433}", ssh: "\u{1F4BB}", system: "\u2699\uFE0F" };
        var icon = modIcon[e.module] || "\u{1F4CC}";
        var text = e.message || e.action || e.desc || "";
        var meta = [];
        if (e.ip && e.ip !== "-") meta.push(escapeHtml(e.ip));
        if (e.duration) meta.push(e.duration + "ms");
        var metaStr = meta.length ? '<span style="color:#9ca3af;font-size:10px">[' + meta.join(", ") + "]</span> " : "";
        return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #e5e7eb;font-size:11px"><span style="color:#6b7280;font-family:Menlo,monospace">' + escapeHtml(time || "--:--") + "</span><span>" + icon + "</span>" + metaStr + '<span style="flex:1">' + escapeHtml(text) + "</span></div>";
      }).join("");
    } catch (e) {
      logDiv.innerHTML = '<span style="color:var(--danger)">\u52A0\u8F7D\u5931\u8D25: ' + (e.message || "") + "</span>";
    }
  }
  function renderDiagLog() {
    var container = document.getElementById("diagLogContainer");
    if (!container) return;
    var filter = document.getElementById("diagPageFilter")?.value || "all";
    var logs = Api.getDiagLog(filter === "all" ? null : filter);
    if (!logs || logs.length === 0) {
      container.innerHTML = '<span style="color:var(--text-secondary);">\u6682\u65E0\u8BCA\u65AD\u65E5\u5FD7</span>';
      return;
    }
    var levelColors = { success: "#22c55e", warn: "#f59e0b", error: "#c41e3a", info: "#6b7280" };
    var pageLabels = { dashboard: "\u{1F4CA}", ddns: "\u{1F4E1}", ssl: "\u{1F512}", nginx: "\u{1F5A5}\uFE0F", proxy: "\u{1F504}", port: "\u{1F50C}", pm2: "\u26A1", docker: "\u{1F433}", ssh: "\u{1F4BB}", settings: "\u2699\uFE0F" };
    container.innerHTML = logs.map(function(e) {
      var color = levelColors[e.level] || "#6b7280";
      var label = pageLabels[e.page] || "\u2753";
      return '<span style="color:' + color + '">' + e.time + " " + label + " " + e.msg + "</span>";
    }).join("<br>");
    container.scrollTop = container.scrollHeight;
  }
  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el && value !== void 0) el.value = value;
  }
  document.addEventListener("DOMContentLoaded", () => {
    const saveBtn = document.getElementById("btnSaveSettings");
    const testBtn = document.getElementById("btnTestPushplus");
    const reinstallBtn = document.getElementById("btnReinstall");
    const exportBtn = document.getElementById("btnExportData");
    const importBtn = document.getElementById("btnImportData");
    const restartBtn = document.getElementById("btnRestartService");
    if (saveBtn) saveBtn.addEventListener("click", async () => {
      const data = {
        aliKeyId: document.getElementById("cfgAliKeyId")?.value || "",
        aliKeySecret: document.getElementById("cfgAliKeySecret")?.value || "",
        pushplusToken: document.getElementById("cfgPushplusToken")?.value || "",
        acmeEmail: document.getElementById("cfgAcmeEmail")?.value || "",
        acmeDns: document.getElementById("cfgAcmeDns")?.value || "alidns"
      };
      const res = await Api.post("/system/config", data);
      Utils.notify(res.message || "\u4FDD\u5B58\u5B8C\u6210", res.success ? "success" : "error");
    });
    if (testBtn) testBtn.addEventListener("click", async () => {
      Utils.notify("\u6B63\u5728\u53D1\u9001\u6D4B\u8BD5\u63A8\u9001...", "info");
      const res = await Api.post("/notify/test", {
        token: document.getElementById("cfgPushplusToken")?.value || ""
      });
      Utils.notify(res.message || "\u63A8\u9001\u5B8C\u6210", res.success ? "success" : "error");
    });
    if (reinstallBtn) reinstallBtn.addEventListener("click", () => {
      Utils.confirm(
        "\u26A0\uFE0F \u91CD\u88C5\u5411\u5BFC",
        '<div style="text-align:left"><strong style="color:var(--danger)">\u91CD\u88C5\u5C06\u6E05\u9664\u6240\u6709\u6570\u636E\uFF01</strong><br><br>\u8BF7\u5148\u5BFC\u51FA\u6570\u636E\u5907\u4EFD\uFF0C\u518D\u6267\u884C\u91CD\u88C5\u3002<br><br>\u91CD\u88C5\u540E\u5C06\u8DF3\u8F6C\u5230\u5B89\u88C5\u5411\u5BFC\u9875\u9762\u91CD\u65B0\u914D\u7F6E\u7CFB\u7EDF\u3002</div>',
        async () => {
          Utils.notify("\u6B63\u5728\u6E05\u9664\u6570\u636E...", "info");
          try {
            const res = await Api.post("/setup/reset");
            if (res.success) {
              Utils.notify("\u7CFB\u7EDF\u5DF2\u91CD\u7F6E\uFF0C\u5373\u5C06\u8DF3\u8F6C...", "success");
              setTimeout(() => {
                window.location.href = "/install.html";
              }, 1500);
            } else {
              Utils.notify(res.message || "\u91CD\u7F6E\u5931\u8D25", "error");
            }
          } catch (e) {
            window.location.href = "/install.html";
          }
        },
        "\u786E\u8BA4\u91CD\u88C5",
        "\u53D6\u6D88"
      );
    });
    if (exportBtn) exportBtn.addEventListener("click", async () => {
      Utils.notify("\u6B63\u5728\u5BFC\u51FA\u6570\u636E...", "info");
      const token = localStorage.getItem("hsp_token");
      const a = document.createElement("a");
      a.href = "/api/db/export?token=" + encodeURIComponent(token);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    if (importBtn) importBtn.addEventListener("click", () => {
      const body = `
      <div class="form-group">
        <label>\u9009\u62E9\u6570\u636E\u5E93\u6587\u4EF6\uFF08.sql / .db / .json\uFF09</label>
        <input type="file" id="importFileInput" accept=".sql,.db,.json" class="form-input" style="padding:8px">
        <small style="color:var(--text-secondary)">\u652F\u6301 SQLite .db / MySQL .sql / JSON \u5907\u4EFD\u6587\u4EF6</small>
      </div>
      <div id="importResult" style="font-size:12px;margin-top:8px;min-height:20px"></div>
    `;
      const footer = `
      <button class="btn btn-secondary" onclick="Utils.closeModal()">\u53D6\u6D88</button>
      <button class="btn btn-success" id="btnImportConfirm">\u{1F4E5} \u5BFC\u5165</button>
    `;
      Utils.openModal("\u{1F4E5} \u5BFC\u5165\u6570\u636E", body, footer);
      document.getElementById("btnImportConfirm").addEventListener("click", async () => {
        const fileInput = document.getElementById("importFileInput");
        const file = fileInput?.files?.[0];
        if (!file) {
          Utils.notify("\u8BF7\u9009\u62E9\u6587\u4EF6", "error");
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        Utils.notify("\u6B63\u5728\u5BFC\u5165...", "info");
        try {
          const token = localStorage.getItem("hsp_token");
          const res = await fetch("/api/db/import", {
            method: "POST",
            headers: { "x-auth-token": token },
            body: formData
          });
          const json = await res.json();
          if (json.success) {
            document.getElementById("importResult").innerHTML = "\u2705 " + json.message;
            Utils.notify("\u2705 \u5BFC\u5165\u6210\u529F", "success");
            setTimeout(() => {
              Utils.closeModal();
              loadSettings();
            }, 1500);
          } else {
            document.getElementById("importResult").innerHTML = "\u274C " + (json.message || "\u5BFC\u5165\u5931\u8D25");
          }
        } catch (e) {
          document.getElementById("importResult").innerHTML = "\u274C " + e.message;
        }
      });
    });
    if (restartBtn) restartBtn.addEventListener("click", () => {
      Utils.confirm(
        "\u{1F504} \u91CD\u542F\u670D\u52A1",
        '<div style="text-align:left">\u5373\u5C06\u91CD\u542F\u5BB6\u5EAD\u670D\u52A1\u5668\u7BA1\u7406\u9762\u677F\u3002<br><br><strong>\u91CD\u542F\u671F\u95F4\u7EA63-5\u79D2\u65E0\u6CD5\u8BBF\u95EE</strong>\uFF0C\u5B8C\u6210\u540E\u8BF7\u5237\u65B0\u9875\u9762\u3002</div>',
        async () => {
          try {
            restartBtn.disabled = true;
            restartBtn.textContent = "\u23F3 \u91CD\u542F\u4E2D...";
            await Api.post("/system/restart");
            Utils.notify("\u670D\u52A1\u5DF2\u91CD\u542F\uFF0C3\u79D2\u540E\u81EA\u52A8\u5237\u65B0...", "success");
            let retries = 0;
            const checkInterval = setInterval(async () => {
              retries++;
              try {
                const res = await fetch("/api/system/uptime");
                if (res.ok) {
                  clearInterval(checkInterval);
                  window.location.reload();
                }
              } catch (e) {
                if (retries > 15) {
                  clearInterval(checkInterval);
                  Utils.notify("\u670D\u52A1\u672A\u81EA\u52A8\u6062\u590D\uFF0C\u8BF7\u624B\u52A8\u5237\u65B0\u9875\u9762", "error");
                  restartBtn.disabled = false;
                  restartBtn.textContent = "\u{1F504} \u91CD\u542F\u670D\u52A1";
                }
              }
            }, 1e3);
          } catch (e) {
            Utils.notify("\u91CD\u542F\u5931\u8D25: " + e.message, "error");
            restartBtn.disabled = false;
            restartBtn.textContent = "\u{1F504} \u91CD\u542F\u670D\u52A1";
          }
        },
        "\u786E\u8BA4\u91CD\u542F",
        "\u53D6\u6D88"
      );
    });
    const _updateSettingsUptime = async () => {
      try {
        const res = await Api.get("/system/uptime");
        if (res.success && res.data) {
          const seconds = Math.floor(res.data.uptime);
          const d = Math.floor(seconds / 86400);
          const h = Math.floor(seconds % 86400 / 3600);
          const m = Math.floor(seconds % 3600 / 60);
          const s = seconds % 60;
          const parts = [];
          if (d > 0) parts.push(d + "\u5929");
          if (h > 0) parts.push(h + "\u65F6");
          parts.push(m + "\u5206" + s + "\u79D2");
          const el = document.getElementById("settingsUptime");
          if (el) el.textContent = parts.join(" ");
        }
      } catch (e) {
      }
    };
    _updateSettingsUptime();
    setInterval(_updateSettingsUptime, 3e4);
    if (loadSettings) loadSettings();
  });
  window.exportOpLog = async (format) => {
    var filterEl = document.getElementById("opLogModuleFilter");
    var module = filterEl ? filterEl.value : "all";
    if (!module || module === "all") module = "all";
    try {
      Utils.notify("\u6B63\u5728\u5BFC\u51FA\u65E5\u5FD7...", "info");
      var token = localStorage.getItem("hsp_token");
      var res = await fetch("/api/log/export?limit=100000&format=" + format + (module !== "all" ? "&module=" + module : ""), {
        headers: { "x-auth-token": token }
      });
      if (!res.ok) {
        var err = await res.json().catch(function() {
          return { message: "\u5BFC\u51FA\u5931\u8D25" };
        });
        Utils.notify("\u5BFC\u51FA\u5931\u8D25: " + (err.message || res.status), "error");
        return;
      }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var now = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = "hsp-oplog-" + now + "." + format;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Utils.notify("\u2705 \u65E5\u5FD7\u5DF2\u5BFC\u51FA (." + format + ")", "success");
    } catch (e) {
      Utils.notify("\u5BFC\u51FA\u5931\u8D25: " + (e.message || ""), "error");
    }
  };
  window.exportDiagLog = () => {
    var logs = Api.getDiagLog(null);
    if (!logs || logs.length === 0) {
      Utils.notify("\u6682\u65E0\u8BCA\u65AD\u65E5\u5FD7\u53EF\u5BFC\u51FA", "error");
      return;
    }
    var text = logs.map(function(e) {
      return e.time + " | " + (e.page || "?") + " | " + (e.level || "info") + " | " + e.msg;
    }).join("\n");
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var now = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = "hsp-diaglog-" + now + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Utils.notify("\u2705 \u8BCA\u65AD\u65E5\u5FD7\u5DF2\u5BFC\u51FA (.txt)", "success");
  };
  var App = window.App = {
    version: "0.7.1-beta",
    NOTIFY_DURATION: 3e3,
    _currentPage: "dashboard",
    _pending: {},
    isPending(key) {
      if (this._pending[key]) return true;
      this._pending[key] = true;
      setTimeout(() => delete this._pending[key], 5e3);
      return false;
    },
    log(level, ...args) {
      if (App.LOG_LEVELS[App.LOG_LEVEL] >= App.LOG_LEVELS[level]) {
        console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[${level.toUpperCase()}]`, ...args);
      }
    },
    LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3, none: 4 },
    LOG_LEVEL: "info"
  };
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const navMap = { ddns: "ddns", ssl: "ssl", nginx: "nginx", port: "port", pm2: "pm2", cron: "cron", docker: "docker", ssh: "ssh", settings: "settings" };
    const pageName = navMap[hash];
    if (!pageName) return;
    document.querySelectorAll(".nav-item").forEach((n) => {
      n.classList.toggle("active", n.dataset.page === pageName);
    });
    const pageMap = {};
    document.querySelectorAll(".page").forEach((p) => {
      if (p.id && p.id.startsWith("page-")) pageMap[p.id.replace("page-", "")] = p;
    });
    Object.values(pageMap).forEach((p) => p.classList.add("hidden"));
    const target = pageMap[pageName];
    if (target) {
      target.classList.remove("hidden");
      if (typeof Api !== "undefined") Api._currentPage = pageName;
      App._currentPage = pageName;
      try {
        sessionStorage.setItem("hsp_page", pageName);
      } catch (e) {
      }
      (App.pageLoaders || {})[pageName]?.();
    }
    history.replaceState(null, "", window.location.pathname);
  });
  document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initSidebarToggle();
    initUserMenu();
    _topbarPollStart();
    var hash = window.location.hash.replace("#", "");
    var navMap = { ddns: "ddns", ssl: "ssl", nginx: "nginx", port: "port", pm2: "pm2", cron: "cron", docker: "docker", ssh: "ssh", settings: "settings" };
    var restorePage = hash ? navMap[hash] : null;
    if (!restorePage) {
      try {
        restorePage = sessionStorage.getItem("hsp_page");
      } catch (e) {
      }
    }
    if (restorePage && restorePage !== "dashboard" && restorePage !== "home") {
      var targetNav = document.querySelector('.nav-item[data-page="' + restorePage + '"]');
      if (targetNav) {
        targetNav.click();
        return;
      }
    }
    loadDashboard();
    loadSettings();
  });
  function initSidebarToggle() {
    const btn = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");
    if (btn && sidebar) {
      btn.addEventListener("click", () => sidebar.classList.toggle("collapsed"));
      document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && !btn.contains(e.target) && window.innerWidth <= 768) {
          sidebar.classList.add("collapsed");
        }
      });
    }
  }
  function initUserMenu() {
    var btn = document.getElementById("topbarUserBtn");
    var dropdown = document.getElementById("userDropdown");
    if (!btn || !dropdown) return;
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", function() {
      dropdown.classList.add("hidden");
    });
    var logoutLink = document.getElementById("menuLogout");
    if (logoutLink) {
      logoutLink.addEventListener("click", function(e) {
        e.preventDefault();
        if (confirm("\u786E\u5B9A\u8981\u9000\u51FA\u767B\u5F55\u5417\uFF1F")) {
          localStorage.removeItem("hsp_token");
          window.location.href = "/login.html";
        }
      });
    }
  }
  function initNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const pageMap = {};
    document.querySelectorAll(".page").forEach((p) => {
      if (p.id && p.id.startsWith("page-")) pageMap[p.id.replace("page-", "")] = p;
    });
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        var now = Date.now();
        if (App._lastNavClick && now - App._lastNavClick < 300) return;
        App._lastNavClick = now;
        const pageName = item.dataset.page;
        var prevPage = typeof Api !== "undefined" ? Api._currentPage : App._currentPage;
        if (prevPage === pageName) return;
        navItems.forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
        Object.values(pageMap).forEach((p) => p.classList.add("hidden"));
        const target = pageMap[pageName];
        if (target) target.classList.remove("hidden");
        App._currentPage = pageName;
        if (typeof Api !== "undefined") Api._currentPage = pageName;
        try {
          sessionStorage.setItem("hsp_page", pageName);
        } catch (e2) {
        }
        (App.pageLoaders || {})[pageName]?.();
      });
    });
  }
  App.pageLoaders = {
    dashboard: () => loadDashboard(),
    ddns: () => _ensurePage("ddns", window.loadDdns),
    ssl: () => _ensurePage("cert", "ssl", window.loadCert),
    nginx: () => _ensurePage("nginx", window.loadNginxPage),
    port: () => _ensurePage("port", window.loadPort),
    pm2: () => _ensurePage("pm2", window.loadPM2),
    cron: () => _ensurePage("cron", window.loadCron),
    docker: () => _ensurePage("docker", window.loadDocker),
    ssh: () => _ensurePage("ssh", window.loadSSH),
    settings: () => loadSettings()
  };
  function _ensurePage(name, mapKey, fn) {
    if (typeof mapKey !== "string") {
      fn = mapKey;
      mapKey = name;
    }
    if (typeof fn === "function") return fn();
    const id = "hsp-page-" + name;
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = "/js/pages/" + name + ".min.js?v=" + (document.querySelector('meta[name="build-id"]')?.content || "");
    s.onload = () => {
      const loader = App.pageLoaders?.[mapKey];
      if (loader) setTimeout(loader, 0);
    };
    s.onerror = () => console.warn("[App] \u9875\u9762\u811A\u672C\u52A0\u8F7D\u5931\u8D25:", name);
    document.head.appendChild(s);
  }
  var _origInitNav = initNavigation;
  initNavigation = function() {
    _origInitNav();
    document.querySelectorAll(".nav-item").forEach(function(item) {
      item.addEventListener("click", function() {
        var page = item.dataset.page;
        if (page !== "dashboard") {
          if (typeof _dashMonTimer !== "undefined" && _dashMonTimer) {
            clearInterval(_dashMonTimer);
            _dashMonTimer = null;
          }
        } else {
          if (!_dashMonTimer && typeof _dashboardMonitorFetch === "function") {
            _dashboardMonitorFetch();
            _dashMonTimer = setInterval(_dashboardMonitorFetch, 5e3);
          }
        }
        if (window.__SSH && window.__SSH._onPageSwitch) {
          window.__SSH._onPageSwitch(page === "ssh");
        }
      });
    });
  };
  window.switchLogTab = function(tab) {
    var opPanel = document.getElementById("logPanelOplog");
    var diagPanel = document.getElementById("logPanelDiag");
    var tabs = document.querySelectorAll(".log-tab");
    tabs.forEach(function(t) {
      t.classList.remove("active");
      t.style.color = "var(--text-secondary)";
      t.style.borderBottomColor = "transparent";
    });
    if (tab === "oplog") {
      if (opPanel) opPanel.style.display = "";
      if (diagPanel) diagPanel.style.display = "none";
      var opTab = document.querySelector('[data-log-tab="oplog"]');
      if (opTab) {
        opTab.classList.add("active");
        opTab.style.color = "var(--brand)";
        opTab.style.borderBottomColor = "var(--brand)";
      }
    } else {
      if (opPanel) opPanel.style.display = "none";
      if (diagPanel) diagPanel.style.display = "";
      var diagTab = document.querySelector('[data-log-tab="diag"]');
      if (diagTab) {
        diagTab.classList.add("active");
        diagTab.style.color = "var(--brand)";
        diagTab.style.borderBottomColor = "var(--brand)";
      }
      if (typeof renderDiagLog === "function") renderDiagLog();
    }
  };
})();
