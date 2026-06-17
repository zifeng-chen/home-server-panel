// 进程管理页面（PM2 + Docker + 系统服务聚合）
let processLoaded = false;

const PROCESS_TYPE_CONFIG = {
  pm2: { label: 'PM2', icon: '⚙️', color: '#7c3aed' },
  docker: { label: 'Docker', icon: '🐳', color: '#0891b2' },
  system: { label: '系统', icon: '🖥️', color: '#ea580c' }
};

async function loadProcess() {
  const tbody = document.getElementById('processTbody');
  const summaryEl = document.getElementById('processSummary');
  const filterEl = document.getElementById('processTypeFilter');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">⏳ 正在收集进程信息...</td></tr>';

  try {
    const res = await Api.get('/process');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${res.message || '获取失败'}</td></tr>`;
      return;
    }

    const data = res.data;
    const s = data.summary || {};

    // 统计概览
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="stat-card" style="border-color:#7c3aed;padding:14px">
          <div class="stat-icon">⚙️</div><div class="stat-info"><span class="stat-label">PM2 进程</span><span class="stat-value">${s.pm2?.online || 0}/${s.pm2?.total || 0}</span></div>
        </div>
        <div class="stat-card" style="border-color:#0891b2;padding:14px">
          <div class="stat-icon">🐳</div><div class="stat-info"><span class="stat-label">Docker 容器</span><span class="stat-value">${s.docker?.running || 0}/${s.docker?.total || 0}</span></div>
        </div>
        <div class="stat-card" style="border-color:#ea580c;padding:14px">
          <div class="stat-icon">🖥️</div><div class="stat-info"><span class="stat-label">系统服务</span><span class="stat-value">${s.system?.active || 0}/${s.system?.total || 0}</span></div>
        </div>
        <div class="stat-card" style="border-color:var(--text-secondary);padding:14px">
          <div class="stat-icon">📊</div><div class="stat-info"><span class="stat-label">总计</span><span class="stat-value">${s.total || 0}</span></div>
        </div>
      `;
    }

    // 合并所有进程为统一列表
    const all = [
      ...(data.pm2 || []).map(p => ({ ...p, _sort: 0 })),
      ...(data.docker || []).map(d => ({ ...d, _sort: 1 })),
      ...(data.system || []).map(s => ({ ...s, _sort: 2 }))
    ];

    // 根据筛选器过滤
    const filter = filterEl?.value || 'all';

    if (all.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">📭 未检测到任何进程</td></tr>';
      return;
    }

    const filtered = filter === 'all' ? all : all.filter(p => p.type === filter);

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">📭 该类型下暂无进程</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const cfg = PROCESS_TYPE_CONFIG[p.type] || { label: '未知', icon: '❓', color: '#6b7280' };
      const statusColor = p.status === 'online' || p.status === 'running' || p.status === 'active' ? 'var(--success)'
        : p.status === 'stopped' || p.status === 'inactive' ? 'var(--warning)'
        : 'var(--danger)';
      const statusLabel = { online: '运行中', running: '运行中', active: '活跃', stopped: '已停止', inactive: '未运行', errored: '异常', unknown: '未知' };
      const statusText = statusLabel[p.status] || p.status;

      // 各类型特有字段
      let extraCol = '';
      if (p.type === 'pm2') {
        extraCol = `<td>${p.cpu > 0 ? p.cpu.toFixed(1) + '%' : '--'}</td><td>${p.memory > 0 ? p.memory.toFixed(1) + ' MB' : '--'}</td>`;
      } else if (p.type === 'docker') {
        extraCol = `<td><small>${p.image || '--'}</small></td><td><small>${p.ports || '--'}</small></td>`;
      } else {
        extraCol = '<td>--</td><td>--</td>';
      }

      return `<tr>
        <td>
          <span style="color:${cfg.color};font-weight:600;">${cfg.icon} ${cfg.label}</span>
        </td>
        <td><strong>${escapeHtml(p.name)}</strong>${p.cwd ? '<br><small style="color:var(--text-secondary)">' + escapeHtml(p.cwd) + '</small>' : ''}</td>
        <td><code>${p.pid || '--'}</code></td>
        <td><span class="status-badge" style="background:${statusColor}20;color:${statusColor};font-weight:600;">${statusText}</span></td>
        ${extraCol}
        <td class="action-cell">
          ${p.type === 'pm2' ? getPm2Actions(p) : (p.type === 'docker' ? getDockerActions(p) : getSystemActions(p))}
        </td>
      </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">加载失败: ${escapeHtml(String(err.message))}</td></tr>`;
  }
}

function getPm2Actions(p) {
  let btns = '';
  if (p.status === 'online') {
    btns += `<button class="btn btn-sm btn-warning" onclick="processAction('pm2','${p.name}','restart')">🔄 重启</button> `;
    btns += `<button class="btn btn-sm btn-danger" onclick="processAction('pm2','${p.name}','stop')">⏹ 停止</button>`;
  } else {
    btns += `<button class="btn btn-sm btn-success" onclick="processAction('pm2','${p.name}','start')">▶ 启动</button>`;
  }
  btns += ` <button class="btn btn-sm btn-outline" onclick="processAction('pm2','${p.name}','delete')" style="color:var(--danger);border-color:var(--danger)">🗑</button>`;
  return btns;
}

function getDockerActions(p) {
  if (p.status === 'running') {
    return `<button class="btn btn-sm btn-warning" onclick="processAction('docker','${p.name}','restart')">🔄 重启</button> <button class="btn btn-sm btn-danger" onclick="processAction('docker','${p.name}','stop')">⏹ 停止</button>`;
  }
  return `<button class="btn btn-sm btn-success" onclick="processAction('docker','${p.name}','start')">▶ 启动</button>`;
}

function getSystemActions(p) {
  if (p.name === 'Server Panel') {
    return `<button class="btn btn-sm btn-warning" onclick="if(confirm('确定重启 Server Panel？')){Api.post('/system/restart').then(r=>{App.notify(r.message||'已重启',r.success?'success':'error')})}">🔄 重启面板</button>`;
  }
  return `<span style="color:var(--text-secondary);font-size:12px;">${p.active ? '系统管理' : ''}</span>`;
}

// 通用进程操作
window.processAction = async (type, name, action) => {
  const labels = { restart: '重启', stop: '停止', start: '启动', delete: '删除' };
  const label = labels[action] || action;
  if (action === 'delete' && !confirm('确定删除进程: ' + name + '?')) return;

  let res;
  try {
    if (type === 'pm2') {
      if (action === 'restart') res = await Api.post('/pm2/' + encodeURIComponent(name) + '/restart');
      else if (action === 'stop') res = await Api.post('/pm2/' + encodeURIComponent(name) + '/stop');
      else if (action === 'start') res = await Api.post('/pm2/' + encodeURIComponent(name) + '/start');
      else if (action === 'delete') res = await Api.del('/pm2/' + encodeURIComponent(name));
    } else if (type === 'docker') {
      if (action === 'restart') res = await Api.post('/docker/' + encodeURIComponent(name) + '/restart');
      else if (action === 'stop') res = await Api.post('/docker/' + encodeURIComponent(name) + '/stop');
      else if (action === 'start') res = await Api.post('/docker/' + encodeURIComponent(name) + '/start');
    }
  } catch (e) {
    res = { success: false, message: e.message };
  }

  if (res && res.success) {
    App.notify(res.message || '操作成功');
  } else {
    App.notify((res && res.message) || '操作失败', 'error');
  }
  setTimeout(loadProcess, 1500);
};

// 刷新进程列表
window.refreshProcessList = () => loadProcess();

// 筛选
window.filterProcessType = () => loadProcess();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 初始化
(function initProcessButtons() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProcessButtons);
    return;
  }
  const scanBtn = document.getElementById('btnProcessScan');
  if (scanBtn) scanBtn.addEventListener('click', () => loadProcess());

  const filterEl = document.getElementById('processTypeFilter');
  if (filterEl) filterEl.addEventListener('change', () => loadProcess());
})();

// 导出供 app.js 的 _ensurePage 调用
window.loadProcess = loadProcess;
