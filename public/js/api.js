// API 通信模块
const Api = {
  baseUrl: '',

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

    try {
      const res = await fetch(this.baseUrl + path, opts);

      // 401 未登录，跳转登录页
      if (res.status === 401) {
        localStorage.removeItem('hsp_token');
        window.location.href = '/login.html';
        return { success: false, message: '未登录' };
      }

      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  get(path, signal) { return this.request('GET', path, null, signal); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  del(path, data) { return this.request('DELETE', path, data || {}); }
};