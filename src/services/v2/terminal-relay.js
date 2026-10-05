// V2 终端中继 — Phase 3 FR-3.1
// 不直连设备：浏览器 ←WS→ HSP ←命令通道→ Agent（或本地 shell）
//
// 说明：这里实现的是「行编辑式交互终端」（readline 风格）：
//   - 服务端维护输入缓冲区 + 历史 + cwd，逐字符回显
//   - 回车后整行下发到设备执行，输出流式回写
//   - 支持 Ctrl+C 取消当前输入、Ctrl+L 清屏、↑↓ 历史翻页、Tab 忽略
// 相比接 PTY，它不需要额外原生依赖（无 node-pty / creack/pty），
// 且在 iStoreOS(BusyBox) 上行为一致。全屏交互程序（top/vi）不在支持范围内。
const { exec } = require('child_process');
const commandService = require('./command-service');

const CMD_TIMEOUT = 90000;          // 单条命令超时
const MAX_BUFFER = 400 * 1024;      // exec maxBuffer
const MAX_OUTPUT_LEN = 200 * 1024;  // 单次回写上限
const SESSION_IDLE_MS = 30 * 60 * 1000;

const CR = '\r\n';

class TerminalSession {
  constructor(id, deviceId, opts = {}) {
    this.id = id;
    this.deviceId = deviceId;
    this.isLocal = deviceId === 'dev_local';
    this.host = opts.host || (this.isLocal ? 'localhost' : deviceId);
    this._send = opts.send || (() => {});
    this._onClose = opts.onClose || (() => {});

    this.buf = '';
    this.cwd = '~';
    this.history = [];
    this.hIndex = -1;
    this.busy = false;
    this.closed = false;
    this.lastActive = Date.now();
  }

  // ===== 输出（统一换行符，xterm 需要 \r\n）=====
  write(text) {
    if (this.closed) return;
    let t = String(text);
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, CR);
    if (t.length > MAX_OUTPUT_LEN) {
      t = t.slice(0, MAX_OUTPUT_LEN) + CR + '\x1b[33m[输出过长已截断]\x1b[0m' + CR;
    }
    this._send(t);
  }

  raw(data) {
    if (!this.closed) this._send(data);
  }

  banner() {
    this.write(`\x1b[36mHSP 终端\x1b[0m — ${this.host}${this.isLocal ? ' (本机)' : ''}`);
    this.write(`行模式；Ctrl+C 取消、Ctrl+L 清屏、↑↓ 历史\x1b[0m`);
    this.prompt();
  }

  prompt() {
    this.write(`\x1b[32m${this.host}\x1b[0m:\x1b[34m${this.cwd}\x1b[0m# `);
  }

  // ===== 键盘输入 =====
  input(data) {
    if (this.closed) return;
    this.lastActive = Date.now();
    const s = String(data);

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      // 方向键序列
      if (ch === '\x1b') {
        const rest = s.slice(i, i + 3);
        if (rest === '\x1b[A') { this._history(-1); i += 2; continue; }
        if (rest === '\x1b[B') { this._history(1); i += 2; continue; }
        if (rest === '\x1b[C') { i += 2; continue; }   // 右
        if (rest === '\x1b[D') { i += 2; continue; }   // 左
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        this.write(CR);
        const line = this.buf;
        this.buf = '';
        this.hIndex = -1;
        this.execute(line.trim());
        continue;
      }
      if (ch === '\x7f' || ch === '\b') {
        if (this.buf.length) {
          this.buf = this.buf.slice(0, -1);
          this.raw('\b \b');
        }
        continue;
      }
      if (ch === '\x03') { // Ctrl+C
        if (this.busy) this.write('^C' + CR);
        else {
          this.buf = '';
          this.write('^C' + CR);
          this.prompt();
        }
        continue;
      }
      if (ch === '\x0c') { // Ctrl+L
        this.raw('\x1b[2J\x1b[3J\x1b[H');
        this.write(`\x1b[32m${this.host}\x1b[0m:${this.cwd}# ${this.buf}`);
        continue;
      }
      if (ch === '\t') continue;          // Tab 忽略
      if (ch < ' ') continue;             // 其他控制字符忽略

      // 普通字符：回显
      this.buf += ch;
      this.raw(ch);
    }
  }

  _history(dir) {
    if (!this.history.length) return;
    if (this.hIndex === -1) this.hIndex = dir < 0 ? this.history.length : this.history.length;
    let next = this.hIndex + dir;
    if (next < 0) next = 0;
    if (next > this.history.length) next = this.history.length;
    this.hIndex = next;

    // 擦掉当前行
    if (this.buf.length) this.raw('\b \b'.repeat(this.buf.length));
    this.buf = this.hIndex >= this.history.length ? '' : this.history[this.hIndex];
    this.raw(this.buf);
  }

  // ===== 执行 =====
  async execute(cmd) {
    if (this.busy) {
      this.write('\x1b[33m[上一个命令仍在执行]\x1b[0m' + CR);
      this.prompt();
      return;
    }
    if (!cmd) { this.prompt(); return; }

    if (this.history[this.history.length - 1] !== cmd) this.history.push(cmd);
    if (this.history.length > 200) this.history.shift();

    const head = cmd.split(/\s+/)[0];
    if (head === 'clear' || head === 'cls') {
      this.raw('\x1b[2J\x1b[3J\x1b[H');
      this.prompt();
      return;
    }
    if (head === 'exit' || head === 'logout') {
      this.write('连接已关闭' + CR);
      this.dispose();
      this._onClose();
      return;
    }

    this.busy = true;
    try {
      if (/^cd(\s|$)/.test(cmd)) {
        await this._doCd(cmd);
      } else {
        const out = await this.run(`cd ${this._cdArg()} 2>/dev/null; ${cmd}`);
        if (out.stdout) this.write(out.stdout);
        if (out.stderr) this.write(out.stderr);
        if (out.exitCode) this.write(`\x1b[31m[exit ${out.exitCode}]\x1b[0m` + CR);
      }
    } catch (e) {
      this.write('\x1b[31m' + (e && e.message ? e.message : String(e)) + '\x1b[0m' + CR);
    } finally {
      this.busy = false;
      if (!this.closed) this.prompt();
    }
  }

  async _doCd(cmd) {
    const target = cmd.replace(/^cd\s*/, '').trim() || '~';
    const out = await this.run(`cd ${this._cdArg()} 2>/dev/null; cd ${target} && pwd`);
    if (out.exitCode !== 0) {
      const msg = (out.stderr || out.stdout || 'cd 失败').trim();
      if (msg) this.write(msg + CR);
      return;
    }
    const lines = String(out.stdout).trim().split('\n').filter(l => l.trim());
    const p = (lines[lines.length - 1] || '').trim();
    if (p && p.startsWith('/')) this.cwd = this._shortCwd(p);
  }

  /** 把 home 目录缩写成 ~，让提示符更短 */
  _shortCwd(p) {
    if (p === '/root') return '~';
    return p.replace(/^\/(?:home|Users)\/[^/]+/, '~');
  }

  _cdArg() {
    return this.cwd === '~' ? '$HOME' : `'${this.cwd.replace(/'/g, "'\\''")}'`;
  }

  /** 下发到设备执行，返回 { stdout, stderr, exitCode } */
  async run(command) {
    if (this.isLocal) return this._runLocal(command);
    return this._runRemote(command);
  }

  _runLocal(command) {
    return new Promise((resolve) => {
      exec(command, { shell: '/bin/sh', timeout: CMD_TIMEOUT, maxBuffer: MAX_BUFFER },
        (err, stdout, stderr) => {
          const out = {
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: 0,
          };
          if (err) {
            out.exitCode = typeof err.code === 'number' ? err.code : 1;
            if (err.killed) { out.exitCode = 124; out.stderr += `\n命令超时 (${CMD_TIMEOUT / 1000}s)`; }
          }
          resolve(out);
        });
    });
  }

  async _runRemote(command) {
    const reply = await commandService.send(this.deviceId, {
      action: 'run_command',
      command,
    }, CMD_TIMEOUT);

    const r = (reply && reply.result) || {};
    // Agent 的 run_command 使用 CombinedOutput，stdout 已包含 stderr
    const stdout = typeof r.stdout === 'string' ? r.stdout
      : (typeof r.output === 'string' ? r.output : '');
    const exitCode = typeof r.exit_code === 'number' ? r.exit_code : 0;
    return {
      stdout,
      stderr: '',
      exitCode,
    };
  }

  dispose() {
    this.closed = true;
  }
}

class TerminalRelay {
  constructor() {
    this.sessions = new Map();
    this.seq = 0;
    this._timer = setInterval(() => this._sweep(), 5 * 60 * 1000);
    if (this._timer.unref) this._timer.unref();
  }

  /**
   * 创建终端会话
   * @param {string} deviceId
   * @param {{host?:string, send:(t:string)=>void, onClose?:()=>void}} opts
   */
  create(deviceId, opts = {}) {
    const id = `ts_${(++this.seq).toString(36)}_${Date.now().toString(36)}`;
    const s = new TerminalSession(id, deviceId, opts);
    this.sessions.set(id, s);
    return s;
  }

  close(id) {
    const s = this.sessions.get(id);
    if (s) { s.dispose(); this.sessions.delete(id); }
  }

  count() { return this.sessions.size; }

  _sweep() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.closed || now - s.lastActive > SESSION_IDLE_MS) {
        s.dispose();
        this.sessions.delete(id);
      }
    }
  }
}

module.exports = new TerminalRelay();
module.exports.TerminalSession = TerminalSession;
