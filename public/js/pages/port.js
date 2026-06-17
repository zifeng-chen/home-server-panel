// 端口管理页面
let portLoaded = false;

const SERVICE_TYPE_MAP = {
  docker: { label: 'Docker', icon: '🐳', color: '#0891b2' },
  system: { label: '系统', icon: '⚙️', color: '#ea580c' },
  local: { label: '本地', icon: '🖥️', color: '#7c3aed' }
};

async function loadPort() {
  const tbody = document.getElementById('portTbody');
  const statsEl = document.getElementById('portStats');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">正在扫描端口...</td></tr>';

  try {
    const res = await Api.get('/port/scan');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${res.message || '扫描失败'}</td></tr>`;
      return;
    }

    const ports = res.data?.ports || [];
    const stats = res.data?.stats || {};

    if (statsEl) {
      const dockerCount = ports.filter(p => p.serviceType === 'docker').length;
      const sysCount = ports.filter(p => p.serviceType === 'system').length;
      const udpCount = ports.filter(p => p.protocol === 'UDP').length;
      statsEl.innerHTML = `
        <span style="margin-right:16px;">📡 总计: <strong>${stats.total || 0}</strong></span>
        <span style="margin-right:16px;color:var(--success);">🌐 Web: <strong>${stats.webPorts || 0}</strong></span>
        <span style="margin-right:16px;color:var(--info);">📶 UDP: <strong>${udpCount}</strong></span>
        <span style="margin-right:16px;color:${SERVICE_TYPE_MAP.docker.color};">🐳 Docker: <strong>${dockerCount}</strong></span>
        <span style="margin-right:16px;color:${SERVICE_TYPE_MAP.system.color};">⚙️ 系统: <strong>${sysCount}</strong></span>
      `;
    }

    if (ports.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">未检测到监听端口<br><small>点击「刷新扫描」重新检测</small></td></tr>';
      return;
    }

    tbody.innerHTML = ports.map(p => {
      const isUdp = p.protocol === 'UDP';
      const isSelf = p.port === 3456;
      const statusColor = p.status === 'LISTEN' ? 'var(--success)' : (isUdp ? 'var(--info)' : 'var(--text-secondary)');
      const stype = SERVICE_TYPE_MAP[p.serviceType] || SERVICE_TYPE_MAP.local;

      return `
        <tr class="${isSelf ? 'highlight-row' : ''}">
          <td>
            <strong>${p.port}</strong>
            <small style="color:var(--text-secondary);">/${p.protocol}</small>
          </td>
          <td>
            ${p.description}
            ${p.process && p.process !== p.description ? `<br><small style="color:var(--text-secondary);">${p.process}</small>` : ''}
          </td>
          <td><span style="color:${stype.color};font-weight:600;">${stype.icon} ${stype.label}</span></td>
          <td><small>${p.host || '0.0.0.0'}</small></td>
          <td><span style="color:${statusColor};" class="status-badge ${isUdp ? 'offline' : 'online'}">${p.status}</span></td>
          ${p.pid ? `<td><code>PID ${p.pid}</code></td>` : '<td>--</td>'}
          <td>
            ${(p.serviceType === 'system' || isSelf || isUdp) ? '<button class="btn btn-sm" onclick="checkSinglePort(${p.port})">🔍 检测</button>' : '<button class="btn btn-sm btn-danger" onclick="killPort(${p.port}, \'${p.process}\')">⏹ 终止</button> <button class="btn btn-sm btn-success" onclick="startPort(${p.port}, \'${p.process}\', \'${p.description}\')">▶ 恢复</button>'}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">扫描失败: ${escapeHtml(String(err.message))}</td></tr>`;
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
(function initPortButtons() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortButtons);
    return;
  }
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
})();
// 终止端口进程
window.killPort = async (port, process) => {
  Utils.confirm('终止端口进程', `确定要终止端口 ${port} 的进程 "${process}" 吗？`, async () => {
    const res = await Api.post(`/port/kill/${port}`);
    if (res.success) {
      Utils.notify(res.message || `端口 ${port} 已终止`, 'success');
      setTimeout(loadPort, 1000);
    } else {
      Utils.notify(res.message || '终止失败', 'error');
    }
  });
};

// 恢复端口服务（需要知道启动命令，简单场景用 systemctl）
window.startPort = async (port, process, desc) => {
  const cmd = prompt(`恢复端口 ${port} (${desc})\n请输入启动命令:`, desc ? `systemctl start ${desc.toLowerCase().replace(/ /g, '-')}` : '');
  if (!cmd) return;
  const res = await Api.post('/port/start', { port, command: cmd });
  if (res.success) {
    Utils.notify(res.message || '启动命令已执行', 'success');
    setTimeout(loadPort, 1000);
  } else {
    Utils.notify(res.message || '命令执行失败', 'error');
  }
};

// 导出供 app.js 的 _ensurePage 调用
window.loadPort = loadPort;

// 服务类型筛选
window.filterPortType = function() {
  const filter = document.getElementById('portTypeFilter')?.value || 'all';
  const tbody = document.getElementById('portTbody');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  rows.forEach(row => {
    const typeCell = row.children[2];
    if (!typeCell) return;
    const text = typeCell.textContent || '';
    if (filter === 'all') {
      row.style.display = '';
    } else if (filter === 'docker' && text.includes('Docker')) {
      row.style.display = '';
    } else if (filter === 'system' && text.includes('系统')) {
      row.style.display = '';
    } else if (filter === 'local' && text.includes('本地')) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
};
