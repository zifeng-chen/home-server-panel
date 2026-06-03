// Nginx 管理页面
let nginxLoaded = false;

const NGINX_ACTION_LABELS = {
  start: '🚀 启动',
  stop: '🛑 停止',
  reload: '🔄 重载',
  restart: '♻️ 重启',
  test: '🧪 配置测试'
};

async function loadNginx() {
  const statusBar = document.getElementById('nginxStatusBar');
  const siteTbody = document.getElementById('nginxTbody');
  if (!statusBar || !siteTbody) return;

  try {
    const [statusRes, sitesRes] = await Promise.all([
      Api.get('/nginx/status'),
      Api.get('/nginx/sites')
    ]);

    renderStatusBar(statusRes.data);
    renderSites(sitesRes.data?.sites || []);
  } catch (err) {
    statusBar.innerHTML = `<span class="status-badge offline">加载失败: ${err.message}</span>`;
  }
}

function renderStatusBar(data) {
  const bar = document.getElementById('nginxStatusBar');
  if (!bar) return;

  if (!data || !data.installed) {
    bar.innerHTML = `
      <span class="status-badge offline" style="font-size:14px;padding:8px 16px;">⚠️ Nginx 未安装</span>
      <small style="color:var(--text-secondary);margin-left:12px;">${data?.installHint || ''}</small>
    `;
    // 显示安装按钮
    const installBtn = document.getElementById('btnNginxInstall');
    if (installBtn) installBtn.style.display = 'inline-flex';
    return;
  }

  const running = data.running;
  const statusClass = running ? 'online' : 'offline';
  const statusText = running ? '运行中' : '已停止';

  bar.innerHTML = `
    <span class="status-badge ${statusClass}" style="font-size:14px;padding:8px 16px;margin-right:16px;">${statusText}</span>
    <span style="color:var(--text-secondary);font-size:13px;">
      v${data.version || '?'} &nbsp;|&nbsp;
      PID: ${data.pid || '--'} &nbsp;|&nbsp;
      运行时长: ${data.uptime || '--'} &nbsp;|&nbsp;
      配置测试: <span style="color:var(--${data.configTest === 'ok' ? 'success' : 'danger'})">${data.configTest === 'ok' ? '✅' : '❌'}</span>
    </span>
    ${data.configDir ? `<br><small style="color:var(--text-secondary)">📁 ${data.configDir}</small>` : ''}
  `;

  // 更新按钮状态
  updateActionButtons(running);
}

function updateActionButtons(running) {
  const startBtn = document.getElementById('btnNginxStart');
  const stopBtn = document.getElementById('btnNginxStop');
  const reloadBtn = document.getElementById('btnNginxReload');
  const restartBtn = document.getElementById('btnNginxRestart');

  if (startBtn) startBtn.style.display = running ? 'none' : 'inline-flex';
  if (stopBtn) stopBtn.style.display = running ? 'inline-flex' : 'none';
  if (reloadBtn) reloadBtn.style.display = running ? 'inline-flex' : 'none';
  if (restartBtn) restartBtn.style.display = running ? 'inline-flex' : 'none';
}

function renderSites(sites) {
  const tbody = document.getElementById('nginxTbody');
  if (!tbody) return;

  if (!sites || sites.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无站点配置<br><small>在 conf.d / sites-available 目录中添加 .conf 文件</small></td></tr>';
    return;
  }

  tbody.innerHTML = sites.map(s => `
    <tr>
      <td><strong>${s.name || s.file}</strong></td>
      <td><code>${s.listen || '80'}</code></td>
      <td>${s.serverName || '_'}</td>
      <td>${s.ssl ? '<span class="status-badge online">HTTPS</span>' : '<span class="status-badge">HTTP</span>'}</td>
      <td>${s.proxyPass ? `<code>→ ${s.proxyPass}</code>` : s.root ? `<code>${s.root}</code>` : '--'}</td>
      <td><small style="color:var(--text-secondary)">${s.source}/${s.file}</small></td>
      <td>
        <button class="btn btn-sm" onclick="viewSiteConfig('${encodeURIComponent(s.filePath)}')">查看</button>
      </td>
    </tr>
  `).join('');

  // 显示加载完成
  updateActionButtons(document.querySelector('#nginxStatusBar .status-badge.online') !== null);
}

// ========== 操作按钮 ==========

async function nginxAction(action) {
  Utils.notify(`正在执行: ${NGINX_ACTION_LABELS[action] || action}...`, 'info');
  try {
    const res = await Api.post(`/nginx/${action}`);
    if (res.success) {
      Utils.notify(res.message || '操作完成', 'success');
      setTimeout(loadNginx, 1000);
    } else {
      Utils.notify(res.message || '操作失败', 'error');
    }
  } catch (err) {
    Utils.notify('操作失败: ' + err.message, 'error');
  }
}

// bind global actions
['start', 'stop', 'reload', 'restart', 'test'].forEach(action => {
  window[`nginx${action.charAt(0).toUpperCase() + action.slice(1)}`] = () => nginxAction(action);
});

// 查看站点配置
window.viewSiteConfig = async (filePath) => {
  try {
    const res = await fetch('/api/nginx/sites');
    const data = await res.json();
    const sites = data?.data?.sites || [];
    const site = sites.find(s => s.filePath === decodeURIComponent(filePath));

    if (!site) {
      Utils.notify('未找到站点配置', 'error');
      return;
    }

    // 读取文件内容
    const { exec } = await import('/api/nginx/logs'); // can't do this in browser
    // Actually, let's use a simple approach - show what we already parsed
    const body = `
      <div class="form-group">
        <label>配置文件</label>
        <code>${site.filePath}</code>
      </div>
      <div class="form-group">
        <label>服务名</label>
        <code>${site.serverName || '_'}</code>
      </div>
      <div class="form-group">
        <label>监听</label>
        <code>${site.listen || '80'}</code>
      </div>
      <div class="form-group">
        <label>SSL</label>
        <span class="status-badge ${site.ssl ? 'online' : ''}">${site.ssl ? '启用' : '未启用'}</span>
      </div>
      ${site.ssl ? `<div class="form-group"><label>证书</label><code>${site.sslCert || '--'}</code></div><div class="form-group"><label>私钥</label><code>${site.sslKey || '--'}</code></div>` : ''}
      ${site.proxyPass ? `<div class="form-group"><label>反向代理</label><code>→ ${site.proxyPass}</code></div>` : ''}
      ${site.root ? `<div class="form-group"><label>根目录</label><code>${site.root}</code></div>` : ''}
      ${site.locations?.length ? `<div class="form-group"><label>Location 块 (${site.locations.length})</label>${site.locations.map(l => `<div style="margin:4px 0"><code>${l.path}</code> ${l.proxyPass ? '→ ' + l.proxyPass : l.root ? '📁 ' + l.root : ''}</div>`).join('')}</div>` : ''}
    `;

    Utils.openModal(`站点详情: ${site.name || site.file}`, body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>');
  } catch (err) {
    Utils.notify('加载站点详情失败', 'error');
  }
};

// 安装 Nginx（SSE 实时进度）
window.installNginx = async () => {
  // 先查询推荐安装方式
  let guide;
  try {
    const res = await Api.post('/nginx/install');
    guide = res.data || res;
  } catch (e) { guide = { platform: 'linux', recommended: 'apt', methods: ['apt', 'yum'] }; }

  if (guide.installed) {
    Utils.notify('Nginx 已安装', 'success');
    return loadNginx();
  }

  const methods = guide.methods || (guide.platform === 'darwin' ? ['brew'] : ['apt', 'yum', 'apk']);
  const recommended = guide.recommended || methods[0];

  const labels = { brew: '🍺 Homebrew (推荐)', apt: '📦 APT (推荐)', yum: '📦 YUM', apk: '📦 APK (Alpine)' };
  const methodButtons = methods.map(m =>
    `<button class="btn btn-${m === recommended ? 'success' : 'secondary'}" onclick="startNginxInstall('${m}')" style="flex:1">${labels[m] || m.toUpperCase()}</button>`
  ).join('');

  const body = `
    <div class="form-group" style="text-align:center">
      <p style="font-size:15px;margin-bottom:16px">Nginx 尚未安装，选择安装方式：</p>
      <div style="display:flex;gap:8px;margin-bottom:12px">${methodButtons}</div>
      <p style="color:var(--text-secondary);font-size:12px">平台: ${guide.platform} | 需要 sudo 权限</p>
    </div>
    <div id="installProgress" style="display:none;margin-top:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span id="installStatus" style="font-weight:600">⏳ 安装中...</span>
        <div class="spinner" style="width:16px;height:16px;border:2px solid var(--text-secondary);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      </div>
      <pre id="installLog" style="max-height:300px;overflow-y:auto;background:var(--bg-tertiary);color:#e0e0e0;padding:12px;border-radius:8px;font-size:12px;font-family:Menlo,monospace;white-space:pre-wrap;word-break:break-all;margin:0"></pre>
    </div>
  `;

  Utils.openModal('🔧 安装 Nginx', body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>');
};

// 启动 SSE 安装
window.startNginxInstall = async (method) => {
  const progressDiv = document.getElementById('installProgress');
  const logDiv = document.getElementById('installLog');
  const statusSpan = document.getElementById('installStatus');
  if (!progressDiv || !logDiv || !statusSpan) return;

  progressDiv.style.display = 'block';
  logDiv.textContent = '';
  statusSpan.textContent = '⏳ 正在连接...';

  // 禁用方法按钮
  progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = true);

  try {
    const token = localStorage.getItem('hsp_token');
    const eventSource = new EventSource(`/api/nginx/install/stream?method=${method}&token=${token}`);
    let killed = false;

    // 监听消息 (注意: SSE 默认监听 'message' 事件，需要用 addEventListener)
    const handler = (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'start':
            statusSpan.innerHTML = `🔧 执行: <code style="font-size:11px">${msg.method}</code>`;
            logDiv.textContent += `$ ${msg.command}\n`;
            break;
          case 'output':
            logDiv.textContent += msg.text + '\n';
            logDiv.scrollTop = logDiv.scrollHeight;
            break;
          case 'done':
            statusSpan.textContent = '✅ ' + msg.message;
            statusSpan.style.color = 'var(--success)';
            eventSource.close();
            setTimeout(() => { Utils.closeModal(); loadNginx(); }, 1500);
            break;
          case 'error':
            statusSpan.textContent = '❌ ' + msg.message;
            statusSpan.style.color = 'var(--danger)';
            // 恢复按钮
            progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false);
            eventSource.close();
            break;
        }
      } catch (parseErr) {
        logDiv.textContent += '[解析错误] ' + e.data + '\n';
      }
    };

    eventSource.addEventListener('message', handler);

    eventSource.onerror = () => {
      if (!killed) {
        statusSpan.textContent = '❌ 连接中断';
        statusSpan.style.color = 'var(--danger)';
      }
      eventSource.close();
      progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false);
    };

    // 关闭弹窗时断开连接
    const closeBtn = document.querySelector('#hsp-modal .btn-secondary');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => { killed = true; eventSource.close(); }, { once: true });
    }
  } catch (err) {
    statusSpan.textContent = '❌ ' + err.message;
    statusSpan.style.color = 'var(--danger)';
    progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false);
  }
};

// 查看日志（支持错误/访问切换 + 一键复制）
window.viewNginxLogs = async (type) => {
  type = type || 'error';

  const title = `📋 Nginx ${type === 'access' ? '访问' : '错误'}日志`;
  const body = `
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
      <button class="btn btn-sm ${type==='error'?'btn-primary':'btn-secondary'}" id="logTabError" onclick="viewNginxLogs('error')">错误日志</button>
      <button class="btn btn-sm ${type==='access'?'btn-primary':'btn-secondary'}" id="logTabAccess" onclick="viewNginxLogs('access')">访问日志</button>
      <span id="logPath" style="color:var(--text-secondary);font-size:12px;margin-left:auto;">加载中...</span>
    </div>
    <div id="logLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ 加载中...</div>
    <pre id="logContent" style="display:none;max-height:420px;overflow:auto;background:var(--bg-tertiary,#0f172a);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#cbd5e1;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
  `;
  const footer = `
    <button class="btn btn-sm btn-secondary" id="btnLogCopy" onclick="copyNginxLog()">📋 一键复制</button>
    <button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>
  `;
  Utils.openModal(title, body, footer);

  // 异步加载日志
  try {
    const res = await Api.get(`/nginx/logs?type=${type}&lines=200`);
    const logEl = document.getElementById('logContent');
    const loaderEl = document.getElementById('logLoader');
    const pathEl = document.getElementById('logPath');
    if (logEl && loaderEl) {
      loaderEl.style.display = 'none';
      logEl.style.display = 'block';
      if (res.success && res.data) {
        logEl.textContent = res.data.logs || '(空)';
        if (pathEl) pathEl.textContent = '📁 ' + (res.data.path || '');
        window._hspNginxLog = res.data.logs || '';
      } else {
        logEl.textContent = res.message || '加载失败';
        window._hspNginxLog = '';
      }
    }
  } catch (err) {
    const loaderEl = document.getElementById('logLoader');
    if (loaderEl) loaderEl.textContent = '❌ 加载失败: ' + err.message;
    window._hspNginxLog = '';
  }
};

window.copyNginxLog = () => {
  const text = window._hspNginxLog || '';
  if (!text) { Utils.notify('没有可复制的日志内容', 'warn'); return; }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      Utils.notify('✅ 已复制 ' + text.split('\n').length + ' 行日志', 'success');
    }).catch(() => {
      Utils.notify('复制失败，请手动选择', 'error');
    });
  } else {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    Utils.notify('✅ 日志已复制', 'success');
  }
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 操作按钮事件
  ['start', 'stop', 'reload', 'restart', 'test'].forEach(action => {
    const btn = document.getElementById(`btnNginx${action.charAt(0).toUpperCase() + action.slice(1)}`);
    if (btn) btn.addEventListener('click', () => nginxAction(action));
  });

  // 安装按钮
  const installBtn = document.getElementById('btnNginxInstall');
  if (installBtn) installBtn.addEventListener('click', installNginx);

  // 日志按钮
  const logBtn = document.getElementById('btnNginxLogs');
  if (logBtn) logBtn.addEventListener('click', viewNginxLogs);

  // 默认隐藏所有操作按钮（等状态加载后显示）
  updateActionButtons(false);
});