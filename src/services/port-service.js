// 端口管理服务
const { exec } = require('child_process');
const os = require('os');

class PortService {
  // 扫描本机监听端口
  async scan() {
    return new Promise((resolve, reject) => {
      const platform = os.platform();
      
      if (platform === 'darwin' || platform === 'linux') {
        // 使用 lsof -iTCP -sTCP:LISTEN -nP
        exec('lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
          if (err && !stdout) {
            // fallback 到 ss/netstat
            return this._fallbackScan(resolve);
          }
          resolve(this._parseLsof(stdout || ''));
        });
      } else {
        resolve(this._parseFallback(''));
      }
    });
  }

  _fallbackScan(resolve) {
    // netstat fallback
    exec('netstat -tlnp 2>/dev/null || netstat -an 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
      resolve(this._parseNetstat(stdout || ''));
    });
  }

  _parseLsof(output) {
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

      const process = headerMap.cmd != null ? cols[headerMap.cmd] : cols[0];
      const pid = headerMap.pid != null ? cols[headerMap.pid] : cols[1];
      const nameCol = headerMap.name != null ? cols[headerMap.name] : cols[cols.length - 1];

      // 解析 NAME 列格式: *:port 或 IP:port
      const portMatch = nameCol.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1]);
      if (ports.find(p => p.port === port && p.pid === pid)) continue;

      const host = nameCol.replace(/:\d+$/, '');
      const isIPv6 = nameCol.startsWith('[');

      ports.push({
        port,
        protocol: 'TCP',
        process,
        pid: pid ? parseInt(pid) : null,
        host: host === '*' ? '0.0.0.0' : (isIPv6 ? `[::]` : host),
        status: 'LISTEN',
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
        protocol: parts[0]?.includes('6') ? 'TCP6' : 'TCP',
        process: parts[parts.length - 1]?.split('/')[1] || 'unknown',
        pid: parts[parts.length - 1]?.split('/')[0] || null,
        host: '0.0.0.0',
        status: status === 'LISTEN' ? 'LISTEN' : status,
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
      8888: 'Jupyter', 3389: 'RDP', 5900: 'VNC',
      25: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS', 995: 'POP3S',
      53: 'DNS'
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
}

module.exports = new PortService();