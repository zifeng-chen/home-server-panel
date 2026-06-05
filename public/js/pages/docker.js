// Docker 容器管理页面
let dockerLoaded = false;
const STATE_COLORS = { running: 'var(--success)', exited: 'var(--danger)', paused: 'var(--warning)', created: 'var(--text-secondary)' };
const STATE_TEXT = { running: '运行中', exited: '已停止', paused: '已暂停', created: '已创建', restarting: '重启中', removing: '删除中' };

async function loadDocker() {
  const container = document.getElementById('dockerContent');
  if (!container) return;

  container.innerHTML = '<div class="loading-box">⏳ 加载中...</div>';

  try {
    const res = await Api.get('/docker');
    if (!res.success || !res.data) {
      container.innerHTML = `<div class="empty-state">${res.message || '加载失败'}</div>`;
      return;
    }

    renderDockerPage(res.data);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">❌ ${err.message}</div>`;
  }
}

function renderDockerPage(data) {
  const { info, containers, images, networks, volumes } = data;

  // 概览卡片
  const statsHtml = info?.available ? `
    <div class="stats-grid">
      <div class="stat-card-mini">
        <div class="stat-icon-mini">📦</div>
        <div class="stat-value-mini">${info.containers || 0}</div>
        <div class="stat-label-mini">容器总数</div>
      </div>
      <div class="stat-card-mini running">
        <div class="stat-icon-mini">🟢</div>
        <div class="stat-value-mini">${info.running || 0}</div>
        <div class="stat-label-mini">运行中</div>
      </div>
      <div class="stat-card-mini">
        <div class="stat-icon-mini">💿</div>
        <div class="stat-value-mini">${info.images || 0}</div>
        <div class="stat-label-mini">镜像</div>
      </div>
      <div class="stat-card-mini">
        <div class="stat-icon-mini">🐳</div>
        <div class="stat-value-mini">${info.version || '?'}</div>
        <div class="stat-label-mini">Docker 版本</div>
      </div>
    </div>
  ` : `<div class="empty-state">
    <p style="font-size:15px;margin-bottom:12px">⚠️ ${info?.message || 'Docker 不可用'}</p>
    ${info?.permDenied ? `
    <div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;text-align:left;font-family:Menlo,monospace;font-size:12px;line-height:1.6">
      <code>sudo usermod -aG docker $(whoami)</code><br>
      <code>newgrp docker</code><br>
      <span style="color:var(--text-secondary)">（然后重启本面板服务）</span>
    </div>` : ''}
  </div>`;

  // 容器列表
  const containerRows = containers.map(c => `
    <tr>
      <td><code style="font-size:11px">${c.id}</code></td>
      <td><strong>${c.name}</strong></td>
      <td><small>${c.image}</small></td>
      <td><span class="status-dot" style="background:${STATE_COLORS[c.state] || 'var(--text-secondary)'}"></span>${STATE_TEXT[c.state] || c.state}</td>
      <td><small>${c.ports.map(p => p.raw || `${p.host}:${p.container}`).join(', ') || '--'}</small></td>
      <td><small>${c.status}</small></td>
      <td class="action-cell">
        ${c.state !== 'running' ? `<button class="btn btn-sm btn-success" onclick="dockerAction('${c.name}','start')" title="启动">▶</button>` : ''}
        ${c.state === 'running' ? `<button class="btn btn-sm btn-warning" onclick="dockerAction('${c.name}','stop')" title="停止">⏹</button>` : ''}
        ${c.state === 'running' ? `<button class="btn btn-sm" onclick="dockerAction('${c.name}','restart')" title="重启">🔄</button>` : ''}
        <button class="btn btn-sm" onclick="viewDockerLogs('${c.name}')" title="日志">📋</button>
        ${c.state !== 'running' ? `<button class="btn btn-sm btn-danger" onclick="dockerAction('${c.name}','remove')" title="删除">🗑</button>` : ''}
      </td>
    </tr>
  `).join('');

  // 镜像列表
  const imageRows = images.slice(0, 15).map(i => `
    <tr>
      <td><code>${i.id}</code></td>
      <td>${i.repository}</td>
      <td><span class="badge">${i.tag}</span></td>
      <td>${i.size}</td>
      <td><small>${i.created}</small></td>
    </tr>
  `).join('');

  const html = `
    ${statsHtml}
    ${containers.length > 0 ? `
    <div class="section">
      <h3 class="section-title">📦 容器列表 (${containers.length})</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>名称</th><th>镜像</th><th>状态</th><th>端口</th><th>运行时间</th><th>操作</th></tr></thead>
          <tbody>${containerRows || '<tr class="empty-row"><td colspan="7">暂无容器</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    ` : ''}
    ${images.length > 0 ? `
    <div class="section">
      <h3 class="section-title">💿 镜像 (${images.length})</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>仓库</th><th>标签</th><th>大小</th><th>创建</th></tr></thead>
          <tbody>${imageRows}</tbody>
        </table>
      </div>
    </div>
    ` : ''}
    ${info?.available ? `
    <div class="footer-actions">
      <button class="btn btn-secondary" onclick="loadDocker()">🔄 刷新</button>
      <button class="btn btn-secondary btn-sm" style="margin-left:8px" onclick="Utils.showOpLog('docker', 'Docker')">📋 日志</button>
      <small style="color:var(--text-secondary);margin-left:12px">Docker ${info.version} | ${info.driver}</small>
    </div>
    ` : ''}
  `;

  document.getElementById('dockerContent').innerHTML = html;
}

// 容器操作
window.dockerAction = async (name, action) => {
  if (action === 'remove' && !confirm(`确认删除容器 ${name}?`)) return;

  Utils.notify(`正在执行: ${action} ${name}...`, 'info');
  try {
    const method = action === 'remove' ? 'DELETE' : 'POST';
    const extra = action === 'remove' ? '?force=true' : '';
    const res = await Api.request(method, `/docker/containers/${name}/${action}${extra}`);
    Utils.notify(res.message || '操作完成', res.success ? 'success' : 'error');
    if (res.success) setTimeout(loadDocker, 1500);
  } catch (err) {
    Utils.notify('操作失败: ' + err.message, 'error');
  }
};

// SSE 日志查看
window.viewDockerLogs = (name) => {
  const body = `
    <div id="dockerLogProgress">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span id="dockerLogStatus">📋 实时日志: <strong>${name}</strong></span>
        <span id="dockerLogLines" style="color:var(--text-secondary);font-size:11px"></span>
      </div>
      <pre id="dockerLogOutput" style="max-height:400px;overflow-y:auto;background:var(--bg-tertiary);color:#e0e0e0;padding:12px;border-radius:8px;font-size:12px;font-family:Menlo,monospace;white-space:pre-wrap;word-break:break-all;margin:0">正在连接...</pre>
    </div>
  `;
  Utils.openModal(`📋 容器日志: ${name}`, body, '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>');

  const logDiv = document.getElementById('dockerLogOutput');
  const statusSpan = document.getElementById('dockerLogStatus');
  const linesSpan = document.getElementById('dockerLogLines');
  let lineCount = 0;

  try {
    const es = new EventSource(`/api/docker/containers/${name}/logs/stream?lines=50`);
    es.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          logDiv.textContent += msg.text + '\n';
          lineCount++;
          if (linesSpan) linesSpan.textContent = `${lineCount} 行`;
          logDiv.scrollTop = logDiv.scrollHeight;
        } else if (msg.type === 'done') {
          statusSpan.innerHTML = '📋 日志流结束';
          es.close();
        } else if (msg.type === 'error') {
          statusSpan.innerHTML = '❌ ' + msg.message;
          es.close();
        }
      } catch (err) {}
    });
    es.onerror = () => { statusSpan.innerHTML = '⚠️ 连接中断'; es.close(); };
    const closeBtn = document.querySelector('#hsp-modal .btn-secondary');
    if (closeBtn) closeBtn.addEventListener('click', () => es.close(), { once: true });
  } catch (err) {
    logDiv.textContent = '错误: ' + err.message;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.loadDocker = loadDocker;
});
