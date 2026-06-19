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

    const [info, ddns, cert, nginxRes, proxy, dbStatus, logs] = await Promise.all([
      safeFetch('/system/info', { success: false }),
      safeFetch('/ddns', { success: false }),
      safeFetch('/cert', { success: false }),
      safeFetch('/nginx/status', { success: false }),
      safeFetch('/proxy', { success: false }),
      safeFetch('/db/status', { success: false }),
      safeFetch('/log?limit=8', { success: false })
    ]);

    const sys = (info && info.data) || {};
    const mem = sys.memory || { total: 0, free: 0 };

    // ── 1. 顶栏指标（先用 system/info 填充已知项，监控轮询动态补齐） ──
    window._liveSysInfo = sys;
    _updateTopbarMetrics(sys);
    // 立即拉取监控数据 + 启动 5 秒轮询（不管首次成败都启动，防止首次失败永久失活）
    _dashMonFetch();
    if (_dashMonTimer) clearInterval(_dashMonTimer);
    _dashMonTimer = setInterval(_dashMonFetch, 5000);

    // ── 2. 左上：系统概览 ──
    // 只保留真实公网 IP（排除内网地址）
    var isPublicIp = function(ip) {
      return ip && !/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(ip);
    };
    var publicIps = (sys.ips || []).filter(isPublicIp);
    var ips = publicIps.length > 0 ? publicIps.join(', ') : '--';
    var overviewBody = document.getElementById('overviewBody');
    if (overviewBody) {
      overviewBody.innerHTML =
        '<div class="overview-row"><span class="overview-label">主机名</span><span class="overview-value">' + (sys.hostname || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">平台</span><span class="overview-value">' + (sys.platform || '--') + ' ' + (sys.arch || '') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">CPU 核心</span><span class="overview-value">' + (sys.cpus || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">运行时长</span><span class="overview-value">' + formatUptime(sys.panelUptime || sys.uptime || 0) + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">内存大小</span><span class="overview-value">' + mem.total + ' GB</span></div>' +
        '<div class="overview-row"><span class="overview-label">Node.js</span><span class="overview-value">' + (sys.nodeVersion || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">面板版本</span><span class="overview-value">v' + (sys.panelVersion || '--') + '</span></div>' +
        '<div class="overview-row"><span class="overview-label">公网 IP</span><span class="overview-value">' + ips + '</span></div>';
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

    var ds = dbStatus && dbStatus.data ? dbStatus.data : {};
    var dbMode = ds.mode || 'local';
    var dbPreferred = ds.preferred || dbMode;
    var dbFallback = ds.fallback;
    var dbLabel = dbMode === 'mysql' ? 'MySQL' : 'SQLite';
    if (dbPreferred === 'mysql' && dbMode === 'local') dbLabel = 'SQLite ⚠️';

    // 数据库回退警告横幅
    var dbWarn = document.getElementById('dbFallbackWarning');
    if (dbWarn) {
      if (dbFallback) {
        dbWarn.innerHTML = '<div class="alert alert-warning" style="margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:8px">' +
          '<span>⚠️</span><span><strong>MySQL 不可达，已回退到 SQLite</strong> — 数据仅保存在本机。' +
          'MySQL 恢复后<a href="#" onclick="location.reload()">刷新</a>即可。</span></div>';
        dbWarn.style.display = 'block';
      } else { dbWarn.style.display = 'none'; }
    }

    var services = [
      { icon: '🐳', name: 'Docker', status: '查看', cls: 'up', nav: 'docker' },
      { icon: '🌐', name: 'Nginx', status: nginxRunning ? '运行中' : '未运行', cls: nginxRunning ? 'up' : 'down', nav: 'nginx' },
      { icon: '📡', name: 'DDNS', status: ddnsCount + ' 个域名', cls: ddnsCount > 0 ? 'up' : 'warn', nav: 'ddns' },
      { icon: '🔒', name: 'SSL', status: certCount + ' 个证书', cls: certCount > 0 ? 'up' : 'warn', nav: 'ssl' },
      { icon: '🔄', name: '反向代理', status: proxyCount + ' 条启用', cls: proxyCount > 0 ? 'up' : 'warn', nav: 'nginx' },
      { icon: '🗄️', name: '数据库', status: dbLabel, cls: dbFallback ? 'warn' : 'up', nav: 'settings' }
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
  if (elUp) elUp.textContent = formatUptime(sys.panelUptime || sys.uptime || 0);
  // CPU 暂用 loadavg[0] 近似（监控轮询会精确覆盖）
  if (elCpu && sys.loadavg) elCpu.textContent = sys.loadavg[0].toFixed(0) + '%';
  // 负载初始值
  var elLoad = document.getElementById('tbLoad');
  if (elLoad && sys.loadavg && sys.loadavg.length >= 3) {
    elLoad.textContent = sys.loadavg[0].toFixed(2) + ' / ' + sys.loadavg[1].toFixed(2) + ' / ' + sys.loadavg[2].toFixed(2);
  }
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
    // 优先使用服务端北京时间，避免浏览器 ICU 兼容问题
    var time = e.timeCst || '';
    if (!time) {
      time = e.time || e.timestamp || e.createdAt || '';
      if (time && time.length > 16) time = new Date(time).toLocaleTimeString("zh-CN", { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' });
    } else {
      // timeCst 格式: "6/15/2026, 12:27:07" — 提取 HH:MM
      var m = time.match(/(\d{2}:\d{2})/);
      if (m) time = m[1];
    }
    var text = e.message || e.action || e.desc || JSON.stringify(e).slice(0, 80);
    return '<div class="dash-log-item"><span class="dash-log-time">' + escapeHtml(time || '--:--') + '</span><span class="dash-log-text">' + escapeHtml(text) + '</span></div>';
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
  var s = Math.floor(seconds % 60);
  var parts = [];
  if (d > 0) parts.push(d + '天');
  if (h > 0) parts.push(h + '时');
  parts.push(m + '分' + s + '秒');
  return parts.join(' ');
}

// ========== 顶栏监控轮询（网络+负载写入 topbar） ==========
var _dashMonTimer = null;

async function _dashMonFetch() {
  try {
    var res = await Api.get('/monitor', null, { showError: false });
    if (!res.success) return;
    var live = res.data.live, hist = res.data.history;

    // CPU
    var cpu = live.cpu || 0;
    var tbCpu = document.getElementById('tbCpu');
    if (tbCpu) tbCpu.textContent = cpu.toFixed(0) + '%';

    // 内存
    var mem = live.memory;
    var tbMem = document.getElementById('tbMem');
    if (tbMem) tbMem.textContent = mem.pct.toFixed(0) + '%';

    // 运行时长
    var tbUptime = document.getElementById('tbUptime');
    if (tbUptime && live.uptime) {
      tbUptime.textContent = formatUptime(live.uptime);
      window._liveUptime = live.uptime;
    }

    // 网络（topbar 文字展示，MB/s）
    var net = hist.network.length > 0 ? hist.network[hist.network.length - 1] : { rxRate: 0, txRate: 0 };
    var rxMB = (net.rxRate / 1048576).toFixed(1);
    var txMB = (net.txRate / 1048576).toFixed(1);
    var tbNetDown = document.getElementById('tbNetDown');
    var tbNetUp = document.getElementById('tbNetUp');
    if (tbNetDown) tbNetDown.textContent = rxMB + ' MB/s';
    if (tbNetUp) tbNetUp.textContent = txMB + ' MB/s';

    // 负载
    var ld = live.load || [];
    var tbLoad = document.getElementById('tbLoad');
    if (tbLoad && ld.length >= 3) tbLoad.textContent = ld[0].toFixed(2) + ' / ' + ld[1].toFixed(2) + ' / ' + ld[2].toFixed(2);

  } catch (_) {}
}

