// DDNS 页面 - 支持 IPv4 + IPv6 + 多选操作
let ddnsLoaded = false;

// 批量操作栏刷新
function updateDdnsBatchBar() {
  const bar = document.getElementById('ddnsBatchBar');
  const countEl = document.getElementById('ddnsBatchCount');
  if (!bar || !countEl) return;

  const checked = document.querySelectorAll('#ddnsTbody .ddns-row-checkbox:checked');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `已选 ${checked.length} 项`;
  } else {
    bar.style.display = 'none';
    const selectAll = document.getElementById('ddnsSelectAll');
    if (selectAll) selectAll.checked = false;
  }
}

// 全选/取消全选
window.ddnsToggleSelectAll = () => {
  const selectAll = document.getElementById('ddnsSelectAll');
  const checkboxes = document.querySelectorAll('#ddnsTbody .ddns-row-checkbox');
  const checked = selectAll.checked;
  checkboxes.forEach(cb => { cb.checked = checked; });
  updateDdnsBatchBar();
};

// 单行复选框变更
window.ddnsRowCheckChanged = () => {
  const selectAll = document.getElementById('ddnsSelectAll');
  const checkboxes = document.querySelectorAll('#ddnsTbody .ddns-row-checkbox');
  const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
  if (selectAll) selectAll.checked = allChecked;
  updateDdnsBatchBar();
};

// 获取选中记录 ID 列表
function getSelectedDdnsIds() {
  const ids = [];
  document.querySelectorAll('#ddnsTbody .ddns-row-checkbox:checked').forEach(cb => {
    ids.push(cb.dataset.id);
  });
  return ids;
}

// 批量启用/停用
window.batchToggleDdns = async (enable) => {
  const ids = getSelectedDdnsIds();
  if (ids.length === 0) { Utils.notify('请先选择记录', 'error'); return; }

  const status = enable ? 'ENABLE' : 'DISABLE';
  const action = enable ? '启用' : '停用';
  Utils.notify(`正在批量${action} ${ids.length} 条记录...`, 'info');

  let success = 0, fail = 0;
  for (const id of ids) {
    const res = await Api.post(`/ddns/record/${id}/toggle`, { status });
    if (res.success) success++; else fail++;
  }

  if (success > 0) Utils.notify(`成功${action} ${success} 条` + (fail > 0 ? `，${fail} 条失败` : ''), 'success');
  else Utils.notify(`批量${action}失败`, 'error');
  loadDdns();
};

// 批量删除
window.batchDeleteDdns = async () => {
  const ids = getSelectedDdnsIds();
  if (ids.length === 0) { Utils.notify('请先选择记录', 'error'); return; }

  const body = `
    <p style="margin-bottom:16px;color:var(--text-secondary)">确认删除选中的 <strong style="color:var(--danger)">${ids.length}</strong> 条 DDNS 记录？</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-secondary" id="batchRemovePanel" style="text-align:left;justify-content:flex-start;padding:12px 16px">
        📋 <strong>仅移除面板跟踪</strong><br>
        <small style="color:var(--text-secondary);margin-top:4px">从面板移除，<strong>不会删除</strong>阿里云 DNS 上的解析记录</small>
      </button>
      <button class="btn btn-danger" id="batchRemoveCloud" style="text-align:left;justify-content:flex-start;padding:12px 16px">
        🗑 <strong>同时从阿里云删除</strong><br>
        <small style="color:var(--text-secondary);margin-top:4px">从面板移除 + <strong style="color:var(--danger)">删除</strong>阿里云 DNS 上的解析记录</small>
      </button>
    </div>
  `;
  const footer = `<button class="btn btn-ghost" onclick="Utils.closeModal()">取消</button>`;
  Utils.openModal('批量删除 DNS 记录', body, footer);

  const doBatchDelete = async (localOnly) => {
    Utils.closeModal();
    Utils.notify(localOnly ? '正在批量移除面板跟踪...' : '正在批量删除阿里云记录...', 'info');

    let success = 0, fail = 0;
    for (const id of ids) {
      const res = await Api.del(`/ddns/record/${id}?localOnly=${localOnly}`);
      if (res.success) success++; else fail++;
    }

    if (success > 0) Utils.notify(`成功移除 ${success} 条` + (fail > 0 ? `，${fail} 条失败` : ''), 'success');
    else Utils.notify('批量删除失败', 'error');
    loadDdns();
  };

  document.getElementById('batchRemovePanel').addEventListener('click', () => doBatchDelete(true));
  document.getElementById('batchRemoveCloud').addEventListener('click', () => doBatchDelete(false));
};

async function loadDdns() {
  const tbody = document.getElementById('ddnsTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="9">加载中...</td></tr>';

  try {
    const res = await Api.get('/ddns');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">${res.message || '加载失败'}<br><small>请先在「系统设置」中配置阿里云密钥，再添加域名</small></td></tr>`;
      updateDdnsBatchBar();
      return;
    }

    const records = res.data?.records || [];
    const ipv4 = res.data?.publicIpv4 || '--';
    const ipv6 = res.data?.publicIpv6 || '--';

    // 更新公网 IP 显示
    const ipEl = document.getElementById('ddnsPublicIp');
    if (ipEl) {
      ipEl.innerHTML = `<span style="margin-right:16px">🌐 IPv4: <strong>${ipv4}</strong></span>${ipv6 && ipv6 !== '--' ? `<span title="${ipv6}">🔷 IPv6: <strong>${ipv6}</strong></span>` : '<span style="color:var(--text-secondary)">🔷 IPv6: 无</span>'}`;
    }

    if (records.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">暂无 DDNS 记录<br><small>点击「添加域名」开始配置</small></td></tr>`;
      updateDdnsBatchBar();
      return;
    }

    tbody.innerHTML = records.map(r => {
      if (r.error) {
        return `<tr><td colspan="9" class="error-row">❌ ${r.domain}: ${r.error}</td></tr>`;
      }

      const needsUpdate = r.needsUpdate;
      const typeClass = r.recordType === 'AAAA' ? 'type-badge-ipv6' : 'type-badge';
      const enabled = r.enabled !== false;

      return `
        <tr style="${enabled ? '' : 'opacity:0.5'}">
          <td style="text-align:center"><input type="checkbox" class="ddns-row-checkbox" data-id="${r.id}" onchange="ddnsRowCheckChanged()"></td>
          <td><strong>${r.domain}</strong></td>
          <td><span class="${typeClass}">${r.recordType || 'A'}</span></td>
          <td><code style="${needsUpdate ? 'color:var(--warning)' : ''}">${r.ip || '--'}</code></td>
          <td><small>${formatDate(r.createdAt) || '—'}</small></td>
          <td><small>${formatDate(r.updatedAt)}</small></td>
          <td>
            <span class="status-badge ${enabled ? (needsUpdate ? 'pending' : 'online') : 'offline'}">
              ${enabled ? (needsUpdate ? '需更新' : '生效中') : '已停用'}
            </span>
          </td>
          <td>
            <button class="btn btn-sm ${enabled ? 'btn-secondary' : 'btn-success'}" onclick="toggleDdnsRecord('${r.id}', '${enabled}')" title="${enabled ? '停用' : '启用'}">${enabled ? '⏸ 停用' : '▶ 启用'}</button>
            <button class="btn btn-sm btn-primary" onclick="editDdnsRecord('${r.id}')">✏ 编辑</button>
            <button class="btn btn-sm btn-danger" onclick="removeDdnsRecord('${r.id}', '${r.domain}')">🗑 移除</button>
          </td>
        </tr>
      `;
    }).join('');

    // 绑定全选复选框
    const selectAll = document.getElementById('ddnsSelectAll');
    if (selectAll) {
      selectAll.onchange = window.ddnsToggleSelectAll;
    }
    updateDdnsBatchBar();
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">加载失败: ${err.message}</td></tr>`;
    updateDdnsBatchBar();
  }
}

// 启停记录
window.toggleDdnsRecord = async (recordId, currentlyEnabled) => {
  const newStatus = currentlyEnabled === 'true' || currentlyEnabled === true ? 'DISABLE' : 'ENABLE';
  Utils.notify(`正在${newStatus === 'ENABLE' ? '启用' : '停用'}...`, 'info');
  const res = await Api.post(`/ddns/record/${recordId}/toggle`, { status: newStatus });
  if (res.success) { Utils.notify(res.message, 'success'); loadDdns(); }
  else Utils.notify(res.message || '操作失败', 'error');
};

// 编辑记录
window.editDdnsRecord = (recordId) => {
  // 先从已加载的数据中找记录
  const rows = document.querySelectorAll('#ddnsTbody tr');
  let record = null;
  for (const row of rows) {
    const btns = row.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.getAttribute('onclick')?.includes(recordId)) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          const domain = cells[1].textContent.trim();
          const type = cells[2].textContent.trim();
          const ip = cells[3].querySelector('code')?.textContent.trim() || '';
          record = { id: recordId, domain, type, ip, ttl: 600 };
        }
        break;
      }
    }
    if (record) break;
  }

  if (!record) { Utils.notify('未找到记录信息', 'error'); return; }

  const body = `
    <div class="form-group">
      <label>域名</label>
      <code style="font-size:14px;">${record.domain}</code>
    </div>
    <div class="form-group">
      <label>记录类型</label>
      <select id="ddnsEditType" class="form-input">
        <option value="A" ${record.type === 'A' ? 'selected' : ''}>A (IPv4)</option>
        <option value="AAAA" ${record.type === 'AAAA' ? 'selected' : ''}>AAAA (IPv6)</option>
      </select>
    </div>
    <div class="form-group">
      <label>记录值 (IP)</label>
      <input type="text" id="ddnsEditValue" class="form-input" value="${record.ip}" placeholder="IP 地址">
    </div>
    <div class="form-group">
      <label>TTL (秒)</label>
      <input type="number" id="ddnsEditTtl" class="form-input" value="${record.ttl || 600}" min="60" max="86400">
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-primary" id="ddnsEditSave">💾 保存</button>
  `;
  Utils.openModal('编辑 DNS 记录', body, footer);

  document.getElementById('ddnsEditSave').addEventListener('click', async () => {
    const type = document.getElementById('ddnsEditType').value;
    const value = document.getElementById('ddnsEditValue').value.trim();
    const ttl = parseInt(document.getElementById('ddnsEditTtl').value) || 600;

    if (!value) { Utils.notify('IP 地址不能为空', 'error'); return; }

    Utils.closeModal();
    Utils.notify('正在更新...', 'info');
    const res = await Api.put(`/ddns/record/${recordId}`, { type, value, ttl });
    if (res.success) { Utils.notify(res.message, 'success'); loadDdns(); }
    else Utils.notify(res.message || '更新失败', 'error');
  });
};

// 移除记录
window.removeDdnsRecord = (recordId, domain) => {
  const body = `
    <p style="margin-bottom:16px;color:var(--text-secondary)">选择「${domain}」的移除方式：</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-secondary" id="ddnsRemovePanel" style="text-align:left;justify-content:flex-start;padding:12px 16px">
        📋 <strong>仅移除面板跟踪</strong><br>
        <small style="color:var(--text-secondary);margin-top:4px">从面板移除，<strong>不会删除</strong>阿里云 DNS 上的解析记录</small>
      </button>
      <button class="btn btn-danger" id="ddnsRemoveCloud" style="text-align:left;justify-content:flex-start;padding:12px 16px">
        🗑 <strong>同时从阿里云删除</strong><br>
        <small style="color:var(--text-secondary);margin-top:4px">从面板移除 + <strong style="color:var(--danger)">删除</strong>阿里云 DNS 上的解析记录</small>
      </button>
    </div>
  `;
  const footer = `<button class="btn btn-ghost" onclick="Utils.closeModal()">取消</button>`;
  Utils.openModal('移除 DNS 记录', body, footer);

  const doDelete = async (localOnly) => {
    Utils.closeModal();
    Utils.notify(localOnly ? '正在移除面板跟踪...' : '正在删除阿里云记录...', 'info');
    const res = await Api.del(`/ddns/record/${recordId}?localOnly=${localOnly}`);
    if (res.success) { Utils.notify(res.message, 'success'); loadDdns(); }
    else Utils.notify(res.message || '移除失败', 'error');
  };

  document.getElementById('ddnsRemovePanel').addEventListener('click', () => doDelete(true));
  document.getElementById('ddnsRemoveCloud').addEventListener('click', () => doDelete(false));
};

// 全局刷新
window.refreshAllDdns = async () => {
  Utils.notify('正在检测公网 IP 并刷新所有 DDNS 记录...', 'info');
  const res = await Api.post('/ddns/refresh');
  if (res.success) {
    Utils.notify(res.message, 'success');
    loadDdns();
  } else {
    Utils.notify(res.message || '刷新失败', 'error');
  }
};

// IPv6 类型切换时自动获取 /64 前缀
window.onDdnsTypeChange = () => {
  const type = document.getElementById('ddnsAddType')?.value;
  const ipv6PrefixEl = document.getElementById('ddnsIpv6Prefix');
  if (!ipv6PrefixEl) return;
  if (type === 'AAAA') {
    ipv6PrefixEl.style.display = 'block';
    tryLoadIpv6Prefix();
  } else {
    ipv6PrefixEl.style.display = 'none';
  }
};

window.tryLoadIpv6Prefix = async () => {
  const inputEl = document.getElementById('ddnsAddIp');
  const prefixEl = document.getElementById('ddnsIpv6PrefixValue');
  if (!inputEl || !prefixEl) return;
  try {
    const ipDisplay = document.getElementById('ddnsPublicIp');
    const ipv6Text = ipDisplay?.innerText || '';
    const ipv6Match = ipv6Text.match(/IPv6:\s*([a-fA-F0-9:]+)/);
    if (ipv6Match && ipv6Match[1].includes(':')) {
      const parts = ipv6Match[1].split(':');
      const prefix = parts.slice(0, 4).join(':');
      prefixEl.textContent = prefix;
      if (!inputEl.value) inputEl.value = prefix + '::';
      return;
    }
    const res = await Api.get('/ddns/ipv6');
    if (res.success && res.data?.ip) {
      const parts = res.data.ip.split(':');
      const prefix = parts.slice(0, 4).join(':');
      prefixEl.textContent = prefix;
      if (!inputEl.value) inputEl.value = prefix + '::';
    }
  } catch (e) {}
};

// 添加域名
window.showAddDdnsModal = () => {
  const body = `
    <div class="form-group">
      <label>主域名 *</label>
      <input type="text" id="ddnsAddName" class="form-input" placeholder="例如：example.com">
    </div>
    <div class="form-group">
      <label>子域名（@ 表示根域名）</label>
      <input type="text" id="ddnsAddSub" class="form-input" value="@">
    </div>
    <div class="form-group">
      <label>记录类型</label>
      <select id="ddnsAddType" class="form-input" onchange="onDdnsTypeChange()">
        <option value="A">A (IPv4)</option>
        <option value="AAAA">AAAA (IPv6)</option>
      </select>
    </div>
    <div class="form-group">
      <label>TTL (秒)</label>
      <input type="number" id="ddnsAddTtl" class="form-input" value="600" min="60" max="86400">
    </div>
    <div id="ddnsIpv6Prefix" style="display:none;margin-bottom:8px;padding:8px;background:rgba(99,102,241,0.08);border-radius:8px;border:1px solid rgba(99,102,241,0.2);font-size:12px;color:var(--text-secondary)">
      📡 IPv6 /64 前缀: <code id="ddnsIpv6PrefixValue" style="color:var(--primary);font-size:13px">—</code>
    </div>
    <div class="form-group">
      <label>IP 地址 (留空自动获取公网 IP)</label>
      <input type="text" id="ddnsAddIp" class="form-input" placeholder="留空自动获取公网 IP">
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-success" id="ddnsAddConfirm">确认添加</button>
  `;
  Utils.openModal('添加 DDNS 域名', body, footer);

  document.getElementById('ddnsAddConfirm').addEventListener('click', async () => {
    const name = document.getElementById('ddnsAddName').value.trim();
    const subdomain = document.getElementById('ddnsAddSub').value.trim() || '@';
    const recordType = document.getElementById('ddnsAddType').value;
    const ttl = parseInt(document.getElementById('ddnsAddTtl').value) || 600;
    const value = document.getElementById('ddnsAddIp').value.trim() || undefined;

    if (!name) { Utils.notify('请输入主域名', 'error'); return; }

    Utils.closeModal();
    Utils.notify(`正在添加 ${subdomain === '@' ? name : subdomain + '.' + name} (${recordType})...`, 'info');

    const res = await Api.post('/ddns/domains', { name, subdomain, recordType, ttl, value });
    if (res.success) {
      Utils.notify(res.message, 'success');
      loadDdns();
      setTimeout(() => Api.post('/ddns/refresh'), 1500);
    } else {
      Utils.notify(res.message || '添加失败', 'error');
    }
  });
};

// 初始化
(function initDdnsButtons() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDdnsButtons);
    return;
  }
  const refreshBtn = document.getElementById('btnDdnsRefresh');
  const addBtn = document.getElementById('btnDdnsAdd');
  const logBtn = document.getElementById('btnDdnsLog');
  const selectAll = document.getElementById('ddnsSelectAll');

  const toolbar = document.querySelector('#page-ddns .page-toolbar');
  if (toolbar && !document.getElementById('ddnsPublicIp')) {
    const ipSpan = document.createElement('span');
    ipSpan.id = 'ddnsPublicIp';
    ipSpan.style.cssText = 'margin-left:auto;font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;';
    ipSpan.innerHTML = '🌐 检测中...';
    toolbar.appendChild(ipSpan);
  }

  if (selectAll) selectAll.onchange = window.ddnsToggleSelectAll;
  if (refreshBtn) refreshBtn.addEventListener('click', window.refreshAllDdns);
  if (addBtn) addBtn.addEventListener('click', window.showAddDdnsModal);
  if (logBtn) logBtn.addEventListener('click', () => Utils.showOpLog('ddns', 'DDNS'));
})();

// 导出供 app.js 的 _ensurePage 调用
window.loadDdns = loadDdns;
