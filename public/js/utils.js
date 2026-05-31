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