// PM2 进程管理页面
async function loadPM2() {
  const tbody = document.getElementById('pm2Tbody');
  const overviewEl = document.getElementById('pm2Overview');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8">加载中...</td></tr>';

  try {
    const [listRes, overviewRes] = await Promise.all([
      Api.get('/pm2'),
      Api.get('/pm2/overview')
    ]);

    // 概览卡片
    if (overviewRes.success && overviewEl) {
      const o = overviewRes.data || {};
      overviewEl.innerHTML = ''
        + '<div class="stat-card" style="border-color:var(--info)">'
        + '  <div class="stat-icon">⚙️</div>'
        + '  <div class="stat-info">'
        + '    <span class="stat-label">PM2 版本</span>'
        + '    <span class="stat-value">' + (o.pm2Version || '--') + '</span>'
        + '  </div>'
        + '</div>'
        + '<div class="stat-card" style="border-color:var(--success)">'
        + '  <div class="stat-icon">🟢</div>'
        + '  <div class="stat-info">'
        + '    <span class="stat-label">在线进程</span>'
        + '    <span class="stat-value">' + ((listRes.data && listRes.data.summary && listRes.data.summary.online) || 0) + '</span>'
        + '  </div>'
        + '</div>'
        + '<div class="stat-card" style="border-color:var(--warning)">'
        + '  <div class="stat-icon">⚠️</div>'
        + '  <div class="stat-info">'
        + '    <span class="stat-label">异常/停止</span>'
        + '    <span class="stat-value">' + (((listRes.data && listRes.data.summary && listRes.data.summary.stopped) || 0) + ((listRes.data && listRes.data.summary && listRes.data.summary.errored) || 0)) + '</span>'
        + '  </div>'
        + '</div>'
        + '<div class="stat-card" style="border-color:var(--text-secondary)">'
        + '  <div class="stat-icon">📦</div>'
        + '  <div class="stat-info">'
        + '    <span class="stat-label">总进程数</span>'
        + '    <span class="stat-value">' + ((listRes.data && listRes.data.summary && listRes.data.summary.total) || 0) + '</span>'
        + '  </div>'
        + '</div>';
    }

    if (!listRes.success) {
      tbody.innerHTML = '<tr><td colspan="8" style="color:var(--danger)">' + (listRes.message || 'PM2 查询失败') + '</td></tr>';
      return;
    }

    const processes = (listRes.data && listRes.data.processes) || [];
    if (processes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-secondary)">PM2 未运行或无进程<br><small>请用 <code>pm2 start app.js</code> 启动进程</small></td></tr>';
      return;
    }

    tbody.innerHTML = processes.map(p => {
      const statusColor = p.status === 'online' ? 'var(--success)' : p.status === 'stopped' ? 'var(--warning)' : 'var(--danger)';
      const uptimeStr = p.uptime > 0 ? formatUptime(p.uptime) : '--';
      const memStr = p.memory > 0 ? p.memory + 'MB' : '--';
      const cpuStr = p.cpu > 0 ? p.cpu + '%' : '--';
      return '<tr>'
        + '<td><strong>' + p.name + '</strong></td>'
        + '<td><code>' + p.pid + '</code></td>'
        + '<td style="color:' + statusColor + ';font-weight:600">' + p.status + '</td>'
        + '<td>' + cpuStr + '</td>'
        + '<td>' + memStr + '</td>'
        + '<td>' + uptimeStr + '</td>'
        + '<td>' + (p.restarts || 0) + '</td>'
        + '<td>'
          + (p.status === 'online'
              ? '<button class="btn btn-sm btn-warning" onclick="pm2Action(\'' + p.name + '\',\'restart\')">重启</button> '
              : '')
          + (p.status === 'online'
              ? '<button class="btn btn-sm btn-danger" onclick="pm2Action(\'' + p.name + '\',\'stop\')">停止</button>'
              : '<button class="btn btn-sm btn-success" onclick="pm2Action(\'' + p.name + '\',\'start\')">启动</button>')
          + ' <button class="btn btn-sm" onclick="pm2Action(\'' + p.name + '\',\'delete\')">删除</button>'
        + '</td>'
        + '</tr>';
    }).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--danger)">加载失败: ' + err.message + '</td></tr>';
  }
}

async function pm2Action(name, action) {
  const confirmMsg = { restart: '重启', stop: '停止', start: '启动', delete: '删除' }[action] || action;
  if (!confirm('确认' + confirmMsg + '进程: ' + name + '?')) return;

  let res;
  if (action === 'restart') res = await Api.post('/pm2/' + name + '/restart');
  else if (action === 'stop') res = await Api.post('/pm2/' + name + '/stop');
  else if (action === 'start') res = await Api.post('/pm2/' + name + '/start');
  else if (action === 'delete') res = await Api.del('/pm2/' + name);

  if (res && res.success) {
    App.notify(res.message || '操作成功');
    setTimeout(loadPM2, 1000);
  } else {
    App.notify((res && res.message) || '操作失败', 'error');
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnPM2Refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', loadPM2);

  const btnSave = document.getElementById('btnPM2Save');
  if (btnSave) btnSave.addEventListener('click', async () => {
    const res = await Api.post('/pm2/save');
    App.notify((res && res.message) || '配置已保存');
  });
});
