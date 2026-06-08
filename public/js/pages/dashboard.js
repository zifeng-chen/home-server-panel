// 仪表盘页面 - 全模块状态概览
let dashboardLoaded = false;
let dashboardInProgress = false;

async function loadDashboard() {
  const grid = document.getElementById('statsGrid');
  if (!grid) { console.error('statsGrid not found'); return; }

  // 防并发
  if (dashboardInProgress) { console.log('dashboardInProgress, skip'); return; }
  if (dashboardLoaded) { console.log('dashboardLoaded, skip'); return; }

  dashboardInProgress = true;

  // 显示加载状态
  grid.innerHTML = Array(6).fill(
    '<div class="stat-card loading"><div class="stat-icon">⏳</div><div class="stat-info"><span class="stat-label">加载中...</span><span class="stat-value">--</span></div></div>'
  ).join('');

  try {
    console.log('[Dashboard] 开始加载...');

    // 单接口失败不影响其他，每个请求超时 10 秒
    const safeFetch = async (path, fallback, timeoutMs) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(function() { controller.abort(); }, timeoutMs || 10000);
        const result = await Api.get(path, controller.signal);
        clearTimeout(timer);
        return result;
      } catch (e) {
        console.warn('[Dashboard]', path, '失败:', e.message);
        return fallback;
      }
    };

    const [info, uptime, ddns, cert, nginxRes, proxy, port] = await Promise.all([
      safeFetch('/system/info', { success: false }),
      safeFetch('/system/uptime', { success: false }),
      safeFetch('/ddns', { success: false }),
      safeFetch('/cert', { success: false }),
      safeFetch('/nginx/status', { success: false }),
      safeFetch('/proxy', { success: false }),
      safeFetch('/port', { success: false })
    ]);

    console.log('[Dashboard] API结果:', { info: !!info.success, uptime: !!uptime.success });

    const sys = (info && info.data) || {};
    const up = uptime && uptime.success ? formatUptime(uptime.data?.uptime || 0) : '加载失败';
    const mem = sys.memory ? sys.memory.free + 'GB / ' + sys.memory.total + 'GB' : '--';
    const cpu = (sys.cpus || '--') + ' 核 (' + (sys.arch || '--') + ')';
    const loadStr = (sys.loadavg || []).slice(0, 2).map(function(n) { return n.toFixed(1); }).join(' / ') || '--';

    // 各模块状态
    var ddnsCount = 0;
    if (ddns && ddns.success) {
      var dd = ddns.data || {};
      ddnsCount = (dd.records || dd.domains || dd.rules || []).length;
    }
    var certCount = 0;
    if (cert && cert.success) {
      var cd = cert.data || {};
      certCount = (cd.certificates || cd.certs || []).length;
    }
    var nginxRunning = nginxRes && nginxRes.success && (nginxRes.data || {}).running;
    var proxyCount = 0;
    if (proxy && proxy.success) {
      var pd = proxy.data || {};
      proxyCount = pd.stats?.enabled || (pd.rules ? pd.rules.filter(function(r) { return r.enabled; }).length : 0);
    }
    var portCount = 0;
    if (port && port.success) {
      var pod = port.data || {};
      portCount = (pod.ports || []).length || (pod.stats || {}).total || 0;
    }

    var cards = [
      { icon: '🖥️', label: '主机名', value: sys.hostname || '--' },
      { icon: '⚡', label: '运行时长', value: up },
      { icon: '🧠', label: '内存', value: mem },
      { icon: '🏗️', label: 'CPU 核心', value: cpu },
      { icon: '📊', label: '系统负载', value: loadStr },
      { icon: '📦', label: 'Node.js', value: sys.nodeVersion || '--' },
      { icon: '📡', label: 'DDNS 域名', value: ddnsCount + ' 个', color: ddnsCount > 0 ? 'var(--success)' : 'var(--text-secondary)', nav: 'ddns' },
      { icon: '🔒', label: 'SSL 证书', value: certCount + ' 个', color: certCount > 0 ? 'var(--success)' : 'var(--text-secondary)', nav: 'ssl' },
      { icon: '🌐', label: 'Nginx', value: nginxRunning ? '运行中 🟢' : '未运行', color: nginxRunning ? 'var(--success)' : 'var(--text-secondary)', nav: 'nginx' },
      { icon: '🔄', label: '代理规则', value: proxyCount + ' 条启用', color: proxyCount > 0 ? 'var(--success)' : 'var(--text-secondary)', nav: 'nginx' },
      { icon: '🔌', label: '监听端口', value: portCount + ' 个', color: portCount > 0 ? 'var(--success)' : 'var(--text-secondary)', nav: 'port' }
    ];

    grid.innerHTML = cards.map(function(c) {
      var colorAttr = c.color ? ' style="color:' + c.color + '"' : '';
      var onclickAttr = c.nav ? ' onclick="window.location.hash=\'' + c.nav + '\'" style="cursor:pointer" title="点击查看详情"' : '';
      return '<div class="stat-card"' + onclickAttr + '>'
        + '<div class="stat-icon">' + c.icon + '</div>'
        + '<div class="stat-info">'
          + '<span class="stat-label">' + c.label + '</span>'
          + '<span class="stat-value"' + colorAttr + '>' + c.value + '</span>'
        + '</div>'
      + '</div>';
    }).join('');

    console.log('[Dashboard] 渲染完成, ' + cards.length + ' 张卡片');

    // 侧边栏版本和运行时间
    var verEl = document.getElementById('version');
    var upEl = document.getElementById('uptime');
    if (verEl) verEl.textContent = 'v' + App.version;
    if (upEl) upEl.textContent = up || '--';

    dashboardLoaded = true;

    // 启动实时监控图表
    _dashboardMonitorStart();

  } catch (err) {
    console.error('[Dashboard] 渲染失败:', err);
    grid.innerHTML = '<div class="stat-card" style="grid-column:1/-1;text-align:center;color:var(--danger);padding:24px;">⚠️ Dashboard 加载失败: ' + (err.message || '未知错误') + '<br><small>请刷新页面或检查控制台</small></div>';
  } finally {
    dashboardInProgress = false;
  }
}

function formatUptime(seconds) {
  if (!seconds || seconds <= 0) return '--';
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var parts = [];
  if (d > 0) parts.push(d + '天');
  if (h > 0) parts.push(h + '时');
  parts.push(m + '分');
  return parts.join(' ');
}

// ========== 仪表盘实时监控图表 ==========
var _dashMonTimer = null;

function _dashboardMonitorStart() {
  var container = document.getElementById('dashboardMonitor');
  if (!container) return;

  container.innerHTML = `
    <div class="monitor-card">
      <div class="monitor-card-hd"><span>📊 CPU</span><span id="dmCpu" class="monitor-card-val">--%</span></div>
      <canvas id="dmChartCpu" class="monitor-chart"></canvas>
    </div>
    <div class="monitor-card">
      <div class="monitor-card-hd"><span>🧠 内存</span><span id="dmMem" class="monitor-card-val">--%</span></div>
      <canvas id="dmChartMem" class="monitor-chart"></canvas>
    </div>
    <div class="monitor-card">
      <div class="monitor-card-hd"><span>💿 磁盘</span><span id="dmDisk" class="monitor-card-val">--</span></div>
      <div id="dmDiskList" class="monitor-disk-list"></div>
    </div>
    <div class="monitor-card">
      <div class="monitor-card-hd"><span>🌐 网络</span><span id="dmNet" class="monitor-card-val">--</span></div>
      <canvas id="dmChartNet" class="monitor-chart"></canvas>
    </div>
    <div class="monitor-card">
      <div class="monitor-card-hd"><span>⏱️ 负载</span><span id="dmLoad" class="monitor-card-val">--</span></div>
      <canvas id="dmChartLoad" class="monitor-chart"></canvas>
    </div>
    <div class="monitor-card monitor-card-info">
      <div class="monitor-card-hd"><span>ℹ️ 系统</span></div>
      <div id="dmInfo" class="monitor-info"></div>
    </div>
  `;

  // 初始化 Canvas
  ['dmChartCpu','dmChartMem','dmChartNet','dmChartLoad'].forEach(function(id) {
    var cv = document.getElementById(id);
    if (cv) {
      var rect = cv.parentElement.getBoundingClientRect();
      cv.width = Math.min(rect.width - 32, 600) * 2;
      cv.height = 180 * 2;
      cv.style.width = (cv.width / 2) + 'px';
      cv.style.height = (cv.height / 2) + 'px';
    }
  });

  _dashboardMonitorFetch();
  if (_dashMonTimer) clearInterval(_dashMonTimer);
  _dashMonTimer = setInterval(_dashboardMonitorFetch, 5000);
}

async function _dashboardMonitorFetch() {
  try {
    var res = await Api.get('/monitor', null, { showError: false });
    if (!res.success) return;
    var live = res.data.live, hist = res.data.history;

    // CPU
    var cpu = live.cpu || 0;
    var cEl = document.getElementById('dmCpu');
    if (cEl) {
      cEl.textContent = cpu.toFixed(1) + '%';
      cEl.style.color = cpu > 80 ? 'var(--danger)' : cpu > 50 ? 'var(--warning)' : 'var(--success)';
    }

    // 内存
    var mem = live.memory;
    var mEl = document.getElementById('dmMem');
    if (mEl) {
      mEl.textContent = mem.pct.toFixed(1) + '%';
      mEl.style.color = mem.pct > 90 ? 'var(--danger)' : mem.pct > 70 ? 'var(--warning)' : 'var(--success)';
    }

    // 磁盘
    var diskItems = hist.disk.length > 0 ? hist.disk[hist.disk.length - 1].items : [];
    if (diskItems.length > 0) {
      var dkEl = document.getElementById('dmDisk');
      if (dkEl) dkEl.textContent = diskItems.map(function(d) { return d.pct + '%'; }).join(' ');
      var dlEl = document.getElementById('dmDiskList');
      if (dlEl) dlEl.innerHTML = diskItems.map(function(d) {
        return '<div class="disk-item"><span class="disk-mount">📂 ' + d.mount + '</span><span class="disk-bar-wrap"><span class="disk-bar" style="width:' + Math.min(d.pct, 100) + '%;background:' + (d.pct > 90 ? 'var(--danger)' : d.pct > 70 ? 'var(--warning)' : 'var(--primary)') + '"></span></span><span class="disk-info">' + d.used + '/' + d.size + '</span></div>';
      }).join('');
    }

    // 网络
    var net = hist.network.length > 0 ? hist.network[hist.network.length - 1] : { rxRate: 0, txRate: 0 };
    var nEl = document.getElementById('dmNet');
    if (nEl) nEl.innerHTML = '🔽 ' + _dmFmtBytes(net.rxRate) + '/s<br>🔼 ' + _dmFmtBytes(net.txRate) + '/s';

    // 负载
    var ld = live.load;
    var lEl = document.getElementById('dmLoad');
    if (lEl) lEl.innerHTML = '1m:' + ld[0].toFixed(2) + ' 5m:' + ld[1].toFixed(2) + ' 15m:' + ld[2].toFixed(2);

    // 系统信息
    var iEl = document.getElementById('dmInfo');
    if (iEl) iEl.innerHTML =
      '<div class="info-row"><span>主机名</span><span>' + live.hostname + '</span></div>' +
      '<div class="info-row"><span>平台</span><span>' + live.platform + '</span></div>' +
      '<div class="info-row"><span>CPU 核</span><span>' + live.cpus + '</span></div>' +
      '<div class="info-row"><span>运行</span><span>' + _dmFmtUptime(live.uptime) + '</span></div>' +
      '<div class="info-row"><span>内存</span><span>' + mem.total + ' GB</span></div>';

    // 图表
    _dmDrawChart('dmChartCpu', hist.cpu, 'pct', '%', 'CPU');
    _dmDrawChart('dmChartMem', hist.memory, 'pct', '%', '内存');
    _dmDrawNetChart('dmChartNet', hist.network);
    _dmDrawLoadChart('dmChartLoad', hist.load);
  } catch (_) {}
}

function _dmDrawChart(canvasId, data, field, unit, label) {
  var cv = document.getElementById(canvasId);
  if (!cv || data.length < 2) { if (cv) _dmDrawEmpty(cv, '等待数据...'); return; }
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pad = { top: 24, right: 16, bottom: 28, left: 48 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = 'rgba(51,65,85,0.25)'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((100 - i * 25) + '%', pad.left - 10, y + 7);
  }
  var maxVal = Math.max(Math.max.apply(null, data.map(function(d) { return d[field]; })), 1);
  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  // 渐变填充
  var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
  grad.addColorStop(0, 'rgba(99,102,241,0.25)'); grad.addColorStop(1, 'rgba(99,102,241,0.02)');
  ctx.beginPath();
  ctx.moveTo(scX(0), scY(data[0][field]));
  for (var i = 1; i < data.length; i++) ctx.lineTo(scX(i), scY(data[i][field]));
  ctx.lineTo(scX(data.length - 1), pad.top + ph); ctx.lineTo(scX(0), pad.top + ph);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  // 折线
  ctx.beginPath(); ctx.moveTo(scX(0), scY(data[0][field]));
  for (var i = 1; i < data.length; i++) ctx.lineTo(scX(i), scY(data[i][field]));
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  // 末点
  var last = data[data.length - 1];
  ctx.beginPath(); ctx.arc(scX(data.length - 1), scY(last[field]), 8, 0, Math.PI * 2);
  ctx.fillStyle = '#818cf8'; ctx.fill();
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3; ctx.stroke();
  // 标签
  ctx.fillStyle = '#94a3b8'; ctx.font = '22px -apple-system, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, pad.left, 26);
  ctx.textAlign = 'right'; ctx.fillText(last[field].toFixed(1) + unit, pad.left + pw, 26);
}

function _dmDrawNetChart(canvasId, data) {
  var cv = document.getElementById(canvasId);
  if (!cv || data.length < 2) { if (cv) _dmDrawEmpty(cv, '等待数据...'); return; }
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pad = { top: 24, right: 16, bottom: 28, left: 60 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(51,65,85,0.25)'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
  }
  var rxArr = data.map(function(d) { return d.rxRate; });
  var txArr = data.map(function(d) { return d.txRate; });
  var maxVal = Math.max(Math.max.apply(null, rxArr), Math.max.apply(null, txArr), 1024);
  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  ctx.fillStyle = '#64748b'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    ctx.fillText(_dmFmtBytesShort(maxVal * (1 - i / 4)), pad.left - 8, pad.top + (ph / 4) * i + 7);
  }
  _dmDrawLine(ctx, data, rxArr, scX, scY, '#22c55e');
  _dmDrawLine(ctx, data, txArr, scX, scY, '#f59e0b');
  ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#22c55e'; ctx.fillText('🔽 下载', pad.left, 26);
  ctx.fillStyle = '#f59e0b'; ctx.fillText('🔼 上传', pad.left + 140, 26);
}

function _dmDrawLine(ctx, data, arr, scX, scY, color) {
  ctx.beginPath(); ctx.moveTo(scX(0), scY(arr[0]));
  for (var i = 1; i < arr.length; i++) ctx.lineTo(scX(i), scY(arr[i]));
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
}

function _dmDrawLoadChart(canvasId, data) {
  var cv = document.getElementById(canvasId);
  if (!cv || data.length < 2) { if (cv) _dmDrawEmpty(cv, '等待数据...'); return; }
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pad = { top: 24, right: 16, bottom: 28, left: 48 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(51,65,85,0.25)'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
  }
  var allVals = [];
  ['load1','load5','load15'].forEach(function(k) { data.forEach(function(d) { allVals.push(d[k]); }); });
  var maxVal = Math.max(Math.max.apply(null, allVals), 1);
  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  var colors = ['#22c55e', '#f59e0b', '#ef4444'];
  var keys = ['load1', 'load5', 'load15'];
  var labels = ['1m', '5m', '15m'];
  keys.forEach(function(key, idx) {
    var vals = data.map(function(d) { return d[key]; });
    ctx.beginPath(); ctx.moveTo(scX(0), scY(vals[0]));
    for (var i = 1; i < vals.length; i++) ctx.lineTo(scX(i), scY(vals[i]));
    ctx.strokeStyle = colors[idx]; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  });
  ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'left';
  keys.forEach(function(_, i) { ctx.fillStyle = colors[i]; ctx.fillText(labels[i], pad.left + i * 100, 26); });
}

function _dmDrawEmpty(canvas, msg) {
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#64748b'; ctx.font = '28px -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2 + 10);
}

function _dmFmtBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  var units = ['B','KB','MB','GB'], i = 0;
  while (bytes >= 1024 && i < 3) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

function _dmFmtBytesShort(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function _dmFmtUptime(sec) {
  var d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60);
  var p = [];
  if (d > 0) p.push(d + '天');
  if (h > 0) p.push(h + '时');
  p.push(m + '分');
  return p.join(' ');
}