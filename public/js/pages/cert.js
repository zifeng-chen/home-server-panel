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
            <button class="btn btn-sm btn-danger" onclick="deleteCertConfig('${c.domain}')">移除</button>
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
      <input type="text" id="certIssueDomain" class="form-input" placeholder="例如：example.com">
      <small style="color:var(--text-secondary)">支持通配符证书：输入 *.example.com 或勾选下方选项</small>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="certWildcard"> 申请通配符证书 (*.domain.com)
      </label>
    </div>
    <div class="form-group">
      <label>联系邮箱（留空则用系统配置）</label>
      <input type="email" id="certIssueEmail" class="form-input" placeholder="admin@example.com" value="${localStorage.getItem('acmeEmail') || ''}">
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
    const domain = document.getElementById('certIssueDomain').value.trim();
    const wildcard = document.getElementById('certWildcard').checked;
    const email = document.getElementById('certIssueEmail').value.trim();

    if (!domain) { Utils.notify('请输入域名', 'error'); return; }
    if (email) localStorage.setItem('acmeEmail', email);

    Utils.closeModal();
    Utils.notify(`正在为 ${domain} 申请证书，请稍候（DNS 验证约需 10-60 秒）...`, 'info');

    try {
      const res = await Api.post('/cert/issue', { domain, wildcard });
      if (res.success) {
        Utils.notify(`✅ ${res.message}`, 'success');
        loadCert();
      } else {
        Utils.notify(res.message || '申请失败', 'error');
      }
    } catch (err) {
      Utils.notify('申请失败: ' + err.message, 'error');
    }
  });
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

// 续期证书
window.renewCert = async (domain) => {
  Utils.notify(`正在为 ${domain} 续期证书...`, 'info');
  const res = await Api.post('/cert/renew', { domain });
  if (res.success) {
    Utils.notify('✅ ' + res.message, 'success');
    loadCert();
  } else {
    Utils.notify(res.message || '续期失败', 'error');
  }
};

// 删除证书配置（从本面板移除，不删除 acme.sh 中的证书）
window.deleteCertConfig = async (domain) => {
  Utils.confirm('移除证书配置', `确定从面板中移除 "${domain}" 的证书跟踪吗？<br><small>不会删除 acme.sh 中的实际证书文件</small>`, async () => {
    const res = await Api.del(`/cert/domains/${encodeURIComponent(domain)}`);
    if (res.success) { Utils.notify(res.message, 'success'); loadCert(); }
    else Utils.notify(res.message || '移除失败', 'error');
  });
};

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
  const applyBtn = document.getElementById('btnCertApply');
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

  if (applyBtn) applyBtn.addEventListener('click', showIssueCertModal);

  // 在工具栏插入「安装/卸载 acme.sh」按钮
  if (toolbar) {
    const installBtn = document.createElement('button');
    installBtn.className = 'btn btn-success';
    installBtn.id = 'btnInstallAcme';
    installBtn.textContent = '🔧 安装 acme.sh';
    installBtn.style.marginLeft = '8px';
    installBtn.style.display = 'none';
    installBtn.addEventListener('click', installAcme);
    toolbar.appendChild(installBtn);

    const uninstallBtn = document.createElement('button');
    uninstallBtn.className = 'btn btn-danger';
    uninstallBtn.id = 'btnUninstallAcme';
    uninstallBtn.textContent = '🗑 卸载 acme.sh';
    uninstallBtn.style.marginLeft = '8px';
    uninstallBtn.style.display = 'none';
    uninstallBtn.addEventListener('click', uninstallAcme);
    toolbar.appendChild(uninstallBtn);
  }
});

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