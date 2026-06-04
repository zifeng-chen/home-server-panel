// Nginx 管理 + 反向代理（合并页面）
let nginxLoaded = false;

const NGINX_ACTION_LABELS = {
  start: '🚀 启动', stop: '🛑 停止', reload: '🔄 重载', restart: '♻️ 重启', test: '🧪 配置测试'
};

// ========== 标签切换 ==========

function initNginxTabs() {
  const tabs = document.querySelectorAll('#page-nginx .nginx-tab');
  const panels = document.querySelectorAll('#page-nginx .nginx-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      // 切换激活
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById('panel-' + tabName);
      if (panel) panel.classList.remove('hidden');

      // 懒加载
      if (tabName === 'nginx-sites') loadNginx();
      else if (tabName === 'nginx-proxy') loadProxy();

      // 诊断标记
      if (typeof Api !== 'undefined') Api._currentPage = 'nginx-' + tabName;
    });
  });
}

// ========== Nginx 管理 ==========

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
    const installBtn = document.getElementById('btnNginxInstall');
    if (installBtn) installBtn.style.display = 'inline-flex';
    return;
  }

  const running = data.running;
  bar.innerHTML = `
    <span class="status-badge ${running ? 'online' : 'offline'}" style="font-size:14px;padding:8px 16px;margin-right:16px;">${running ? '运行中' : '已停止'}</span>
    <span style="color:var(--text-secondary);font-size:13px;">
      v${data.version || '?'} &nbsp;|&nbsp;
      PID: ${data.pid || '--'} &nbsp;|&nbsp;
      运行时长: ${data.uptime || '--'} &nbsp;|&nbsp;
      配置测试: <span style="color:var(--${data.configTest === 'ok' ? 'success' : 'danger'})">${data.configTest === 'ok' ? '✅' : '❌'}</span>
    </span>
    ${data.configDir ? `<br><small style="color:var(--text-secondary)">📁 ${data.configDir}</small>` : ''}
  `;
  updateActionButtons(running);
}

function updateActionButtons(running) {
  ['start','stop','reload','restart'].forEach(action => {
    const btn = document.getElementById('btnNginx' + action.charAt(0).toUpperCase() + action.slice(1));
    if (btn) btn.style.display = running ? (['stop','reload','restart'].includes(action) ? 'inline-flex' : 'none') : (action === 'start' ? 'inline-flex' : 'none');
  });
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
      <td><button class="btn btn-sm" onclick="viewSiteConfig('${encodeURIComponent(s.filePath)}')">查看</button></td>
    </tr>
  `).join('');
}

// Nginx 操作
async function nginxAction(action) {
  Utils.notify(`正在执行: ${NGINX_ACTION_LABELS[action] || action}...`, 'info');
  try {
    const res = await Api.post(`/nginx/${action}`);
    if (res.success) { Utils.notify(res.message || '操作完成', 'success'); setTimeout(loadNginx, 1000); }
    else Utils.notify(res.message || '操作失败', 'error');
  } catch (err) { Utils.notify('操作失败: ' + err.message, 'error'); }
}

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
    if (!site) { Utils.notify('未找到站点配置', 'error'); return; }

    const body = `
      <div class="form-group"><label>配置文件</label><code>${site.filePath}</code></div>
      <div class="form-group"><label>服务名</label><code>${site.serverName || '_'}</code></div>
      <div class="form-group"><label>监听</label><code>${site.listen || '80'}</code></div>
      <div class="form-group"><label>SSL</label><span class="status-badge ${site.ssl ? 'online' : ''}">${site.ssl ? '启用' : '未启用'}</span></div>
      ${site.ssl ? `<div class="form-group"><label>证书</label><code>${site.sslCert || '--'}</code></div><div class="form-group"><label>私钥</label><code>${site.sslKey || '--'}</code></div>` : ''}
      ${site.proxyPass ? `<div class="form-group"><label>反向代理</label><code>→ ${site.proxyPass}</code></div>` : ''}
      ${site.root ? `<div class="form-group"><label>根目录</label><code>${site.root}</code></div>` : ''}
      ${site.locations?.length ? `<div class="form-group"><label>Location 块 (${site.locations.length})</label>${site.locations.map(l => `<div style="margin:4px 0"><code>${l.path}</code> ${l.proxyPass ? '→ ' + l.proxyPass : l.root ? '📁 ' + l.root : ''}</div>`).join('')}</div>` : ''}
    `;
    Utils.openModal(`站点详情: ${site.name || site.file}`, body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>');
  } catch (err) { Utils.notify('加载站点详情失败', 'error'); }
};

// 安装 Nginx（SSE）
window.installNginx = async () => {
  let guide;
  try { const res = await Api.post('/nginx/install'); guide = res.data || res; }
  catch (e) { guide = { platform: 'linux', recommended: 'apt', methods: ['apt', 'yum'] }; }

  if (guide.installed) { Utils.notify('Nginx 已安装', 'success'); return loadNginx(); }

  const methods = guide.methods || (guide.platform === 'darwin' ? ['brew'] : ['apt', 'yum', 'apk']);
  const recommended = guide.recommended || methods[0];
  const labels = { brew: '🍺 Homebrew (推荐)', apt: '📦 APT (推荐)', yum: '📦 YUM', apk: '📦 APK (Alpine)' };

  const methodButtons = methods.map(m => `<button class="btn btn-${m === recommended ? 'success' : 'secondary'}" onclick="startNginxInstall('${m}')" style="flex:1">${labels[m] || m.toUpperCase()}</button>`).join('');

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

window.startNginxInstall = async (method) => {
  const progressDiv = document.getElementById('installProgress');
  const logDiv = document.getElementById('installLog');
  const statusSpan = document.getElementById('installStatus');
  if (!progressDiv || !logDiv || !statusSpan) return;

  progressDiv.style.display = 'block'; logDiv.textContent = ''; statusSpan.textContent = '⏳ 正在连接...';
  progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = true);

  try {
    const token = localStorage.getItem('hsp_token');
    const eventSource = new EventSource(`/api/nginx/install/stream?method=${method}&token=${token}`);
    let killed = false;

    const handler = (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'start': statusSpan.innerHTML = `🔧 执行: <code style="font-size:11px">${msg.method}</code>`; logDiv.textContent += `$ ${msg.command}\n`; break;
          case 'output': logDiv.textContent += msg.text + '\n'; logDiv.scrollTop = logDiv.scrollHeight; break;
          case 'done': statusSpan.textContent = '✅ ' + msg.message; statusSpan.style.color = 'var(--success)'; eventSource.close(); setTimeout(() => { Utils.closeModal(); loadNginx(); }, 1500); break;
          case 'error': statusSpan.textContent = '❌ ' + msg.message; statusSpan.style.color = 'var(--danger)'; progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false); eventSource.close(); break;
        }
      } catch (parseErr) { logDiv.textContent += '[解析错误] ' + e.data + '\n'; }
    };

    eventSource.addEventListener('message', handler);
    eventSource.onerror = () => { if (!killed) { statusSpan.textContent = '❌ 连接中断'; statusSpan.style.color = 'var(--danger)'; } eventSource.close(); progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false); };

    const closeBtn = document.querySelector('#hsp-modal .btn-secondary');
    if (closeBtn) closeBtn.addEventListener('click', () => { killed = true; eventSource.close(); }, { once: true });
  } catch (err) { statusSpan.textContent = '❌ ' + err.message; statusSpan.style.color = 'var(--danger)'; progressDiv.parentElement.querySelectorAll('button').forEach(b => b.disabled = false); }
};

// 查看日志
window.viewNginxLogs = async (type) => {
  type = type || 'error';
  const title = `📋 Nginx ${type === 'access' ? '访问' : '错误'}日志`;
  const body = `
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
      <button class="btn btn-sm ${type==='error'?'btn-primary':'btn-secondary'}" onclick="viewNginxLogs('error')">错误日志</button>
      <button class="btn btn-sm ${type==='access'?'btn-primary':'btn-secondary'}" onclick="viewNginxLogs('access')">访问日志</button>
      <span id="logPath" style="color:var(--text-secondary);font-size:12px;margin-left:auto;">加载中...</span>
    </div>
    <div id="logLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ 加载中...</div>
    <pre id="logContent" style="display:none;max-height:420px;overflow:auto;background:var(--bg-tertiary,#0f172a);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#cbd5e1;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
  `;
  const footer = `<button class="btn btn-sm btn-secondary" onclick="copyNginxLog()">📋 一键复制</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>`;
  Utils.openModal(title, body, footer);

  try {
    const res = await Api.get(`/nginx/logs?type=${type}&lines=200`);
    const logEl = document.getElementById('logContent'), loaderEl = document.getElementById('logLoader'), pathEl = document.getElementById('logPath');
    if (logEl && loaderEl) {
      loaderEl.style.display = 'none'; logEl.style.display = 'block';
      if (res.success && res.data) { logEl.textContent = res.data.logs || '(空)'; if (pathEl) pathEl.textContent = '📁 ' + (res.data.path || ''); window._hspNginxLog = res.data.logs || ''; }
      else { logEl.textContent = res.message || '加载失败'; window._hspNginxLog = ''; }
    }
  } catch (err) { const loaderEl = document.getElementById('logLoader'); if (loaderEl) loaderEl.textContent = '❌ 加载失败: ' + err.message; window._hspNginxLog = ''; }
};

window.copyNginxLog = () => {
  const text = window._hspNginxLog || '';
  if (!text) { Utils.notify('没有可复制的日志内容', 'warn'); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => Utils.notify('✅ 已复制 ' + text.split('\n').length + ' 行日志', 'success')).catch(() => Utils.notify('复制失败，请手动选择', 'error')); }
  else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); Utils.notify('✅ 日志已复制', 'success'); }
};

// ========== 反向代理 ==========

const PROTOCOL_OPTIONS = ['http', 'https'];

async function loadProxy() {
  const tbody = document.getElementById('proxyTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">加载中...</td></tr>';

  try {
    const res = await Api.get('/proxy');
    if (!res.success) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${res.message || '加载失败'}</td></tr>`; return; }

    const rules = res.data?.rules || [];
    const stats = res.data?.stats || {};
    updateProxyStats(stats);

    if (rules.length === 0) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无代理规则<br><small>点击「添加规则」创建第一条反向代理</small></td></tr>'; return; }

    tbody.innerHTML = rules.map(r => {
      const source = `${r.sourceProtocol}://${r.sourceHost}:${r.sourcePort}`;
      const target = `${r.targetProtocol}://${r.targetHost}:${r.targetPort}`;
      return `
        <tr style="${r.enabled ? '' : 'opacity:0.5'}">
          <td><strong>${r.name}</strong></td>
          <td><code>${source}</code>${r.ssl ? ' <span class="status-badge online" style="font-size:10px">SSL</span>' : ''}${r.websocket ? ' <span class="status-badge online" style="font-size:10px">WS</span>' : ''}</td>
          <td><code>→ ${target}</code></td>
          <td><span class="status-badge ${r.enabled ? 'online' : 'offline'}">${r.enabled ? '启用' : '停用'}</span></td>
          <td><small>${formatDate(r.updatedAt || r.createdAt)}</small></td>
          <td>
            <button class="btn btn-sm" onclick="toggleProxy('${r.id}')">${r.enabled ? '⏸ 停用' : '▶ 启用'}</button>
            <button class="btn btn-sm btn-primary" onclick="editProxy('${r.id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProxy('${r.id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">加载失败: ${err.message}</td></tr>`; }
}

function updateProxyStats(stats) {
  const el = document.getElementById('proxyStats');
  if (!el) return;
  el.innerHTML = `📋 总计: <strong>${stats.total || 0}</strong> &nbsp;|&nbsp; ✅ 启用: <strong>${stats.enabled || 0}</strong> &nbsp;|&nbsp; ⏸ 停用: <strong>${stats.disabled || 0}</strong> &nbsp;|&nbsp; 🔒 HTTPS: <strong>${stats.https || 0}</strong>`;
}

function buildProxyForm(rule) {
  const isEdit = !!rule;
  const defaults = {
    name: '', description: '', sourceProtocol: 'http', sourceHost: '', sourcePort: 80,
    targetProtocol: 'http', targetHost: '', targetPort: 80, ssl: false, websocket: false, ...rule
  };

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group" style="grid-column:1/-1;">
        <label>规则名称</label>
        <input type="text" id="proxyName" class="form-input" value="${defaults.name}" placeholder="例如：Jellyfin 媒体服务器">
      </div>
      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">📥 来源（外部访问）</div>
      <div class="form-group"><label>协议</label><select id="proxySrcProto" class="form-input">${PROTOCOL_OPTIONS.map(p => `<option value="${p}" ${defaults.sourceProtocol === p ? 'selected' : ''}>${p.toUpperCase()}</option>`).join('')}</select></div>
      <div class="form-group"><label>域名/IP</label><input type="text" id="proxySrcHost" class="form-input" value="${defaults.sourceHost}" placeholder="例如：jellyfin.example.com"></div>
      <div class="form-group"><label>端口</label><input type="number" id="proxySrcPort" class="form-input" value="${defaults.sourcePort}" min="1" max="65535"></div>
      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">📤 目标（内网服务）</div>
      <div class="form-group"><label>协议</label><select id="proxyTgtProto" class="form-input">${PROTOCOL_OPTIONS.map(p => `<option value="${p}" ${defaults.targetProtocol === p ? 'selected' : ''}>${p.toUpperCase()}</option>`).join('')}</select></div>
      <div class="form-group"><label>主机/IP</label><input type="text" id="proxyTgtHost" class="form-input" value="${defaults.targetHost}" placeholder="例如：192.168.1.100"></div>
      <div class="form-group"><label>端口</label><input type="number" id="proxyTgtPort" class="form-input" value="${defaults.targetPort}" min="1" max="65535"></div>
      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">⚙️ 高级选项</div>
      <div class="form-group" style="grid-column:1/-1;display:flex;gap:16px;">
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="proxySsl" ${defaults.ssl ? 'checked' : ''}> 🔒 启用 SSL</label>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="proxyWs" ${defaults.websocket ? 'checked' : ''}> 🔌 WebSocket 支持</label>
      </div>
      ${defaults.ssl ? `<div class="form-group"><label>SSL 证书路径</label><input type="text" id="proxySslCert" class="form-input" value="${defaults.sslCert || ''}" placeholder="/etc/nginx/ssl/domain.pem"></div><div class="form-group"><label>SSL 私钥路径</label><input type="text" id="proxySslKey" class="form-input" value="${defaults.sslKey || ''}" placeholder="/etc/nginx/ssl/domain.key"></div>` : ''}
    </div>
  `;
}

window.showAddProxyModal = () => {
  const body = buildProxyForm(null);
  Utils.openModal('添加反向代理规则', body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button><button class="btn btn-success" id="proxySaveBtn">💾 保存规则</button>');
  document.getElementById('proxySrcProto').addEventListener('change', toggleSslFields);
  document.getElementById('proxySaveBtn').addEventListener('click', () => saveProxy());
};

window.editProxy = (id) => {
  Api.get('/proxy').then(data => {
    const rules = data.data?.rules || [];
    const rule = rules.find(r => r.id === id);
    if (!rule) { Utils.notify('规则不存在', 'error'); return; }
    const body = buildProxyForm(rule);
    Utils.openModal('编辑反向代理规则', body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button><button class="btn btn-primary" id="proxySaveBtn">💾 更新规则</button>');
    document.getElementById('proxySrcProto').addEventListener('change', toggleSslFields);
    document.getElementById('proxySaveBtn').addEventListener('click', () => saveProxy(id));
  });
};

function toggleSslFields() {
  const proto = document.getElementById('proxySrcProto')?.value;
  const certEl = document.getElementById('proxySslCert');
  const keyEl = document.getElementById('proxySslKey');
  if (proto === 'https') { document.getElementById('proxySsl').checked = true; if (certEl) certEl.closest('.form-group').style.display = ''; if (keyEl) keyEl.closest('.form-group').style.display = ''; }
}

async function saveProxy(id) {
  const data = {
    name: document.getElementById('proxyName').value.trim(),
    sourceProtocol: document.getElementById('proxySrcProto').value,
    sourceHost: document.getElementById('proxySrcHost').value.trim(),
    sourcePort: parseInt(document.getElementById('proxySrcPort').value) || 80,
    targetProtocol: document.getElementById('proxyTgtProto').value,
    targetHost: document.getElementById('proxyTgtHost').value.trim(),
    targetPort: parseInt(document.getElementById('proxyTgtPort').value) || 80,
    ssl: document.getElementById('proxySsl').checked,
    sslCert: document.getElementById('proxySslCert')?.value || null,
    sslKey: document.getElementById('proxySslKey')?.value || null,
    websocket: document.getElementById('proxyWs').checked
  };
  if (!data.sourceHost || !data.targetHost) { Utils.notify('来源域名和目标主机不能为空', 'error'); return; }
  Utils.closeModal();
  const res = id ? await Api.put(`/proxy/${id}`, data) : await Api.post('/proxy', data);
  if (res.success) { Utils.notify(res.message, 'success'); loadProxy(); }
  else Utils.notify(res.message || '操作失败', 'error');
}

window.toggleProxy = async (id) => {
  const res = await Api.post(`/proxy/${id}/toggle`);
  if (res.success) { Utils.notify(res.message, 'success'); loadProxy(); }
  else Utils.notify(res.message || '操作失败', 'error');
};

window.deleteProxy = async (id) => {
  Utils.confirm('删除代理规则', '确定要删除这条代理规则吗？', async () => {
    const res = await Api.del(`/proxy/${id}`);
    if (res.success) { Utils.notify(res.message, 'success'); loadProxy(); }
    else Utils.notify(res.message || '删除失败', 'error');
  });
};

window.previewProxyConfig = async () => {
  const res = await Api.get('/proxy/config/preview');
  if (res.success && res.data?.config) {
    Utils.openModal('Nginx 配置预览',
      `<pre style="max-height:500px;overflow:auto;background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;font-family:monospace;">${res.data.config || '(无规则)'}</pre>`,
      '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button><button class="btn btn-primary" onclick="exportProxyConfig()">💾 导出到文件</button>'
    );
  } else { Utils.notify('暂无启用的代理规则', 'info'); }
};

window.exportProxyConfig = async () => {
  const path = prompt('导出文件路径:', '/tmp/proxy-nginx.conf');
  if (!path) return;
  const res = await Api.post('/proxy/config/export', { filePath: path });
  if (res.success) { Utils.notify(res.message, 'success'); Utils.closeModal(); }
  else Utils.notify(res.message || '导出失败', 'error');
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  // 标签切换
  initNginxTabs();

  // Nginx 操作按钮
  ['start', 'stop', 'reload', 'restart', 'test'].forEach(action => {
    const btn = document.getElementById(`btnNginx${action.charAt(0).toUpperCase() + action.slice(1)}`);
    if (btn) btn.addEventListener('click', () => nginxAction(action));
  });

  const installBtn = document.getElementById('btnNginxInstall');
  if (installBtn) installBtn.addEventListener('click', installNginx);

  const logBtn = document.getElementById('btnNginxLogs');
  if (logBtn) logBtn.addEventListener('click', () => viewNginxLogs());

  // 反向代理按钮
  const addBtn = document.getElementById('btnProxyAdd');
  if (addBtn) addBtn.addEventListener('click', showAddProxyModal);

  // 代理工具栏：统计区 + 预览 + 导出
  const toolbar = document.querySelector('#panel-nginx-proxy .page-toolbar');
  if (toolbar) {
    if (!document.getElementById('proxyStats')) {
      const stats = document.createElement('span');
      stats.id = 'proxyStats';
      stats.style.cssText = 'margin-left:16px;font-size:12px;color:var(--text-secondary);';
      toolbar.appendChild(stats);
    }
    if (!document.getElementById('btnProxyPreview')) {
      const pb = document.createElement('button');
      pb.className = 'btn btn-secondary btn-sm'; pb.id = 'btnProxyPreview'; pb.textContent = '📄 预览配置'; pb.style.marginLeft = '8px';
      pb.addEventListener('click', previewProxyConfig);
      toolbar.appendChild(pb);
    }
    if (!document.getElementById('btnProxyExport')) {
      const eb = document.createElement('button');
      eb.className = 'btn btn-secondary btn-sm'; eb.id = 'btnProxyExport'; eb.textContent = '💾 导出'; eb.style.marginLeft = '4px';
      eb.addEventListener('click', exportProxyConfig);
      toolbar.appendChild(eb);
    }
  }

  // 默认隐藏 Nginx 操作按钮
  updateActionButtons(false);
});
