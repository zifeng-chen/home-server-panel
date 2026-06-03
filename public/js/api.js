// API 通信模块
const Api = {
  baseUrl: '/api',
  _diagLog: [],  // 诊断日志

  _diag(msg) {
    this._diagLog.push(msg);
    try { var d=document.getElementById('page-diag'); if(d) d.innerHTML+='<br><span style="color:#38bdf8">🌐 '+msg+'</span>'; } catch(e){}
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
      this._diag(method + ' ' + url + ' → HTTP ' + res.status + ' ct=' + (res.headers.get('content-type')||'?'));

      if (res.status === 401) {
        localStorage.removeItem('hsp_token');
        this._diag('🔴 401 未登录，跳转登录页');
        window.location.href = '/login.html';
        return { success: false, message: '未登录' };
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        this._diag('🟠 JSON解析失败! 响应不是JSON: ' + text.substring(0, 100));
        return { success: false, message: 'Invalid JSON: ' + text.substring(0, 80) };
      }
    } catch (err) {
      this._diag('🔴 fetch异常: ' + (err.name||'?') + ' ' + (err.message||''));
      return { success: false, message: err.message };
    }
  },

  get(path, signal) { return this.request('GET', path, null, signal); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  del(path, data) { return this.request('DELETE', path, data || {}); }
};