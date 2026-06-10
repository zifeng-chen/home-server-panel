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
    }
    renderDbStatus();
  } catch (err) {
    App.log('error', '加载设置失败:', err);
  }
}

// ========== 数据库管理 ==========

function renderDbStatus() {
  const el = document.getElementById('dbStatusText');
  if (!el) return;

  if (dbMode === 'mysql' && dbConnected) {
    el.innerHTML = '<span style="color:var(--success)">✅ MySQL 已连接</span>';
    const migrateSection = document.getElementById('dbMigrateSection');
    const btnSwitch = document.getElementById('btnDbSwitch');
    if (migrateSection) migrateSection.style.display = 'none';
    if (btnSwitch) btnSwitch.style.display = 'inline-flex';
  } else if (dbMode === 'mysql' && !dbConnected) {
    el.innerHTML = '<span style="color:var(--warning)">⚠️ MySQL 连接断开</span>';
    const migrateSection = document.getElementById('dbMigrateSection');
    const btnSwitch = document.getElementById('btnDbSwitch');
    if (migrateSection) migrateSection.style.display = 'none';
    if (btnSwitch) btnSwitch.style.display = 'none';
  } else {
    el.innerHTML = '<span style="color:var(--text-secondary)">🗄️ SQLite 本地存储</span>';
    const migrateSection = document.getElementById('dbMigrateSection');
    const btnSwitch = document.getElementById('btnDbSwitch');
    if (migrateSection) migrateSection.style.display = 'block';
    if (btnSwitch) btnSwitch.style.display = 'none';
  }
}

window.toggleDbConfig = () => {
  if (dbMode === 'mysql' && dbConnected) {
    // 断开连接
    Utils.confirm('断开 MySQL', '确定断开数据库连接并切回 SQLite 模式吗？<br><small>数据仍在 MySQL 中，不会丢失</small>', async () => {
      Utils.notify('正在断开连接...', 'info');
      const res = await Api.post('/db/disconnect');
      if (res.success) {
        dbMode = 'local';
        dbConnected = false;
        renderDbStatus();
        Utils.notify('已切回 SQLite 本地存储模式', 'success');
      } else {
        Utils.notify(res.message || '操作失败', 'error');
      }
    });
    return;
  }

  // 显示 MySQL 配置浮窗
  showDbConfigModal();
};

window.showDbConfigModal = () => {
  const body = `
    <div class="form-group">
      <label>MySQL 主机</label>
      <input type="text" id="dbMigHost" class="form-input" value="192.168.100.110" placeholder="127.0.0.1">
    </div>
    <div class="form-group">
      <label>端口</label>
      <input type="number" id="dbMigPort" class="form-input" value="3306" placeholder="3306">
    </div>
    <div class="form-group">
      <label>用户名</label>
      <input type="text" id="dbMigUser" class="form-input" value="root" placeholder="root">
    </div>
    <div class="form-group">
      <label>密码</label>
      <input type="password" id="dbMigPass" class="form-input" placeholder="MySQL 密码">
    </div>
    <div class="form-group">
      <label>数据库名</label>
      <input type="text" id="dbMigName" class="form-input" value="server_panel" placeholder="server_panel">
    </div>
    <div id="dbMigResult" style="font-size:12px;margin-top:8px;min-height:20px"></div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-info" id="btnDbTest">🧪 测试连接</button>
    <button class="btn btn-success" id="btnDbConnect" onclick="migrateToMySQL()">🚀 连接并迁移</button>
  `;
  Utils.openModal('🔗 迁移至 MySQL', body, footer);

  document.getElementById('btnDbTest').addEventListener('click', async () => {
    const host = document.getElementById('dbMigHost').value.trim();
    const port = document.getElementById('dbMigPort').value.trim() || '3306';
    const user = document.getElementById('dbMigUser').value.trim();
    const password = document.getElementById('dbMigPass').value;
    const database = document.getElementById('dbMigName').value.trim() || 'server_panel';
    const resultEl = document.getElementById('dbMigResult');

    if (!host || !user) { resultEl.textContent = '❌ 请输入主机和用户名'; return; }
    resultEl.textContent = '🔄 测试连接...';
    const res = await Api.post('/db/test', { host, port: parseInt(port), user, password, database });
    resultEl.textContent = res.success ? (res.dbExists ? `✅ 连接成功！数据库"${database}"已存在` : `✅ 连接成功！数据库"${database}"将自动创建`) : '❌ ' + (res.message || '连接失败');
  });
};

window.migrateToMySQL = async () => {
  const host = document.getElementById('dbMigHost').value.trim();
  const port = document.getElementById('dbMigPort').value.trim() || '3306';
  const user = document.getElementById('dbMigUser').value.trim();
  const password = document.getElementById('dbMigPass').value;
  const database = document.getElementById('dbMigName').value.trim() || 'server_panel';
  const resultEl = document.getElementById('dbMigResult');

  if (!host || !user) { Utils.notify('请输入数据库连接信息', 'error'); return; }
  resultEl.textContent = '🔄 正在连接 MySQL 并初始化...';

  const res = await Api.post('/db/connect', { host, port: parseInt(port), user, password, database });
  if (!res.success) { resultEl.textContent = '❌ ' + (res.message || '连接失败'); return; }

  resultEl.textContent = '🔄 正在迁移数据...';
  const migRes = await Api.post('/db/migrate');
  if (migRes.success) {
    dbMode = 'mysql';
    dbConnected = true;
    renderDbStatus();
    resultEl.textContent = '✅ 迁移完成！' + (migRes.data?.migrated?.join(', ') || '');
    Utils.notify('✅ MySQL 迁移完成', 'success');
    setTimeout(() => Utils.closeModal(), 2000);
  } else {
    resultEl.textContent = '❌ ' + (migRes.message || '迁移失败');
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

  var levelColors = { success: '#22c55e', warn: '#f59e0b', error: '#c41e3a', info: '#6b7280' };
  var pageLabels = { dashboard: '📊', ddns: '📡', ssl: '🔒', nginx: '🖥️', proxy: '🔄', port: '🔌', pm2: '⚡', docker: '🐳', ssh: '💻', settings: '⚙️' };

  container.innerHTML = logs.map(function(e) {
    var color = levelColors[e.level] || '#6b7280';
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
  const reinstallBtn = document.getElementById('btnReinstall');
  const exportBtn = document.getElementById('btnExportData');
  const importBtn = document.getElementById('btnImportData');

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

  // ===== Task 3: Reinstall button =====
  if (reinstallBtn) reinstallBtn.addEventListener('click', () => {
    Utils.confirm('⚠️ 重装向导', 
      '<div style="text-align:left"><strong style="color:var(--danger)">重装将清除所有数据！</strong><br><br>' +
      '请先导出数据备份，再执行重装。<br><br>' +
      '重装后将跳转到安装向导页面重新配置系统。</div>',
      async () => {
        // 调用 reset API 清除所有数据
        Utils.notify('正在清除数据...', 'info');
        try {
          const res = await Api.post('/setup/reset');
          if (res.success) {
            Utils.notify('系统已重置，即将跳转...', 'success');
            setTimeout(() => { window.location.href = '/install.html'; }, 1500);
          } else {
            Utils.notify(res.message || '重置失败', 'error');
          }
        } catch (e) {
          // 降级：直接跳转
          window.location.href = '/install.html';
        }
      }, '确认重装', '取消'
    );
  });

  // ===== Task 4: Export data =====
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    Utils.notify('正在导出数据...', 'info');
    const token = localStorage.getItem('hsp_token');
    const a = document.createElement('a');
    a.href = '/api/db/export?token=' + encodeURIComponent(token);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // ===== Task 4: Import data =====
  if (importBtn) importBtn.addEventListener('click', () => {
    const body = `
      <div class="form-group">
        <label>选择数据库文件（.sql / .db / .json）</label>
        <input type="file" id="importFileInput" accept=".sql,.db,.json" class="form-input" style="padding:8px">
        <small style="color:var(--text-secondary)">支持 SQLite .db / MySQL .sql / JSON 备份文件</small>
      </div>
      <div id="importResult" style="font-size:12px;margin-top:8px;min-height:20px"></div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
      <button class="btn btn-success" id="btnImportConfirm">📥 导入</button>
    `;
    Utils.openModal('📥 导入数据', body, footer);

    document.getElementById('btnImportConfirm').addEventListener('click', async () => {
      const fileInput = document.getElementById('importFileInput');
      const file = fileInput?.files?.[0];
      if (!file) { Utils.notify('请选择文件', 'error'); return; }

      const formData = new FormData();
      formData.append('file', file);

      Utils.notify('正在导入...', 'info');
      try {
        const token = localStorage.getItem('hsp_token');
        const res = await fetch('/api/db/import', {
          method: 'POST',
          headers: { 'x-auth-token': token },
          body: formData
        });
        const json = await res.json();
        if (json.success) {
          document.getElementById('importResult').innerHTML = '✅ ' + json.message;
          Utils.notify('✅ 导入成功', 'success');
          setTimeout(() => { Utils.closeModal(); loadSettings(); }, 1500);
        } else {
          document.getElementById('importResult').innerHTML = '❌ ' + (json.message || '导入失败');
        }
      } catch (e) {
        document.getElementById('importResult').innerHTML = '❌ ' + e.message;
      }
    });
  });

  if (loadSettings) loadSettings();
});