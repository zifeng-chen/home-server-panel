// API 通信模块
const Api = {
  baseUrl: '/api',
  _diagLog: [],  // 诊断日志 [{page, time, msg, level}]
  _currentPage: 'dashboard',

  _diag(msg, level) {
    level = level || 'info';
    const entry = { page: this._currentPage, time: new Date().toLocaleTimeString(), msg, level };
    this._diagLog.push(entry);
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

  // opts.showError: true (default, modal) | false (page handles it) | 'notify' (toast only)
  async request(method, path, data, signal, opts) {
    opts = opts || {};
    const showError = opts.showError !== false;

    const headers = { 'Content-Type': 'application/json' };
    const token = this._getToken();
    if (token) headers['x-auth-token'] = token;

    const fetchOpts = {
      method,
      headers,
      credentials: 'same-origin'
    };
    if (signal) fetchOpts.signal = signal;

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOpts.body = JSON.stringify(data);
    }

    const url = this.baseUrl + path;
    this._diag(method + ' ' + url + ' | token=' + (token ? '✅' : '❌'));

    try {
      const res = await fetch(url, fetchOpts);

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
        const result = JSON.parse(text);
        // 自动弹窗错误
        if (!result.success && showError && typeof Utils !== 'undefined') {
          if (showError === 'notify') {
            Utils.notify(result.message || '请求失败', 'error');
          } else {
            Utils.showError('请求失败', result.message || '未知错误', method + ' ' + url);
          }
        }
        return result;
      } catch (e) {
        this._diag('🟠 JSON解析失败! 响应不是JSON: ' + text.substring(0, 100), 'error');
        if (showError && typeof Utils !== 'undefined') {
          Utils.showError('数据解析失败', '服务器返回了非 JSON 响应', 'URL: ' + url + '\nContent: ' + text.substring(0, 500));
        }
        return { success: false, message: 'Invalid JSON: ' + text.substring(0, 80) };
      }
    } catch (err) {
      this._diag('🔴 fetch异常: ' + (err.name||'?') + ' ' + (err.message||''), 'error');
      if (showError && typeof Utils !== 'undefined') {
        Utils.showError('网络请求异常', err.message || '请求失败', method + ' ' + url);
      }
      return { success: false, message: err.message };
    }
  },

  get(path, signal, opts) { return this.request('GET', path, null, signal, opts); },
  post(path, data, opts) { return this.request('POST', path, data, null, opts); },
  put(path, data, opts) { return this.request('PUT', path, data, null, opts); },
  del(path, data, opts) { return this.request('DELETE', path, data || {}, null, opts); }
};