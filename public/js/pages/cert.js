// SSL 证书页面
let sslLoaded = false;

async function loadCert() {
  const tbody = document.getElementById('certTbody');
  const acmeStatusEl = document.getElementById('acmeStatus');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">加载中...</td></tr>';

  try {
    const [certRes, acmeRes] = await Promise.all([
      Api.get('/cert'),
      Api.get('/cert/acme')
    ]);

    // acme.sh 状态
    if (acmeStatusEl) {
      if (acmeRes.success && acmeRes.data?.installed) {
        acmeStatusEl.innerHTML = `✅ acme.sh 已安装 ${acmeRes.data.version ? '(' + acmeRes.data.version + ')' : ''}`;
      } else {
        acmeStatusEl.classList.remove('hidden');
        acmeStatusEl.innerHTML = '⚠️ acme.sh 未安装，SSL 功能不可用';
      }
    }

    const certs = certRes.data?.certificates || [];
    const acmeInstalled = acmeRes.data?.installed !== false;

    if (!acmeInstalled) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">请先安装 acme.sh 才能申请证书<br><small>点击「安装 acme.sh」按钮</small></td></tr>`;
      return;
    }

    if (certs.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无证书<br><small>点击「申请证书」为域名申请 Let\'s Encrypt 免费证书</small></td></tr>';
      return;
    }

    tbody.innerHTML = certs.map(c => {
      const days = c.daysRemaining;
      let daysClass = 'online';
      if (days !== null && days < 0) daysClass = 'offline';
      else if (days !== null && days < 7) daysClass = 'offline';
      else if (days !== null && days < 30) daysClass = 'pending';

      const warningText = c.warning || '';
      const statusText = c.status === 'expired' ? '已过期' : c.status === 'expiring' ? '即将过期' : c.status === 'warning' ? '需关注' : '有效';

      return `
        <tr>
          <td><strong>${c.domain}</strong>${c.sanDomains?.length > 0 ? '<br><small style="color:var(--text-secondary)">SAN: ' + c.sanDomains.join(', ') + '</small>' : ''}</td>
          <td>${c.issuer || 'Let\'s Encrypt'}</td>
          <td>${formatDate(c.expiresAt)}</td>
          <td>
            <span class="status-badge ${daysClass}">${days !== null ? days + ' 天' : '--'}</span>
            ${warningText ? `<br><small style="color:var(--${days < 0 ? 'danger' : 'warning'})">${warningText}</small>` : ''}
          </td>
          <td><span class="status-badge ${c.status === 'valid' ? 'online' : c.status === 'expired' ? 'offline' : 'pending'}">${statusText}</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="renewCert('${c.domain}')">续期</button>
            <button class="btn btn-sm btn-secondary" onclick="exportCert('${c.domain}')">导出</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCertFiles('${c.domain}')">🗑 删除文件</button>
            <button class="btn btn-sm btn-warning" onclick="deleteCertConfig('${c.domain}')">移除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">加载失败: ${err.message}</td></tr>`;
  }
}

// 申请证书弹窗
window.showIssueCertModal = () => {
  const body = `
    <div class="form-group">
      <label>域名 *</label>
      <input type="text" id="certIssueDomain" class="form-input" placeholder="例如：example.com 或 *.example.com">
      <small style="color:var(--text-secondary)">支持通配符证书：输入 *.example.com 或勾选下方选项</small>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="certWildcard"> 申请通配符证书 (*.domain.com)
      </label>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="certForce"> 强制重新申请 (--force)
        <small style="color:var(--warning)">如果证书已存在且未到期，默认会跳过</small>
      </label>
    </div>
    <div class="info-box" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:12px;font-size:12px;color:var(--text-secondary);margin-top:12px;">
      ℹ️ 使用阿里云 DNS (alidns) 自动验证，请确保已在「系统设置」中配置阿里云 AccessKey
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-success" id="certIssueConfirm">申请证书</button>
  `;
  Utils.openModal('申请 Let\'s Encrypt 证书', body, footer);

  document.getElementById('certIssueConfirm').addEventListener('click', async () => {
    let domain = document.getElementById('certIssueDomain').value.trim();
    const wildcard = document.getElementById('certWildcard').checked;
    const force = document.getElementById('certForce').checked;

    if (!domain) { Utils.notify('请输入域名', 'error'); return; }

    // 前端规范化：去除 *. 前缀（后端统一加回）
    if (domain.startsWith('*.')) {
      domain = domain.replace(/^\*+\./g, '');
      document.getElementById('certWildcard').checked = true;
    }

    if (domain.includes('*')) {
      Utils.notify('域名格式无效：通配符仅支持 *.example.com（单级）', 'error');
      return;
    }

    if (!/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) {
      Utils.notify('请输入有效的域名格式，如 example.com', 'error');
      return;
    }

    Utils.closeModal();
    const displayName = wildcard ? `*.${domain}` : domain;
    startCertIssueProgress(domain, wildcard, displayName, force);
  });
};

// SSE 证书申请进度浮窗
window.startCertIssueProgress = (domain, wildcard, displayName, force) => {
  const body = `
    <div id="certIssueProgress">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span id="certIssueStatus">⏳ 正在为 ${displayName} 申请证书...</span>
        <div class="spinner" style="width:16px;height:16px;border:2px solid var(--text-secondary);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      </div>
      <pre id="certIssueLog" style="max-height:300px;overflow-y:auto;background:var(--bg-tertiary);color:#e0e0e0;padding:12px;border-radius:8px;font-size:12px;font-family:Menlo,monospace;white-space:pre-wrap;word-break:break-all;margin:0"></pre>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>
  `;
  Utils.openModal(`📜 申请证书: ${displayName}`, body, footer);

  const statusSpan = document.getElementById('certIssueStatus');
  const logDiv = document.getElementById('certIssueLog');
  if (!statusSpan || !logDiv) return;

  const token = localStorage.getItem('hsp_token');
  const es = new EventSource(`/api/cert/issue/stream?domain=${encodeURIComponent(domain)}&wildcard=${wildcard}&force=${force ? 'true' : 'false'}&token=${encodeURIComponent(token)}`);
  let killed = false;

  es.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'start':
          statusSpan.textContent = '⏳ ' + msg.message;
          break;
        case 'step':
          statusSpan.textContent = msg.text;
          logDiv.textContent += msg.text + '\n';
          logDiv.scrollTop = logDiv.scrollHeight;
          break;
        case 'output':
          logDiv.textContent += msg.text + '\n';
          logDiv.scrollTop = logDiv.scrollHeight;
          break;
        case 'done':
          if (msg.alreadyExists) {
            statusSpan.textContent = 'ℹ️ ' + msg.message;
            statusSpan.style.color = 'var(--primary)';
          } else {
            statusSpan.textContent = '✅ ' + msg.message;
            statusSpan.style.color = 'var(--success)';
          }
          statusSpan.parentElement.querySelector('.spinner').style.display = 'none';
          es.close();
          setTimeout(() => { Utils.closeModal(); loadCert(); }, 2000);
          break;
        case 'error':
          statusSpan.textContent = '❌ ' + msg.message;
          statusSpan.style.color = 'var(--danger)';
          statusSpan.parentElement.querySelector('.spinner').style.display = 'none';
          es.close();
          break;
      }
    } catch (parseErr) {
      logDiv.textContent += '[解析错误] ' + e.data + '\n';
    }
  });

  es.onerror = () => {
    if (!killed) { statusSpan.textContent = '❌ 连接中断'; statusSpan.style.color = 'var(--danger)'; }
    es.close();
  };

  const closeBtn = document.querySelector('#hsp-modal .btn-secondary');
  if (closeBtn) closeBtn.addEventListener('click', () => { killed = true; es.close(); }, { once: true });
};

// 安装 acme.sh（SSE 实时进度）
window.installAcme = async () => {
  const email = localStorage.getItem('acmeEmail') || 'admin@izifeng.com';

  const body = `
    <div class="form-group">
      <label>联系邮箱</label>
      <input type="email" id="acmeInstallEmail" class="form-input" value="${email}" placeholder="admin@example.com">
    </div>
    <div id="acmeInstallProgress" style="display:none;margin-top:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span id="acmeInstallStatus" style="font-weight:600">⏳ 安装中...</span>
        <div class="spinner" style="width:16px;height:16px;border:2px solid var(--text-secondary);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      </div>
      <pre id="acmeInstallLog" style="max-height:300px;overflow-y:auto;background:var(--bg-tertiary);color:#e0e0e0;padding:12px;border-radius:8px;font-size:12px;font-family:Menlo,monospace;white-space:pre-wrap;word-break:break-all;margin:0"></pre>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
    <button class="btn btn-success" id="acmeInstallConfirm">开始安装</button>
  `;
  Utils.openModal('🔧 安装 acme.sh', body, footer);

  document.getElementById('acmeInstallConfirm').addEventListener('click', async () => {
    const emailInput = document.getElementById('acmeInstallEmail');
    if (!emailInput?.value.trim()) { Utils.notify('请输入邮箱', 'error'); return; }
    localStorage.setItem('acmeEmail', emailInput.value.trim());
    startAcmeInstall(emailInput.value.trim());
  });
};

window.startAcmeInstall = async (email) => {
  const progressDiv = document.getElementById('acmeInstallProgress');
  const logDiv = document.getElementById('acmeInstallLog');
  const statusSpan = document.getElementById('acmeInstallStatus');
  if (!progressDiv || !logDiv) return;

  progressDiv.style.display = 'block';
  statusSpan.textContent = '⏳ 正在连接...';
  progressDiv.parentElement.querySelectorAll('button').forEach(b => { if (b.id !== 'acmeInstallConfirm' && !b.classList.contains('btn-secondary')) b.disabled = true; });
  document.getElementById('acmeInstallConfirm').disabled = true;

  try {
    const token = localStorage.getItem('hsp_token');
    const eventSource = new EventSource(`/api/cert/acme/install/stream?email=${encodeURIComponent(email)}&token=${token}`);
    let killed = false;

    eventSource.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'start':
            statusSpan.textContent = '🔧 ' + msg.message;
            break;
          case 'step':
            statusSpan.textContent = msg.text;
            logDiv.textContent += msg.text + '\n';
            logDiv.scrollTop = logDiv.scrollHeight;
            break;
          case 'output':
            logDiv.textContent += msg.text + '\n';
            logDiv.scrollTop = logDiv.scrollHeight;
            break;
          case 'done':
            statusSpan.textContent = '✅ ' + msg.message;
            statusSpan.style.color = 'var(--success)';
            eventSource.close();
            setTimeout(() => { Utils.closeModal(); loadCert(); }, 1500);
            break;
          case 'error':
            statusSpan.textContent = '❌ ' + msg.message;
            statusSpan.style.color = 'var(--danger)';
            eventSource.close();
            document.getElementById('acmeInstallConfirm').disabled = false;
            break;
        }
      } catch (parseErr) {
        logDiv.textContent += '[解析错误] ' + e.data + '\n';
      }
    });

    eventSource.onerror = () => {
      if (!killed) { statusSpan.textContent = '❌ 连接中断'; statusSpan.style.color = 'var(--danger)'; }
      eventSource.close();
    };

    const closeBtn = document.querySelector('#hsp-modal .btn-secondary');
    if (closeBtn) closeBtn.addEventListener('click', () => { killed = true; eventSource.close(); }, { once: true });
  } catch (err) {
    statusSpan.textContent = '❌ ' + err.message;
    statusSpan.style.color = 'var(--danger)';
  }
};

// 卸载 acme.sh
window.uninstallAcme = async () => {
  Utils.confirm('卸载 acme.sh', `确定要卸载 acme.sh 吗？<br><small>此操作会删除 ~/.acme.sh 目录及所有已签发的证书</small>`, async () => {
    Utils.notify('正在卸载 acme.sh...', 'info');
    try {
      const res = await Api.post('/cert/acme/uninstall');
      if (res.success) {
        Utils.notify('✅ ' + res.message, 'success');
        loadCert();
      } else {
        Utils.notify(res.message || '卸载失败', 'error');
      }
    } catch (err) {
      Utils.notify('卸载失败: ' + err.message, 'error');
    }
  });
};

// 导出证书
window.exportCert = (domain) => {
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <button class="btn btn-primary" onclick="doExportCert('${domain}','fullchain')">📜 完整证书链<br><small>fullchain.cer</small></button>
      <button class="btn btn-primary" onclick="doExportCert('${domain}','cert')">📄 域名证书<br><small>${domain}.cer</small></button>
      <button class="btn btn-warning" onclick="doExportCert('${domain}','key')">🔑 私钥<br><small>${domain}.key</small></button>
      <button class="btn btn-secondary" onclick="doExportCert('${domain}','ca')">🏛 CA证书<br><small>ca.cer</small></button>
    </div>
    <button class="btn btn-success" style="width:100%;margin-top:12px" onclick="doExportCert('${domain}','all')">📦 打包下载全部</button>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>`;
  Utils.openModal('📥 导出证书: ' + domain, body, footer);
};

window.doExportCert = (domain, format) => {
  const token = localStorage.getItem('hsp_token');
  const url = `/api/cert/export/${encodeURIComponent(domain)}?format=${format}&token=${encodeURIComponent(token)}`;
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  Utils.notify('开始下载...', 'info');
};
window.renewCert = async (domain) => {
  Utils.notify(`正在为 ${domain} 续期证书...`, 'info');
  const res = await Api.post('/cert/renew', { domain });
  if (res.success) {
    Utils.notify('✅ ' + res.message, 'success');
    loadCert();
  } else if (res.data?.skipped) {
    // 证书未到期，跳过续期
    Utils.notify('ℹ️ ' + (res.message || '证书未到期，无需续期'), 'info');
  } else {
    Utils.notify(res.message || '续期失败', 'error');
  }
};

// 删除证书配置（从本面板移除）
window.deleteCertConfig = async (domain) => {
  Utils.confirm('移除证书', `确定从面板移除「${domain}」吗？<br><small style="color:var(--warning)">仅从面板移除，证书文件保留</small>`, async () => {
    const res = await Api.del(`/cert/domains/${encodeURIComponent(domain)}`);
    if (res.success) { Utils.notify(res.message, 'success'); loadCert(); }
    else Utils.notify(res.message || '移除失败', 'error');
  });
};

// Task 13: 彻底删除证书（含文件）
window.deleteCertFiles = (domain) => {
  Utils.confirm('⚠️ 删除证书文件', 
    `<div style="text-align:left"><strong style="color:var(--danger)">此操作不可撤销！</strong><br><br>` +
    `将彻底删除「${domain}」的证书文件，包括：<br>` +
    `• 证书文件 (.cer/.pem)<br>` +
    `• 私钥文件 (.key)<br>` +
    `• CA 证书<br><br>` +
    `删除后需重新申请证书。</div>`,
    async () => {
      Utils.notify('正在删除证书文件...', 'info');
      const res = await Api.del(`/cert/domains/${encodeURIComponent(domain)}?deleteFiles=true`);
      if (res.success) { Utils.notify('✅ ' + res.message, 'success'); loadCert(); }
      else Utils.notify(res.message || '删除失败', 'error');
    }, '确认删除', '取消'
  );
};

// 页面加载
(function initCertButtons() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCertButtons);
    return;
  }
  const applyBtn = document.getElementById('btnCertApply');
  const logBtn = document.getElementById('btnCertLog');
  const acmeStatusEl = document.getElementById('acmeStatus');

  // 在工具栏插入 acme.sh 状态提示
  const toolbar = document.querySelector('#page-ssl .page-toolbar');
  if (toolbar && !document.getElementById('acmeStatus')) {
    const statusSpan = document.createElement('span');
    statusSpan.id = 'acmeStatus';
    statusSpan.className = 'hidden';
    statusSpan.style.cssText = 'margin-left:auto;font-size:13px;';
    toolbar.appendChild(statusSpan);
  }

  if (applyBtn) applyBtn.addEventListener('click', window.showIssueCertModal);
  if (logBtn) logBtn.addEventListener('click', () => Utils.showOpLog('ssl', 'SSL 证书'));

  // 在工具栏插入「安装/卸载 acme.sh」按钮
  if (toolbar) {
    const installBtn = document.createElement('button');
    installBtn.className = 'btn btn-success';
    installBtn.id = 'btnInstallAcme';
    installBtn.textContent = '🔧 安装 acme.sh';
    installBtn.style.marginLeft = '8px';
    installBtn.style.display = 'none';
    installBtn.addEventListener('click', window.installAcme);
    toolbar.appendChild(installBtn);

    const uninstallBtn = document.createElement('button');
    uninstallBtn.className = 'btn btn-danger';
    uninstallBtn.id = 'btnUninstallAcme';
    uninstallBtn.textContent = '🗑 卸载 acme.sh';
    uninstallBtn.style.marginLeft = '8px';
    uninstallBtn.style.display = 'none';
    uninstallBtn.addEventListener('click', window.uninstallAcme);
    toolbar.appendChild(uninstallBtn);
  }
})();

// 加载时检查 acme 状态并控制按钮显示
const _origLoadCert = loadCert;
window.loadCert = async function() {
  await _origLoadCert();
  try {
    const acmeRes = await Api.get('/cert/acme');
    const installBtn = document.getElementById('btnInstallAcme');
    const uninstallBtn = document.getElementById('btnUninstallAcme');
    if (installBtn) installBtn.style.display = (acmeRes.data && acmeRes.data.installed) ? 'none' : 'inline-flex';
    if (uninstallBtn) uninstallBtn.style.display = (acmeRes.data && acmeRes.data.installed) ? 'inline-flex' : 'none';
  } catch {}
};