// App 全局常量和状态
const App = window.App = {
  version: '1.8.1',
  NOTIFY_DURATION: 3000,
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
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarToggle();
  updateClock();
  setInterval(updateClock, 30000);
  loadDashboard();
  loadSettings();
});

function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) el.textContent = formatTime(new Date());
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
      const pageName = item.dataset.page;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      Object.values(pageMap).forEach(p => p.classList.add('hidden'));
      const target = pageMap[pageName];
      if (target) target.classList.remove('hidden');

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
  nginx: loadNginx,
  proxy: loadProxy,
  port: loadPort,
  pm2: loadPM2,
  log: loadLog,
  cron: loadCron,
  docker: loadDocker,
  settings: loadSettings
};