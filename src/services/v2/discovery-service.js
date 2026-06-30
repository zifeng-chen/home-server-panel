// V2 设备发现引擎 — ARP/mDNS/nmap 扫描 + 设备指纹识别
const { exec } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const crypto = require('crypto');

const OUI_DB = require('./oui-db.json');
const deviceService = require('./device-service');

class DiscoveryService {
  constructor() {
    this.activeScans = new Map(); // scan_id → { progress, devices, completed }
  }

  // ===== 扫描入口 =====
  async scan(method, range) {
    const scanId = 'scan_' + crypto.randomBytes(4).toString('hex');
    this.activeScans.set(scanId, {
      progress: { stage: 'starting', percent: 0, detail: '正在初始化...' },
      devices: [],
      completed: false
    });

    // 后台异步执行
    this._runScan(scanId, method, range).catch(err => {
      console.error('[Discovery] 扫描异常:', err.message);
      const s = this.activeScans.get(scanId);
      if (s) { s.progress = { stage: 'error', detail: err.message }; s.completed = true; }
    });

    return scanId;
  }

  async _runScan(scanId, method, range) {
    const s = this.activeScans.get(scanId);
    let discovered = [];

    // Stage 1: ARP 快速扫描 (ZERO deps — ip neigh)
    s.progress = { stage: 'arp', percent: 10, detail: 'ARP 扫描中...' };
    discovered = await this._scanArp();

    // Stage 2: mDNS 发现（如果 avahi 可用）
    if (method === 'auto' || method === 'mdns') {
      s.progress = { stage: 'mdns', percent: 20, detail: 'mDNS 发现中...' };
      const mdnsDevices = await this._scanMdns();
      for (const d of mdnsDevices) {
        if (!discovered.find(x => x.ip === d.ip)) discovered.push(d);
      }
    }

    // Stage 3: nmap（如果可用且指定）
    if (method === 'nmap' && range) {
      s.progress = { stage: 'nmap', percent: 30, detail: 'nmap 扫描中...' };
      const nmapDevices = await this._scanNmap(range);
      for (const d of nmapDevices) {
        if (!discovered.find(x => x.ip === d.ip)) discovered.push(d);
      }
    }

    s.devices = discovered;

    // Stage 4: 端口探测 + 识别（并行，每 IP 2-3s）
    const total = discovered.length;
    for (let i = 0; i < discovered.length; i++) {
      const d = discovered[i];
      s.progress = {
        stage: 'probe',
        percent: 40 + Math.floor((i / total) * 40),
        detail: `正在探测 ${d.ip} (${i + 1}/${total})...`,
        ip: d.ip
      };
      try {
        const info = await this._identifyDevice(d.ip);
        if (!d.hostname && info.hostname) d.hostname = info.hostname;
        delete info.hostname;
        Object.assign(d, info);
      } catch (_) { /* 探测失败，保留基本信息 */ }
    }

    // Stage 5: 丰富信息 — MAC 厂商 + 已管理设备匹配
    s.progress = { stage: 'enrich', percent: 85, detail: '正在匹配设备信息...' };
    for (const d of discovered) {
      if (d.mac) d.vendor = this._lookupOui(d.mac);
      const managed = await this._matchManaged(d);
      if (managed) {
        d.managed = true;
        d.agentDeviceId = managed.id;
      }
    }

    s.devices = discovered;
    s.progress = { stage: 'done', percent: 100, detail: `发现 ${discovered.length} 台设备` };
    s.completed = true;
  }

  // ===== 虚拟接口/网段过滤 =====
  // 保留: br-lan/br-wan (OpenWrt 主网桥)、eth*/wan/lan/pppoe* (物理接口)
  // 排除: docker0、br-<hash>(Docker网络)、veth、tailscale、WireGuard、tun/tap、virbr
  _isVirtualInterface(iface) {
    if (!iface) return false;
    const v = iface.toLowerCase();
    // 明确保留的接口
    if (v === 'br-lan' || v === 'br-wan' || v === 'lan' || v === 'wan') return false;
    if (v.startsWith('eth') || v.startsWith('en') || v.startsWith('pppoe')) return false;
    // 虚拟接口
    if (v === 'lo') return true;
    if (v.startsWith('docker')) return true;
    // br-<hash> (Docker 网络桥，通常是 br- + 12位hex)
    if (v.startsWith('br-') && v.length >= 15 && /^br-[0-9a-f]{12}$/i.test(v)) return true;
    if (v.startsWith('veth')) return true;
    if (v.startsWith('tailscale')) return true;
    if (v.startsWith('wg')) return true;
    if (v.startsWith('tun') || v.startsWith('tap')) return true;
    if (v.startsWith('virbr')) return true;
    return false;
  }

  // 排除本地回环、链路本地、组播/广播地址
  _isVirtualIP(ip) {
    if (!ip) return true;
    // Loopback
    if (ip.startsWith('127.')) return true;
    // Link-local (APIPA)
    if (ip.startsWith('169.254.')) return true;
    // 0.0.0.0 / 255.255.255.255
    if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;
    // 组播 (224.0.0.0/4)
    const oct1 = parseInt(ip.split('.')[0]);
    if (oct1 >= 224 && oct1 <= 239) return true;
    // Docker 默认桥接网段 (172.17.0.0/16)
    if (ip.startsWith('172.17.')) return true;
    // Docker 用户自定义网络常见范围 (172.18.0.0/16 ~ 172.31.0.0/16)
    if (ip.startsWith('172.18.') || ip.startsWith('172.19.') || ip.startsWith('172.20.')
      || ip.startsWith('172.21.') || ip.startsWith('172.22.') || ip.startsWith('172.23.')
      || ip.startsWith('172.24.') || ip.startsWith('172.25.') || ip.startsWith('172.26.')
      || ip.startsWith('172.27.') || ip.startsWith('172.28.') || ip.startsWith('172.29.')
      || ip.startsWith('172.30.') || ip.startsWith('172.31.')) return true;
    // Tailscale CGNAT (100.64.0.0/10)
    const oct2 = parseInt(ip.split('.')[1]);
    if (oct1 === 100 && oct2 >= 64 && oct2 <= 127) return true;
    return false;
  }

  // ===== ARP 扫描 =====
  async _scanArp() {
    const devices = [];
    try {
      // 优先用 /proc/net/arp（Linux 零依赖）— 有 interface 列可过滤
      const fs = require('fs');
      try {
        const arpData = fs.readFileSync('/proc/net/arp', 'utf-8');
        const lines = arpData.trim().split('\n');
        // Header: IP address HW type Flags HW address Mask Device
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 6 && parts[0] !== 'IP') {
            const ip = parts[0];
            const mac = parts[3].toLowerCase();
            const iface = parts[5] || '';
            if (this._isVirtualIP(ip)) continue;
            if (this._isVirtualInterface(iface)) continue;
            if (mac === '00:00:00:00:00:00') continue;
            if (mac.startsWith('01:') || mac === 'ff:ff:ff:ff:ff:ff') continue;
            devices.push({
              ip, mac,
              hostname: '', type: 'unknown', open_ports: [],
              managed: false, manageable: false,
              source: 'arp'
            });
          }
        }
      } catch (_) {
        // Fallback: ip neigh show (BusyBox 兼容) — 有 dev 字段可过滤
        const result = await this._exec('ip neigh show 2>/dev/null');
        const lines = result.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const ipMatch = line.match(/^([0-9.]+|[:\w]+)/);
          const macMatch = line.match(/lladdr\s+([0-9a-f:]{17})/i);
          const devMatch = line.match(/dev\s+(\S+)/i);
          if (ipMatch && macMatch) {
            const ip = ipMatch[1];
            const mac = macMatch[1].toLowerCase();
            const iface = devMatch ? devMatch[1] : '';
            if (this._isVirtualIP(ip)) continue;
            if (this._isVirtualInterface(iface)) continue;
            if (mac === '00:00:00:00:00:00') continue;
            devices.push({
              ip, mac,
              hostname: '', type: 'unknown', open_ports: [],
              managed: false, manageable: false,
              source: 'ip-neigh'
            });
          }
        }
      }
    } catch (e) {
      console.warn('[Discovery] ARP 扫描失败:', e.message);
    }
    return this._dedupeByIP(devices);
  }

  // ===== mDNS 发现 =====
  async _scanMdns() {
    const devices = [];
    try {
      const result = await this._exec('avahi-browse -atpr 2>/dev/null', 5000);
      const lines = result.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        // avahi-browse -p 格式: =;iface;proto;name;type;domain;host;addr;port;txt
        const parts = line.split(';');
        if (parts.length >= 8 && parts[0] === '=') {
          const iface = parts[1] || ''; // <-- interface 字段可过滤虚拟接口
          const hostname = parts[6] || '';
          const addr = parts[7] || '';
          if (addr && !addr.includes(':') && !this._isVirtualIP(addr) && !this._isVirtualInterface(iface)) {
            devices.push({
              ip: addr,
              mac: '',
              hostname: hostname.replace('.local', ''),
              type: this._classifyMdns(parts[4] || ''),
              open_ports: [],
              managed: false, manageable: false,
              source: 'mdns'
            });
          }
        }
      }
    } catch (_) { /* avahi 不可用 */ }
    return devices;
  }

  _classifyMdns(type) {
    const t = type.toLowerCase();
    if (t.includes('http') || t.includes('_tcp')) return 'service';
    if (t.includes('printer') || t.includes('ipp')) return 'printer';
    if (t.includes('airplay') || t.includes('raop')) return 'media';
    if (t.includes('smb') || t.includes('afp') || t.includes('nfs')) return 'nas';
    if (t.includes('ssh') || t.includes('sftp')) return 'server';
    return 'iot';
  }

  // ===== nmap 扫描 =====
  async _scanNmap(range) {
    const devices = [];
    try {
      const result = await this._exec(`nmap -sn ${range} -oG - 2>/dev/null`, 30000);
      const lines = result.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('#')) continue;
        // grepable format: Host: IP (hostname) Status: Up
        const m = line.match(/Host:\s+([0-9.]+)\s*(?:\(([^)]*)\))?\s+.*Status:\s+Up/);
        if (m) {
          devices.push({
            ip: m[1],
            mac: '',
            hostname: m[2] || '',
            type: 'unknown',
            open_ports: [],
            managed: false, manageable: false,
            source: 'nmap'
          });
        }
      }
    } catch (_) { /* nmap 不可用 */ }
    return devices;
  }

  // ===== 端口探测 + 设备识别 =====
  async _identifyDevice(ip) {
    const info = { hostname: '', open_ports: [], http_server: '', ssh_banner: '', os_guess: '' };

    // DNS 反向解析 (PTR)
    try {
      const hostnames = await dns.reverse(ip);
      if (hostnames && hostnames.length > 0) {
        info.hostname = hostnames[0].replace(/\.local\.?$/i, '').replace(/\.$/,'');
        // 去除常见域名后缀
        info.hostname = info.hostname.replace(/\.lan$/i, '').replace(/\.home$/i, '').replace(/\.fritz\.box$/i, '');
      }
    } catch (_) { /* PTR 记录不存在 */ }
    const ports = [22, 80, 443, 445, 3389, 8080, 8443, 5000, 5001];
    const results = await Promise.allSettled(
      ports.map(p => this._probePort(ip, p))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { port, banner } = r.value;
        info.open_ports.push(port);
        if (port === 22) {
          info.ssh_banner = banner || '';
          info.os_guess = this._guessOS(banner);
        }
        if (port === 80 || port === 443 || port === 8080 || port === 8443) {
          if (banner) info.http_server = banner;
        }
      }
    }

    // 根据端口判断类型
    if (info.open_ports.includes(22) && info.open_ports.includes(80)) info.type = 'router';
    else if (info.open_ports.includes(5000) || info.open_ports.includes(5001)) info.type = 'nas';
    else if (info.open_ports.includes(445)) info.type = 'nas';
    else if (info.open_ports.includes(3389)) info.type = 'desktop';
    else if (info.open_ports.includes(22)) info.type = 'server';
    else if (info.open_ports.length > 0) info.type = 'iot';
    else info.type = 'unknown';

    // 可管理性判断
    info.manageable = info.open_ports.includes(22);

    return info;
  }

  _probePort(ip, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => {
        let banner = '';
        socket.on('data', (data) => {
          banner += data.toString('utf-8').replace(/[\r\n]+/g, ' ').substring(0, 200);
          socket.destroy();
        });
        // SSH: 发送一条换行来触发 banner
        if (port === 22) {
          socket.write('\n');
        } else {
          // HTTP: 发送 HEAD 请求
          socket.write(`HEAD / HTTP/1.0\r\nHost: ${ip}\r\n\r\n`);
        }
        setTimeout(() => {
          socket.destroy();
          resolve({ port, banner: banner || `${port}/open` });
        }, 1500);
      });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
      socket.connect(port, ip);
    });
  }

  _guessOS(banner) {
    if (!banner) return '';
    const b = banner.toLowerCase();
    if (b.includes('openwrt') || b.includes('lede') || b.includes('dropbear')) return 'Linux (OpenWrt/iStoreOS)';
    if (b.includes('ubuntu')) return 'Linux (Ubuntu)';
    if (b.includes('debian')) return 'Linux (Debian)';
    if (b.includes('centos') || b.includes('rhel')) return 'Linux (CentOS/RHEL)';
    if (b.includes('synology')) return 'Synology DSM';
    if (b.includes('qnap')) return 'QNAP';
    if (b.includes('openssh')) return 'Linux/Unix';
    return 'Unknown';
  }

  // ===== MAC OUI 查询 =====
  _lookupOui(mac) {
    if (!mac) return '';
    const prefix = mac.replace(/:/g, '').substring(0, 6).toUpperCase();
    return OUI_DB[prefix] || '';
  }

  // ===== 已管理设备匹配 =====
  async _matchManaged(device) {
    try {
      const result = await deviceService.list({ pageSize: 100 });
      const devices = result.devices || [];
      for (const d of devices) {
        // 匹配 IP
        if (d.ip === device.ip) return d;
        // 匹配 hostname（模糊）
        if (device.hostname && d.hostname && 
            (device.hostname.includes(d.hostname) || d.hostname.includes(device.hostname))) {
          return d;
        }
      }
    } catch (_) { /* deviceService 不可用 */ }
    return null;
  }

  // ===== 单个 IP 识别（手动添加用）=====
  async identify(ip) {
    const device = {
      ip, mac: '',
      hostname: '', type: 'unknown',
      open_ports: [], manageable: false,
      managed: false, source: 'manual'
    };
    
    // 尝试获取 MAC
    try {
      const fs = require('fs');
      const arpData = fs.readFileSync('/proc/net/arp', 'utf-8');
      for (const line of arpData.split('\n')) {
        if (line.startsWith(ip)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) device.mac = parts[3].toLowerCase();
          break;
        }
      }
    } catch (_) {}

    if (device.mac) device.vendor = this._lookupOui(device.mac);

    const info = await this._identifyDevice(ip);
    Object.assign(device, info);

    const managed = await this._matchManaged(device);
    if (managed) {
      device.managed = true;
      device.agentDeviceId = managed.id;
    }

    return device;
  }

  // ===== 辅助方法 =====
  _exec(cmd, timeout = 10000) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout || '');
      });
    });
  }

  _dedupeByIP(devices) {
    const seen = new Set();
    return devices.filter(d => {
      if (seen.has(d.ip)) return false;
      seen.add(d.ip);
      return true;
    });
  }

  // ===== 查询扫描状态 =====
  getScan(scanId) {
    return this.activeScans.get(scanId) || null;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, s] of this.activeScans) {
      if (s.completed && s._finishedAt && now - s._finishedAt > 600000) {
        this.activeScans.delete(id);
      }
    }
  }
}

module.exports = new DiscoveryService();
