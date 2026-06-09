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
    const body = `
      <div class="form-group">
        <label>任务名称</label>
        <input type="text" id="cronAddName" class="form-input" placeholder="例如：DDNS 自动刷新">
      </div>
      <div class="form-group">
        <label>执行间隔（秒）</label>
        <input type="number" id="cronAddInterval" class="form-input" value="3600" min="60" max="86400">
      </div>
      <div class="form-group">
        <label>执行命令/API</label>
        <select id="cronAddType" class="form-input">
          <option value="ddns_refresh">刷新 DDNS</option>
          <option value="custom">自定义 API</option>
        </select>
      </div>
      <div class="form-group" id="cronAddCustomGroup" style="display:none">
        <label>目标 API 路径</label>
        <input type="text" id="cronAddApiPath" class="form-input" placeholder="例如：/api/ddns/refresh">
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
      <button class="btn btn-success" id="cronAddConfirm">✅ 添加任务</button>
    `;
    Utils.openModal('添加定时任务', body, footer);

    document.getElementById('cronAddType').addEventListener('change', function() {
      document.getElementById('cronAddCustomGroup').style.display = this.value === 'custom' ? 'block' : 'none';
    });

    document.getElementById('cronAddConfirm').addEventListener('click', async () => {
      const name = document.getElementById('cronAddName').value.trim() || '定时任务';
      const interval = parseInt(document.getElementById('cronAddInterval').value) || 3600;
      const type = document.getElementById('cronAddType').value;
      const apiPath = document.getElementById('cronAddApiPath').value.trim();

      Utils.closeModal();
      Utils.notify('正在添加...', 'info');

      const res = await Api.post('/cron', { name, interval: interval * 1000, type, apiPath });
      if (res.success) {
        Utils.notify(res.message || '定时任务已添加', 'success');
        loadCron();
      } else {
        Utils.notify(res.message || '添加失败', 'error');
      }
    });
  });
});
