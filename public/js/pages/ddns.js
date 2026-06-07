// DDNS 页面 - 支持 IPv4 + IPv6
let ddnsLoaded = false;

async function loadDdns() {
  const tbody = document.getElementById('ddnsTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="8">加载中...</td></tr>';

  try {
    const res = await Api.get('/ddns');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${res.message || '加载失败'}<br><small>请先在「系统设置」中配置阿里云密钥，再添加域名</small></td></tr>`;
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
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">暂无 DDNS 记录<br><small>点击「添加域名」开始配置</small></td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      if (r.error) {
        return `<tr><td colspan="8" class="error-row">❌ ${r.domain}: ${r.error}</td></tr>`;
      }

      const needsUpdate = r.needsUpdate;
      const typeClass = r.recordType === 'AAAA' ? 'type-badge-ipv6' : 'type-badge';
      const enabled = r.enabled !== false;

      return `
        <tr style="${enabled ? '' : 'opacity:0.5'}">
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
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">加载失败: ${err.message}</td></tr>`;
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
        if (cells.length >= 3) {
          const domain = cells[0].textContent.trim();
          const type = cells[1].textContent.trim();
          const ip = cells[2].querySelector('code')?.textContent.trim() || '';
          const ttlEl = row.querySelector('[data-ttl]');
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

// 移除记录（仅从面板移除，不删除阿里云 DNS 记录）
window.removeDdnsRecord = (recordId, domain) => {
  Utils.confirm('移除记录', `确定从面板中移除「${domain}」的跟踪吗？<br><small style="color:var(--warning)">仅从面板移除，<strong>不会删除</strong>阿里云 DNS 上的解析记录</small>`, async () => {
    const res = await Api.del(`/ddns/record/${recordId}?localOnly=true`);
    if (res.success) { Utils.notify(res.message, 'success'); loadDdns(); }
    else Utils.notify(res.message || '移除失败', 'error');
  });
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
    // 尝试从当前公网 IPv6 获取 /64 前缀
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
    // 先尝试从已缓存的公网 IPv6 获取
    const ipDisplay = document.getElementById('ddnsPublicIp');
    const ipv6Text = ipDisplay?.innerText || '';
    const ipv6Match = ipv6Text.match(/IPv6:\s*([a-fA-F0-9:]+)/);
    if (ipv6Match && ipv6Match[1].includes(':')) {
      const parts = ipv6Match[1].split(':');
      const prefix = parts.slice(0, 4).join(':');  // /64 = first 4 groups
      prefixEl.textContent = prefix;
      if (!inputEl.value) inputEl.value = prefix + '::';
      return;
    }
    // 如果没有缓存，从服务器获取
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
      // 添加后自动刷新
      setTimeout(() => Api.post('/ddns/refresh'), 1500);
    } else {
      Utils.notify(res.message || '添加失败', 'error');
    }
  });
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('btnDdnsRefresh');
  const addBtn = document.getElementById('btnDdnsAdd');
  const logBtn = document.getElementById('btnDdnsLog');

  // 在工具栏右侧插入 IP 显示
  const toolbar = document.querySelector('#page-ddns .page-toolbar');
  if (toolbar && !document.getElementById('ddnsPublicIp')) {
    const ipSpan = document.createElement('span');
    ipSpan.id = 'ddnsPublicIp';
    ipSpan.style.cssText = 'margin-left:auto;font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;';
    ipSpan.innerHTML = '🌐 检测中...';
    toolbar.appendChild(ipSpan);
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refreshAllDdns);
  if (addBtn) addBtn.addEventListener('click', showAddDdnsModal);
  if (logBtn) logBtn.addEventListener('click', () => Utils.showOpLog('ddns', 'DDNS'));
});
