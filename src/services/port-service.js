// 端口管理服务
const { exec } = require('child_process');
const os = require('os');

class PortService {
  // 扫描本机所有被占用端口（TCP+UDP，含 LISTEN/ESTABLISHED 等）
  async scan() {
    return new Promise((resolve) => {
      const platform = os.platform();
      
      if (platform === 'darwin' || platform === 'linux') {
        // 扫描 TCP LISTEN + 全部 UDP（UDP 无连接状态）
        exec('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null; echo "---UDP---"; lsof -iUDP -nP 2>/dev/null', { timeout: 15000 }, (err, stdout) => {
          if (err && !stdout) {
            return this._fallbackScan(resolve);
          }
          const parts = (stdout || '').split('---UDP---');
          const tcpPorts = this._parseLsof(parts[0] || '', 'TCP');
          const udpPorts = this._parseLsof(parts[1] || '', 'UDP');
          resolve(this._sortPorts([...tcpPorts, ...udpPorts]));
        });
      } else {
        resolve(this._parseFallback(''));
      }
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
    return new Promise((resolve) => {
      const { execSync } = require("child_process");
      try {
        const result = execSync("lsof -iTCP:" + port + " -sTCP:LISTEN -nP -t 2>/dev/null", { timeout: 5000, encoding: "utf-8" }).trim();
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
    return new Promise((resolve) => {
      const { exec } = require("child_process");
      exec(command, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) return resolve({ success: false, message: "执行失败: " + err.message });
        resolve({ success: true, message: "命令已执行", output: (stdout || stderr || "").slice(0, 500) });
      });
    });
  }

}

module.exports = new PortService();