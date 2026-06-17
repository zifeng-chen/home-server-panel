// PM2 进程管理页面（整合：PM2 + Docker + 系统服务）
let pm2GuideShown = false;
window._pm2AllData = null;

async function loadPM2() {
  const tbody = document.getElementById('pm2Tbody');
  const guideEl = document.getElementById('pm2Guide');
  const summaryEl = document.getElementById('pm2AggSummary');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7"><div class="loading-box">⏳ 加载中...</div></td></tr>';
  if (guideEl) guideEl.innerHTML = '';
  if (summaryEl) summaryEl.innerHTML = '';

  try {
    // 并行获取 PM2 状态 + 进程聚合数据
    const [statusRes, guideRes, aggRes] = await Promise.all([
      Api.get('/pm2/status'),
      Api.get('/pm2/guide'),
      Api.get('/process')
    ]);

    const g = guideRes?.data || {};
    const guides = g.guides || [];
    const installed = g.installed;
    const daemonRunning = g.daemonRunning;
    const running = statusRes?.data?.running;

    // PM2 安装引导（PM2 未安装或守护进程未运行）
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
      // PM2 正常运行，显示状态卡片
      guideEl.innerHTML = `
        <div class="card" style="border-left:3px solid var(--success);margin-bottom:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <h3 style="margin:0;color:var(--success)">✅ PM2 ${g.pm2Version || ''} 运行中</h3>
            <button class="btn btn-sm btn-danger" style="border:1px solid var(--danger);color:var(--danger);" onclick="pm2Uninstall()">🗑 卸载 PM2</button>
          </div>
        </div>
      `;
    }

    // 进程聚合数据（PM2 + Docker + 系统服务）
    if (aggRes.success) {
      const data = aggRes.data;
      const s = data.summary || {};
      const all = [].concat(
        (data.pm2 || []).map(function(p) { p._type = 'pm2'; return p; }),
        (data.docker || []).map(function(d) { d._type = 'docker'; return d; }),
        (data.system || []).map(function(sv) { sv._type = 'system'; return sv; })
      );

      // 统计概览
      if (summaryEl) {
        summaryEl.innerHTML = `
          <span style="font-size:12px;padding:4px 10px;background:#f3f0ff;border-radius:12px;color:#7c3aed">⚙️ PM2 ${s.pm2 ? s.pm2.online + '/' + s.pm2.total : '0'}</span>
          <span style="font-size:12px;padding:4px 10px;background:#e0f7fa;border-radius:12px;color:#0891b2">🐳 Docker ${s.docker ? s.docker.running + '/' + s.docker.total : '0'}</span>
          <span style="font-size:12px;padding:4px 10px;background:#fff3e0;border-radius:12px;color:#ea580c">🖥️ 系统 ${s.system ? s.system.active + '/' + s.system.total : '0'}</span>
        `;
      }

      if (all.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">📭 暂无运行中的进程</td></tr>';
        return;
      }

      var TYPE_BADGES = { pm2: '<span style="background:#f3f0ff;color:#7c3aed;padding:2px 8px;border-radius:10px;font-size:11px">⚙️ PM2</span>', docker: '<span style="background:#e0f7fa;color:#0891b2;padding:2px 8px;border-radius:10px;font-size:11px">🐳 Docker</span>', system: '<span style="background:#fff3e0;color:#ea580c;padding:2px 8px;border-radius:10px;font-size:11px">🖥️ 系统</span>' };

      tbody.innerHTML = all.map(function(p) {
        var t = p._type;
        var badge = TYPE_BADGES[t] || '';
        var name = p.name || '--';
        var pid = p.pid || '--';
        var statusStr = p.status || '--';
        var col1, col2, actions = '';

        if (t === 'pm2') {
          var sc = statusStr === 'online' ? 'var(--success)' : statusStr === 'stopped' ? 'var(--warning)' : 'var(--danger)';
          statusStr = '<span class="status-badge" style="background:' + sc + '20;color:' + sc + '">' + statusStr + '</span>';
          col1 = (p.cpu > 0 ? p.cpu.toFixed(1) + '%' : '--');
          col2 = (p.memory > 0 ? p.memory.toFixed(1) + ' MB' : '--');
          actions = (p.status === 'online'
            ? '<button class="btn btn-sm btn-warning" onclick="pm2Action(\'' + name + '\',\'restart\')">🔄 重启</button> '
            : '')
            + (p.status === 'online'
              ? '<button class="btn btn-sm btn-danger" onclick="pm2Action(\'' + name + '\',\'stop\')">⏹ 停止</button>'
              : '<button class="btn btn-sm btn-success" onclick="pm2Action(\'' + name + '\',\'start\')">▶ 启动</button>')
            + ' <button class="btn btn-sm btn-outline" onclick="pm2Action(\'' + name + '\',\'delete\')" style="color:var(--danger);border-color:var(--danger)">🗑</button>';
        } else if (t === 'docker') {
          var sc = statusStr.indexOf('Up') === 0 ? 'var(--success)' : 'var(--warning)';
          statusStr = '<span class="status-badge" style="background:' + sc + '20;color:' + sc + '">' + statusStr + '</span>';
          col1 = '<small>' + (p.image || '--') + '</small>';
          col2 = '<small>' + (p.ports || '--') + '</small>';
          actions = '';
        } else {
          // system
          var sc = statusStr === 'active' ? 'var(--success)' : 'var(--warning)';
          statusStr = '<span class="status-badge" style="background:' + sc + '20;color:' + sc + '">' + statusStr + '</span>';
          col1 = (p.cpu > 0 ? p.cpu.toFixed(1) + '%' : '--');
          col2 = (p.memory > 0 ? p.memory.toFixed(0) + ' MB' : '--');
          actions = p.name === 'Server Panel' ? '<span style="font-size:11px;color:var(--text-secondary)">本面板</span>' : '';
        }

        return '<tr>'
          + '<td>' + badge + '</td>'
          + '<td><strong>' + name + '</strong>' + (p.uptime && t === 'docker' ? '<br><small style="color:var(--text-secondary)">' + p.uptime + '</small>' : '') + '</td>'
          + '<td><code>' + pid + '</code></td>'
          + '<td>' + statusStr + '</td>'
          + '<td>' + col1 + '</td>'
          + '<td>' + col2 + '</td>'
          + '<td class="action-cell">' + actions + '</td>'
          + '</tr>';
      }).join('');

      window._pm2AllData = data;
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--danger)">' + (aggRes.message || '获取进程信息失败') + '</td></tr>';
    }

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--danger)">加载失败: ' + err.message + '</td></tr>';
  }
}

async function pm2Action(name, action) {
  const labels = { restart: '重启', stop: '停止', start: '启动', delete: '删除' };
  const label = labels[action] || action;
  if (!confirm('确认' + label + '进程: ' + name + '?')) return;

  const tbody = document.getElementById('pm2Tbody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="loading-box">⏳ 正在' + label + ' ' + name + '...</div></td></tr>';

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
  
  setTimeout(loadPM2, 1500);
}

// PM2 安装/卸载/启动守护进程（SSE流式进度）
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

(function initPm2Buttons() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPm2Buttons);
    return;
  }
  var btn = document.getElementById('btnPm2Scan');
  if (btn) btn.addEventListener('click', loadPM2);
})();

// 导出供 app.js 的 _ensurePage 调用
window.loadPM2 = loadPM2;
