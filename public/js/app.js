// App 全局常量和状态
const App = window.App = {
  version: '1.17.7',
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
    App._currentPage = pageName;
    try { sessionStorage.setItem('hsp_page', pageName); } catch(e) {}
    (App.pageLoaders || {})[pageName]?.();
  }
  // 清除 hash
  history.replaceState(null, '', window.location.pathname);
});

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarToggle();
  initUserMenu();
  _topbarPollStart();

  // 刷新时恢复当前页面（非默认仪表盘时）
  var hash = window.location.hash.replace('#', '');
  var navMap = { ddns: 'ddns', ssl: 'ssl', nginx: 'nginx', port: 'port', pm2: 'pm2', cron: 'cron', docker: 'docker', ssh: 'ssh', settings: 'settings' };
  var restorePage = hash ? navMap[hash] : null;
  // 从 sessionStorage 恢复（hash 优先）
  if (!restorePage) {
    try { restorePage = sessionStorage.getItem('hsp_page'); } catch(e) {}
  }
  if (restorePage && restorePage !== 'dashboard' && restorePage !== 'home') {
    // 模拟点击导航项
    var targetNav = document.querySelector('.nav-item[data-page="' + restorePage + '"]');
    if (targetNav) {
      targetNav.click();
      return;
    }
  }

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

// 管理员菜单（点击用户名弹出退出登录菜单）
function initUserMenu() {
  var btn = document.getElementById('topbarUserBtn');
  var dropdown = document.getElementById('userDropdown');
  if (!btn || !dropdown) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', function() {
    dropdown.classList.add('hidden');
  });
  var logoutLink = document.getElementById('menuLogout');
  if (logoutLink) {
    logoutLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('hsp_token');
        window.location.href = '/login.html';
      }
    });
  }
}

// 退出登录（顶栏按钮）
function initLogout() {
  // 已由 initUserMenu 统一处理
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
      var prevPage = (typeof Api !== 'undefined') ? Api._currentPage : App._currentPage;
      if (prevPage === pageName) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      Object.values(pageMap).forEach(p => p.classList.add('hidden'));
      const target = pageMap[pageName];
      if (target) target.classList.remove('hidden');

      // 设置当前页面（用于诊断日志标记 + 重复点击检测）
      App._currentPage = pageName;
      if (typeof Api !== 'undefined') Api._currentPage = pageName;
      try { sessionStorage.setItem('hsp_page', pageName); } catch(e) {}

      // 页面级懒加载
      (App.pageLoaders || {})[pageName]?.();
    });
  });
}

// 启动页加载映射
App.pageLoaders = {
  dashboard: () => loadDashboard(),
  ddns: () => _ensurePage('ddns', window.loadDdns),
  ssl: () => _ensurePage('cert', window.loadCert),
  nginx: () => _ensurePage('nginx', window.loadNginxPage),
  port: () => _ensurePage('port', window.loadPort),
  pm2: () => _ensurePage('pm2', window.loadPM2),
  cron: () => _ensurePage('cron', window.loadCron),
  docker: () => _ensurePage('docker', window.loadDocker),
  ssh: () => _ensurePage('ssh', window.loadSSH),
  settings: () => loadSettings()
};

// 动态按需加载页面脚本
function _ensurePage(name, fn) {
  if (typeof fn === 'function') return fn();            // 已加载
  // 首访：动态加载 JS 并缓存
  const id = 'hsp-page-' + name;
  if (document.getElementById(id)) return;              // 正在加载
  const s = document.createElement('script');
  s.id = id;
  s.src = '/js/pages/' + name + '.min.js?v=' + (document.querySelector('meta[name="build-id"]')?.content || '');
  s.onload = () => {
    // 脚本加载后重新触发页面加载
    const loader = App.pageLoaders?.[name];
    if (loader) setTimeout(loader, 0);
  };
  s.onerror = () => console.warn('[App] 页面脚本加载失败:', name);
  document.head.appendChild(s);
}

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