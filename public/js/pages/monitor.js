// 系统监控页面 — Canvas 实时图表
let _monitorInterval = null;
let _monitorPollMs = 5000;
let _monitorCharts = {};

async function loadMonitor() {
  const container = document.getElementById('monitorContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="monitor-grid">
      <div class="monitor-card">
        <div class="monitor-card-hd">
          <span>📊 CPU 使用率</span>
          <span id="mcCpuPct" class="monitor-card-val">--%</span>
        </div>
        <canvas id="chartCpu" class="monitor-chart"></canvas>
      </div>
      <div class="monitor-card">
        <div class="monitor-card-hd">
          <span>🧠 内存</span>
          <span id="mcMemPct" class="monitor-card-val">--%</span>
        </div>
        <canvas id="chartMem" class="monitor-chart"></canvas>
      </div>
      <div class="monitor-card">
        <div class="monitor-card-hd">
          <span>💿 磁盘</span>
          <span id="mcDiskPct" class="monitor-card-val">--</span>
        </div>
        <div id="mcDiskList" class="monitor-disk-list"></div>
      </div>
      <div class="monitor-card">
        <div class="monitor-card-hd">
          <span>🌐 网络</span>
          <span id="mcNetRate" class="monitor-card-val">--</span>
        </div>
        <canvas id="chartNet" class="monitor-chart"></canvas>
      </div>
      <div class="monitor-card">
        <div class="monitor-card-hd">
          <span>⏱️ 系统负载</span>
          <span id="mcLoad" class="monitor-card-val">--</span>
        </div>
        <canvas id="chartLoad" class="monitor-chart"></canvas>
      </div>
      <div class="monitor-card monitor-card-info">
        <div class="monitor-card-hd"><span>ℹ️ 系统信息</span></div>
        <div id="mcInfo" class="monitor-info"></div>
      </div>
    </div>
  `;

  _initCharts();
  await _monitorFetch();

  if (_monitorInterval) clearInterval(_monitorInterval);
  _monitorInterval = setInterval(_monitorFetch, _monitorPollMs);
}

function _initCharts() {
  ['chartCpu', 'chartMem', 'chartNet', 'chartLoad'].forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.min(rect.width - 32, 600) * 2;
      canvas.height = 180 * 2;
      canvas.style.width = (canvas.width / 2) + 'px';
      canvas.style.height = (canvas.height / 2) + 'px';
    }
  });
}

async function _monitorFetch() {
  try {
    const res = await Api.get('/monitor', null, { showError: false });
    if (!res.success) return;

    const { live, history } = res.data;

    // CPU
    const cpuPct = live.cpu || 0;
    document.getElementById('mcCpuPct').textContent = cpuPct.toFixed(1) + '%';
    document.getElementById('mcCpuPct').style.color = cpuPct > 80 ? 'var(--danger)' : cpuPct > 50 ? 'var(--warning)' : 'var(--success)';

    // 内存
    const mem = live.memory;
    document.getElementById('mcMemPct').textContent = mem.pct.toFixed(1) + '%';
    document.getElementById('mcMemPct').style.color = mem.pct > 90 ? 'var(--danger)' : mem.pct > 70 ? 'var(--warning)' : 'var(--success)';

    // 磁盘
    const diskItems = history.disk.length > 0 ? history.disk[history.disk.length - 1].items : [];
    if (diskItems.length > 0) {
      document.getElementById('mcDiskPct').textContent = diskItems.map(d => d.pct + '%').join(' ');
      document.getElementById('mcDiskList').innerHTML = diskItems.map(d => `
        <div class="disk-item">
          <span class="disk-mount">📂 ${d.mount}</span>
          <span class="disk-bar-wrap"><span class="disk-bar" style="width:${Math.min(d.pct, 100)}%; background:${d.pct > 90 ? 'var(--danger)' : d.pct > 70 ? 'var(--warning)' : 'var(--primary)'}"></span></span>
          <span class="disk-info">${d.used}/${d.size}</span>
        </div>
      `).join('');
    }

    // 网络
    const net = history.network.length > 0 ? history.network[history.network.length - 1] : { rxRate: 0, txRate: 0 };
    document.getElementById('mcNetRate').innerHTML =
      `🔽 ${_fmtBytes(net.rxRate)}/s<br>🔼 ${_fmtBytes(net.txRate)}/s`;

    // 负载
    const ld = live.load;
    document.getElementById('mcLoad').innerHTML =
      `1m: ${ld[0].toFixed(2)} 5m: ${ld[1].toFixed(2)} 15m: ${ld[2].toFixed(2)}`;

    // 系统信息
    document.getElementById('mcInfo').innerHTML = `
      <div class="info-row"><span>主机名</span><span>${live.hostname}</span></div>
      <div class="info-row"><span>平台</span><span>${live.platform}</span></div>
      <div class="info-row"><span>CPU 核心</span><span>${live.cpus}</span></div>
      <div class="info-row"><span>运行时间</span><span>${_fmtUptime(live.uptime)}</span></div>
      <div class="info-row"><span>内存总计</span><span>${mem.total} GB</span></div>
    `;

    // 绘制图表
    _drawChart('chartCpu', history.cpu, 'pct', '%', 'CPU');
    _drawChart('chartMem', history.memory, 'pct', '%', '内存');
    _drawNetChart('chartNet', history.network);
    _drawLoadChart('chartLoad', history.load);
  } catch (e) {}
}

function _drawChart(canvasId, data, field, unit, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length < 2) { if (canvas) _drawEmpty(canvas, '等待数据...'); return; }

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 24, right: 16, bottom: 28, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = 'rgba(15,23,42,0.6)';
  ctx.fillRect(0, 0, W, H);

  // 网格
  ctx.strokeStyle = 'rgba(51,65,85,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((100 - i * 25) + '%', pad.left - 10, y + 7);
  }

  // 绘制折线 + 填充
  const maxVal = Math.max(Math.max(...data.map(d => d[field])), 1);
  const scaleY = val => pad.top + plotH - (val / maxVal) * plotH;
  const scaleX = i => pad.left + (i / (data.length - 1)) * plotW;

  // 渐变填充
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0, 'rgba(99,102,241,0.25)');
  grad.addColorStop(1, 'rgba(99,102,241,0.02)');

  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleY(data[0][field]));
  for (let i = 1; i < data.length; i++) {
    ctx.lineTo(scaleX(i), scaleY(data[i][field]));
  }
  ctx.lineTo(scaleX(data.length - 1), pad.top + plotH);
  ctx.lineTo(scaleX(0), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 折线
  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleY(data[0][field]));
  for (let i = 1; i < data.length; i++) {
    ctx.lineTo(scaleX(i), scaleY(data[i][field]));
  }
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 最后数据点
  const last = data[data.length - 1];
  ctx.beginPath();
  ctx.arc(scaleX(data.length - 1), scaleY(last[field]), 8, 0, Math.PI * 2);
  ctx.fillStyle = '#818cf8';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 标签
  ctx.fillStyle = '#94a3b8'; ctx.font = '22px -apple-system, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, pad.left, 26);
  ctx.textAlign = 'right';
  ctx.fillText(last[field].toFixed(1) + unit, pad.left + plotW, 26);
}

function _drawNetChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length < 2) { if (canvas) _drawEmpty(canvas, '等待数据...'); return; }

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 24, right: 16, bottom: 28, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,23,42,0.6)';
  ctx.fillRect(0, 0, W, H);

  // 网格
  ctx.strokeStyle = 'rgba(51,65,85,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
  }

  const rxArr = data.map(d => d.rxRate);
  const txArr = data.map(d => d.txRate);
  const maxVal = Math.max(Math.max(...rxArr), Math.max(...txArr), 1024);
  const scaleY = val => pad.top + plotH - (val / maxVal) * plotH;
  const scaleX = i => pad.left + (i / (data.length - 1)) * plotW;

  // Y 轴标签
  ctx.fillStyle = '#64748b'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (maxVal * (1 - i / 4));
    ctx.fillText(_fmtBytesShort(v), pad.left - 8, pad.top + (plotH / 4) * i + 7);
  }

  // 下载
  _drawLine(ctx, data, rxArr, scaleX, scaleY, pad, plotH, '#22c55e');
  // 上传
  _drawLine(ctx, data, txArr, scaleX, scaleY, pad, plotH, '#f59e0b');

  // 图例
  ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#22c55e'; ctx.fillText('🔽 下载', pad.left, 26);
  ctx.fillStyle = '#f59e0b'; ctx.fillText('🔼 上传', pad.left + 140, 26);
  ctx.textAlign = 'right';
  ctx.fillText(_fmtBytesShort(rxArr[rxArr.length - 1]) + '/s', pad.left + plotW, 26);

  function _drawLine(ctx, data, arr, sx, sy, pad, plotH, color) {
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(arr[0]));
    for (let i = 1; i < arr.length; i++) ctx.lineTo(sx(i), sy(arr[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function _drawLoadChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length < 2) { if (canvas) _drawEmpty(canvas, '等待数据...'); return; }

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 24, right: 16, bottom: 28, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,23,42,0.6)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(51,65,85,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
  }

  const allVals = [...data.map(d => d.load1), ...data.map(d => d.load5), ...data.map(d => d.load15)];
  const maxVal = Math.max(Math.max(...allVals), 1);
  const scaleY = v => pad.top + plotH - (v / maxVal) * plotH;
  const scaleX = i => pad.left + (i / (data.length - 1)) * plotW;

  const colors = ['#22c55e', '#f59e0b', '#ef4444'];
  const keys = ['load1', 'load5', 'load15'];
  const labels = ['1m', '5m', '15m'];

  keys.forEach((key, idx) => {
    const vals = data.map(d => d[key]);
    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(scaleX(i), scaleY(vals[i]));
    ctx.strokeStyle = colors[idx]; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.stroke();
  });

  // 图例
  ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'left';
  keys.forEach((_, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillText(labels[i], pad.left + i * 100, 26);
  });
}

function _drawEmpty(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#64748b'; ctx.font = '28px -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2 + 10);
}

function _fmtBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < 3) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

function _fmtBytesShort(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function _fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(d + '天');
  if (h > 0) parts.push(h + '小时');
  parts.push(m + '分');
  return parts.join(' ');
}

// 切换页面时停止轮询
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
  } else if (!_monitorInterval && document.getElementById('page-monitor') && !document.getElementById('page-monitor').classList.contains('hidden')) {
    _monitorInterval = setInterval(_monitorFetch, _monitorPollMs);
  }
});
