// 仪表盘页面 - 4 区布局
let dashboardLoaded = false;
let dashboardInProgress = false;

async function loadDashboard() {
  const dashGrid = document.getElementById('dashGrid');
  if (!dashGrid) { console.error('dashGrid not found'); return; }

  if (dashboardInProgress) { console.log('dashboardInProgress, skip'); return; }
  if (dashboardLoaded) { console.log('dashboardLoaded, skip'); return; }
  dashboardInProgress = true;

  try {
    console.log('[Dashboard] 开始加载...');

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

    const [info, ddns, cert, nginxRes, proxy, logs] = await Promise.all([
      safeFetch('/system/info', { success: false }),
      safeFetch('/ddns', { success: false }),
      safeFetch('/cert', { success: false }),
      safeFetch('/nginx/status', { success: false }),
      safeFetch('/proxy', { success: false }),
      safeFetch('/log?limit=8', { success: false })
    ]);

    const sys = (info && info.data) || {};
    const mem = sys.memory || { total: 0, free: 0 };

    // ── 1. 顶栏指标 ──
    window._liveSysInfo = sys;
    _updateTopbarMetrics(sys);

    // ── 2. 左上：系统概览 ──
    var ips = sys.ips && sys.ips.length > 0 ? sys.ips.join(', ') : '--';
    var loadStr = (sys.loadavg || []).map(function(n) { return n.toFixed(2); }).join(' / ') || '--';
    var overviewBody = document.getElementById('overviewBody');
    if (overviewBody) {
      overviewBody.innerHTML =
        '<div class="overview-row"><span class="overview-label">主机名</span><span class="overview-value">' + (sys.hostname || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">平台</span><span class="overview-value">' + (sys.platform || '--') + ' ' + (sys.arch || '') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">CPU 核心</span><span class="overview-value">' + (sys.cpus || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">系统负载</span><span class="overview-value">' + loadStr + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">运行时长</span><span class="overview-value">' + formatUptime(sys.uptime || 0) + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">内存大小</span><span class="overview-value">' + mem.total + ' GB</span></div>' +
        '<div class="overview-row"><span class="overview-label">Node.js</span><span class="overview-value">' + (sys.nodeVersion || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">面板版本</span><span class="overview-value">v' + (sys.panelVersion || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">IP 地址</span><span class="overview-value">' + ips + '</span></div>';
    }

    // ── 3. 右上：服务状态 ──
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
      proxyCount = pd.stats ? pd.stats.enabled : (pd.rules ? pd.rules.filter(function(r) { return r.enabled; }).length : 0);
    }

    var services = [
      { icon: '🐳', name: 'Docker', status: '查看', cls: 'up', nav: 'docker' },
      { icon: '🌐', name: 'Nginx', status: nginxRunning ? '运行中' : '未运行', cls: nginxRunning ? 'up' : 'down', nav: 'nginx' },
      { icon: '📡', name: 'DDNS', status: ddnsCount + ' 个域名', cls: ddnsCount > 0 ? 'up' : 'warn', nav: 'ddns' },
      { icon: '🔒', name: 'SSL', status: certCount + ' 个证书', cls: certCount > 0 ? 'up' : 'warn', nav: 'ssl' },
      { icon: '🔄', name: '反向代理', status: proxyCount + ' 条启用', cls: proxyCount > 0 ? 'up' : 'warn', nav: 'nginx' },
      { icon: '🗄️', name: '数据库', status: 'SQLite', cls: 'up', nav: 'settings' }
    ];

    var sGrid = document.getElementById('servicesGrid');
    if (sGrid) {
      sGrid.innerHTML = services.map(function(s) {
        return '<div class="service-card" onclick="window.location.hash=\'' + s.nav + '\'" title="点击查看 ' + s.name + '">' +
          '<span class="service-card-icon">' + s.icon + '</span>' +
          '<div class="service-card-info">' +
            '<span class="service-card-name">' + s.name + '</span>' +
            '<span class="service-card-status ' + s.cls + '">' + s.status + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // ── 4. 左下：操作日志 ──
    _renderDashLogs(logs);

    // ── 5. 右下：资源使用（由 _dashboardMonitorStart 填充） ──
    _dashboardMonitorStart();

    // 侧边栏版本
    var verEl = document.getElementById('version');
    if (verEl) verEl.textContent = 'v' + App.version;

    dashboardLoaded = true;
    console.log('[Dashboard] 渲染完成');

  } catch (err) {
    console.error('[Dashboard] 渲染失败:', err);
    var ov = document.getElementById('overviewBody');
    if (ov) ov.innerHTML = '<div style="color:var(--danger);padding:16px;">⚠️ ' + (err.message || '加载失败') + '</div>';
  } finally {
    dashboardInProgress = false;
  }
}

// ── 顶栏指标更新 ──
function _updateTopbarMetrics(sys) {
  var elCpu = document.getElementById('tbCpu');
  var elMem = document.getElementById('tbMem');
  var elUp  = document.getElementById('tbUptime');
  if (sys.memory) {
    var usedGB = sys.memory.total - sys.memory.free;
    var pct = sys.memory.total > 0 ? (usedGB / sys.memory.total * 100) : 0;
    if (elMem) elMem.textContent = pct.toFixed(0) + '%';
  }
  if (elUp) elUp.textContent = formatUptime(sys.uptime || 0);
  // CPU will be updated by monitor poll
}

// ── 操作日志渲染 ──
function _renderDashLogs(logs) {
  var listEl = document.getElementById('dashLogList');
  if (!listEl) return;
  var entries = [];
  if (logs && logs.success && logs.data) {
    entries = (logs.data.records || logs.data.entries || logs.data.logs || logs.data.list || []);
  }
  if (!Array.isArray(entries)) entries = [];
  if (entries.length === 0) {
    listEl.innerHTML = '<div class="dash-log-item"><span class="dash-log-text" style="color:var(--text-tertiary)">暂无操作记录</span></div>';
    return;
  }
  var recent = entries.slice(0, 8);
  listEl.innerHTML = recent.map(function(e) {
    var time = e.time || e.timestamp || e.createdAt || '';
    if (time && time.length > 16) time = time.slice(11, 16);
    var text = e.message || e.action || e.desc || JSON.stringify(e).slice(0, 80);
    return '<div class="dash-log-item"><span class="dash-log-time">' + (time || '--:--') + '</span><span class="dash-log-text">' + text + '</span></div>';
  }).join('');
}

// ── Topbar CPU/mem/uptime 轮询更新（不依赖 Dashboard 页面） ──
var _topbarPollTimer = null;
function _topbarPollStart() {
  if (_topbarPollTimer) return;
  _topbarPoll();
  _topbarPollTimer = setInterval(_topbarPoll, 5000);
  // 获取管理员用户名（仅一次）
  Api.get('/auth/status', null, { showError: false }).then(function(r) {
    if (r.success && r.data.username) {
      var uEl = document.getElementById('topbarUserBtn');
      if (uEl) uEl.textContent = '👤 ' + r.data.username;
    }
  }).catch(function() {});
}
async function _topbarPoll() {
  // 仪表盘页面由 _dashboardMonitorFetch 统一更新顶栏，无需独立轮询
  if (App._currentPage === 'dashboard') return;
  try {
    var res = await Api.get('/monitor/live', null, { showError: false });
    if (!res.success) return;
    var live = res.data;
    var cEl = document.getElementById('tbCpu');
    var mEl = document.getElementById('tbMem');
    var uEl = document.getElementById('tbUptime');
    if (cEl) cEl.textContent = (live.cpu || 0).toFixed(0) + '%';
    if (mEl) {
      var mem = live.memory;
      mEl.textContent = mem.pct.toFixed(0) + '%';
    }
    if (uEl && live.uptime) {
      uEl.textContent = formatUptime(live.uptime);
      window._liveUptime = live.uptime;
    }
  } catch (_) {}
}

// ── 退出按钮 ──
function _initLogoutTop() {
  var btn = document.getElementById('btnLogoutTop');
  if (btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('hsp_token');
        window.location.href = '/login.html';
      }
    });
  }
}

// ========== 工具函数 ==========
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

// ========== 资源使用监控（右下区域） ==========
var _dashMonTimer = null;

function _dashboardMonitorStart() {
  var container = document.getElementById('dashboardMonitor');
  if (!container) return;

  container.innerHTML =
    '<div class="monitor-card"><div class="monitor-card-hd"><span>📊 CPU</span><span id="dmCpu" class="monitor-card-val">--%</span></div><canvas id="dmChartCpu" class="monitor-chart"></canvas></div>' +
    '<div class="monitor-card"><div class="monitor-card-hd"><span>🧠 内存</span><span id="dmMem" class="monitor-card-val">--%</span></div><canvas id="dmChartMem" class="monitor-chart"></canvas></div>' +
    '<div class="monitor-card"><div class="monitor-card-hd"><span>💿 磁盘</span><span id="dmDisk" class="monitor-card-val">--</span></div><div id="dmDiskList" class="monitor-disk-list"></div></div>' +
    '<div class="monitor-card"><div class="monitor-card-hd"><span>🌐 网络</span><span id="dmNet" class="monitor-card-val">--</span></div><canvas id="dmChartNet" class="monitor-chart"></canvas></div>' +
    '<div class="monitor-card"><div class="monitor-card-hd"><span>⏱️ 负载</span><span id="dmLoad" class="monitor-card-val">--</span></div><canvas id="dmChartLoad" class="monitor-chart"></canvas></div>';

  ['dmChartCpu','dmChartMem','dmChartNet','dmChartLoad'].forEach(function(id) {
    var cv = document.getElementById(id);
    if (cv) {
      var rect = cv.parentElement.getBoundingClientRect();
      cv.width = Math.min(rect.width - 32, 600) * 2;
      cv.height = 160 * 2;
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

    var cpu = live.cpu || 0;
    var cEl = document.getElementById('dmCpu');
    if (cEl) { cEl.textContent = cpu.toFixed(1) + '%'; cEl.style.color = cpu > 80 ? 'var(--danger)' : cpu > 50 ? 'var(--warning)' : 'var(--success)'; }
    // 同步更新顶栏 CPU
    var tbCpu = document.getElementById('tbCpu');
    if (tbCpu) tbCpu.textContent = cpu.toFixed(0) + '%';

    var mem = live.memory;
    var mEl = document.getElementById('dmMem');
    if (mEl) { mEl.textContent = mem.pct.toFixed(1) + '%'; mEl.style.color = mem.pct > 90 ? 'var(--danger)' : mem.pct > 70 ? 'var(--warning)' : 'var(--success)'; }
    var tbMem = document.getElementById('tbMem');
    if (tbMem) tbMem.textContent = mem.pct.toFixed(0) + '%';

    // 同步更新顶栏 UPTIME
    var tbUptime = document.getElementById('tbUptime');
    if (tbUptime && live.uptime) {
      tbUptime.textContent = formatUptime(live.uptime);
      window._liveUptime = live.uptime;
    }

    var diskItems = hist.disk.length > 0 ? hist.disk[hist.disk.length - 1].items : [];
    if (diskItems.length > 0) {
      var dkEl = document.getElementById('dmDisk');
      if (dkEl) dkEl.textContent = diskItems.map(function(d) { return d.pct + '%'; }).join(' ');
      var dlEl = document.getElementById('dmDiskList');
      if (dlEl) dlEl.innerHTML = diskItems.map(function(d) {
        return '<div class="disk-item"><span class="disk-mount">📂 ' + d.mount + '</span><span class="disk-bar-wrap"><span class="disk-bar" style="width:' + Math.min(d.pct, 100) + '%;background:' + (d.pct > 90 ? 'var(--danger)' : d.pct > 70 ? 'var(--warning)' : 'var(--primary)') + '"></span></span><span class="disk-info">' + d.used + '/' + d.size + '</span></div>';
      }).join('');
    }

    var net = hist.network.length > 0 ? hist.network[hist.network.length - 1] : { rxRate: 0, txRate: 0 };
    var nEl = document.getElementById('dmNet');
    if (nEl) nEl.innerHTML = '🔽 ' + _dmFmtBytes(net.rxRate) + '/s<br>🔼 ' + _dmFmtBytes(net.txRate) + '/s';

    var ld = live.load;
    var lEl = document.getElementById('dmLoad');
    if (lEl) lEl.innerHTML = '1m ' + ld[0].toFixed(2) + ' 5m ' + ld[1].toFixed(2) + ' 15m ' + ld[2].toFixed(2);

    window._liveUptime = live.uptime;
    var upEl = document.getElementById('uptime');
    if (upEl && live.uptime) upEl.textContent = _dmFmtUptime(live.uptime);

    _dmDrawChart('dmChartCpu', hist.cpu, 'pct', '%', 'CPU');
    _dmDrawChart('dmChartMem', hist.memory, 'pct', '%', '内存');
    _dmDrawNetChart('dmChartNet', hist.network);
    _dmDrawLoadChart('dmChartLoad', hist.load);
  } catch (_) {}
}

// ... keep existing chart drawing functions below ...
function _dmDrawChart(canvasId, data, field, unit, label) {
  var cv = document.getElementById(canvasId);
  if (!cv || data.length < 2) { if (cv) _dmDrawEmpty(cv, '等待数据...'); return; }
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pad = { top: 32, right: 20, bottom: 20, left: 70 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  var maxVal = Math.max(Math.max.apply(null, data.map(function(d) { return d[field]; })), 1);
  // 将 maxVal 向上取整到合适刻度
  var nice = [1,2,5,10,20,25,50,100,200,500,1000];
  var step = 1;
  for (var s = 0; s < nice.length; s++) {
    if (maxVal <= nice[s] * 5) { step = nice[s]; break; }
    step = maxVal / 4;
  }
  maxVal = Math.ceil(maxVal / step) * step;

  // Y轴网格+标签（基于实际 maxVal）
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    var v = maxVal * (1 - i / 4);
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
    // 整数值不显示小数
    var label = v === Math.floor(v) ? v.toFixed(0) + unit : v.toFixed(1) + unit;
    ctx.fillText(label, pad.left - 12, y + 7);
  }

  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
  grad.addColorStop(0, 'rgba(184,134,11,0.18)'); grad.addColorStop(1, 'rgba(184,134,11,0.02)');
  ctx.beginPath();
  ctx.moveTo(scX(0), scY(data[0][field]));
  for (var i = 1; i < data.length; i++) ctx.lineTo(scX(i), scY(data[i][field]));
  ctx.lineTo(scX(data.length - 1), pad.top + ph); ctx.lineTo(scX(0), pad.top + ph);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(scX(0), scY(data[0][field]));
  for (var i = 1; i < data.length; i++) ctx.lineTo(scX(i), scY(data[i][field]));
  ctx.strokeStyle = '#daa520'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  var last = data[data.length - 1];
  ctx.beginPath(); ctx.arc(scX(data.length - 1), scY(last[field]), 8, 0, Math.PI * 2);
  ctx.fillStyle = '#daa520'; ctx.fill();
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.stroke();
}

function _dmDrawNetChart(canvasId, data) {
  var cv = document.getElementById(canvasId);
  if (!cv || data.length < 2) { if (cv) _dmDrawEmpty(cv, '等待数据...'); return; }
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var pad = { top: 32, right: 20, bottom: 20, left: 80 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  var rxArr = data.map(function(d) { return d.rxRate; });
  var txArr = data.map(function(d) { return d.txRate; });
  var maxVal = Math.max(Math.max.apply(null, rxArr), Math.max.apply(null, txArr), 1024);
  // 向上取整
  var nice = [1024, 5120, 10240, 51200, 102400, 524288, 1048576, 5242880, 10485760];
  for (var s = 0; s < nice.length; s++) { if (maxVal <= nice[s]) { maxVal = nice[s]; break; } }

  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    var v = maxVal * (1 - i / 4);
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
    ctx.fillText(_dmFmtBytesShort(v), pad.left - 12, y + 7);
  }
  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  _dmDrawLine(ctx, data, rxArr, scX, scY, '#22c55e');
  _dmDrawLine(ctx, data, txArr, scX, scY, '#f59e0b');
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
  var pad = { top: 32, right: 20, bottom: 20, left: 70 };
  var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  var allVals = [];
  ['load1','load5','load15'].forEach(function(k) { data.forEach(function(d) { allVals.push(d[k]); }); });
  var maxVal = Math.max(Math.max.apply(null, allVals), 1);
  maxVal = Math.ceil(maxVal * 2) / 2;

  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af'; ctx.font = '20px -apple-system, sans-serif'; ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    var v = maxVal * (1 - i / 4);
    var y = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), pad.left - 12, y + 7);
  }
  var scY = function(v) { return pad.top + ph - (v / maxVal) * ph; };
  var scX = function(i) { return pad.left + (i / (data.length - 1)) * pw; };
  var colors = ['#22c55e', '#f59e0b', '#c41e3a'];
  var keys = ['load1', 'load5', 'load15'];
  keys.forEach(function(key, idx) {
    var vals = data.map(function(d) { return d[key]; });
    ctx.beginPath(); ctx.moveTo(scX(0), scY(vals[0]));
    for (var i = 1; i < vals.length; i++) ctx.lineTo(scX(i), scY(vals[i]));
    ctx.strokeStyle = colors[idx]; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  });
}

function _dmDrawEmpty(canvas, msg) {
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#9ca3af'; ctx.font = '28px -apple-system, sans-serif'; ctx.textAlign = 'center';
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
