// Nginx 管理服务 - 安装检测/启停/配置解析
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class NginxService {
  constructor() {
    this.platform = os.platform();
    this._detectPaths();
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

    const bins = candidates[this.platform] || candidates.linux;
    for (const bin of bins) {
      if (fs.existsSync(bin)) {
        this.nginxBin = bin;
        break;
      }
    }

    // 配置文件目录
    const configCandidates = {
      darwin: ['/opt/homebrew/etc/nginx', '/usr/local/etc/nginx'],
      linux: ['/etc/nginx', '/usr/local/nginx/conf'],
    };
    const configDirs = configCandidates[this.platform] || configCandidates.linux;
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
        installHint: this.platform === 'darwin'
          ? 'brew install nginx'
          : 'apt install nginx 或 yum install nginx'
      };
    }

    try {
      const version = await this._exec(`${this.nginxBin} -v 2>&1`);
      const testResult = await this._exec(`${this.nginxBin} -t 2>&1`);
      const running = await this._isRunning();
      const pid = running ? await this._getPid() : null;

      return {
        installed: true,
        running,
        pid,
        version: (version.match(/nginx\/([\d.]+)/) || [])[1] || 'unknown',
        configTest: testResult.includes('successful') ? 'ok' : 'error',
        configTestOutput: testResult,
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
        nginxBin: this.nginxBin,
        configDir: this.configDir,
        error: err.message
      };
    }
  }

  // ========== 启停操作 ==========

  async start() {
    this._requireNginx();
    await this._execSudo(`${this.nginxBin}`);
    return { success: true, action: 'start', message: 'Nginx 已启动' };
  }

  async stop() {
    this._requireNginx();
    await this._execSudo(`${this.nginxBin} -s stop`);
    return { success: true, action: 'stop', message: 'Nginx 已停止' };
  }

  async reload() {
    this._requireNginx();
    await this._execSudo(`${this.nginxBin} -s reload`);
    return { success: true, action: 'reload', message: 'Nginx 配置已重载' };
  }

  async restart() {
    this._requireNginx();
    const running = await this._isRunning();
    if (running) {
      await this._execSudo(`${this.nginxBin} -s stop`);
      await new Promise(r => setTimeout(r, 1000));
    }
    await this._execSudo(`${this.nginxBin}`);
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

    const guides = {
      darwin: {
        method: 'Homebrew',
        commands: ['brew install nginx'],
        configPath: '/opt/homebrew/etc/nginx/'
      },
      linux: {
        method: 'apt / yum',
        commands: [
          'sudo apt update && sudo apt install -y nginx  # Debian/Ubuntu',
          'sudo yum install -y nginx  # CentOS/RHEL'
        ],
        configPath: '/etc/nginx/'
      }
    };

    return {
      installed: false,
      platform: this.platform,
      guide: guides[this.platform] || guides.linux
    };
  }

  // ========== 内部方法 ==========

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
      // Try reading PID from file first
      const pidPaths = [
        '/var/run/nginx.pid',
        '/opt/homebrew/var/run/nginx.pid',
        '/usr/local/var/run/nginx.pid'
      ];
      for (const pidPath of pidPaths) {
        if (fs.existsSync(pidPath)) {
          const pid = fs.readFileSync(pidPath, 'utf-8').trim();
          if (pid && await this._pidAlive(pid)) return parseInt(pid);
        }
      }
      // Fallback to pgrep
      const result = await this._exec('pgrep nginx 2>/dev/null || echo ""');
      const pids = result.trim().split('\n').filter(Boolean);
      if (pids.length > 0) return parseInt(pids[0]);
      return null;
    } catch {
      return null;
    }
  }

  async _pidAlive(pid) {
    try {
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
          return reject(new Error(stderr || stdout || err.message));
        }
        resolve((stdout + stderr).trim());
      });
    });
  }

  _execSudo(command) {
    // Try without sudo first (e.g., Mac Homebrew)
    return this._exec(command).catch(() => {
      // Fallback to sudo
      return this._exec(`sudo ${command}`);
    });
  }
}

module.exports = new NginxService();