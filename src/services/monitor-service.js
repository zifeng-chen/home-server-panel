// 系统监控服务 — CPU/内存/磁盘/网络实时采集 + 历史数据缓存
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

const HISTORY_MAX = 60; // 保留最近 60 个数据点（~10 分钟 @每10秒）
const PERSIST_INTERVAL = 5; // 每 5 个 tick（50 秒）持久化一次

class MonitorService {
  constructor() {
    this.history = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      load: []
    };
    this._prevCpu = null;
    this._prevNet = null;
    this._collecting = false;
    this._tickCount = 0;
    this._sqliteService = null;
  }

  start() {
    if (this._collecting) return;
    this._collecting = true;
    // 从数据库恢复上次历史数据
    this._restoreFromDb();
    this._tick();
    this._interval = setInterval(() => this._tick(), 10000);
  }

  stop() {
    this._collecting = false;
    // 停止前最后持久化一次
    this._persist();
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  async _tick() {
    try {
      const [cpu, memory, disk, network, load] = await Promise.all([
        this._getCpuUsage(),
        this._getMemory(),
        this._getDisk(),
        this._getNetwork(),
        Promise.resolve(os.loadavg())
      ]);

      const ts = Date.now();
      this._pushH('cpu', { ts, pct: cpu });
      this._pushH('memory', { ts, used: memory.used, total: memory.total, pct: memory.pct });
      this._pushH('disk', { ts, items: disk });
      this._pushH('network', { ts, rx: network.rx, tx: network.tx, rxRate: network.rxRate, txRate: network.txRate });
      this._pushH('load', { ts, load1: load[0], load5: load[1], load15: load[2] });

      // 每 N 个 tick 持久化一次，避免频繁写盘
      this._tickCount++;
      if (this._tickCount % PERSIST_INTERVAL === 0) {
        this._persist();
      }
    } catch (e) {
      // 静默忽略单次采集失败
    }
  }

  _pushH(key, data) {
    this.history[key].push(data);
    if (this.history[key].length > HISTORY_MAX) {
      this.history[key] = this.history[key].slice(-HISTORY_MAX);
    }
  }

  // CPU 使用率（百分比）
  _getCpuUsage() {
    return new Promise(resolve => {
      const cpus = os.cpus();

      if (!this._prevCpu) {
        const idle = cpus.reduce((s, c) => s + c.times.idle, 0);
        const total = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
        this._prevCpu = { idle, total };
        resolve(0);
        return;
      }

      const idle = cpus.reduce((s, c) => s + c.times.idle, 0);
      const total = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a, b) => a + b, 0), 0);

      const idleDelta = idle - this._prevCpu.idle;
      const totalDelta = total - this._prevCpu.total;
      const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 10000) / 100 : 0;

      this._prevCpu = { idle, total };
      resolve(usage);
    });
  }

  // 内存
  _getMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return Promise.resolve({
      used: Math.round(used / (1024 * 1024 * 1024) * 100) / 100,
      free: Math.round(free / (1024 * 1024 * 1024) * 100) / 100,
      total: Math.round(total / (1024 * 1024 * 1024) * 100) / 100,
      pct: Math.round((used / total) * 10000) / 100
    });
  }

  // 磁盘
  _getDisk() {
    return new Promise(resolve => {
      exec("df -h / /volume1 /opt /mnt 2>/dev/null | tail -n +2", { timeout: 5000 }, (err, stdout) => {
        if (err) { exec("df -h / 2>/dev/null | tail -n +2", { timeout: 5000 }, (err2, stdout2) => {
          if (err2) return resolve([{ mount: '/', pct: 0 }]);
          resolve(this._parseDf(stdout2));
        }); return; }
        resolve(this._parseDf(stdout));
      });
    });
  }

  _parseDf(output) {
    return output.trim().split('\n').map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        filesystem: parts[0] || '?',
        size: parts[1] || '0',
        used: parts[2] || '0',
        avail: parts[3] || '0',
        pct: parseInt(parts[4]) || 0,
        mount: parts[5] || '/'
      };
    });
  }

  // 网络流量
  _getNetwork() {
    const dir = '/sys/class/net';
    return new Promise(resolve => {
      if (!fs.existsSync(dir)) {
        // macOS 兼容
        this._getNetMac(resolve);
        return;
      }
      // Linux: /sys/class/net/
      let totalRx = 0, totalTx = 0;
      try {
        const ifaces = fs.readdirSync(dir);
        for (const iface of ifaces) {
          if (iface === 'lo') continue;
          try {
            totalRx += parseInt(fs.readFileSync(`${dir}/${iface}/statistics/rx_bytes`, 'utf-8').trim()) || 0;
            totalTx += parseInt(fs.readFileSync(`${dir}/${iface}/statistics/tx_bytes`, 'utf-8').trim()) || 0;
          } catch (e) {}
        }
      } catch (e) {}
      this._calcNetRate(totalRx, totalTx, resolve);
    });
  }

  // macOS 网络统计 (netstat)
  _getNetMac(resolve) {
    exec("netstat -ibn 2>/dev/null | grep -v '^Name' | grep -v '^lo' | awk '{rx+=$7; tx+=$10} END {print rx, tx}'", { timeout: 5000 }, (err, stdout) => {
      const parts = (stdout || '').trim().split(/\s+/);
      const totalRx = parseInt(parts[0]) || 0;
      const totalTx = parseInt(parts[1]) || 0;
      this._calcNetRate(totalRx, totalTx, resolve);
    });
  }

  _calcNetRate(totalRx, totalTx, resolve) {
    const now = Date.now();
    let rxRate = 0, txRate = 0;

    if (this._prevNet) {
      const elapsed = (now - this._prevNet.ts) / 1000; // 秒
      rxRate = elapsed > 0 ? Math.round((totalRx - this._prevNet.rx) / elapsed) : 0;
      txRate = elapsed > 0 ? Math.round((totalTx - this._prevNet.tx) / elapsed) : 0;
    }

    this._prevNet = { ts: now, rx: totalRx, tx: totalTx };

    resolve({
      rx: totalRx,
      tx: totalTx,
      rxRate: Math.max(0, rxRate),  // bytes/s
      txRate: Math.max(0, txRate)
    });
  }

  // 从 SQLite 恢复历史数据（启动时调用）
  _restoreFromDb() {
    try {
      if (!this._sqliteService) {
        this._sqliteService = require('./sqlite-service');
      }
      const saved = this._sqliteService.loadMonitorHistory();
      if (saved && saved.cpu && saved.cpu.length > 0) {
        this.history = saved;
        console.log('[Monitor] 从数据库恢复历史数据 (', saved.cpu.length, '点)');
      }
    } catch (e) { /* 静默 */ }
  }

  // 持久化当前历史到 SQLite
  _persist() {
    try {
      if (!this._sqliteService) {
        this._sqliteService = require('./sqlite-service');
      }
      if (this.history.cpu.length > 0) {
        this._sqliteService.saveMonitorHistory(this.history);
      }
    } catch (e) { /* 静默 */ }
  }

  // 获取当前实时 + 历史数据
  snapshot() {
    return {
      live: {
        cpu: this.history.cpu.length > 0 ? this.history.cpu[this.history.cpu.length - 1].pct : (os.loadavg()[0] * 100 / os.cpus().length),
        memory: (() => {
          const total = os.totalmem(), used = total - os.freemem();
          return { used: Math.round(used/(1024*1024*1024)*100)/100, total: Math.round(total/(1024*1024*1024)*100)/100, pct: Math.round(used/total*10000)/100 };
        })(),
        load: os.loadavg(),
        uptime: os.uptime(),
        cpus: os.cpus().length,
        platform: os.platform(),
        hostname: os.hostname()
      },
      history: this.history
    };
  }
}

module.exports = new MonitorService();
