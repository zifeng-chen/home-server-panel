// 操作日志页面
async function loadLog() {
  const tbody = document.getElementById("logTbody");
  if (!tbody) return;
  const module = document.getElementById("logModuleFilter")?.value || "all";
  const search = document.getElementById("logSearch")?.value || "";
  tbody.innerHTML = "<tr class='empty-row'><td colspan='5'>加载中...</td></tr>";
  try {
    const params = { limit: 50 };
    if (module !== "all") params.module = module;
    if (search) params.search = search;
    const res = await Api.get("/log", params);
    if (!res.success) { tbody.innerHTML = "<tr><td colspan='5'>"+res.message+"</td></tr>"; return; }
    const list = res.data.list || [];
    const stats = document.getElementById("logStats");
    if (stats) {
      const errors = list.filter(e => e.level === "error").length;
      const warns = list.filter(e => e.level === "warn").length;
      stats.innerHTML = "共 " + res.data.total + " 条 | " +
        (errors ? "<span style='color:var(--danger)'>错误 " + errors + "</span> | " : "") +
        (warns ? "<span style='color:var(--warn)'>警告 " + warns + "</span>" : "");
    }
    if (list.length === 0) { tbody.innerHTML = "<tr class='empty-row'><td colspan='5'>暂无日志</td></tr>"; return; }
    tbody.innerHTML = list.map(e => {
      const lc = { error: "var(--danger)", warn: "#f59e0b", success: "var(--success)", info: "var(--text-secondary)" };
      return "<tr><td><small>" + new Date(e.time).toLocaleString("zh-CN") + "</small></td>" +
        "<td>" + e.module + "</td><td><small>" + e.action + "</small></td>" +
        "<td>" + (e.message || "--") + "</td>" +
        "<td><span style='color:" + (lc[e.level] || lc.info) + ";'>" + e.level + "</span></td></tr>";
    }).join("");
  } catch (err) { tbody.innerHTML = "<tr><td colspan='5'>加载失败: "+err.message+"</td></tr>"; }
}

async function clearLogs() {
  if (!confirm("确定清空所有操作日志?")) return;
  await Api.del("/log");
  loadLog();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLogRefresh")?.addEventListener("click", loadLog);
  document.getElementById("btnLogClear")?.addEventListener("click", clearLogs);
  document.getElementById("logSearch")?.addEventListener("keydown", e => { if (e.key === "Enter") loadLog(); });
});
