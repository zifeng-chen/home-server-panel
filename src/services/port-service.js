// 端口管理服务
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

class PortService {
  // 扫描本机所有被占用端口（TCP+UDP，含 LISTEN/ESTABLISHED 等）
  async scan() {
    const results = await this._scanAll();
    // 合并 Docker 容器端口
    try {
      const dockerPorts = await this._scanDockerPorts();
      for (const dp of dockerPorts) {
        // 避免重复：Docker 代理端口已在 /proc 中体现，这里标记为 Docker
        const existing = results.find(r => r.port === dp.port && r.protocol === dp.protocol);
        if (existing) {
          existing.process = existing.process || dp.process;
          existing.description = existing.description || dp.description;
        } else {
          results.push(dp);
        }
      }
    } catch (_) { /* Docker 不可达时静默跳过 */ }
    // 标注服务类型
    for (const r of results) {
      r.serviceType = this.classifyServiceType(r);
    }
    return this._sortPorts(results);
  }

  // 分类服务类型：docker | system | local
  classifyServiceType(portEntry) {
    const proc = (portEntry.process || '').toLowerCase();
    // Docker 容器
    if (proc.startsWith('docker:')) return 'docker';
    // 系统服务（端口 < 1024 或已知系统进程）
    const sysProcs = ['sshd', 'nginx', 'dnsmasq', 'systemd', 'syslog', 'ntpd', 'cron',
      'lighttpd', 'uhttpd', 'dropbear', 'netifd', 'odhcpd', 'procd', 'init', 'kern', 'kernel'];
    if (portEntry.port < 1024 || sysProcs.some(sp => proc.includes(sp))) return 'system';
    // 其余为本地/用户服务
    return 'local';
  }

  _scanAll() {
    return new Promise((resolve) => {
      const platform = os.platform();

      if (platform === 'darwin') {
        exec('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null; echo "---UDP---"; lsof -iUDP -nP 2>/dev/null', { timeout: 15000 }, (err, stdout) => {
          if (err && !stdout) return this._fallbackScan(resolve);
          const parts = (stdout || '').split('---UDP---');
          resolve(this._sortPorts([...this._parseLsof(parts[0] || '', 'TCP'), ...this._parseLsof(parts[1] || '', 'UDP')]));
        });
      } else if (platform === 'linux') {
        // Linux: 优先用 /proc (无外部依赖，iStoreOS/BusyBox 可用)
        const procPorts = this._parseProcNet();
        if (procPorts.length > 0) {
          // 同时尝试 lsof 获取进程名（/proc 的进程名可能不够详细）
          exec('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null; echo "---UDP---"; lsof -iUDP -nP 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
            if (stdout) {
              const parts = (stdout || '').split('---UDP---');
              const lsofTcp = this._parseLsof(parts[0] || '', 'TCP');
              const lsofUdp = this._parseLsof(parts[1] || '', 'UDP');
              const lsofMap = new Map();
              for (const p of [...lsofTcp, ...lsofUdp]) {
                lsofMap.set(`${p.port}:${p.protocol}`, p);
              }
              // 用 lsof 的进程名丰富 /proc 数据
              for (const pp of procPorts) {
                const key = `${pp.port}:${pp.protocol}`;
                if (lsofMap.has(key)) {
                  pp.process = lsofMap.get(key).process || pp.process;
                  pp.pid = lsofMap.get(key).pid || pp.pid;
                }
              }
            }
            resolve(this._sortPorts(procPorts));
          });
        } else {
          // /proc 不可用，回退
          this._fallbackScan(resolve);
        }
      } else {
        resolve(this._parseFallback(''));
      }
    });
  }

  // /proc/net 扫描器（Linux 通用，无需 lsof/netstat/ss）
  _parseProcNet() {
    const ports = [];
    try {
      // 扫描 TCP（仅 LISTEN 状态）
      const tcpContent = fs.readFileSync('/proc/net/tcp', 'utf-8');
      const tcpLines = tcpContent.trim().split('\n').slice(1);
      for (const line of tcpLines) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10) continue;
        const localAddr = this._parseProcAddr(fields[1]);
        if (!localAddr) continue;
        const state = parseInt(fields[3], 16);
        if (state !== 0x0A) continue; // TCP_LISTEN
        const inode = fields[9];
        const procInfo = this._resolveProcInode(inode);
        ports.push({
          port: localAddr.port,
          protocol: 'TCP',
          process: procInfo.name || 'kernel',
          pid: procInfo.pid || 0,
          host: localAddr.ip,
          status: 'LISTEN',
          description: this._getServiceName(localAddr.port, procInfo.name || '')
        });
      }

      // 扫描 TCP6
      try {
        const tcp6Content = fs.readFileSync('/proc/net/tcp6', 'utf-8');
        const tcp6Lines = tcp6Content.trim().split('\n').slice(1);
        for (const line of tcp6Lines) {
          const fields = line.trim().split(/\s+/);
          if (fields.length < 10) continue;
          const state = parseInt(fields[3], 16);
          if (state !== 0x0A) continue;
          const localAddr = this._parseProcAddrV6(fields[1]);
          if (!localAddr) continue;
          const inode = fields[9];
          const procInfo = this._resolveProcInode(inode);
          // 检查是否已存在（tcp 和 tcp6 可能有重复）
          if (!ports.find(p => p.port === localAddr.port && p.protocol === 'TCP')) {
            ports.push({
              port: localAddr.port,
              protocol: 'TCP',
              process: procInfo.name || 'kernel',
              pid: procInfo.pid || 0,
              host: '::',
              status: 'LISTEN',
              description: this._getServiceName(localAddr.port, procInfo.name || '')
            });
          }
        }
      } catch (_) { /* tcp6 not available */ }

      // 扫描 UDP
      try {
        const udpContent = fs.readFileSync('/proc/net/udp', 'utf-8');
        const udpLines = udpContent.trim().split('\n').slice(1);
        for (const line of udpLines) {
          const fields = line.trim().split(/\s+/);
          if (fields.length < 10) continue;
          const localAddr = this._parseProcAddr(fields[1]);
          if (!localAddr) continue;
          const inode = fields[9];
          const procInfo = this._resolveProcInode(inode);
          ports.push({
            port: localAddr.port,
            protocol: 'UDP',
            process: procInfo.name || 'kernel',
            pid: procInfo.pid || 0,
            host: localAddr.ip,
            status: 'UDP',
            description: this._getServiceName(localAddr.port, procInfo.name || '')
          });
        }
      } catch (_) { /* udp not available */ }

      // 扫描 UDP6
      try {
        const udp6Content = fs.readFileSync('/proc/net/udp6', 'utf-8');
        const udp6Lines = udp6Content.trim().split('\n').slice(1);
        for (const line of udp6Lines) {
          const fields = line.trim().split(/\s+/);
          if (fields.length < 10) continue;
          const localAddr = this._parseProcAddrV6(fields[1]);
          if (!localAddr) continue;
          const inode = fields[9];
          const procInfo = this._resolveProcInode(inode);
          if (!ports.find(p => p.port === localAddr.port && p.protocol === 'UDP')) {
            ports.push({
              port: localAddr.port,
              protocol: 'UDP',
              process: procInfo.name || 'kernel',
              pid: procInfo.pid || 0,
              host: '::',
              status: 'UDP',
              description: this._getServiceName(localAddr.port, procInfo.name || '')
            });
          }
        }
      } catch (_) { /* udp6 not available */ }

    } catch (err) {
      // /proc/net not available (e.g., non-Linux)
    }
    return ports;
  }

  _parseProcAddr(field) {
    try {
      const parts = field.split(':');
      const ipHex = parts[0];
      const portHex = parts[1];
      // IP is little-endian hex: 0100007F → 7F000001 → 127.0.0.1
      const ip = parseInt(ipHex, 16);
      const port = parseInt(portHex, 16);
      const ipStr = `${(ip >>> 24) & 0xFF}.${(ip >>> 16) & 0xFF}.${(ip >>> 8) & 0xFF}.${ip & 0xFF}`;
      return { ip: ipStr, port };
    } catch (e) { return null; }
  }

  _parseProcAddrV6(field) {
    try {
      const parts = field.split(':');
      const portHex = parts[parts.length - 1];
      const port = parseInt(portHex, 16);
      return { ip: '::', port };
    } catch (e) { return null; }
  }

  _resolveProcInode(inode) {
    // 遍历 /proc/*/fd/* 找到对应 socket inode
    try {
      const procDirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
      for (const pid of procDirs) {
        try {
          const fdDir = `/proc/${pid}/fd`;
          const fds = fs.readdirSync(fdDir);
          for (const fd of fds) {
            try {
              const link = fs.readlinkSync(`${fdDir}/${fd}`);
              if (link.includes(`socket:[${inode}]`)) {
                // 读进程名
                const cmdline = fs.readFileSync(`/proc/${pid}/comm`, 'utf-8').trim();
                return { name: cmdline, pid: parseInt(pid) };
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}
    return { name: 'unknown', pid: 0 };
  }

  // 扫描 Docker 容器端口映射
  async _scanDockerPorts() {
    return new Promise((resolve, reject) => {
      const sock = process.env.DOCKER_SOCK || '/var/run/docker.sock';
      if (!fs.existsSync(sock)) return resolve([]);

      const http = require('http');
      const options = { socketPath: sock, path: '/containers/json?all=true', method: 'GET' };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const containers = JSON.parse(data);
            const ports = [];
            for (const c of containers) {
              const containerPorts = c.Ports || [];
              for (const p of containerPorts) {
                if (p.PublicPort && p.Type === 'tcp') {
                  const name = (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : c.Id.substring(0, 12);
                  ports.push({
                    port: p.PublicPort,
                    protocol: 'TCP',
                    process: `docker:${name}`,
                    pid: 0,
                    host: '0.0.0.0',
                    status: 'LISTEN',
                    description: `Docker 容器: ${name}`
                  });
                }
              }
            }
            resolve(ports);
          } catch (e) { resolve([]); }
        });
        res.on('error', () => resolve([]));
      });
      req.on('error', () => resolve([]));
      req.setTimeout(5000, () => { req.destroy(); resolve([]); });
      req.end();
    });
  }

  _fallbackScan(resolve) {
    // netstat fallback (TCP+UDP)
    exec('netstat -tulnp 2>/dev/null || netstat -an 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
      resolve(this._parseNetstat(stdout || ''));
    });
  }

  _parseLsof(output, protocol) {
    const lines = output.trim().split('\n');
    if (lines.length < 2) return [];

    const ports = [];
    const headerMap = {};
    const header = lines[0];

    // 解析表头
    const headers = header.trim().split(/\s+/);
    headers.forEach((h, i) => {
      if (h === 'COMMAND') headerMap.cmd = i;
      if (h === 'PID') headerMap.pid = i;
      if (h === 'NAME') headerMap.name = i;
    });

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].trim().split(/\s+/);
      if (cols.length < 8) continue;

      const process = (headerMap.cmd != null ? cols[headerMap.cmd] : cols[0]).replace(/\\x[0-9a-fA-F]{2}/g, ' ').trim();
      const pid = headerMap.pid != null ? cols[headerMap.pid] : cols[1];
      const nameCol = headerMap.name != null ? cols[headerMap.name] : cols[cols.length - 1];

      // 解析 NAME 列格式: *:port 或 IP:port
      const portMatch = nameCol.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1]);
      // 去重：同端口+同协议只保留一条
      if (ports.find(p => p.port === port && p.protocol === protocol)) continue;

      const host = nameCol.replace(/:\d+$/, '');
      const isIPv6 = nameCol.startsWith('[');

      ports.push({
        port,
        protocol,
        process,
        pid: pid ? parseInt(pid) : null,
        host: host === '*' ? '0.0.0.0' : (isIPv6 ? `[::]` : host),
        status: protocol === 'UDP' ? 'UDP' : 'LISTEN',
        description: this._getServiceName(port, process)
      });
    }

    return this._sortPorts(ports);
  }

  _parseNetstat(output) {
    const ports = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      // Linux: tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN
      // Mac:   tcp4 0 0 *.80 *.* LISTEN
      const parts = line.trim().split(/\s+/);
      
      const statusIdx = parts.findIndex(p => p === 'LISTEN' || p === 'ESTABLISHED');
      if (statusIdx === -1) continue;

      const status = parts[statusIdx];
      const proto = parts[0];
      const isUdp = proto?.toLowerCase().includes('udp');
      
      // 找地址
      let addr = '';
      for (const p of parts) {
        if (p.includes(':') && !p.includes('::') && p.match(/\d+\.\d+\.\d+\.\d+:\d+/)) {
          addr = p; break;
        }
        if (p.match(/^\*?\.?\*?:?\d+$/)) {
          addr = p.startsWith('*:') ? `0.0.0.0:${p.slice(2)}` : p;
          break;
        }
      }

      if (!addr) continue;
      const portMatch = addr.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1]);
      if (ports.find(p => p.port === port)) continue;

      ports.push({
        port,
        protocol: isUdp ? 'UDP' : (proto?.includes('6') ? 'TCP6' : 'TCP'),
        process: parts[parts.length - 1]?.split('/')[1] || 'unknown',
        pid: parts[parts.length - 1]?.split('/')[0] || null,
        host: '0.0.0.0',
        status: isUdp ? 'UDP' : (status === 'LISTEN' ? 'LISTEN' : status),
        description: this._getServiceName(port, parts[parts.length - 1]?.split('/')[1] || '')
      });
    }

    return this._sortPorts(ports);
  }

  // 检查指定端口是否可用
  async checkPort(port) {
    return new Promise(resolve => {
      exec(`lsof -iTCP:${port} -sTCP:LISTEN -nP 2>/dev/null`, { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ available: true, message: `端口 ${port} 可用` });
        } else {
          const lines = stdout.trim().split('\n');
          const info = lines[1]?.trim().split(/\s+/);
          resolve({
            available: false,
            message: `端口 ${port} 已被占用`,
            process: info?.[0] || 'unknown',
            pid: info?.[1] || null
          });
        }
      });
    });
  }

  _getServiceName(port, process) {
    // 常见服务名映射
    const known = {
      80: 'HTTP', 443: 'HTTPS', 22: 'SSH', 21: 'FTP',
      3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis',
      27017: 'MongoDB', 8080: 'HTTP 备用', 8443: 'HTTPS 备用',
      3000: 'Node.js', 4000: 'Node.js', 5000: 'Python/Flask',
      8096: 'Jellyfin', 9090: 'Prometheus', 9091: 'Transmission',
      5001: '群晖 DSM HTTP', 5000: '群晖 DSM HTTPS',
      4567: '家药管家', 3456: 'Server Panel', 3457: 'Invoice Manager',
      9000: 'Portainer', 9200: 'Elasticsearch', 9092: 'Kafka',
      8888: 'Jupyter', 3389: 'RDP', 5900: 'VNC', 6443: 'k8s API',
      25: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS', 995: 'POP3S',
      53: 'DNS', 67: 'DHCP', 68: 'DHCP', 161: 'SNMP', 389: 'LDAP',
      445: 'SMB', 548: 'AFP', 137: 'NetBIOS', 138: 'NetBIOS', 139: 'NetBIOS',
      1723: 'PPTP', 51820: 'WireGuard', 1194: 'OpenVPN', 1701: 'L2TP',
      3478: 'STUN', 5349: 'STUN/TLS', 1900: 'SSDP', 5353: 'mDNS',
      51413: 'Transmission', 6881: 'BT', 9093: 'Transmission',
      32400: 'Plex', 8920: 'Jellyfin', 6789: 'Syncthing', 8384: 'Syncthing',
      22000: 'Syncthing', 8082: 'qBittorrent', 9117: 'Jackett', 7878: 'Radarr',
      8989: 'Sonarr', 9696: 'Prowlarr', 8686: 'Lidarr', 8191: 'FlareSolverr',
      8123: 'Home Assistant'
    };

    if (known[port]) return known[port];
    if (process && process !== 'unknown' && process !== '-') return process;
    return '未知服务';
  }

  _sortPorts(ports) {
    return ports.sort((a, b) => a.port - b.port);
  }

  getStats(ports) {
    const list = ports || [];
    const count = list.length;
    const topPorts = list.slice(0, 5).map(p => ({ port: p.port, process: p.process || '未知', description: p.description }));
    const webPorts = list.filter(p => p.port === 80 || p.port === 443 || p.port === 8080 || p.port === 8443).length;

    return {
      total: count,
      topProcesses: this._topProcesses(list),
      webPorts,
      topPorts
    };
  }

  _topProcesses(list) {
    const counts = {};
    list.forEach(p => {
      const name = p.process || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }
  // 终止端口进程
  async killPort(port) {
    // 防御：确保 port 是合法数字
    const p = parseInt(port);
    if (isNaN(p) || p < 1 || p > 65535) {
      return { success: false, message: '端口号不合法' };
    }
    return new Promise((resolve) => {
      const { execSync } = require("child_process");
      try {
        const result = execSync("lsof -iTCP:" + p + " -sTCP:LISTEN -nP -t 2>/dev/null", { timeout: 5000, encoding: "utf-8" }).trim();
        if (!result) return resolve({ success: false, message: "端口 " + port + " 未找到监听进程" });
        const pids = result.split("\n").filter(Boolean);
        for (const pid of pids) {
          try { execSync("kill -9 " + pid + " 2>/dev/null", { timeout: 3000 }); } catch(e) {}
        }
        resolve({ success: true, message: "端口 " + port + " 已终止 (PID: " + pids.join(", ") + ")" });
      } catch (err) {
        resolve({ success: false, message: "终止失败: " + err.message });
      }
    });
  }

  // 启动命令执行（恢复端口服务）
  async startService(command) {
    // 安全检查：拒绝危险操作
    const safeCmd = String(command || '').trim();
    if (!safeCmd) return { success: false, message: '命令不能为空' };
    if (safeCmd.length > 200) return { success: false, message: '命令过长' };
    // 拒绝重定向/管道/命令替换/危险操作符
    if (/[&|;><`$()]/.test(safeCmd)) {
      return { success: false, message: '命令包含不允许的字符 (禁用: & | ; > < ` $() )' };
    }

    return new Promise((resolve) => {
      const { exec } = require("child_process");
      exec(safeCmd, { timeout: 10000, maxBuffer: 1024 * 500 }, (err, stdout, stderr) => {
        if (err) return resolve({ success: false, message: "执行失败: " + err.message });
        resolve({ success: true, message: "命令已执行", output: (stdout || stderr || "").slice(0, 500) });
      });
    });
  }

}

module.exports = new PortService();