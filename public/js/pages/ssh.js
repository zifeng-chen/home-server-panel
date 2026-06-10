// SSH 终端页面模块
async function loadSSH() {
  const page = document.getElementById('page-ssh');
  if (!page) return;

  // 注意: xterm.js 需要从 CDN 加载
  // 在 index.html 中已引入 xterm.js CSS + JS

  page.innerHTML = `
    <div class="page-header">
      <h2>💻 Web SSH 终端</h2>
      <p class="desc">通过浏览器连接服务器终端</p>
    </div>

    <!-- 连接表单 -->
    <div id="ssh-connect-card" class="auth-card" style="max-width:540px;margin:0 auto;">
      <h3>🔗 建立 SSH 连接</h3>
      <div class="form-group">
        <label>主机地址</label>
        <input type="text" id="ssh-host" placeholder="192.168.100.110" value="192.168.100.110">
      </div>
      <div class="form-group">
        <label>端口</label>
        <input type="number" id="ssh-port" placeholder="22" value="22">
      </div>
      <div class="form-group">
        <label>用户名</label>
        <input type="text" id="ssh-user" placeholder="root">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="ssh-pass" placeholder="输入密码">
      </div>
      <div class="form-actions">
        <button id="ssh-connect-btn" class="btn btn-primary">🔗 连接</button>
      </div>
      <div id="ssh-connect-status" style="margin-top:12px;text-align:center;"></div>
    </div>

    <!-- 终端区域 (初始隐藏) -->
    <div id="ssh-terminal-area" style="display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span id="ssh-term-info" style="color:#94a3b8;font-size:13px;"></span>
        <button id="ssh-disconnect-btn" class="btn btn-danger btn-sm" style="padding:4px 12px;font-size:12px;">🔌 断开</button>
      </div>
      <div id="ssh-terminal" style="border-radius:8px;overflow:hidden;border:1px solid #334155;"></div>
      <div id="ssh-term-status" style="margin-top:8px;text-align:center;font-size:12px;color:#64748b;"></div>
    </div>
  `;

  let term = null;
  let ws = null;
  let fitAddon = null;

  const connectCard = document.getElementById('ssh-connect-card');
  const terminalArea = document.getElementById('ssh-terminal-area');
  const connectStatus = document.getElementById('ssh-connect-status');
  const termStatus = document.getElementById('ssh-term-status');
  const termInfo = document.getElementById('ssh-term-info');
  const termContainer = document.getElementById('ssh-terminal');

  const btnConnect = document.getElementById('ssh-connect-btn');
  const btnDisconnect = document.getElementById('ssh-disconnect-btn');

  // 加载 xterm.js
  function ensureXtermLoaded() {
    return new Promise((resolve, reject) => {
      if (typeof window.Terminal !== 'undefined') return resolve();

      // 动态加载
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
      document.head.appendChild(css);

      const js = document.createElement('script');
      js.src = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js';
      js.onload = () => {
        // 加载 addon-fit
        const fitJs = document.createElement('script');
        fitJs.src = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js';
        fitJs.onload = resolve;
        fitJs.onerror = reject;
        document.head.appendChild(fitJs);
      };
      js.onerror = reject;
      document.head.appendChild(js);
    });
  }

  // 创建终端
  async function createTerminal() {
    await ensureXtermLoaded();
    termContainer.style.height = '480px';

    term = new window.Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#818cf8',
        cursorAccent: '#0f172a',
        selection: 'rgba(129, 140, 248, 0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#94a3b8',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#e2e8f0'
      },
      cols: 120,
      rows: 30
    });

    term.open(termContainer);

    if (typeof window.FitAddon !== 'undefined') {
      fitAddon = new window.FitAddon.FitAddon();
      term.loadAddon(fitAddon);

      // 延迟 fit，等 DOM渲染
      setTimeout(() => {
        try { fitAddon.fit(); } catch (e) {}
      }, 200);
    }

    // 终端输入 → WebSocket
    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // 窗口大小变化
    if (fitAddon) {
      window.addEventListener('resize', () => {
        try { fitAddon.fit(); } catch (e) {}
        if (term && ws) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows
          }));
        }
      });
    }

    // 发送 resize
    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
  }

  // 连接
  btnConnect.addEventListener('click', async () => {
    const host = document.getElementById('ssh-host').value.trim();
    const port = parseInt(document.getElementById('ssh-port').value) || 22;
    const username = document.getElementById('ssh-user').value.trim();
    const password = document.getElementById('ssh-pass').value.trim();

    if (!host || !username || !password) {
      connectStatus.innerHTML = '<span style="color:#f87171;">请填写完整的连接信息</span>';
      return;
    }

    btnConnect.disabled = true;
    connectStatus.innerHTML = '<span style="color:#94a3b8;">⏳ 正在连接...</span>';

    try {
      await createTerminal();
    } catch (e) {
      connectStatus.innerHTML = `<span style="color:#f87171;">加载 xterm.js 失败: ${e.message}</span>`;
      btnConnect.disabled = false;
      return;
    }

    // WebSocket 连接
    const token = localStorage.getItem('hsp_token') || '';
    const wsUrl = `ws://${location.host}/ws/ssh?token=${token}`;

    // 连接 WebSocket 并设置回调
    connectWebSocket(wsUrl, { host, port, username, password });
  });

  function connectWebSocket(wsUrl, sshOpts) {
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';  // 必须在 onmessage 之前设置

    ws.onerror = () => {
      connectStatus.innerHTML = '<span style="color:#f87171;">❌ WebSocket 连接失败，请检查服务是否运行</span>';
      btnConnect.disabled = false;
      if (term) { term.write('\r\n[WebSocket 连接失败]\r\n'); }
    };

    ws.onclose = (e) => {
      if (termStatus) termStatus.innerHTML = '<span style="color:#64748b;">⏹️ 连接已关闭 (code: ' + e.code + ')</span>';
      btnConnect.disabled = false;
      if (term && e.code !== 1000) { term.write('\r\n[连接已关闭]\r\n'); }
    };

    ws.onopen = () => {
      connectStatus.innerHTML = '<span style="color:#94a3b8;">⏳ 正在认证并连接 SSH...</span>';
      // 发送 SSH 连接请求
      ws.send(JSON.stringify({
        type: 'connect',
        host: sshOpts.host,
        port: sshOpts.port,
        username: sshOpts.username,
        password: sshOpts.password
      }));
    };

    ws.onmessage = (event) => {
      // JSON 协议消息
      if (typeof event.data === 'string' && event.data.startsWith('{')) {
        try {
          const msg = JSON.parse(event.data);
          handleWsMessage(msg);
        } catch (e) {
          if (term) term.write(event.data);
        }
      } else {
        // 二进制或原始终端数据 → 写入终端
        if (term) term.write(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
      }
    };
  }

  function handleWsMessage(msg) {
    switch (msg.type) {
      case 'status':
        if (msg.status === 'connected') {
          connectStatus.innerHTML = '<span style="color:#22c55e;">✅ SSH 已连接，正在启动 shell...</span>';
          // 请求启动 shell
          ws.send(JSON.stringify({
            type: 'shell',
            cols: term ? term.cols : 120,
            rows: term ? term.rows : 30
          }));
          termStatus.innerHTML = '⏳ 启动 Shell...';
        } else if (msg.status === 'disconnected' || msg.status === 'shell-closed') {
          termStatus.innerHTML = '<span style="color:#f87171;">⚠️ 连接已断开</span>';
          btnConnect.disabled = false;
        }
        break;

      case 'ready':
        connectCard.style.display = 'none';
        terminalArea.style.display = 'block';
        const host = document.getElementById('ssh-host').value;
        const user = document.getElementById('ssh-user').value;
        termInfo.textContent = `🖥️ ${user}@${host}`;
        termStatus.innerHTML = '<span style="color:#22c55e;">🟢 已连接</span>';
        btnConnect.disabled = false;
        if (fitAddon) {
          setTimeout(() => { try { fitAddon.fit(); } catch (e) {} }, 100);
        }
        term.focus();
        break;

      case 'error':
        termStatus.innerHTML = `<span style="color:#f87171;">❌ ${msg.message}</span>`;
        connectStatus.innerHTML = `<span style="color:#f87171;">❌ ${msg.message}</span>`;
        btnConnect.disabled = false;
        break;
    }
  }

  // 断开
  btnDisconnect.addEventListener('click', () => {
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'disconnect' })); } catch (e) {}
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    disconnect();
  });

  function disconnect() {
    if (term) {
      try { term.dispose(); } catch (e) {}
      term = null;
      fitAddon = null;
    }
    terminalArea.style.display = 'none';
    connectCard.style.display = 'block';
    btnConnect.disabled = false;
    connectStatus.innerHTML = '';
    termStatus.innerHTML = '';
    termContainer.innerHTML = '';
  }
}