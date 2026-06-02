// 仪表盘页面 - 全模块状态概览
let dashboardLoaded = false;
let dashboardInProgress = false;

async function loadDashboard() {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  // 防并发
  if (dashboardInProgress) return;
  if (dashboardLoaded) return;

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
      { icon: '📡', label: 'DDNS 域名', value: ddnsCount + ' 个', color: ddnsCount > 0 ? 'var(--success)' : 'var(--text-secondary)' },
      { icon: '🔒', label: 'SSL 证书', value: certCount + ' 个', color: certCount > 0 ? 'var(--success)' : 'var(--text-secondary)' },
      { icon: '🌐', label: 'Nginx', value: nginxRunning ? '运行中 🟢' : '未运行', color: nginxRunning ? 'var(--success)' : 'var(--text-secondary)' },
      { icon: '🔄', label: '代理规则', value: proxyCount + ' 条启用', color: proxyCount > 0 ? 'var(--success)' : 'var(--text-secondary)' },
      { icon: '🔌', label: '监听端口', value: portCount + ' 个', color: portCount > 0 ? 'var(--success)' : 'var(--text-secondary)' }
    ];

    grid.innerHTML = cards.map(function(c) {
      var colorAttr = c.color ? ' style="color:' + c.color + '"' : '';
      return '<div class="stat-card">'
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