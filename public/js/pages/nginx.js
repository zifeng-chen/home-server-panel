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

// 安装 Nginx
window.installNginx = async () => {
  const platform = navigator.platform.includes('Mac') ? 'darwin' : 'linux';
  const body = `
    <div class="form-group">
      <p>Nginx 尚未安装，请选择安装方式：</p>
    </div>
    ${platform === 'darwin' ? `
    <div class="form-group">
      <button class="btn btn-success" id="btnInstallBrew" style="width:100%;justify-content:center;">🍺 brew install nginx (推荐)</button>
    </div>` : ''}
    <div class="form-group">
      <p style="color:var(--text-secondary);font-size:12px;">或手动执行命令：<br><code>${platform === 'darwin' ? 'brew install nginx' : 'sudo apt install -y nginx'}</code></p>
    </div>
  `;

  Utils.openModal('安装 Nginx', body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>');

  document.getElementById('btnInstallBrew')?.addEventListener('click', async () => {
    Utils.closeModal();
    Utils.notify('正在通过 Homebrew 安装 Nginx...', 'info');
    try {
      const res = await Api.post('/nginx/install', { method: 'brew' });
      if (res.success) {
        Utils.notify(res.message, 'success');
        setTimeout(loadNginx, 2000);
      } else {
        Utils.notify(res.message || '安装失败', 'error');
      }
    } catch (err) {
      Utils.notify('安装失败: ' + err.message, 'error');
    }
  });
};

// 查看日志
window.viewNginxLogs = async () => {
  const type = document.getElementById('nginxLogType')?.value || 'error';
  try {
    const res = await Api.get(`/nginx/logs?type=${type}&lines=100`);
    if (res.success && res.data) {
      const logs = res.data.logs || '(空)';
      const body = `<pre style="max-height:400px;overflow:auto;background:var(--bg-tertiary);padding:12px;border-radius:8px;font-size:11px;white-space:pre-wrap;word-break:break-all;">${logs}</pre>`;
      Utils.openModal(`${type === 'access' ? '访问' : '错误'}日志 (${res.data.path || ''})`, body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>');
    } else {
      Utils.notify(res.message || '未找到日志', 'error');
    }
  } catch (err) {
    Utils.notify('加载日志失败', 'error');
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