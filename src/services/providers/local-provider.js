/**
 * LocalProvider - 本机设备 Provider 实现
 *
 * 直接读取本机系统状态，封装为 MonitorProvider / SystemProvider。
 * 重构目标：逐步替换现有的 monitor-service.js / system.js 等直接调用。
 */

const os = require('os');
const { execSync } = require('child_process');
const { MonitorProvider, SystemProvider } = require('./interface');

class LocalMonitorProvider extends MonitorProvider {
  async getMetrics(deviceId) {
    const cpuUsage = this._getCpuUsage();
    const memInfo = this._getMemoryInfo();
    const diskInfo = this._getDiskInfo();
    const netInfo = this._getNetworkInfo();
    const temp = this._getTemperature();
    const load = os.loadavg()[0];

    return {
      cpu: cpuUsage,
      memory: memInfo.usedPercent,
      disk: diskInfo.usedPercent,
      temperature: temp,
      load: parseFloat(load.toFixed(2)),
      network: {
        rx: netInfo.rx,
        tx: netInfo.tx
      }
    };
  }

  async getHistory(deviceId, limit = 60) {
    // 从数据库读取历史指标
    const db = require('../db');
    return await db.query(
      'SELECT * FROM device_metrics WHERE device_id = ? ORDER BY created_at DESC LIMIT ?',
      [deviceId, limit]
    );
  }

  _getCpuUsage() {
    try {
      const cpus = os.cpus();
      let totalIdle = 0, totalTick = 0;
      for (const cpu of cpus) {
        for (const type in cpu.times) totalTick += cpu.times[type];
        totalIdle += cpu.times.idle;
      }
      if (totalTick === 0) return 0;
      return parseFloat(((1 - totalIdle / totalTick) * 100).toFixed(1));
    } catch {
      return 0;
    }
  }

  _getMemoryInfo() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: Math.round(total / (1024 * 1024 * 1024) * 100) / 100,
      free: Math.round(free / (1024 * 1024 * 1024) * 100) / 100,
      used: Math.round(used / (1024 * 1024 * 1024) * 100) / 100,
      usedPercent: parseFloat(((used / total) * 100).toFixed(1))
    };
  }

  _getDiskInfo() {
    try {
      const stdout = execSync("df -k / | tail -1", { encoding: 'utf-8', timeout: 5000 }).trim();
      const parts = stdout.split(/\s+/);
      if (parts.length >= 5) {
        const used = parseInt(parts[2], 10);
        const avail = parseInt(parts[3], 10);
        const total = used + avail;
        if (total > 0) {
          return {
            total: Math.round(total / (1024 * 1024) * 100) / 100,
            used: Math.round(used / (1024 * 1024) * 100) / 100,
            usedPercent: parseFloat(((used / total) * 100).toFixed(1))
          };
        }
      }
    } catch {}
    return { total: 0, used: 0, usedPercent: 0 };
  }

  _getNetworkInfo() {
    try {
      const ifaces = os.networkInterfaces();
      let rx = 0, tx = 0;
      for (const name of Object.keys(ifaces)) {
        if (name === 'lo') continue;
        for (const iface of ifaces[name]) {
          if (iface.internal) continue;
          rx += iface.bytesReceived || 0;
          tx += iface.bytesSent || 0;
        }
      }
      return { rx, tx };
    } catch {
      return { rx: 0, tx: 0 };
    }
  }

  _getTemperature() {
    try {
      // Linux: /sys/class/thermal/thermal_zone0/temp
      const fs = require('fs');
      const path = '/sys/class/thermal/thermal_zone0/temp';
      if (fs.existsSync(path)) {
        const raw = fs.readFileSync(path, 'utf-8').trim();
        return parseFloat((parseInt(raw, 10) / 1000).toFixed(1));
      }
    } catch {}
    return 0;
  }
}

class LocalSystemProvider extends SystemProvider {
  async getSystemInfo(deviceId) {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
        free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100
      },
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      nodeVersion: process.version,
      panelVersion: '1.7.3'
    };
  }
}

module.exports = {
  LocalMonitorProvider,
  LocalSystemProvider
};
