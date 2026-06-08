// Nginx 管理服务 - 安装检测/启停/配置解析
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class NginxService {
  constructor() {
    this.platform = os.platform();
    this.distro = this._detectDistro();
    this._detectPaths();
  }

  // 检测发行版（iStoreOS / OpenWRT 特殊处理）
  _detectDistro() {
    // 检查 OpenWRT/iStoreOS 标志文件
    if (fs.existsSync('/etc/openwrt_release') || fs.existsSync('/etc/os-release')) {
      try {
        const release = fs.readFileSync(
          fs.existsSync('/etc/openwrt_release') ? '/etc/openwrt_release' : '/etc/os-release',
          'utf-8'
        );
        if (release.includes('OpenWrt') || release.includes('iStoreOS') || release.includes('LEDE')) {
          return 'openwrt';
        }
      } catch (e) { /* fall through */ }
    }
    // 检查 opkg 是否存在
    try {
      require('child_process').execSync('which opkg 2>/dev/null', { timeout: 2000 });
      return 'openwrt';
    } catch (e) { /* not OpenWRT */ }
    // 检查 alpine (apk)
    try {
      require('child_process').execSync('which apk 2>/dev/null', { timeout: 2000 });
      return 'alpine';
    } catch (e) { /* not Alpine */ }
    return 'generic';
  }

  // 平台自适应路径检测
  _detectPaths() {
    const candidates = {
      darwin: [
        '/opt/homebrew/sbin/nginx',
        '/opt/homebrew/bin/nginx',
        '/usr/local/sbin/nginx',
        '/usr/local/bin/nginx',
      ],
      linux: [
        '/usr/sbin/nginx',
        '/usr/bin/nginx',
        '/usr/local/sbin/nginx',
      ]
    };

    const bins = [...(candidates[this.platform] || candidates.linux)];
    // OpenWRT 额外路径
    const openwrtBins = ['/usr/sbin/nginx', '/usr/bin/nginx'];
    if (this.distro === 'openwrt') bins.unshift(...openwrtBins.filter(b => !bins.includes(b)));
    for (const bin of bins) {
      if (fs.existsSync(bin)) {
        this.nginxBin = bin;
        break;
      }
    }

    // 配置文件目录
    const configCandidates = {
      darwin: ['/opt/homebrew/etc/nginx', '/usr/local/etc/nginx'],
      linux: ['/etc/nginx', '/usr/local/nginx/conf', '/etc/nginx/conf.d'],
    };
    const configDirs = [...(configCandidates[this.platform] || configCandidates.linux)];
    // OpenWRT 配置目录优先
    if (this.distro === 'openwrt') configDirs.unshift('/etc/nginx');
    for (const dir of configDirs) {
      if (fs.existsSync(dir)) {
        this.configDir = dir;
        break;
      }
    }
  }

  // ========== 状态检测 ==========

  async getStatus() {
    const installed = !!this.nginxBin;

    if (!installed) {
      return {
        installed: false,
        running: false,
        platform: this.platform,
        distro: this.distro,
        installHint: this.distro === 'openwrt' ? 'opkg update && opkg install nginx'
          : this.platform === 'darwin' ? 'brew install nginx'
          : 'apt install nginx 或 yum install nginx'
      };
    }

    try {
      // 1) 版本检测（stderr，可能失败）
      let version = 'unknown';
      try {
        const vOutput = await this._exec(`${this.nginxBin} -v 2>&1`);
        version = (vOutput.match(/nginx\/([\d.]+)/) || [])[1] || 'unknown';
      } catch (e) { /* 非关键 */ }

      // 2) 运行状态检测（独立于版本/配置检测）
      let running = false;
      let pid = null;
      try {
        running = await this._isRunning();
        pid = running ? await this._getPid() : null;
      } catch (e) { /* 非关键 */ }

      // 3) 配置测试（独立，可能权限不足，尝试 sudo -n）
      let configTest = 'ok';
      let configTestOutput = '';
      try {
        configTestOutput = await this._exec(`${this.nginxBin} -t 2>&1`);
      } catch (e) {
        // 权限不足时尝试 sudo -n
        try {
          configTestOutput = await this._exec(`sudo -n ${this.nginxBin} -t 2>&1`);
        } catch (e2) {
          configTestOutput = e2.message;
          configTest = 'error';
        }
      }
      if (configTest !== 'error') {
        configTest = (configTestOutput.includes('successful') || configTestOutput.includes('ok')) ? 'ok' : 'error';
      }

      return {
        installed: true,
        running,
        pid,
        version,
        configTest,
        configTestOutput,
        nginxBin: this.nginxBin,
        configDir: this.configDir,
        confdDir: this.configDir ? path.join(this.configDir, 'conf.d') : null,
        platform: this.platform,
        uptime: running ? await this._getUptime() : null,
        connections: running ? await this._getConnections() : null
      };
    } catch (err) {
      return {
        installed: true,
        running: false,
        version: 'unknown',
        nginxBin: this.nginxBin,
        configDir: this.configDir,
        error: err.message
      };
    }
  }

  // ========== 启停操作 ==========

  async start() {
    this._requireNginx();
    await this._execSudo('start', `${this.nginxBin}`);
    return { success: true, action: 'start', message: 'Nginx 已启动' };
  }

  async stop() {
    this._requireNginx();
    await this._execSudo('stop', `${this.nginxBin} -s stop`);
    return { success: true, action: 'stop', message: 'Nginx 已停止' };
  }

  async reload() {
    this._requireNginx();
    await this._execSudo('reload', `${this.nginxBin} -s reload`);
    return { success: true, action: 'reload', message: 'Nginx 配置已重载' };
  }

  async restart() {
    this._requireNginx();
    // 优先用 systemctl restart（已有服务），否则 stop+start
    await this._execSudo('restart', `${this.nginxBin} -s stop`, `${this.nginxBin}`);
    return { success: true, action: 'restart', message: 'Nginx 已重启' };
  }

  async testConfig() {
    this._requireNginx();
    try {
      const result = await this._exec(`${this.nginxBin} -t 2>&1`);
      return { valid: result.includes('successful'), output: result };
    } catch (err) {
      return { valid: false, output: err.message };
    }
  }

  // ========== 站点配置解析 ==========

  async getSites() {
    if (!this.configDir) {
      return { sites: [], error: '未找到 Nginx 配置目录' };
    }

    const confdDir = path.join(this.configDir, 'conf.d');
    const sitesAvailable = path.join(this.configDir, 'sites-available');
    const sitesEnabled = path.join(this.configDir, 'sites-enabled');

    let sites = [];
    const scanDirs = [confdDir, sitesAvailable, sitesEnabled].filter(d => fs.existsSync(d));

    for (const scanDir of scanDirs) {
      try {
        const files = fs.readdirSync(scanDir).filter(f => f.endsWith('.conf'));
        const source = path.basename(scanDir);

        for (const file of files) {
          const filePath = path.join(scanDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          // 解析 server 块
          const serverBlocks = this._parseServerBlocks(content);

          for (const server of serverBlocks) {
            sites.push({
              name: file.replace('.conf', ''),
              file: file,
              filePath,
              source,
              ...server
            });
          }
        }
      } catch (err) {
        // skip unreadable dirs
      }
    }

    return { sites };
  }

  // ========== 日志查看 ==========

  async getLogs(type = 'access', lines = 50) {
    if (!this.configDir) return { logs: '' };

    const logCandidates = {
      access: [
        '/var/log/nginx/access.log',
        path.join(this.configDir, 'access.log'),
        '/usr/local/var/log/nginx/access.log',
      ],
      error: [
        '/var/log/nginx/error.log',
        path.join(this.configDir, 'error.log'),
        '/usr/local/var/log/nginx/error.log',
      ]
    };

    const candidates = logCandidates[type] || logCandidates.access;
    for (const logFile of candidates) {
      if (fs.existsSync(logFile)) {
        try {
          const output = await this._exec(`tail -n ${lines} ${logFile}`);
          return { type, path: logFile, lines: output.split('\n').filter(Boolean).length, logs: output };
        } catch (err) {
          return { type, error: err.message };
        }
      }
    }

    return { type, logs: '', error: '未找到日志文件' };
  }

  // ========== 安装引导 ==========

  async getInstallGuide() {
    if (this.nginxBin) return { installed: true, message: 'Nginx 已安装' };

    const isRoot = this._isRoot();
    const sudoNeeded = isRoot ? '' : 'sudo ';

    const guides = {
      darwin: {
        method: 'Homebrew',
        commands: ['brew install nginx'],
        configPath: '/opt/homebrew/etc/nginx/'
      },
      openwrt: {
        method: 'opkg',
        commands: [
          'opkg update && opkg install nginx  # OpenWRT / iStoreOS',
          'opkg install nginx-full  # 如需完整模块',
          'opkg install nginx-ssl  # 如需 SSL 支持'
        ],
        configPath: '/etc/nginx/',
        rootHint: isRoot ? null : '⚠️ 非 root 用户运行，可能需要 sudo 或联系管理员'
      },
      alpine: {
        method: 'apk',
        commands: [`${sudoNeeded}apk add nginx`],
        configPath: '/etc/nginx/'
      },
      generic: {
        method: 'apt / yum',
        commands: [
          `${sudoNeeded}apt update && ${sudoNeeded}apt install -y nginx  # Debian/Ubuntu`,
          `${sudoNeeded}yum install -y nginx  # CentOS/RHEL`
        ],
        configPath: '/etc/nginx/'
      }
    };

    const key = this.distro === 'openwrt' ? 'openwrt'
      : this.distro === 'alpine' ? 'alpine'
      : this.platform === 'darwin' ? 'darwin'
      : 'generic';

    return {
      installed: false,
      platform: this.platform,
      distro: this.distro,
      isRoot,
      guide: guides[key]
    };
  }

  // ========== 内部方法 ==========

  // 检测当前是否以 root 运行
  _isRoot() {
    if (this._isRootCache !== undefined) return this._isRootCache;
    this._isRootCache = (typeof process.getuid === 'function' && process.getuid() === 0);
    return this._isRootCache;
  }

  _requireNginx() {
    if (!this.nginxBin) {
      throw new Error('Nginx 未安装');
    }
  }

  async _isRunning() {
    try {
      const pid = await this._getPid();
      return pid !== null;
    } catch {
      return false;
    }
  }

  async _getPid() {
    try {
      // Try reading PID from file first (may fail with EACCES)
      const pidPaths = [
        '/run/nginx.pid',
        '/var/run/nginx.pid',
        '/opt/homebrew/var/run/nginx.pid',
        '/usr/local/var/run/nginx.pid'
      ];
      for (const pidPath of pidPaths) {
        try {
          if (fs.existsSync(pidPath)) {
            const pid = fs.readFileSync(pidPath, 'utf-8').trim();
            if (pid && await this._pidAlive(pid)) return parseInt(pid);
          }
        } catch (e) { /* EACCES, 继续下一个 */ }
      }
      // Fallback: use systemd MainPID (most accurate for systemd systems)
      try {
        const mp = await this._exec('systemctl show nginx -p MainPID --value 2>/dev/null');
        const mainPid = parseInt(mp.trim());
        if (mainPid > 0 && await this._pidAlive(mainPid)) return mainPid;
      } catch (e) { /* 非 systemd 系统 */ }
      // Last fallback: pgrep (may return wrong nginx in Docker env)
      try {
        const result = await this._exec('pgrep -f "/usr/sbin/nginx" 2>/dev/null || echo ""');
        const pids = result.trim().split('\n').filter(Boolean);
        if (pids.length > 0) return parseInt(pids[0]);
      } catch (e) { /* pgrep not available */ }
      return null;
    } catch {
      return null;
    }
  }

  async _pidAlive(pid) {
    try {
      // /proc/<pid> 比 kill -0 更可靠（root进程也能读）
      if (fs.existsSync(`/proc/${pid}`)) return true;
      // Fallback: kill -0
      await this._exec(`kill -0 ${pid} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  async _getUptime() {
    const pid = await this._getPid();
    if (!pid) return null;

    try {
      const result = await this._exec(`ps -o etime= -p ${pid} 2>/dev/null`);
      return result.trim();
    } catch {
      return null;
    }
  }

  async _getConnections() {
    try {
      const result = await this._exec(
        `curl -s http://127.0.0.1/nginx_status 2>/dev/null || echo ""`,
        { timeout: 3000 }
      );
      if (result.includes('Active connections')) {
        const active = (result.match(/Active connections:\s*(\d+)/) || [])[1];
        const accepts = (result.match(/^\s+(\d+)\s+(\d+)\s+(\d+)/m) || [])[1];
        return { active: parseInt(active) || 0, totalRequests: parseInt(accepts) || 0 };
      }
      return null;
    } catch {
      return null;
    }
  }

  _parseServerBlocks(content) {
    const servers = [];
    const serverRegex = /server\s*\{/g;
    let match;

    while ((match = serverRegex.exec(content)) !== null) {
      const startIdx = match.index;
      let braceCount = 1;
      let idx = startIdx + match[0].length;

      // Find matching closing brace
      while (idx < content.length && braceCount > 0) {
        if (content[idx] === '{') braceCount++;
        else if (content[idx] === '}') braceCount--;
        idx++;
      }

      const block = content.substring(startIdx, idx);

      servers.push({
        serverName: this._extractServerName(block),
        listen: this._extractListen(block),
        ssl: block.includes('ssl on') || block.includes('ssl_certificate'),
        sslCert: this._extractSslCert(block),
        sslKey: this._extractSslKey(block),
        root: this._extractRoot(block),
        proxyPass: this._extractProxyPass(block),
        locations: this._extractLocations(block),
        size: block.length
      });
    }

    return servers;
  }

  _extractServerName(block) {
    const m = block.match(/server_name\s+([^;]+);/);
    return m ? m[1].trim() : '_';
  }

  _extractListen(block) {
    const listens = [];
    const regex = /listen\s+([^;]+);/g;
    let m;
    while ((m = regex.exec(block)) !== null) {
      listens.push(m[1].trim());
    }
    return listens.length ? listens.join(', ') : '80';
  }

  _extractSslCert(block) {
    const m = block.match(/ssl_certificate\s+([^;]+);/);
    return m ? m[1].trim() : null;
  }

  _extractSslKey(block) {
    const m = block.match(/ssl_certificate_key\s+([^;]+);/);
    return m ? m[1].trim() : null;
  }

  _extractRoot(block) {
    const m = block.match(/root\s+([^;]+);/);
    return m ? m[1].trim() : null;
  }

  _extractProxyPass(block) {
    const m = block.match(/proxy_pass\s+([^;]+);/);
    return m ? m[1].trim() : null;
  }

  _extractLocations(block) {
    const locations = [];
    const regex = /location\s+([^{]+)\{/g;
    let m;
    while ((m = regex.exec(block)) !== null) {
      const locPath = m[1].trim();
      // Find matching closing brace
      let braceCount = 1;
      let idx = m.index + m[0].length;
      while (idx < block.length && braceCount > 0) {
        if (block[idx] === '{') braceCount++;
        else if (block[idx] === '}') braceCount--;
        idx++;
      }
      const locBlock = block.substring(m.index, idx);
      const proxyPass = this._extractProxyPass(locBlock);
      const root = this._extractRoot(locBlock);
      locations.push({ path: locPath, proxyPass, root });
    }
    return locations;
  }

  _exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: options.timeout || 10000, ...options }, (err, stdout, stderr) => {
        if (err && !options.ignoreError) {
          // sudo commands often write to stderr on success; check exit code not just stderr presence
          const msg = (stderr + stdout).trim();
          if (command.startsWith('sudo ') && err.code === 0) {
            return resolve(msg);
          }
          return reject(new Error(msg || err.message));
        }
        resolve((stdout + stderr).trim());
      });
    });
  }

  _hasSystemctl() {
    if (this._hasSystemctlCache !== undefined) return this._hasSystemctlCache;
    try {
      require('child_process').execSync('which systemctl 2>/dev/null || systemctl --version 2>/dev/null', { timeout: 2000 });
      this._hasSystemctlCache = true;
    } catch { this._hasSystemctlCache = false; }
    return this._hasSystemctlCache;
  }

  async _execSudo(action, ...commands) {
    const command = commands.join(' && sleep 0.5 && ');

    // 如果已经是 root，直接执行，不需要 sudo
    if (this._isRoot()) {
      try {
        return await this._exec(command);
      } catch (e) {
        throw new Error(`权限不足: ${e.message}`);
      }
    }

    // systemd 优先: systemctl start/stop/reload/restart nginx
    if (this.platform === 'linux' && this._hasSystemctl() && ['start','stop','reload','restart'].includes(action)) {
      try {
        // 先尝试无 sudo（某些系统允许）
        return await this._exec(`systemctl ${action} nginx`);
      } catch (e1) {
        try {
          // sudo -n: 非交互模式，如果没 NOPASSWD 会干净报错而非挂起
          return await this._exec(`sudo -n systemctl ${action} nginx`);
        } catch (e2) {
          throw new Error(`Nginx ${action} 需要管理员权限。请配置 NOPASSWD: sudo sh -c 'echo "${process.env.USER || process.env.LOGNAME} ALL=(ALL) NOPASSWD: /usr/bin/systemctl ${action} nginx" >> /etc/sudoers.d/nginx'`);
        }
      }
    }

    // 非 systemd 或 Mac: 直接运行命令
    try {
      return await this._exec(command);
    } catch (e1) {
      try {
        // sudo -n 非交互模式
        return await this._exec(`sudo -n ${command}`);
      } catch (e2) {
        throw new Error(`权限不足: ${e2.message}。请配置 sudo NOPASSWD 或手动运行: sudo ${command}`);
      }
    }
  }
}

module.exports = new NginxService();