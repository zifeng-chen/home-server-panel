// 系统设置页面
let dbMode = 'local';
let dbConnected = false;

async function loadSettings() {
  try {
    const [cfgRes, dbRes] = await Promise.all([
      Api.get('/system/config'),
      Api.get('/db/status')
    ]);

    // 系统设置
    if (cfgRes.success && cfgRes.data) {
      const cfg = cfgRes.data;
      setVal('cfgAliKeyId', cfg.aliKeyId || '');
      setVal('cfgAliKeySecret', cfg.aliKeySecret || '');
      setVal('cfgPushplusToken', cfg.pushplusToken === '已配置' ? '' : '');
      setVal('cfgAcmeEmail', cfg.acmeEmail || '');
      setVal('cfgAcmeDns', cfg.acmeDnsProvider || 'alidns');
    }

    // 数据库状态
    if (dbRes.success && dbRes.data) {
      dbMode = dbRes.data.mode || 'local';
      dbConnected = dbRes.data.connected;
      renderDbStatus();
    }
  } catch (err) {
    App.log('error', '加载设置失败:', err);
  }
}

// ========== 数据库管理 ==========

function renderDbStatus() {
  const el = document.getElementById('dbStatusText');
  const btnEl = document.getElementById('dbActionBtn');
  const cardEl = document.getElementById('cardDbConfig');
  if (!el) return;

  if (dbMode === 'mysql' && dbConnected) {
    el.innerHTML = '✅ <span style="color:var(--success)">MySQL 已连接</span>';
    el.className = '';
    if (btnEl) btnEl.textContent = '断开连接';
    if (cardEl) cardEl.style.display = 'none';
  } else {
    el.innerHTML = '📁 <span style="color:var(--text-secondary)">本地 JSON 文件存储</span>';
    el.className = '';
    if (btnEl) btnEl.textContent = '配置 MySQL';
    if (cardEl) cardEl.style.display = 'none';
  }
}

window.toggleDbConfig = () => {
  if (dbMode === 'mysql' && dbConnected) {
    // 断开连接
    Utils.confirm('断开 MySQL', '确定断开数据库连接并切回本地模式吗？<br><small>数据仍在 MySQL 中，不会丢失</small>', async () => {
      Utils.notify('正在断开连接...', 'info');
      const res = await Api.post('/db/disconnect');
      if (res.success) {
        dbMode = 'local';
        dbConnected = false;
        renderDbStatus();
        Utils.notify('已切回本地存储模式', 'success');
      } else {
        Utils.notify(res.message || '操作失败', 'error');
      }
    });
    return;
  }

  const cardEl = document.getElementById('cardDbConfig');
  if (cardEl) {
    cardEl.style.display = cardEl.style.display === 'block' ? 'none' : 'block';
  }
};

window.testDbConnection = async () => {
  const host = document.getElementById('dbHost')?.value.trim() || '';
  const port = document.getElementById('dbPort')?.value.trim() || '3306';
  const user = document.getElementById('dbUser')?.value.trim() || '';
  const password = document.getElementById('dbPass')?.value || '';
  const database = document.getElementById('dbName')?.value.trim() || 'server_panel';
  const resultEl = document.getElementById('dbTestResult');

  if (!host || !user) {
    if (resultEl) { resultEl.textContent = '❌ 请输入主机和用户名'; resultEl.className = 'test-result error'; }
    return;
  }

  if (resultEl) { resultEl.textContent = '🔄 测试连接...'; resultEl.className = 'test-result info'; }

  const res = await Api.post('/db/test', { host, port: parseInt(port) || 3306, user, password, database });
  if (res.success) {
    if (resultEl) {
      resultEl.textContent = res.dbExists ? `✅ 连接成功！数据库 "${database}" 已存在` : `✅ 连接成功！数据库 "${database}" 将在连接时自动创建`;
      resultEl.className = 'test-result success';
    }
  } else {
    if (resultEl) { resultEl.textContent = '❌ ' + (res.message || '连接失败'); resultEl.className = 'test-result error'; }
  }
};

window.connectDb = async () => {
  const host = document.getElementById('dbHost')?.value.trim() || '';
  const port = document.getElementById('dbPort')?.value.trim() || '3306';
  const user = document.getElementById('dbUser')?.value.trim() || '';
  const password = document.getElementById('dbPass')?.value || '';
  const database = document.getElementById('dbName')?.value.trim() || 'server_panel';
  const resultEl = document.getElementById('dbTestResult');
  const btn = document.getElementById('btnDbConnect');

  if (!host || !user) {
    Utils.notify('请输入数据库连接信息', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 连接中...'; }
  Utils.notify('正在连接 MySQL 并初始化表结构...', 'info');

  const res = await Api.post('/db/connect', { host, port: parseInt(port) || 3306, user, password, database });
  if (res.success) {
    dbMode = 'mysql';
    dbConnected = true;
    renderDbStatus();
    Utils.notify('✅ MySQL 连接成功！现在可以迁移数据', 'success');
    document.getElementById('cardDbConfig').style.display = 'none';
    // 显示迁移按钮
    const migrateBtn = document.getElementById('btnMigrate');
    if (migrateBtn) migrateBtn.style.display = 'inline-flex';
  } else {
    if (resultEl) { resultEl.textContent = '❌ ' + (res.message || '连接失败'); resultEl.className = 'test-result error'; }
    Utils.notify(res.message || '连接失败', 'error');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '🔗 连接 MySQL'; }
};

window.startMigration = async () => {
  Utils.confirm('数据迁移', '确定将本地 JSON 数据迁移到 MySQL 吗？<br><small>迁移不会删除本地文件，数据会合并到 MySQL</small>', async () => {
    Utils.notify('正在迁移数据...', 'info');
    const res = await Api.post('/db/migrate');
    if (res.success && res.data) {
      const d = res.data;
      let msg = '✅ 迁移完成';
      if (d.migrated.length > 0) msg += '\n已迁移: ' + d.migrated.join(', ');
      if (d.errors.length > 0) msg += '\n失败: ' + d.errors.join(', ');
      if (d.skipped.length > 0) msg += '\n跳过: ' + d.skipped.join(', ');
      Utils.notify(msg, 'success');
    } else {
      Utils.notify(res.message || '迁移失败', 'error');
    }
  });
};

// ========== 操作日志 ==========

window.showSettingsOpLog = () => {
  const filter = document.getElementById('opLogModuleFilter')?.value || 'all';
  Utils.showOpLog(filter, '操作日志');
};

// ========== 诊断日志（保留在系统设置页，隐藏态） ==========

function renderDiagLog() {
  var container = document.getElementById('diagLogContainer');
  if (!container) return;

  var filter = document.getElementById('diagPageFilter')?.value || 'all';
  var logs = Api.getDiagLog(filter === 'all' ? null : filter);

  if (!logs || logs.length === 0) {
    container.innerHTML = '<span style="color:var(--text-secondary);">暂无诊断日志</span>';
    return;
  }

  var levelColors = { success: '#22c55e', warn: '#f59e0b', error: '#ef4444', info: '#94a3b8' };
  var pageLabels = { dashboard: '📊', ddns: '📡', ssl: '🔒', nginx: '🖥️', proxy: '🔄', port: '🔌', pm2: '⚡', docker: '🐳', ssh: '💻', settings: '⚙️' };

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

  if (loadSettings) loadSettings();
});