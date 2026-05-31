// 定时任务页面
async function loadCron() {
  const tbody = document.getElementById("cronTbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr class='empty-row'><td colspan='6'>加载中...</td></tr>";
  try {
    const res = await Api.get("/cron");
    if (!res.success) { tbody.innerHTML = "<tr><td colspan='6'>"+res.message+"</td></tr>"; return; }
    const jobs = res.data.jobs || [];
    if (jobs.length === 0) { tbody.innerHTML = "<tr class='empty-row'><td colspan='6'>暂无定时任务<br><small>点击「添加任务」创建</small></td></tr>"; return; }
    tbody.innerHTML = jobs.map(j => {
      var intervalText = j.interval < 60000 ? (j.interval/1000).toFixed(0)+"秒" : j.interval < 3600000 ? (j.interval/60000).toFixed(0)+"分钟" : (j.interval/3600000).toFixed(1)+"小时";
      var lastRun = j.lastRun ? new Date(j.lastRun).toLocaleString("zh-CN") : "从未执行";
      var status = j.enabled ? "<span style='color:var(--success);'>启用中</span>" : "<span style='color:var(--text-secondary);'>已停用</span>";
      var btn = "<button class='btn btn-sm' data-jobid='"+j.id+"' data-action='toggle'>"+(j.enabled?"停用":"启用")+"</button>";
      return "<tr><td><strong>"+j.name+"</strong></td><td>"+j.type+"</td><td>"+intervalText+"</td><td><small>"+lastRun+"</small></td><td>"+status+"</td><td>"+btn+"</td></tr>";
    }).join("");
    // 事件委托
    document.querySelectorAll("#cronTbody [data-action='toggle']").forEach(btn => {
      btn.addEventListener("click", async function() {
        await Api.post("/cron/"+this.dataset.jobid+"/toggle");
        loadCron();
      });
    });
  } catch (err) { tbody.innerHTML = "<tr><td colspan='6'>加载失败: "+err.message+"</td></tr>"; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnCronAdd")?.addEventListener("click", () => {
    alert("定时任务功能已就绪，后续版本将提供UI配置界面。\n\n当前可通过 API 手动添加:\nPOST /api/cron");
  });
});
