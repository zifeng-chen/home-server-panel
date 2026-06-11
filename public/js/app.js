// App 全局常量和状态
const App = window.App = {
  version: '1.16.1',
  NOTIFY_DURATION: 3000, _currentPage: 'dashboard',
  _pending: {},
  isPending(key) {
    if (this._pending[key]) return true;
    this._pending[key] = true;
    setTimeout(() => delete this._pending[key], 5000);
    return false;
  },

  log(level, ...args) {
    if (App.LOG_LEVELS[App.LOG_LEVEL] >= App.LOG_LEVELS[level]) {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}]`, ...args);
    }
  },

  LOG_LEVELS: { debug: 0, info: 1, warn: 2, error: 3, none: 4 },
  LOG_LEVEL: 'info'
};

// DOM ready
// Hash 路由：支持仪表盘卡片点击跳转
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return;
  const navMap = { ddns: 'ddns', ssl: 'ssl', nginx: 'nginx', port: 'port', pm2: 'pm2', cron: 'cron', docker: 'docker', ssh: 'ssh', settings: 'settings' };
  const pageName = navMap[hash];
  if (!pageName) return;
  // 切换侧边栏激活状态
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageName);
  });
  // 切换页面
  const pageMap = {};
  document.querySelectorAll('.page').forEach(p => {
    if (p.id && p.id.startsWith('page-')) pageMap[p.id.replace('page-', '')] = p;
  });
  Object.values(pageMap).forEach(p => p.classList.add('hidden'));
  const target = pageMap[pageName];
  if (target) {
    target.classList.remove('hidden');
    if (typeof Api !== 'undefined') Api._currentPage = pageName;
    (App.pageLoaders || {})[pageName]?.();
  }
  // 清除 hash
  history.replaceState(null, '', window.location.pathname);
});

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarToggle();
  initLogout();
  // 顶栏退出按钮（dashboard.js 提供 _initLogoutTop，此处兜底）
  var topBtn = document.getElementById('btnLogoutTop');
  if (topBtn && typeof _initLogoutTop !== 'function') {
    topBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('hsp_token');
        window.location.href = '/login.html';
      }
    });
  }
  _topbarPollStart();
  setInterval(updateUptime, 1000);
  loadDashboard();
  loadSettings();
});


// 侧边栏运行时间实时更新（每秒）
let _uptimeStart = null;
function updateUptime() {
  if (_uptimeStart == null && window._liveUptime != null) {
    _uptimeStart = Date.now() - window._liveUptime * 1000;
  }
  if (_uptimeStart != null) {
    const sec = Math.floor((Date.now() - _uptimeStart) / 1000);
    const el = document.getElementById('uptime');
    if (el) el.textContent = formatUptime(sec);
  }
}

// 侧边栏折叠
function initSidebarToggle() {
  const btn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (btn && sidebar) {
    btn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !btn.contains(e.target) && window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
      }
    });
  }
}

// 退出登录（顶栏按钮）
function initLogout() {
  // 已在 dashboard.js 中通过 _initLogoutTop() 处理
}

// 导航
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pageMap = {};
  document.querySelectorAll('.page').forEach(p => {
    if (p.id && p.id.startsWith('page-')) pageMap[p.id.replace('page-', '')] = p;
  });

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();

      // 防抖：300ms 内重复点击忽略
      var now = Date.now();
      if (App._lastNavClick && now - App._lastNavClick < 300) return;
      App._lastNavClick = now;

      const pageName = item.dataset.page;

      // 如果同一个页面，不重复加载
      if (App._currentPage === pageName) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      Object.values(pageMap).forEach(p => p.classList.add('hidden'));
      const target = pageMap[pageName];
      if (target) target.classList.remove('hidden');

      // 设置当前页面（用于诊断日志标记）
      if (typeof Api !== 'undefined') Api._currentPage = pageName;

      // 页面级懒加载
      (App.pageLoaders || {})[pageName]?.();
    });
  });
}

// 启动页加载映射
App.pageLoaders = {
  dashboard: loadDashboard,
  ddns: loadDdns,
  ssl: loadCert,
  nginx: () => { loadNginx(); loadProxy(); },
  port: loadPort,
  pm2: loadPM2,
  cron: loadCron,
  docker: loadDocker,
  ssh: loadSSH,
  settings: loadSettings
};

// 页面切换时停止仪表盘监控轮询 & 处理 SSH 连接
var _origInitNav = initNavigation;
initNavigation = function() {
  _origInitNav();
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var page = item.dataset.page;
      if (page !== 'dashboard') {
        if (typeof _dashMonTimer !== 'undefined' && _dashMonTimer) {
          clearInterval(_dashMonTimer);
          _dashMonTimer = null;
        }
      } else {
        if (!_dashMonTimer && typeof _dashboardMonitorFetch === 'function') {
          _dashboardMonitorFetch();
          _dashMonTimer = setInterval(_dashboardMonitorFetch, 5000);
        }
      }
      // SSH 页面切换处理
      if (window.__SSH && window.__SSH._onPageSwitch) {
        window.__SSH._onPageSwitch(page === 'ssh');
      }
    });
  });
};