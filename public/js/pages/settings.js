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
      setVal('cfgPushplusToken', cfg.pushplusToken);
      // 已配置 token 时显示提示 placeholder
      var tokEl = document.getElementById('cfgPushplusToken');
      if (tokEl && cfg.pushplusToken === '已配置') {
        tokEl.value = '';
        tokEl.placeholder = '✅ 已配置（修改请重新输入）';
        tokEl.style.borderColor = 'var(--success)';
      } else if (tokEl) {
        tokEl.placeholder = '输入 Token';
        tokEl.style.borderColor = '';
      }
      setVal('cfgAcmeEmail', cfg.acmeEmail || '');
      setVal('cfgAcmeDns', cfg.acmeDnsProvider || 'alidns');
    }

    // 数据库状态
    if (dbRes.success && dbRes.data) {
      dbMode = dbRes.data.mode || 'local';
      dbConnected = dbRes.data.connected;
    }
    renderDbStatus();

    // 自动加载操作日志面板
    setTimeout(function() { _loadSettingsOpLog('all'); }, 300);
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
  var filterEl = document.getElementById('opLogModuleFilter');
  var filter = filterEl ? filterEl.value : 'all';
  if (!filter || filter === 'all') filter = 'all';
  _loadSettingsOpLog(filter);
};

// 自动加载操作日志
async function _loadSettingsOpLog(module) {
  var logDiv = document.getElementById('opLogContainer');
  if (!logDiv) return;

  try {
    var params = 'limit=8';
    if (module && module !== 'all') params += '&module=' + module;
    var res = await Api.get('/log?' + params, null, { showError: false });
    if (!res.success || !res.data) {
      logDiv.innerHTML = '<span style="color:#64748b;">暂无操作记录</span>';
      return;
    }
    var entries = res.data.list || res.data.records || res.data.entries || [];
    if (!Array.isArray(entries) || entries.length === 0) {
      logDiv.innerHTML = '<span style="color:#64748b;">暂无操作记录</span>';
      return;
    }
    var recent = entries.slice(0, 8);
    logDiv.innerHTML = recent.map(function(e) {
      var time = e.time || e.timestamp || e.createdAt || '';
      if (time && time.length > 16) time = time.slice(11, 16);
      var modIcon = { ddns: '📡', ssl: '🔒', nginx: '🖥️', proxy: '🔄', port: '🔌', pm2: '⚡', docker: '🐳', ssh: '💻', system: '⚙️' };
      var icon = modIcon[e.module] || '📌';
      var text = e.message || e.action || e.desc || '';
      // 附加简要 meta（IP + 耗时）
      var meta = [];
      if (e.ip && e.ip !== '-') meta.push(e.ip);
      if (e.duration) meta.push(e.duration + 'ms');
      var metaStr = meta.length ? '<span style="color:#9ca3af;font-size:10px">[' + meta.join(', ') + ']</span> ' : '';
      return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #e5e7eb;font-size:11px"><span style="color:#6b7280;font-family:Menlo,monospace">' + (time || '--:--') + '</span><span>' + icon + '</span>' + metaStr + '<span style="flex:1">' + text + '</span></div>';
    }).join('');
  } catch(e) {
    logDiv.innerHTML = '<span style="color:var(--danger)">加载失败: ' + (e.message || '') + '</span>';
  }
}

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
  const restartBtn = document.getElementById('btnRestartService');

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

  // ===== 重启服务 =====
  if (restartBtn) restartBtn.addEventListener('click', () => {
    Utils.confirm('🔄 重启服务',
      '<div style="text-align:left">即将重启家庭服务器管理面板。<br><br>' +
      '<strong>重启期间约3-5秒无法访问</strong>，完成后请刷新页面。</div>',
      async () => {
        try {
          restartBtn.disabled = true;
          restartBtn.textContent = '⏳ 重启中...';
          await Api.post('/system/restart');
          Utils.notify('服务已重启，3秒后自动刷新...', 'success');
          // 轮询等待服务恢复
          let retries = 0;
          const checkInterval = setInterval(async () => {
            retries++;
            try {
              const res = await fetch('/api/system/uptime');
              if (res.ok) {
                clearInterval(checkInterval);
                window.location.reload();
              }
            } catch (e) {
              if (retries > 15) {
                clearInterval(checkInterval);
                Utils.notify('服务未自动恢复，请手动刷新页面', 'error');
                restartBtn.disabled = false;
                restartBtn.textContent = '🔄 重启服务';
              }
            }
          }, 1000);
        } catch (e) {
          Utils.notify('重启失败: ' + e.message, 'error');
          restartBtn.disabled = false;
          restartBtn.textContent = '🔄 重启服务';
        }
      }, '确认重启', '取消'
    );
  });

  // 加载运行时间
  const _updateSettingsUptime = async () => {
    try {
      const res = await Api.get('/system/uptime');
      if (res.success && res.data) {
        const seconds = Math.floor(res.data.uptime);
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const parts = [];
        if (d > 0) parts.push(d + '天');
        if (h > 0) parts.push(h + '时');
        parts.push(m + '分' + s + '秒');
        const el = document.getElementById('settingsUptime');
        if (el) el.textContent = parts.join(' ');
      }
    } catch (e) { /* ignore */ }
  };
  _updateSettingsUptime();
  setInterval(_updateSettingsUptime, 30000);

  if (loadSettings) loadSettings();
});

// ========== 日志导出 ==========

// 导出操作日志（从服务器 API）
window.exportOpLog = async (format) => {
  var filterEl = document.getElementById('opLogModuleFilter');
  var module = filterEl ? filterEl.value : 'all';
  if (!module || module === 'all') module = 'all';

  try {
    Utils.notify('正在导出日志...', 'info');
    var token = localStorage.getItem('hsp_token');
    var res = await fetch('/api/log/export?limit=100000&format=' + format + (module !== 'all' ? '&module=' + module : ''), {
      headers: { 'x-auth-token': token }
    });
    if (!res.ok) {
      var err = await res.json().catch(function(){ return {message:'导出失败'}; });
      Utils.notify('导出失败: ' + (err.message || res.status), 'error');
      return;
    }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = 'hsp-oplog-' + now + '.' + format;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Utils.notify('✅ 日志已导出 (.' + format + ')', 'success');
  } catch (e) {
    Utils.notify('导出失败: ' + (e.message || ''), 'error');
  }
};

// 导出诊断日志（浏览器本地）
window.exportDiagLog = () => {
  var logs = Api.getDiagLog(null);
  if (!logs || logs.length === 0) {
    Utils.notify('暂无诊断日志可导出', 'error');
    return;
  }
  var text = logs.map(function(e) {
    return e.time + ' | ' + (e.page || '?') + ' | ' + (e.level || 'info') + ' | ' + e.msg;
  }).join('\n');
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = 'hsp-diaglog-' + now + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Utils.notify('✅ 诊断日志已导出 (.txt)', 'success');
};