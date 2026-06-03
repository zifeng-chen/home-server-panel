// 端口管理页面
let portLoaded = false;

async function loadPort() {
  const tbody = document.getElementById('portTbody');
  const statsEl = document.getElementById('portStats');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">正在扫描端口...</td></tr>';

  try {
    const res = await Api.get('/port/scan');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${res.message || '扫描失败'}</td></tr>`;
      return;
    }

    const ports = res.data?.ports || [];
    const stats = res.data?.stats || {};

    if (statsEl) {
      const udpCount = ports.filter(p => p.protocol === 'UDP').length;
      statsEl.innerHTML = `
        <span style="margin-right:16px;">📡 监听端口: <strong>${stats.total || 0}</strong></span>
        <span style="margin-right:16px;color:var(--success);">🌐 Web端口: <strong>${stats.webPorts || 0}</strong></span>
        <span style="margin-right:16px;color:var(--info);">📶 UDP: <strong>${udpCount}</strong></span>
        <span style="color:var(--text-secondary);">🖥️ 进程: <strong>${stats.topProcesses?.[0]?.name || '--'}</strong></span>
      `;
    }

    if (ports.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">未检测到监听端口<br><small>点击「刷新扫描」重新检测</small></td></tr>';
      return;
    }

    tbody.innerHTML = ports.map(p => {
      const isSystem = p.port < 1024;
      const isWeb = [80, 443, 8080, 8443, 3000, 4000, 5000, 8096, 32400, 9000, 8082].includes(p.port);
      const isSelf = p.port === 3456;
      const isUdp = p.protocol === 'UDP';
      const statusColor = p.status === 'LISTEN' ? 'var(--success)' : (isUdp ? 'var(--info)' : 'var(--text-secondary)');
      
      let icon = '📌';
      if (isWeb) icon = '🌐';
      else if (isSystem) icon = '⚙️';
      else if (isSelf) icon = '🏠';
      else if (isUdp) icon = '📡';

      return `
        <tr class="${isSelf ? 'highlight-row' : ''}">
          <td>
            <span style="font-size:18px;margin-right:6px;">${icon}</span>
            <strong>${p.port}</strong>
            <small style="color:var(--text-secondary);">/${p.protocol}</small>
          </td>
          <td>
            ${p.description}
            ${p.process && p.process !== p.description ? `<br><small style="color:var(--text-secondary);">${p.process}</small>` : ''}
          </td>
          <td><small>${p.host || '0.0.0.0'}</small></td>
          <td><span style="color:${statusColor};" class="status-badge ${isUdp ? 'offline' : 'online'}">${p.status}</span></td>
          ${p.pid ? `<td><code>PID ${p.pid}</code></td>` : '<td>--</td>'}
          <td>
            <button class="btn btn-sm" onclick="checkSinglePort(${p.port})">🔍 检测</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">扫描失败: ${err.message}</td></tr>`;
  }
}

// 手动触发全量扫描
async function reScanPorts() {
  const tbody = document.getElementById('portTbody');
  if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="6">扫描中<span class="spinner-center"></span></td></tr>';
  await loadPort();
}

// 检查单个端口
window.checkSinglePort = async (port) => {
  const res = await Api.get(`/port/check/${port}`);
  if (res.success) {
    const d = res.data;
    Utils.notify(d.available ? `端口 ${port} 空闲可用` : `端口 ${port} 已被 ${d.process || '未知进程'} 占用`, d.available ? 'success' : 'warn');
  } else {
    Utils.notify('检测失败: ' + res.message, 'error');
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('btnPortScan');
  const refreshBtn = document.getElementById('btnPortRefresh');

  if (scanBtn) scanBtn.addEventListener('click', reScanPorts);
  if (refreshBtn) refreshBtn.addEventListener('click', reScanPorts);

  // 统计区
  const toolbar = document.querySelector('#page-port .page-toolbar');
  if (toolbar && !document.getElementById('portStats')) {
    const statsSpan = document.createElement('span');
    statsSpan.id = 'portStats';
    statsSpan.style.cssText = 'margin-left:16px;font-size:12px;color:var(--text-secondary);';
    toolbar.appendChild(statsSpan);
  }

  // 刷新按钮
  if (toolbar && !document.getElementById('btnPortRefresh')) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.id = 'btnPortRefresh';
    btn.textContent = '🔄 刷新扫描';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', reScanPorts);
    toolbar.appendChild(btn);
  }
});