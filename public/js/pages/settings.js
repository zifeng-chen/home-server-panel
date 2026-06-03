// 系统设置页面
async function loadSettings() {
  try {
    const res = await Api.get('/system/config');
    if (!res.success || !res.data) return;

    const cfg = res.data;
    setVal('cfgAliKeyId', cfg.aliKeyId || '');
    setVal('cfgAliKeySecret', cfg.aliKeySecret || '');
    setVal('cfgPushplusToken', cfg.pushplusToken === '已配置' ? '' : '');
    setVal('cfgAcmeEmail', cfg.acmeEmail || '');
    setVal('cfgAcmeDns', cfg.acmeDnsProvider || 'alidns');
  } catch (err) {
    App.log('error', '加载设置失败:', err);
  }
}

// 渲染诊断日志
function renderDiagLog() {
  var container = document.getElementById('diagLogContainer');
  if (!container) return;
  
  var filter = document.getElementById('diagPageFilter')?.value || 'all';
  var logs = Api.getDiagLog(filter === 'all' ? null : filter);
  
  if (!logs || logs.length === 0) {
    container.innerHTML = '<span style="color:var(--text-secondary);">暂无诊断日志<br>切换到其他页面触发 API 请求后回到这里查看</span>';
    return;
  }

  var levelColors = { success: '#22c55e', warn: '#f59e0b', error: '#ef4444', info: '#94a3b8' };
  var pageLabels = {
    dashboard: '📊', ddns: '📡', ssl: '🔒', nginx: '🖥️', proxy: '🔄',
    port: '🔌', pm2: '⚡', docker: '🐳', ssh: '💻', settings: '⚙️'
  };
  
  container.innerHTML = logs.map(function(e) {
    var color = levelColors[e.level] || '#94a3b8';
    var label = pageLabels[e.page] || '❓';
    return '<span style="color:' + color + '">' + e.time + ' ' + label + ' ' + e.msg + '</span>';
  }).join('<br>');
  container.scrollTop = container.scrollHeight;
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined) el.value = value;
}

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('btnSaveSettings');
  const testBtn = document.getElementById('btnTestPushplus');

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const data = {
      aliKeyId: document.getElementById('cfgAliKeyId')?.value || '',
      aliKeySecret: document.getElementById('cfgAliKeySecret')?.value || '',
      pushplusToken: document.getElementById('cfgPushplusToken')?.value || '',
      acmeEmail: document.getElementById('cfgAcmeEmail')?.value || '',
      acmeDns: document.getElementById('cfgAcmeDns')?.value || 'alidns'
    };
    const res = await Api.post('/system/config', data);
    Utils.notify(res.message || '保存完成', res.success ? 'success' : 'error');
  });

  if (testBtn) testBtn.addEventListener('click', async () => {
    Utils.notify('正在发送测试推送...', 'info');
    const res = await Api.post('/notify/test', {
      token: document.getElementById('cfgPushplusToken')?.value || ''
    });
    Utils.notify(res.message || '推送完成', res.success ? 'success' : 'error');
  });

  // 进入设置页时自动刷新诊断日志
  var settingsPage = document.getElementById('page-settings');
  if (settingsPage) {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (!settingsPage.classList.contains('hidden')) renderDiagLog();
        }
      });
    });
    observer.observe(settingsPage, { attributes: true, attributeFilter: ['class'] });
  }
});