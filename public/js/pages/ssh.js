// SSH 终端 V2 — 连接历史、跨页面保持、3分钟自动断连、蒙层重连
// 全局状态: window.__SSH = { term, ws, fitAddon, current, idleTime, idleTimer }
window.__SSH = window.__SSH || { connections: JSON.parse(localStorage.getItem('hsp_ssh_conns') || '[]') };

function _saveSSHConns() {
  try { localStorage.setItem('hsp_ssh_conns', JSON.stringify(window.__SSH.connections)); } catch(e) {}
}

function _sshResetIdle() {
  var st = window.__SSH;
  st.idleTime = Date.now();
  if (st.idleTimer) clearTimeout(st.idleTimer);
  st.idleTimer = setTimeout(_sshOnIdle, 180000); // 3分钟
}

function _sshOnIdle() {
  var st = window.__SSH;
  // 保存断连前的连接信息，以便重连
  if (st.current) st._lastDisconnected = { host: st.current.host, port: st.current.port, username: st.current.username, password: st.current.password };
  if (st.ws && st.ws.readyState === WebSocket.OPEN) {
    try { st.ws.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
    try { st.ws.close(); } catch(e) {}
  }
  st.ws = null;
  if (st.term) { try { st.term.dispose(); } catch(e) {} st.term = null; st.fitAddon = null; }
  if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
  st.current = null;
  _sshRenderSidebar();
  _sshShowOverlay('⚠️ 连接因 3 分钟无操作已断开', '点击此处重新连接');
}

function _sshShowOverlay(text, hint) {
  var ov = document.getElementById('sshOverlay');
  if (ov) {
    ov.classList.remove('hidden');
    ov.querySelector('.ssh-overlay-text').textContent = text || '连接已断开';
    ov.querySelector('.ssh-overlay-hint').textContent = hint || '点击重新连接';
  }
}

function _sshHideOverlay() {
  var ov = document.getElementById('sshOverlay');
  if (ov) ov.classList.add('hidden');
}

// 页面切换时清理/恢复
window.__SSH._onPageSwitch = function(isSSHPage) {
  var st = window.__SSH;
  if (!isSSHPage) {
    // 离开SSH页面：保留ws连接，清除idle timer
    if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
  } else {
    // 回到SSH页面：如有活跃连接，恢复终端
    if (st.ws && st.ws.readyState === WebSocket.OPEN && st.current) {
      _sshRender(true);
      _sshResetIdle();
    } else if (st.current) {
      _sshRender(true);
      _sshShowOverlay('连接已断开', '点击重新连接');
    }
  }
};

function _sshDisconnect() {
  var st = window.__SSH;
  // 保存断连前的连接信息，以便重连
  if (st.current) st._lastDisconnected = { host: st.current.host, port: st.current.port, username: st.current.username, password: st.current.password };
  if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
  if (st.ws) {
    try { st.ws.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
    try { st.ws.close(); } catch(e) {}
    st.ws = null;
  }
  if (st.term) { try { st.term.dispose(); } catch(e) {} st.term = null; st.fitAddon = null; }
  st.current = null;
  _sshRender(true);
}

// XTerm 加载
function _sshEnsureXterm() {
  return new Promise(function(resolve, reject) {
    if (typeof window.Terminal !== 'undefined') return resolve();
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js';
    js.onload = function() {
      var fitJs = document.createElement('script');
      fitJs.src = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js';
      fitJs.onload = resolve;
      fitJs.onerror = reject;
      document.head.appendChild(fitJs);
    };
    js.onerror = reject;
    document.head.appendChild(js);
  });
}

function _sshCreateTerm() {
  var st = window.__SSH;
  var tc = document.getElementById('ssh-terminal');
  tc.innerHTML = '';
  tc.style.height = '100%';

  st.term = new window.Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    theme: {
      background: '#0a0e1a',
      foreground: '#c9d1d9',
      cursor: '#818cf8',
      cursorAccent: '#0a0e1a',
      selection: 'rgba(99,102,241,0.3)',
      black: '#161b22',
      red: '#f85149',
      green: '#3fb950',
      yellow: '#d2991d',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#30363d',
      brightRed: '#ff6e6e',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    allowProposedApi: true
  });
  st.term.open(tc);

  if (typeof window.FitAddon !== 'undefined') {
    st.fitAddon = new window.FitAddon.FitAddon();
    st.term.loadAddon(st.fitAddon);
    setTimeout(function() { try { st.fitAddon.fit(); } catch(e) {} }, 150);
  }

  st.term.onData(function(data) {
    _sshResetIdle();
    if (st.ws && st.ws.readyState === WebSocket.OPEN) {
      st.ws.send(JSON.stringify({ type: 'input', data: data }));
    }
  });

  if (st.fitAddon) {
    window.addEventListener('resize', function() {
      try { st.fitAddon.fit(); } catch(e) {}
    });
  }

  st.term.onResize(function(dims) {
    if (st.ws && st.ws.readyState === WebSocket.OPEN) {
      st.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    }
  });
}

function _sshConnect(conn, reconnecting) {
  var st = window.__SSH;
  _sshHideOverlay();

  // 更新头部
  var label = document.getElementById('sshConnLabel');
  if (label) label.textContent = conn.username + '@' + conn.host;
  var dot = document.getElementById('sshConnDot');
  if (dot) { dot.className = 'ssh-conn-dot'; }
  var stText = document.getElementById('sshConnStatusText');
  if (stText) stText.textContent = '连接中...';

  _sshEnsureXterm().then(function() {
    _sshCreateTerm();

    var wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/ssh';
    st.ws = new WebSocket(wsUrl);
    st.ws.binaryType = 'arraybuffer';

    st.ws.onerror = function() {
      if (st.term) st.term.write('\r\n\x1b[31m[WebSocket 连接失败]\x1b[0m\r\n');
      _sshShowOverlay('❌ WebSocket 连接失败', '点击重试');
    };

    st.ws.onclose = function(e) {
      if (e.code !== 1000 && st.term) st.term.write('\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n');
      if (dot) { dot.className = 'ssh-conn-dot offline'; }
      if (stText) stText.textContent = '已断开';
      st.ws = null;
      _sshShowOverlay('连接已断开 (code: ' + e.code + ')', '点击重新连接');
    };

    st.ws.onopen = function() {
      st.ws.send(JSON.stringify({
        type: 'connect',
        host: conn.host,
        port: conn.port || 22,
        username: conn.username,
        password: conn.password
      }));
    };

    st.ws.onmessage = function(event) {
      _sshResetIdle();
      if (typeof event.data === 'string' && event.data.charAt(0) === '{') {
        try {
          var msg = JSON.parse(event.data);
          if (msg.type === 'status' && msg.status === 'connected') {
            st.ws.send(JSON.stringify({ type: 'shell', cols: st.term ? st.term.cols : 120, rows: st.term ? st.term.rows : 30 }));
          } else if (msg.type === 'ready') {
            if (dot) { dot.className = 'ssh-conn-dot online'; }
            if (stText) stText.textContent = '已连接';
            st.current = conn;
            _sshRenderSidebar();
            if (st.fitAddon) { setTimeout(function() { try { st.fitAddon.fit(); } catch(e) {} }, 100); }
            st.term.focus();
          } else if (msg.type === 'error') {
            if (st.term) st.term.write('\r\n\x1b[31m[' + msg.message + ']\x1b[0m\r\n');
            if (dot) { dot.className = 'ssh-conn-dot offline'; }
            if (stText) stText.textContent = '错误';
            _sshShowOverlay('❌ ' + msg.message, '点击重试');
          }
        } catch(e) {
          if (st.term) st.term.write(event.data);
        }
      } else {
        if (st.term) st.term.write(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
      }
    };

    st.current = conn;
    _sshRenderSidebar();
    _sshResetIdle();
  }).catch(function(e) {
    _sshShowOverlay('加载 xterm.js 失败: ' + e.message, '点击重试');
  });
}

// 右侧面板渲染
function _sshRender(keepTerm) {
  var st = window.__SSH;
  var page = document.getElementById('page-ssh');
  var isConnected = st.ws && st.ws.readyState === WebSocket.OPEN && st.current;

  var html = '<div class="page-header"><h2>💻 Web SSH 终端</h2><p class="desc">安全连接到远程服务器</p></div>';
  html += '<div class="ssh-layout">';

  // 左侧：连接列表
  html += '<div class="ssh-sidebar"><div class="ssh-sidebar-hd">📋 连接记录</div><div class="ssh-conn-list" id="sshConnList">';
  if (st.connections.length === 0) {
    html += '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">暂无保存的连接<br>点击下方按钮添加</div>';
  } else {
    st.connections.forEach(function(c, i) {
      var isActive = st.current && st.current.host === c.host && st.current.username === c.username;
      html += '<div class="ssh-conn-item' + (isActive ? ' active' : '') + '" data-conn-idx="' + i + '">';
      html += '<div><strong>' + c.name + '</strong><span class="conn-host">' + c.username + '@' + c.host + ':' + (c.port || 22) + '</span></div>';
      html += '<span class="conn-edit" data-edit-idx="' + i + '" title="编辑">✏️</span>';
      html += '<span class="conn-del" data-del-idx="' + i + '" title="删除">×</span>';
      html += '</div>';
    });
  }
  html += '</div><div class="ssh-sidebar-add"><button class="btn btn-primary btn-sm" id="btnSSHAdd">+ 新建连接</button></div></div>';

  // 右侧：终端主区域
  html += '<div class="ssh-main">';
  html += '<div class="ssh-main-header">';
  html += '<span class="ssh-conn-label" id="sshConnLabel">' + (isConnected ? st.current.username + '@' + st.current.host : '未连接') + '</span>';
  html += '<div class="ssh-conn-status">';
  html += '<span class="ssh-conn-dot ' + (isConnected ? 'online' : 'offline') + '" id="sshConnDot"></span>';
  html += '<span id="sshConnStatusText" style="color:var(--text-secondary)">' + (isConnected ? '已连接' : '未连接') + '</span>';
  if (isConnected) {
    html += '<button class="btn btn-danger btn-sm" style="padding:2px 10px;font-size:11px;margin-left:12px" id="btnSSHDisconnect">断开</button>';
  }
  html += '</div></div>';
  html += '<div id="ssh-terminal"></div>';
  html += '<div class="ssh-overlay' + (isConnected ? ' hidden' : '') + '" id="sshOverlay">';
  html += '<div class="ssh-overlay-icon">🖥️</div>';
  html += '<div class="ssh-overlay-text">' + (st.current ? '连接已断开' : '选择左侧连接或新建连接') + '</div>';
  html += '<div class="ssh-overlay-hint">' + (st.current ? '点击重新连接' : '') + '</div>';
  html += '</div></div></div>';

  page.innerHTML = html;

  // 事件绑定
  setTimeout(function() {
    // 点击连接项
    document.querySelectorAll('.ssh-conn-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('conn-del')) return;
        var idx = parseInt(el.dataset.connIdx);
        var conn = st.connections[idx];
        if (!conn) return;
        if (st.ws && st.ws.readyState === WebSocket.OPEN) {
          try { st.ws.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
          try { st.ws.close(); } catch(e) {}
          st.ws = null;
        }
        if (st.term) { try { st.term.dispose(); } catch(e) {} st.term = null; st.fitAddon = null; }
        _sshConnect(conn);
      });
    });

    // 删除连接
    document.querySelectorAll('.conn-del').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.dataset.delIdx);
        st.connections.splice(idx, 1);
        _saveSSHConns();
        if (st.current && st.current === st.connections[idx]) st.current = null;
        _sshRender(true);
      });
    });

    // 编辑连接
    document.querySelectorAll('.conn-edit').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.dataset.editIdx);
        _sshShowAddForm(idx);
      });
    });

    // 新建连接按钮
    var btnAdd = document.getElementById('btnSSHAdd');
    if (btnAdd) btnAdd.addEventListener('click', _sshShowAddForm);

    // 断开按钮
    var btnDis = document.getElementById('btnSSHDisconnect');
    if (btnDis) btnDis.addEventListener('click', function() {
      _sshDisconnect();
    });

    // 蒙层点击重连 — 优先用 _lastDisconnected（手动断开/空闲断连后仍可重连）
    var overlay = document.getElementById('sshOverlay');
    var reconnectTarget = st.current || st._lastDisconnected;
    if (overlay && reconnectTarget) {
      overlay.style.cursor = 'pointer';
      overlay.addEventListener('click', function() {
        if (st.ws && st.ws.readyState === WebSocket.OPEN) {
          try { st.ws.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
          try { st.ws.close(); } catch(e) {}
          st.ws = null;
        }
        if (st.term) { try { st.term.dispose(); } catch(e) {} st.term = null; st.fitAddon = null; }
        _sshConnect(st._lastDisconnected || st.current, true);
      });
    } else if (overlay) {
      overlay.style.cursor = 'default';
    }

    // 如有活跃连接且有terminal，重新附加到DOM
    if (isConnected && st.term) {
      var tc = document.getElementById('ssh-terminal');
      if (tc && !tc.querySelector('.xterm')) {
        st.term.open(tc);
        if (st.fitAddon) { setTimeout(function() { try { st.fitAddon.fit(); } catch(e) {} }, 150); }
      }
    }
  }, 50);
}

// 新建/编辑连接弹窗
var _sshEditingIdx = -1;
function _sshShowAddForm(editIdx) {
  var st = window.__SSH;
  _sshEditingIdx = (editIdx !== undefined) ? editIdx : -1;
  var isEditing = _sshEditingIdx >= 0;
  var conn = isEditing ? st.connections[_sshEditingIdx] : null;

  var html = `
    <div class="ssh-form-row">
      <label>连接名称</label>
      <input type="text" id="sshFmName" placeholder="如: iStoreOS" value="${isEditing ? (conn.name || '') : ''}">
    </div>
    <div class="ssh-form-row">
      <label>主机地址</label>
      <input type="text" id="sshFmHost" placeholder="192.168.100.1" value="${isEditing ? (conn.host || '') : '192.168.100.110'}">
    </div>
    <div class="ssh-form-row">
      <label>端口</label>
      <input type="number" id="sshFmPort" placeholder="22" value="${isEditing ? (conn.port || 22) : 22}">
    </div>
    <div class="ssh-form-row">
      <label>用户名</label>
      <input type="text" id="sshFmUser" placeholder="root" value="${isEditing ? (conn.username || '') : 'root'}">
    </div>
    <div class="ssh-form-row">
      <label>密码</label>
      <input type="password" id="sshFmPass" placeholder="${isEditing ? '(保持不变)' : '输入密码'}">
    </div>
  `;
  var footer = '<button class="btn btn-secondary" id="sshModalSave">💾 仅保存</button><button class="btn btn-primary" id="sshModalConnect">⚡ 保存并连接</button><button class="btn btn-secondary" style="margin-left:8px" onclick="Utils.closeModal()">取消</button>';
  Utils.openModal(isEditing ? '✏️ 编辑 SSH 连接' : '🔗 新建 SSH 连接', html, footer);

  setTimeout(function() {
    var buildConn = function() {
      var name = document.getElementById('sshFmName').value.trim();
      var host = document.getElementById('sshFmHost').value.trim();
      var port = parseInt(document.getElementById('sshFmPort').value) || 22;
      var username = document.getElementById('sshFmUser').value.trim();
      var password = document.getElementById('sshFmPass').value.trim();
      if (!host || !username) { Utils.notify('请填写主机和用户名', 'error'); return null; }
      // 编辑时如果密码留空则保留原密码
      if (isEditing && !password && conn.password) password = conn.password;
      if (!password) { Utils.notify('请输入密码', 'error'); return null; }
      if (!name) name = username + '@' + host;
      return { name: name, host: host, port: port, username: username, password: password };
    };

    var btnSave = document.getElementById('sshModalSave');
    if (btnSave) btnSave.addEventListener('click', function() {
      var newConn = buildConn();
      if (!newConn) return;
      if (isEditing) {
        st.connections[_sshEditingIdx] = newConn;
      } else {
        // 查重：同host+username则更新
        var existsIdx = st.connections.findIndex(function(c) { return c.host === newConn.host && c.username === newConn.username; });
        if (existsIdx >= 0) st.connections[existsIdx] = newConn;
        else st.connections.push(newConn);
      }
      _saveSSHConns();
      _sshEditingIdx = -1;
      Utils.closeModal();
      _sshRenderSidebar();
      Utils.notify('连接已保存', 'success');
    });

    var btnConnect = document.getElementById('sshModalConnect');
    if (btnConnect) btnConnect.addEventListener('click', function() {
      var newConn = buildConn();
      if (!newConn) return;
      if (isEditing) {
        st.connections[_sshEditingIdx] = newConn;
      } else {
        var existsIdx = st.connections.findIndex(function(c) { return c.host === newConn.host && c.username === newConn.username; });
        if (existsIdx >= 0) st.connections[existsIdx] = newConn;
        else st.connections.push(newConn);
      }
      _saveSSHConns();
      _sshEditingIdx = -1;
      Utils.closeModal();
      if (st.ws && st.ws.readyState === WebSocket.OPEN) {
        try { st.ws.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
        try { st.ws.close(); } catch(e) {}
        st.ws = null;
      }
      if (st.term) { try { st.term.dispose(); } catch(e) {} st.term = null; st.fitAddon = null; }
      _sshConnect(newConn);
    });
  }, 50);
}

// 侧边栏状态同步
function _sshRenderSidebar() {
  var list = document.getElementById('sshConnList');
  if (!list) return;
  var st = window.__SSH;
  var html = '';
  if (st.connections.length === 0) {
    html = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">暂无保存的连接<br>点击下方按钮添加</div>';
  } else {
    st.connections.forEach(function(c, i) {
      var isActive = st.current && st.current.host === c.host && st.current.username === c.username;
      html += '<div class="ssh-conn-item' + (isActive ? ' active' : '') + '" onclick="(function(){var st=window.__SSH;var c=st.connections[' + i + '];if(st.ws&&st.ws.readyState===WebSocket.OPEN){try{st.ws.send(JSON.stringify({type:\"disconnect\"}));}catch(e){}try{st.ws.close();}catch(e){}st.ws=null;}if(st.term){try{st.term.dispose();}catch(e){}st.term=null;st.fitAddon=null;}_sshConnect(c);})()">';
      html += '<div><strong>' + c.name + '</strong><span class="conn-host">' + c.username + '@' + c.host + ':' + (c.port || 22) + '</span></div>';
      html += '<span class="conn-edit" onclick="event.stopPropagation();_sshShowAddForm(' + i + ');" title="编辑">✏️</span>';
      html += '<span class="conn-del" onclick="event.stopPropagation();var st=window.__SSH;st.connections.splice(' + i + ',1);_saveSSHConns();_sshRender(true);">×</span>';
      html += '</div>';
    });
  }
  list.innerHTML = html;
}

// 主入口
function loadSSH() {
  var st = window.__SSH;
  var isConnected = st.ws && st.ws.readyState === WebSocket.OPEN && st.current;
  _sshRender(isConnected);
  if (isConnected) {
    _sshResetIdle();
  }
}
