// API 通信模块
const Api = {
  baseUrl: '/api',
  _diagLog: [],  // 诊断日志 [{page, time, msg, level}]
  _currentPage: 'dashboard',

  _diag(msg, level) {
    level = level || 'info'; // info | success | warn | error
    const entry = { page: this._currentPage, time: new Date().toLocaleTimeString(), msg, level };
    this._diagLog.push(entry);
    // 只保留最近 200 条
    if (this._diagLog.length > 200) this._diagLog = this._diagLog.slice(-200);
    try { var d = document.getElementById('page-diag-content'); if(d) d.innerHTML+='<br><span style="color:#38bdf8">🌐 '+msg+'</span>'; } catch(e){}
  },

  getDiagLog(filterPage) {
    if (filterPage) return this._diagLog.filter(e => e.page === filterPage);
    return this._diagLog;
  },

  clearDiagLog() {
    this._diagLog = [];
  },

  _getToken() {
    return localStorage.getItem('hsp_token');
  },

  async request(method, path, data, signal) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this._getToken();
    if (token) headers['x-auth-token'] = token;

    const opts = {
      method,
      headers,
      credentials: 'same-origin'
    };
    if (signal) opts.signal = signal;

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = JSON.stringify(data);
    }

    const url = this.baseUrl + path;
    this._diag(method + ' ' + url + ' | token=' + (token ? '✅' : '❌'));

    try {
      const res = await fetch(url, opts);

      // 🔍 记录状态码
      const ct = res.headers.get('content-type')||'?';
      const ok = res.ok && ct.includes('json');
      this._diag(method + ' ' + url + ' → HTTP ' + res.status + ' ct=' + ct, ok ? 'success' : 'warn');

      if (res.status === 401) {
        localStorage.removeItem('hsp_token');
        this._diag('🔴 401 未登录，跳转登录页', 'error');
        window.location.href = '/login.html';
        return { success: false, message: '未登录' };
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        this._diag('🟠 JSON解析失败! 响应不是JSON: ' + text.substring(0, 100), 'error');
        return { success: false, message: 'Invalid JSON: ' + text.substring(0, 80) };
      }
    } catch (err) {
      this._diag('🔴 fetch异常: ' + (err.name||'?') + ' ' + (err.message||''), 'error');
      return { success: false, message: err.message };
    }
  },

  get(path, signal) { return this.request('GET', path, null, signal); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  del(path, data) { return this.request('DELETE', path, data || {}); }
};