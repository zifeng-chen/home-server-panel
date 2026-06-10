// SSH 连接管理服务
const { Client } = require('ssh2');
const { EventEmitter } = require('events');

class SSHService extends EventEmitter {
  constructor() {
    super();
    // 活跃连接池: sessionId → { client, stream, host, user }
    this._connections = new Map();
  }

  /**
   * 创建 SSH 连接
   * @param {object} opts - { host, port, username, password? }
   * @returns {string} sessionId
   */
  connect(opts) {
    const { host, port = 22, username, password } = opts;
    if (!host || !username || !password) {
      throw new Error('缺少必要参数: host, username, password');
    }

    const client = new Client();
    const sessionId = `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 暂存配置，等就绪后填充 stream
    this._connections.set(sessionId, {
      client,
      stream: null,
      host,
      user: username,
      status: 'connecting',
      cols: 80,
      rows: 24
    });

    client.on('ready', () => {
      const conn = this._connections.get(sessionId);
      if (!conn) {
        client.end();
        return;
      }
      conn.status = 'connected';
      this.emit('status', sessionId, 'connected');
    });

    client.on('error', (err) => {
      const conn = this._connections.get(sessionId);
      if (conn) conn.status = 'error';
      this.emit('error', sessionId, err.message);
      // 不清除连接，让调用方决定是否重试
    });

    client.on('close', () => {
      const conn = this._connections.get(sessionId);
      if (conn) conn.status = 'disconnected';
      this.emit('status', sessionId, 'disconnected');
      this._connections.delete(sessionId);
    });

    client.connect({ host, port, username, password, readyTimeout: 10000, tryKeyboard: true });

    return sessionId;
  }

  /**
   * 开启交互式 shell
   * @param {string} sessionId
   * @param {object} opts - { cols, rows }
   */
  async startShell(sessionId, opts = {}) {
    const conn = this._connections.get(sessionId);
    if (!conn) throw new Error('SSH 会话不存在');
    if (conn.status !== 'connected') throw new Error(`SSH 未连接: ${conn.status}`);

    return new Promise((resolve, reject) => {
      conn.client.shell({ cols: opts.cols || 80, rows: opts.rows || 24 }, (err, stream) => {
        if (err) return reject(err);

        conn.stream = stream;
        conn.cols = opts.cols || 80;
        conn.rows = opts.rows || 24;

        stream.on('data', (data) => {
          this.emit('data', sessionId, data);
        });

        stream.on('close', () => {
          this.emit('status', sessionId, 'shell-closed');
        });

        stream.stderr?.on('data', (data) => {
          this.emit('data', sessionId, data);
        });

        resolve();
      });
    });
  }

  /**
   * 发送输入到 shell
   */
  write(sessionId, data) {
    const conn = this._connections.get(sessionId);
    if (!conn || !conn.stream) return false;
    conn.stream.write(data);
    return true;
  }

  /**
   * 调整终端尺寸
   */
  resize(sessionId, cols, rows) {
    const conn = this._connections.get(sessionId);
    if (!conn || !conn.stream) return false;
    conn.stream.setWindow(rows, cols, null, null);
    conn.cols = cols;
    conn.rows = rows;
    return true;
  }

  /**
   * 断开 SSH 连接
   */
  disconnect(sessionId) {
    const conn = this._connections.get(sessionId);
    if (!conn) return false;
    try { conn.stream?.close(); } catch (e) {}
    try { conn.client.end(); } catch (e) {}
    this._connections.delete(sessionId);
    return true;
  }

  /**
   * 获取连接状态
   */
  getStatus(sessionId) {
    const conn = this._connections.get(sessionId);
    if (!conn) return { exists: false };
    return {
      exists: true,
      status: conn.status,
      host: conn.host,
      user: conn.user
    };
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    for (const [id, conn] of this._connections) {
      try { conn.stream?.close(); } catch (e) {}
      try { conn.client.end(); } catch (e) {}
    }
    this._connections.clear();
  }
}

// 单例
module.exports = new SSHService();