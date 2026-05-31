// DDNS 页面
let ddnsLoaded = false;

async function loadDdns() {
  const tbody = document.getElementById('ddnsTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">加载中...</td></tr>';

  try {
    const res = await Api.get('/ddns');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${res.message || '加载失败'}<br><small>请先在「系统设置」中配置阿里云密钥，再添加域名</small></td></tr>`;
      return;
    }

    const records = res.data?.records || [];
    const publicIp = res.data?.publicIp || '--';

    // 更新公网 IP 显示
    const ipEl = document.getElementById('ddnsPublicIp');
    if (ipEl) ipEl.innerHTML = `🌐 公网 IP: <strong>${publicIp}</strong>`;

    if (records.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">暂无 DDNS 记录<br><small>公网 IP: <strong>${publicIp}</strong> | 点击「添加域名」开始配置</small></td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      if (r.error) {
        return `<tr><td colspan="6" class="error-row">❌ ${r.domain}: ${r.error}</td></tr>`;
      }
      const needsUpdate = r.needsUpdate;
      return `
        <tr>
          <td><strong>${r.domain}</strong></td>
          <td><span class="type-badge">${r.recordType || 'A'}</span></td>
          <td><code>${r.ip || '--'}</code>${needsUpdate ? ` → <code style="color:var(--warning)">${r.currentPublicIp}</code>` : ''}</td>
          <td>${formatDate(r.updatedAt)}</td>
          <td><span class="status-badge ${r.status === 'ENABLE' ? 'online' : needsUpdate ? 'pending' : 'online'}">${needsUpdate ? '需更新' : r.status === 'ENABLE' ? '生效中' : '已停用'}</span></td>
          <td>
            ${needsUpdate ? `<button class="btn btn-sm btn-warning" onclick="refreshDdnsRecord('${r.id}')">🔄 更新</button>` : '<span class="text-muted">最新</span>'}
            <button class="btn btn-sm btn-danger" onclick="deleteDdns('${encodeURIComponent(r.domain)}', '${r.id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">加载失败: ${err.message}</td></tr>`;
  }
}

// 全局刷新所有 DDNS
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

// 单条刷新（已废弃，走全局刷新）
window.refreshDdnsRecord = async (recordId) => {
  Utils.notify('正在更新...', 'info');
  const res = await Api.post('/ddns/refresh');
  if (res.success) {
    Utils.notify(res.message, 'success');
    loadDdns();
  } else {
    Utils.notify(res.message || '更新失败', 'error');
  }
};

// 删除 DDNS 域名
window.deleteDdns = async (domain, recordId) => {
  Utils.confirm('删除 DDNS 配置', `确定要删除 "${decodeURIComponent(domain)}" 吗？<br><small>仅删除本面板配置，不会删除阿里云上的 DNS 记录</small>`, async () => {
    // 从配置中移除
    const parts = decodeURIComponent(domain).split('.');
    let subdomain = '@', name = decodeURIComponent(domain);
    if (parts.length > 2) {
      name = parts.slice(-2).join('.');
      subdomain = parts.slice(0, -2).join('.');
    }

    const res = await Api.del('/ddns/domains', { name, subdomain });
    if (res.success) { Utils.notify(res.message, 'success'); loadDdns(); }
    else Utils.notify(res.message || '删除失败', 'error');
  });
};

// 添加域名弹窗
window.showAddDdnsModal = () => {
  const body = `
    <div class="form-group">
      <label>主域名 *</label>
      <input type="text" id="ddnsAddName" class="form-input" placeholder="例如：example.com">
    </div>
    <div class="form-group">
      <label>子域名（@ 表示根域名）</label>
      <input type="text" id="ddnsAddSub" class="form-input" placeholder="例如：www 或 @">
    </div>
    <div class="form-group">
      <label>记录类型</label>
      <select id="ddnsAddType" class="form-input">
        <option value="A">A (IPv4)</option>
        <option value="AAAA">AAAA (IPv6)</option>
      </select>
    </div>
    <div class="form-group">
      <label>TTL (秒)</label>
      <input type="number" id="ddnsAddTtl" class="form-input" value="600" min="60" max="86400">
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

    if (!name) { Utils.notify('请输入主域名', 'error'); return; }

    Utils.closeModal();
    Utils.notify(`正在添加 ${subdomain === '@' ? name : subdomain + '.' + name}...`, 'info');

    const res = await Api.post('/ddns/domains', { name, subdomain, recordType, ttl });
    if (res.success) {
      Utils.notify(res.message, 'success');
      loadDdns();
      // 添加后自动刷新一次 DDNS
      setTimeout(() => Api.post('/ddns/refresh'), 1000);
    } else {
      Utils.notify(res.message || '添加失败', 'error');
    }
  });
};

// 按钮事件绑定
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('btnDdnsRefresh');
  const addBtn = document.getElementById('btnDdnsAdd');

  // 在工具栏插入公网 IP 显示
  const toolbar = document.querySelector('#page-ddns .page-toolbar');
  if (toolbar && !document.getElementById('ddnsPublicIp')) {
    const ipSpan = document.createElement('span');
    ipSpan.id = 'ddnsPublicIp';
    ipSpan.style.cssText = 'margin-left:auto;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;';
    ipSpan.innerHTML = '🌐 公网 IP: <strong>检测中...</strong>';
    toolbar.appendChild(ipSpan);
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refreshAllDdns);
  if (addBtn) addBtn.addEventListener('click', showAddDdnsModal);
});