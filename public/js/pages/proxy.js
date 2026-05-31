// 反向代理页面 - 群晖风格 Reverse Proxy
let proxyLoaded = false;

const PROTOCOL_OPTIONS = ['http', 'https'];

async function loadProxy() {
  const tbody = document.getElementById('proxyTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">加载中...</td></tr>';

  try {
    const res = await Api.get('/proxy');
    if (!res.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${res.message || '加载失败'}</td></tr>`;
      return;
    }

    const rules = res.data?.rules || [];
    const stats = res.data?.stats || {};

    // 更新统计
    updateProxyStats(stats);

    if (rules.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无代理规则<br><small>点击「添加规则」创建第一条反向代理</small></td></tr>';
      return;
    }

    tbody.innerHTML = rules.map(r => {
      const source = `${r.sourceProtocol}://${r.sourceHost}:${r.sourcePort}`;
      const target = `${r.targetProtocol}://${r.targetHost}:${r.targetPort}`;
      return `
        <tr style="${r.enabled ? '' : 'opacity:0.5'}">
          <td><strong>${r.name}</strong></td>
          <td>
            <code>${source}</code>
            ${r.ssl ? '<span class="status-badge online" style="font-size:10px;margin-left:4px;">SSL</span>' : ''}
            ${r.websocket ? '<span class="status-badge online" style="font-size:10px;margin-left:4px;">WS</span>' : ''}
          </td>
          <td><code>→ ${target}</code></td>
          <td>
            <span class="status-badge ${r.enabled ? 'online' : 'offline'}">${r.enabled ? '启用' : '停用'}</span>
          </td>
          <td><small>${formatDate(r.updatedAt || r.createdAt)}</small></td>
          <td>
            <button class="btn btn-sm" onclick="toggleProxy('${r.id}')">${r.enabled ? '⏸ 停用' : '▶ 启用'}</button>
            <button class="btn btn-sm btn-primary" onclick="editProxy('${r.id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProxy('${r.id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">加载失败: ${err.message}</td></tr>`;
  }
}

function updateProxyStats(stats) {
  const el = document.getElementById('proxyStats');
  if (!el) return;
  el.innerHTML = `
    <span style="margin-right:16px;">📋 总计: <strong>${stats.total || 0}</strong></span>
    <span style="margin-right:16px;color:var(--success);">✅ 启用: <strong>${stats.enabled || 0}</strong></span>
    <span style="margin-right:16px;color:var(--text-secondary);">⏸ 停用: <strong>${stats.disabled || 0}</strong></span>
    <span style="color:var(--text-secondary);">🔒 HTTPS: <strong>${stats.https || 0}</strong></span>
  `;
}

// ========== 表单弹窗 ==========

function buildProxyForm(rule) {
  const isEdit = !!rule;
  const defaults = {
    name: '', description: '',
    sourceProtocol: 'http', sourceHost: '', sourcePort: 80,
    targetProtocol: 'http', targetHost: '', targetPort: 80,
    ssl: false, websocket: false,
    ...rule
  };

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group" style="grid-column:1/-1;">
        <label>规则名称</label>
        <input type="text" id="proxyName" class="form-input" value="${defaults.name}" placeholder="例如：Jellyfin 媒体服务器">
      </div>

      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">📥 来源（外部访问）</div>

      <div class="form-group">
        <label>协议</label>
        <select id="proxySrcProto" class="form-input">${PROTOCOL_OPTIONS.map(p => `<option value="${p}" ${defaults.sourceProtocol === p ? 'selected' : ''}>${p.toUpperCase()}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>域名/IP</label>
        <input type="text" id="proxySrcHost" class="form-input" value="${defaults.sourceHost}" placeholder="例如：jellyfin.example.com">
      </div>
      <div class="form-group">
        <label>端口</label>
        <input type="number" id="proxySrcPort" class="form-input" value="${defaults.sourcePort}" min="1" max="65535">
      </div>

      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">📤 目标（内网服务）</div>

      <div class="form-group">
        <label>协议</label>
        <select id="proxyTgtProto" class="form-input">${PROTOCOL_OPTIONS.map(p => `<option value="${p}" ${defaults.targetProtocol === p ? 'selected' : ''}>${p.toUpperCase()}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>主机/IP</label>
        <input type="text" id="proxyTgtHost" class="form-input" value="${defaults.targetHost}" placeholder="例如：192.168.1.100">
      </div>
      <div class="form-group">
        <label>端口</label>
        <input type="number" id="proxyTgtPort" class="form-input" value="${defaults.targetPort}" min="1" max="65535">
      </div>

      <div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--text-secondary);margin-top:8px;">⚙️ 高级选项</div>

      <div class="form-group" style="grid-column:1/-1;display:flex;gap:16px;">
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="proxySsl" ${defaults.ssl ? 'checked' : ''}> 🔒 启用 SSL
        </label>
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="proxyWs" ${defaults.websocket ? 'checked' : ''}> 🔌 WebSocket 支持
        </label>
      </div>

      ${defaults.ssl ? `
      <div class="form-group">
        <label>SSL 证书路径</label>
        <input type="text" id="proxySslCert" class="form-input" value="${defaults.sslCert || ''}" placeholder="/etc/nginx/ssl/domain.pem">
      </div>
      <div class="form-group">
        <label>SSL 私钥路径</label>
        <input type="text" id="proxySslKey" class="form-input" value="${defaults.sslKey || ''}" placeholder="/etc/nginx/ssl/domain.key">
      </div>
      ` : ''}
    </div>
  `;
}

// 添加规则
window.showAddProxyModal = () => {
  const body = buildProxyForm(null);
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-success" id="proxySaveBtn">💾 保存规则</button>
  `;
  Utils.openModal('添加反向代理规则', body, footer);

  document.getElementById('proxySrcProto').addEventListener('change', toggleSslFields);
  document.getElementById('proxySaveBtn').addEventListener('click', () => saveProxy());
};

// 编辑规则
window.editProxy = (id) => {
  const res = Api.get('/proxy').then(data => {
    const rules = data.data?.rules || [];
    const rule = rules.find(r => r.id === id);
    if (!rule) { Utils.notify('规则不存在', 'error'); return; }

    const body = buildProxyForm(rule);
    const footer = `
      <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
      <button class="btn btn-primary" id="proxySaveBtn">💾 更新规则</button>
    `;
    Utils.openModal('编辑反向代理规则', body, footer);

    document.getElementById('proxySrcProto').addEventListener('change', toggleSslFields);
    document.getElementById('proxySaveBtn').addEventListener('click', () => saveProxy(id));
  });
};

function toggleSslFields() {
  const proto = document.getElementById('proxySrcProto')?.value;
  const certEl = document.getElementById('proxySslCert');
  const keyEl = document.getElementById('proxySslKey');
  if (proto === 'https') {
    document.getElementById('proxySsl').checked = true;
    if (certEl) certEl.style.display = '';
    if (keyEl) keyEl.style.display = '';
  }
}

async function saveProxy(id) {
  const data = {
    name: document.getElementById('proxyName').value.trim(),
    sourceProtocol: document.getElementById('proxySrcProto').value,
    sourceHost: document.getElementById('proxySrcHost').value.trim(),
    sourcePort: parseInt(document.getElementById('proxySrcPort').value) || 80,
    targetProtocol: document.getElementById('proxyTgtProto').value,
    targetHost: document.getElementById('proxyTgtHost').value.trim(),
    targetPort: parseInt(document.getElementById('proxyTgtPort').value) || 80,
    ssl: document.getElementById('proxySsl').checked,
    sslCert: document.getElementById('proxySslCert')?.value || null,
    sslKey: document.getElementById('proxySslKey')?.value || null,
    websocket: document.getElementById('proxyWs').checked
  };

  if (!data.sourceHost || !data.targetHost) {
    Utils.notify('来源域名和目标主机不能为空', 'error');
    return;
  }

  Utils.closeModal();

  const res = id
    ? await Api.put(`/proxy/${id}`, data)
    : await Api.post('/proxy', data);

  if (res.success) {
    Utils.notify(res.message, 'success');
    loadProxy();
  } else {
    Utils.notify(res.message || '操作失败', 'error');
  }
}

// 启用/停用
window.toggleProxy = async (id) => {
  const res = await Api.post(`/proxy/${id}/toggle`);
  if (res.success) { Utils.notify(res.message, 'success'); loadProxy(); }
  else Utils.notify(res.message || '操作失败', 'error');
};

// 删除
window.deleteProxy = async (id) => {
  Utils.confirm('删除代理规则', '确定要删除这条代理规则吗？', async () => {
    const res = await Api.del(`/proxy/${id}`);
    if (res.success) { Utils.notify(res.message, 'success'); loadProxy(); }
    else Utils.notify(res.message || '删除失败', 'error');
  });
};

// 预出 Nginx 配置
window.previewProxyConfig = async () => {
  const res = await Api.get('/proxy/config/preview');
  if (res.success && res.data?.config) {
    const config = res.data.config || '(无规则)';
    Utils.openModal('Nginx 配置预览',
      `<pre style="max-height:500px;overflow:auto;background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;font-family:monospace;">${config}</pre>`,
      '<button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button><button class="btn btn-primary" onclick="exportProxyConfig()">💾 导出到文件</button>'
    );
  } else {
    Utils.notify('暂无启用的代理规则', 'info');
  }
};

// 导出配置
window.exportProxyConfig = async () => {
  const path = prompt('导出文件路径:', '/tmp/proxy-nginx.conf');
  if (!path) return;
  const res = await Api.post('/proxy/config/export', { filePath: path });
  if (res.success) { Utils.notify(res.message, 'success'); Utils.closeModal(); }
  else Utils.notify(res.message || '导出失败', 'error');
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('btnProxyAdd');
  const previewBtn = document.getElementById('btnProxyPreview');
  const exportBtn = document.getElementById('btnProxyExport');

  if (addBtn) addBtn.addEventListener('click', showAddProxyModal);

  // 工具栏插入统计和操作按钮
  const toolbar = document.querySelector('#page-proxy .page-toolbar');
  if (toolbar) {
    // 统计区
    if (!document.getElementById('proxyStats')) {
      const stats = document.createElement('span');
      stats.id = 'proxyStats';
      stats.style.cssText = 'margin-left:16px;font-size:12px;color:var(--text-secondary);';
      toolbar.appendChild(stats);
    }
    // 预览按钮
    if (!document.getElementById('btnProxyPreview')) {
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn btn-secondary';
      previewBtn.id = 'btnProxyPreview';
      previewBtn.textContent = '📄 预览配置';
      previewBtn.style.marginLeft = '8px';
      previewBtn.addEventListener('click', previewProxyConfig);
      toolbar.appendChild(previewBtn);
    }
    // 导出按钮
    if (!document.getElementById('btnProxyExport')) {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn-secondary';
      exportBtn.id = 'btnProxyExport';
      exportBtn.textContent = '💾 导出配置';
      exportBtn.style.marginLeft = '8px';
      exportBtn.addEventListener('click', exportProxyConfig);
      toolbar.appendChild(exportBtn);
    }
  }
});