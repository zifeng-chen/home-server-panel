// 工具函数
const Utils = (window.Utils = {
  notify(message, type = 'info') {
    const bar = document.getElementById('notifyBar');
    if (!bar) return;
    bar.className = `notify-bar ${type}`;
    bar.textContent = message;
    bar.classList.remove('hidden');
    bar.classList.add('show');
    setTimeout(() => {
      bar.classList.remove('show');
      setTimeout(() => bar.classList.add('hidden'), 400);
    }, App.NOTIFY_DURATION);
  },

  openModal(title, body, footer) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const footerEl = document.getElementById('modalFooter');
    if (overlay && titleEl && bodyEl) {
      titleEl.textContent = title;
      bodyEl.innerHTML = body || '';
      footerEl.innerHTML = footer || '';
      overlay.classList.remove('hidden');
    }
  },

  closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
  },

  confirm(title, message, onConfirm) {
    const footer = `<button class="btn btn-secondary" onclick="Utils.closeModal()">取消</button>
      <button class="btn btn-danger" id="modalConfirmBtn">确认</button>`;
    Utils.openModal(title, `<p>${message}</p>`, footer);
    document.getElementById('modalConfirmBtn')?.addEventListener('click', () => {
      Utils.closeModal();
      if (onConfirm) onConfirm();
    });
  },

  // 错误弹窗 - 支持一键复制
  showError(title, message, details) {
    const detailStr = details ? `\n\n--- 详情 ---\n${details}` : '';
    const displayMsg = (message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const displayDetails = (details || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fullText = message + detailStr;

    const body = `
      <div style="margin-bottom:12px;padding:12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;max-height:360px;overflow-y:auto;font-size:13px;line-height:1.6;color:var(--text-primary);white-space:pre-wrap;word-break:break-all">${displayMsg}${details ? '\n\n<span style="color:var(--text-secondary);font-size:12px">---</span>\n<span style="color:var(--text-secondary);font-size:12px">' + displayDetails + '</span>' : ''}</div>
    `;
    const footer = `
      <button class="btn btn-secondary btn-sm" onclick="Utils.copyErrorText()">📋 一键复制</button>
      <button class="btn btn-secondary" onclick="Utils.closeModal()">关闭</button>
    `;
    this._lastErrorText = fullText;
    Utils.openModal('❌ ' + (title || '错误'), body, footer);
  },

  copyErrorText() {
    const text = this._lastErrorText || '';
    if (!text) { this.notify('没有可复制的内容', 'warn'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => this.notify('✅ 已复制错误信息', 'success'))
        .catch(() => this.notify('复制失败，请手动选择', 'error'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); this.notify('✅ 错误信息已复制', 'success');
    }
  },

  // 显示操作日志弹窗（从后端 /api/log 查询）
  async showOpLog(module, title) {
    const body = `
      <div id="opLogLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ 加载中...</div>
      <pre id="opLogContent" style="display:none;max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
      <div id="opLogSummary" style="display:none;margin-top:8px;font-size:11px;color:var(--text-secondary);"></div>
    `;
    const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyOpLog()">📋 一键复制</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>`;
    Utils.openModal('📋 操作日志 - ' + (title || module), body, footer);

    try {
      const api = window.Api;
      const res = await (api ? api.get('/log?module=' + encodeURIComponent(module || 'all') + '&limit=200') : fetch('/api/log?module=' + encodeURIComponent(module || 'all') + '&limit=200').then(r => r.json()));
      const loaderEl = document.getElementById('opLogLoader');
      const contentEl = document.getElementById('opLogContent');
      const summaryEl = document.getElementById('opLogSummary');

      if (contentEl && loaderEl) {
        loaderEl.style.display = 'none';
        contentEl.style.display = 'block';

        if (res.success && res.data && res.data.list) {
          const list = res.data.list;
          if (list.length === 0) {
            contentEl.innerHTML = '<span style="color:var(--text-secondary);">暂无操作日志</span>';
            window._hspOpLogText = '';
          } else {
            const levelIcon = { success: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };
            const lines = list.map(e => {
              const time = (e.time || '').replace('T', ' ').substring(0, 19);
              const icon = levelIcon[e.level] || '📝';
              return `[${time}] ${icon} [${e.module}] ${e.action}: ${e.message}${e.detail ? ' (' + e.detail + ')' : ''}`;
            });
            contentEl.textContent = lines.join('\n');
            summaryEl.style.display = 'block';
            summaryEl.textContent = `共 ${res.data.total || list.length} 条操作日志`;
            window._hspOpLogText = lines.join('\n');
          }
        } else {
          contentEl.innerHTML = '<span style="color:var(--danger);">' + (res.message || '加载失败') + '</span>';
          window._hspOpLogText = '';
        }
      }
    } catch (err) {
      const loaderEl = document.getElementById('opLogLoader');
      if (loaderEl) loaderEl.textContent = '❌ 加载失败: ' + err.message;
      window._hspOpLogText = '';
    }
  },

  copyOpLog() {
    const text = window._hspOpLogText || '';
    if (!text) { this.notify('没有可复制的日志', 'warn'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => this.notify('✅ 日志已复制', 'success')).catch(() => this.notify('复制失败', 'error'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); this.notify('✅ 日志已复制', 'success');
    }
  },

  // 显示页面 API 诊断日志
  showPageDiagLog(title, pageFilter) {
    const filter = pageFilter || (window.Api ? Api._currentPage : 'dashboard');
    const entries = window.Api ? Api.getDiagLog(filter) : [];
    if (entries.length === 0) {
      // 如果当前页无日志，回退到显示全部
      const allEntries = window.Api ? Api.getDiagLog() : [];
      if (allEntries.length === 0) {
        this.notify('暂无诊断日志', 'info');
        return;
      }
      const logText = allEntries.map(e => `[${e.time}] [${e.page}] ${e.level.toUpperCase()} ${e.msg}`).join('\n');
      window._hspUtilsLog = logText;
      const body = `
        <pre style="max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;">${logText}</pre>
        <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);">共 ${allEntries.length} 条 API 调用记录（全部页面）</div>
      `;
      const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">📋 一键复制</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>`;
      Utils.openModal('📋 API诊断 - ' + (title || ''), body, footer);
      return;
    }
    const logText = entries.map(e => `[${e.time}] ${e.level.toUpperCase()} ${e.msg}`).join('\n');
    window._hspUtilsLog = logText;
    const body = `
      <pre style="max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;">${logText}</pre>
      <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);">共 ${entries.length} 条 API 调用记录</div>
    `;
    const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">📋 一键复制</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>`;
    Utils.openModal('📋 API诊断 - ' + (title || ''), body, footer);
  },

  // 通用日志弹窗（供各页面使用）
  async showLog(apiPath, title) {
    const body = `
      <div id="utilsLogLoader" style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ 加载中...</div>
      <pre id="utilsLogContent" style="display:none;max-height:480px;overflow:auto;background:var(--bg-tertiary,#f8f9fa);padding:12px;border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#1a1a1a;margin:0;font-family:Menlo,Monaco,monospace;"></pre>
    `;
    const footer = `<button class="btn btn-sm btn-secondary" onclick="Utils.copyLog()">📋 一键复制</button><button class="btn btn-sm btn-secondary" onclick="Utils.closeModal()">关闭</button>`;
    Utils.openModal('📋 ' + (title || '日志'), body, footer);

    try {
      const api = window.Api;
      const res = await (api ? api.get(apiPath) : fetch(apiPath).then(r => r.json()));
      const contentEl = document.getElementById('utilsLogContent');
      const loaderEl = document.getElementById('utilsLogLoader');
      if (contentEl && loaderEl) {
        loaderEl.style.display = 'none';
        contentEl.style.display = 'block';
        if (res.success && res.data) {
          contentEl.textContent = res.data.logs || '(空)';
          window._hspUtilsLog = res.data.logs || '';
        } else {
          contentEl.innerHTML = '<span style="color:var(--danger)">' + (res.message || '加载失败') + '</span>';
          window._hspUtilsLog = '';
        }
      }
    } catch (err) {
      const loaderEl = document.getElementById('utilsLogLoader');
      if (loaderEl) loaderEl.textContent = '❌ 加载失败: ' + err.message;
      window._hspUtilsLog = '';
    }
  },

  copyLog() {
    const text = window._hspUtilsLog || '';
    if (!text) { this.notify('没有可复制的日志', 'warn'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => this.notify('✅ 日志已复制', 'success')).catch(() => this.notify('复制失败', 'error'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); this.notify('✅ 日志已复制', 'success');
    }
  }
});

window.closeModal = Utils.closeModal;
window.openModal = Utils.openModal;

// 关闭弹窗（点击遮罩层和关闭按钮）
document.addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay' || e.target.id === 'modalClose') {
    Utils.closeModal();
  }
});

function formatTime(date) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Shanghai'
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function isEmpty(arr) { return !arr || arr.length === 0; }