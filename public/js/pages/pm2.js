// PM2 进程管理页面
let pm2GuideShown = false;

async function loadPM2() {
  const tbody = document.getElementById('pm2Tbody');
  const overviewEl = document.getElementById('pm2Overview');
  const guideEl = document.getElementById('pm2Guide');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-box">⏳ 加载中...</div></td></tr>';
  if (guideEl) guideEl.innerHTML = '';

  try {
    // 先检查 PM2 状态
    const [statusRes, listRes, overviewRes, guideRes] = await Promise.all([
      Api.get('/pm2/status'),
      Api.get('/pm2'),
      Api.get('/pm2/overview'),
      Api.get('/pm2/guide')
    ]);

    const g = guideRes?.data || {};
    const guides = g.guides || [];
    const installed = g.installed;
    const daemonRunning = g.daemonRunning;
    const running = statusRes?.data?.running;

    // 安装引导（PM2 未安装或守护进程未运行）
    if (guideEl && !running) {
      pm2GuideShown = true;
      guideEl.innerHTML = `
        <div class="card" style="border-left:3px solid var(--warning);margin-bottom:16px">
          <h3 style="margin:0 0 12px 0;color:var(--warning)">⚠️ PM2 未运行</h3>
          ${!installed ? `
            <p style="margin:0 0 12px 0;color:var(--text-secondary)">
              PM2 未安装。Node ${g.nodeVersion} | npm ${g.npmVersion}
            </p>
            <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" onclick="pm2Install()">📦 一键安装 PM2</button>
            </div>
            <p style="margin:0 0 8px 0;font-weight:600">📖 或手动安装：</p>
          ` : `
            <p style="margin:0 0 12px 0;color:var(--text-secondary)">PM2 ${g.pm2Version} 已安装但守护进程未运行。</p>
            <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-success btn-sm" onclick="pm2StartDaemon()">▶ 启动守护进程</button>
              <button class="btn btn-danger btn-sm" style="border:1px solid var(--danger);color:var(--danger);" onclick="pm2Uninstall()">🗑 卸载 PM2</button>
            </div>
          `}
          <table class="data-table" style="margin:0">
            <thead><tr><th style="width:50px">#</th><th>操作</th><th>命令</th></tr></thead>
            <tbody>
              ${(!installed ? guides : guides.filter(gs => gs.step >= 3)).map(gs => `
                <tr>
                  <td>${gs.step}</td>
                  <td>${gs.title}</td>
                  <td><code style="cursor:pointer" onclick="navigator.clipboard.writeText('${gs.cmd.replace(/'/g,"\\'")}')" title="点击复制">${gs.cmd}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top:12px">
            <button class="btn btn-sm" onclick="loadPM2()">🔄 重新检测</button>
          </div>
        </div>
      `;
    } else if (guideEl && installed && daemonRunning) {
      // PM2 正常运行，显示管理按钮
      guideEl.innerHTML = `
        <div class="card" style="border-left:3px solid var(--success);margin-bottom:16px">
          <h3 style="margin:0 0 12px 0;color:var(--success)">✅ PM2 ${g.pm2Version} 运行中</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="loadPM2()">🔄 刷新</button>
            <button class="btn btn-sm btn-warning" onclick="pm2Save()">💾 保存配置</button>
            <button class="btn btn-sm btn-danger" style="border:1px solid var(--danger);color:var(--danger);" onclick="pm2Uninstall()">🗑 卸载 PM2</button>
          </div>
        </div>
      `;
    }

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
    
    // 如果没有进程但 PM2 在运行
    if (processes.length === 0 && running) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">📭 暂无 PM2 管理的进程<br><small>在项目目录执行 <code>pm2 start app.js</code> 添加进程</small></td></tr>';
      return;
    }

    // PM2 未运行但已安装
    if (processes.length === 0 && !running && installed) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">⚡ PM2 守护进程未运行<br><small>点击上方「启动守护进程」或执行 <code>pm2 resurrect</code></small></td></tr>';
      return;
    }

    if (processes.length === 0) {
      const installerLink = 'pm2-not-installed';
      tbody.innerHTML = `<tr id="${installerLink}"><td colspan="8" class="empty-state">📦 PM2 未安装，点击上方安装按钮 ↑</td></tr>`;
      return;
    }

    tbody.innerHTML = processes.map(p => {
      const statusColor = p.status === 'online' ? 'var(--success)' : p.status === 'stopped' ? 'var(--warning)' : 'var(--danger)';
      const uptimeStr = p.uptime > 0 ? formatUptime(p.uptime) : '--';
      const memStr = p.memory > 0 ? p.memory.toFixed(1) + ' MB' : '--';
      const cpuStr = p.cpu > 0 ? p.cpu.toFixed(1) + '%' : '--';
      return '<tr>'
        + '<td><strong>' + p.name + '</strong><br><small style="color:var(--text-secondary)">' + (p.execMode || '') + ' x' + (p.instances || 1) + '</small></td>'
        + '<td><code>' + (p.pid || '--') + '</code></td>'
        + '<td><span class="status-badge" style="background:' + statusColor + '20;color:' + statusColor + '">' + p.status + '</span></td>'
        + '<td>' + cpuStr + '</td>'
        + '<td>' + memStr + '</td>'
        + '<td>' + uptimeStr + '</td>'
        + '<td>' + (p.restarts || 0) + '</td>'
        + '<td class="action-cell">'
          + (p.status === 'online'
              ? '<button class="btn btn-sm btn-warning" onclick="pm2Action(\'' + p.name + '\',\'restart\')">🔄 重启</button> '
              : '')
          + (p.status === 'online'
              ? '<button class="btn btn-sm btn-danger" onclick="pm2Action(\'' + p.name + '\',\'stop\')">⏹ 停止</button>'
              : '<button class="btn btn-sm btn-success" onclick="pm2Action(\'' + p.name + '\',\'start\')">▶ 启动</button>')
          + ' <button class="btn btn-sm btn-outline" onclick="pm2Action(\'' + p.name + '\',\'delete\')" style="color:var(--danger);border-color:var(--danger)">🗑 删除</button>'
        + '</td>'
        + '</tr>';
    }).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--danger)">加载失败: ' + err.message + '</td></tr>';
  }
}

async function pm2Action(name, action) {
  const labels = { restart: '重启', stop: '停止', start: '启动', delete: '删除' };
  const label = labels[action] || action;
  if (!confirm('确认' + label + '进程: ' + name + '?')) return;

  // 显示进度指示
  const tbody = document.getElementById('pm2Tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-box">⏳ 正在' + label + ' ' + name + '...</div></td></tr>';

  let res;
  try {
    if (action === 'restart') res = await Api.post('/pm2/' + name + '/restart');
    else if (action === 'stop') res = await Api.post('/pm2/' + name + '/stop');
    else if (action === 'start') res = await Api.post('/pm2/' + name + '/start');
    else if (action === 'delete') res = await Api.del('/pm2/' + name);
  } catch (e) {
    res = { success: false, message: e.message };
  }

  if (res && res.success) {
    App.notify(res.message || '操作成功');
  } else {
    App.notify((res && res.message) || '操作失败', 'error');
  }
  
  // 延迟刷新获取最新状态
  setTimeout(loadPM2, 1500);
}

// PM2 安装/卸载/启动守护进程
let _pm2EventSource = null;

function _pm2StopStream() {
  if (_pm2EventSource) { _pm2EventSource.close(); _pm2EventSource = null; }
}

function _pm2ShowStreamLog() {
  const guideEl = document.getElementById('pm2Guide');
  if (guideEl) {
    guideEl.innerHTML = `
      <div class="card" style="border-left:3px solid var(--primary);margin-bottom:16px">
        <h3 style="margin:0 0 8px 0;color:var(--primary)">📡 实时进度</h3>
        <div id="pm2-stream-log" style="background:#f8f9fa;border-radius:8px;padding:12px;max-height:400px;overflow-y:auto;font-family:monospace;font-size:13px;line-height:1.6">
          <div style="color:#64748b">⏳ 连接中...</div>
        </div>
        <div style="margin-top:10px">
          <button class="btn btn-sm btn-outline" onclick="_pm2StopStream();loadPM2()">✕ 停止</button>
        </div>
      </div>
    `;
  }
}

function _pm2StreamLog(msg, type) {
  const el = document.getElementById('pm2-stream-log');
  if (!el) return;
  const colors = { output: '#6b7280', warn: '#f59e0b', error: '#c41e3a', info: '#22c55e', done: '#daa520' };
  const color = colors[type] || '#6b7280';
  const div = document.createElement('div');
  div.style.color = color;
  div.textContent = (type === 'done' ? '✅ ' : type === 'warn' ? '⚠️ ' : type === 'error' ? '❌ ' : '') + msg;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function _pm2InstallStream() {
  _pm2StopStream();
  _pm2ShowStreamLog();
  _pm2StreamLog('正在连接安装服务...', 'info');

  _pm2EventSource = new EventSource('/api/pm2/install/stream');
  _pm2EventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'start') {
        _pm2StreamLog(data.message || data.command, 'info');
      } else if (data.type === 'output') {
        _pm2StreamLog(data.text, 'output');
      } else if (data.type === 'warn') {
        _pm2StreamLog(data.text, 'warn');
      } else if (data.type === 'done') {
        _pm2StreamLog(data.message, 'done');
        _pm2StreamLog(data.version ? '版本: ' + data.version : '', 'info');
        _pm2StopStream();
        setTimeout(loadPM2, 1500);
      } else if (data.type === 'error') {
        _pm2StreamLog(data.message, 'error');
        _pm2StopStream();
        setTimeout(loadPM2, 2000);
      }
    } catch (err) {
      _pm2StreamLog(e.data, 'output');
    }
  };
  _pm2EventSource.onerror = () => {
    _pm2StreamLog('连接中断', 'error');
    _pm2StopStream();
    setTimeout(loadPM2, 2000);
  };
}

function _pm2UninstallStream() {
  _pm2StopStream();
  _pm2ShowStreamLog();
  _pm2StreamLog('正在连接卸载服务...', 'info');

  _pm2EventSource = new EventSource('/api/pm2/uninstall/stream');
  _pm2EventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'start') {
        _pm2StreamLog(data.message || data.command, 'info');
      } else if (data.type === 'output') {
        _pm2StreamLog(data.text, 'output');
      } else if (data.type === 'warn') {
        _pm2StreamLog(data.text, 'warn');
      } else if (data.type === 'done') {
        _pm2StreamLog(data.message, 'done');
        _pm2StopStream();
        setTimeout(loadPM2, 1500);
      } else if (data.type === 'error') {
        _pm2StreamLog(data.message, 'error');
        _pm2StopStream();
        setTimeout(loadPM2, 2000);
      }
    } catch (err) {
      _pm2StreamLog(e.data, 'output');
    }
  };
  _pm2EventSource.onerror = () => {
    _pm2StreamLog('连接中断', 'error');
    _pm2StopStream();
    setTimeout(loadPM2, 2000);
  };
}

async function pm2Install() {
  if (!confirm('确定安装 PM2 吗？将执行 npm install -g pm2')) return;
  _pm2InstallStream();
}

async function pm2Uninstall() {
  if (!confirm('确定卸载 PM2 吗？所有进程配置将丢失！')) return;
  _pm2UninstallStream();
}

async function pm2StartDaemon() {
  App.notify('正在启动 PM2 守护进程...', 'info');
  const res = await Api.post('/pm2/start-daemon');
  if (res.success) {
    App.notify('守护进程已启动', 'success');
  } else {
    App.notify(res.message || '启动失败', 'error');
  }
  setTimeout(loadPM2, 2000);
}

async function pm2Save() {
  const res = await Api.post('/pm2/save');
  App.notify((res && res.message) || '配置已保存', res.success ? 'success' : 'error');
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnPM2Refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', loadPM2);

  const btnSave = document.getElementById('btnPM2Save');
  if (btnSave) btnSave.addEventListener('click', pm2Save);
});