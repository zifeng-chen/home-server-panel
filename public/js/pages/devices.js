// 设备中心页面
let devicesLoaded = false;

async function loadDevices() {
  if (devicesLoaded) return;
  devicesLoaded = true;
  await refreshDevices();
}

async function refreshDevices() {
  const grid = document.getElementById('deviceStatsGrid');
  const tbody = document.getElementById('deviceTbody');
  if (!grid || !tbody) return;

  grid.innerHTML = '<div class="stat-card loading"><div class="stat-icon">⏳</div><div class="stat-info"><span class="stat-label">加载中...</span><span class="stat-value">--</span></div></div>'.repeat(3);

  try {
    const [statsRes, listRes] = await Promise.all([
      Api.get('/v1/device/stats'),
      Api.get('/v1/device')
    ]);

    // 统计卡片
    const stats = (statsRes && statsRes.success) ? statsRes.data : { online: 0, offline: 0, total: 0 };
    grid.innerHTML = [
      { icon: '🖥️', label: '设备总数', value: stats.total + ' 台', color: 'var(--info)' },
      { icon: '🟢', label: '在线设备', value: stats.online + ' 台', color: 'var(--success)' },
      { icon: '🔴', label: '离线设备', value: stats.offline + ' 台', color: stats.offline > 0 ? 'var(--danger)' : 'var(--text-secondary)' }
    ].map(c =>
      '<div class="stat-card"><div class="stat-icon">' + c.icon + '</div><div class="stat-info"><span class="stat-label">' + c.label + '</span><span class="stat-value" style="color:' + c.color + '">' + c.value + '</span></div></div>'
    ).join('');

    // 设备列表
    const devices = (listRes && listRes.success && listRes.data.devices) ? listRes.data.devices : [];
    if (devices.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无设备<br><small>安装 HSP Agent 后设备将自动注册</small></td></tr>';
      return;
    }

    tbody.innerHTML = devices.map(d => {
      const statusClass = d.status === 'online' ? 'status-online' : 'status-offline';
      const statusText = d.status === 'online' ? '🟢 在线' : '🔴 离线';
      const lastSeen = d.last_seen ? formatTime(new Date(d.last_seen)) : '--';
      const osIcon = getOsIcon(d.os);
      return '<tr>'
        + '<td><strong>' + Utils.escapeHtml(d.name || d.hostname) + '</strong></td>'
        + '<td>' + osIcon + ' ' + Utils.escapeHtml(d.os || '--') + '</td>'
        + '<td>' + Utils.escapeHtml(d.arch || '--') + '</td>'
        + '<td>' + Utils.escapeHtml(d.ip || '--') + '</td>'
        + '<td><span class="' + statusClass + '">' + statusText + '</span></td>'
        + '<td>' + lastSeen + '</td>'
        + '<td>'
          + '<button class="btn btn-sm btn-secondary" onclick="viewDeviceDetail(\'' + d.id + '\')">📋 详情</button> '
          + (d.id !== 'dev_local' ? '<button class="btn btn-sm btn-danger" onclick="removeDevice(\'' + d.id + '\', \'' + Utils.escapeHtml(d.name || d.hostname) + '\')">🗑</button>' : '')
        + '</td>'
      + '</tr>';
    }).join('');

  } catch (err) {
    console.error('[Devices] 加载失败:', err);
    grid.innerHTML = '<div class="stat-card" style="grid-column:1/-1;text-align:center;color:var(--danger);padding:24px;">⚠️ 加载失败: ' + (err.message || '未知错误') + '</div>';
  }
}

function getOsIcon(os) {
  const map = { linux: '🐧', darwin: '🍎', win32: '🪟', openwrt: '📡' };
  return map[os] || '💻';
}

async function viewDeviceDetail(deviceId) {
  try {
    const res = await Api.get('/v1/device/' + deviceId);
    if (!res || !res.success) {
      Utils.notify('获取设备详情失败', 'error');
      return;
    }
    const d = res.data;
    const metric = d.latestMetric;
    const statusColor = d.status === 'online' ? 'var(--success)' : 'var(--danger)';
    const statusText = d.status === 'online' ? '🟢 在线' : '🔴 离线';

    let metricHtml = '<p style="color:var(--text-secondary)">暂无指标数据</p>';
    if (metric) {
      metricHtml = '<div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-top:12px;">'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">CPU</span><span class="stat-value">' + metric.cpu + '%</span></div></div>'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">内存</span><span class="stat-value">' + metric.memory + '%</span></div></div>'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">磁盘</span><span class="stat-value">' + metric.disk + '%</span></div></div>'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">温度</span><span class="stat-value">' + (metric.temperature > 0 ? metric.temperature + '°C' : '--') + '</span></div></div>'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">负载</span><span class="stat-value">' + (metric.load_avg || '--') + '</span></div></div>'
        + '<div class="stat-card"><div class="stat-info"><span class="stat-label">网络 RX/TX</span><span class="stat-value">' + formatBytes(metric.network_rx) + ' / ' + formatBytes(metric.network_tx) + '</span></div></div>'
        + '</div>';
    }

    let pluginHtml = '<p style="color:var(--text-secondary)">暂无插件</p>';
    if (d.plugins && d.plugins.length > 0) {
      pluginHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'
        + d.plugins.map(p => '<span style="padding:4px 12px;background:var(--bg-primary);border-radius:20px;font-size:13px;">'
          + (p.enabled ? '✅' : '⬜') + ' ' + Utils.escapeHtml(p.plugin_name) + ' ' + (p.version || '')
          + '</span>').join('')
        + '</div>';
    }

    const body = ''
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">'
        + '<div>'
          + '<h4 style="margin-bottom:8px;">📋 基本信息</h4>'
          + '<table class="data-table"><tbody>'
            + '<tr><td>设备 ID</td><td><code>' + Utils.escapeHtml(d.id) + '</code></td></tr>'
            + '<tr><td>名称</td><td>' + Utils.escapeHtml(d.name || d.hostname) + '</td></tr>'
            + '<tr><td>主机名</td><td>' + Utils.escapeHtml(d.hostname) + '</td></tr>'
            + '<tr><td>IP 地址</td><td>' + Utils.escapeHtml(d.ip || '--') + '</td></tr>'
            + '<tr><td>系统</td><td>' + getOsIcon(d.os) + ' ' + Utils.escapeHtml(d.os) + ' ' + Utils.escapeHtml(d.arch) + '</td></tr>'
            + '<tr><td>Agent 版本</td><td>' + Utils.escapeHtml(d.version || '--') + '</td></tr>'
            + '<tr><td>状态</td><td style="color:' + statusColor + '">' + statusText + '</td></tr>'
            + '<tr><td>最后心跳</td><td>' + (d.last_seen ? formatTime(new Date(d.last_seen)) : '--') + '</td></tr>'
            + '<tr><td>注册时间</td><td>' + (d.created_at ? formatTime(new Date(d.created_at)) : '--') + '</td></tr>'
          + '</tbody></table>'
        + '</div>'
        + '<div>'
          + '<h4 style="margin-bottom:8px;">📊 实时指标</h4>'
          + metricHtml
          + '<h4 style="margin:16px 0 8px;">🔌 插件</h4>'
          + pluginHtml
        + '</div>'
      + '</div>';

    Utils.openModal('设备详情: ' + Utils.escapeHtml(d.name || d.hostname), body, '');
  } catch (err) {
    Utils.notify('获取设备详情失败: ' + err.message, 'error');
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + units[i];
}

function removeDevice(deviceId, name) {
  Utils.confirm('删除设备', '确定要删除设备 <strong>' + name + '</strong> 吗？<br>将同时删除该设备的指标、命令记录和插件数据。', async () => {
    try {
      const res = await Api.del('/v1/device/' + deviceId);
      if (res && res.success) {
        Utils.notify('设备已删除', 'success');
        await refreshDevices();
      } else {
        Utils.notify('删除失败: ' + (res?.message || '未知错误'), 'error');
      }
    } catch (err) {
      Utils.notify('删除失败: ' + err.message, 'error');
    }
  });
}

// 注册到 App.pageLoaders
if (typeof App !== 'undefined' && App.pageLoaders) {
  App.pageLoaders.devices = loadDevices;
}
