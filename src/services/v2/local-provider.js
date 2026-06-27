// V2 LocalProvider — 封装 V1 现有服务调用，本地设备（iStoreOS 自身）
// 复用现有 system/docker/nginx 服务，不重复实现

const os = require('os');
const { execSync } = require('child_process');

function getDiskInfo() {
  try {
    // df -k 输出 KB 块，BusyBox/iStoreOS 兼容；macOS 兼容（POSIX 标准）
    const out = execSync(
      "df -k / | awk 'NR==2 {print $2,$3,$5}'",
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    const parts = out.split(/\s+/);
    if (parts.length < 3) return { total: 0, used: 0, pct: 0 };
    return {
      total: Math.round(parseInt(parts[0]) / 1024),
      used: Math.round(parseInt(parts[1]) / 1024),
      pct: parseFloat(parts[2].replace('%', '')) || 0
    };
  } catch (_) { return { total: 0, used: 0, pct: 0 }; }
}

class LocalProvider {
  /** 获取实时指标 */
  async getMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // 尝试从 monitor-service 获取精确网络数据
    let netRx = 0, netTx = 0;
    try {
      const monitorService = require('../monitor-service');
      const snap = monitorService.getLatest();
      if (snap?.network) {
        netRx = snap.network.rxRate || 0;
        netTx = snap.network.txRate || 0;
      }
    } catch (_) { /* monitor-service 可能未初始化 */ }

    const cpuCount = os.cpus().length;
    const cpuPct = Math.round((os.loadavg()[0] / cpuCount) * 10000) / 100;

    return {
      cpu: cpuPct,
      memory: {
        total: Math.round(totalMem / 1024 / 1024),
        used: Math.round(usedMem / 1024 / 1024),
        pct: Math.round((usedMem / totalMem) * 10000) / 100
      },
      disk: getDiskInfo(),
      net: { rx: netRx, tx: netTx },
      uptime: Math.floor(os.uptime()),
      load: os.loadavg()
    };
  }

  /** 获取系统信息 */
  async getInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMem: Math.round(os.totalmem() / 1024 / 1024),
      nodeVersion: process.version
    };
  }

  /** 获取 Docker 容器列表 */
  async listContainers() {
    try {
      const dockerService = require('../docker-service');
      return await dockerService.listContainers();
    } catch (_) {
      return [];
    }
  }

  /** 获取 Nginx 状态 */
  async getNginxStatus() {
    try {
      const nginxService = require('../nginx-service');
      return await nginxService.getStatus();
    } catch (_) {
      return { installed: false, running: false };
    }
  }

  /** 获取 PM2 进程列表 */
  async listPM2Processes() {
    try {
      const pm2Service = require('../pm2-service');
      return await pm2Service.list();
    } catch (_) {
      return [];
    }
  }
  /** 获取进程列表 */
  async getProcessList() {
    try {
      // BusyBox ps 不支持 -eo，使用 ps ww + 手动解析
      const out = execSync(
        "ps ww 2>/dev/null | head -25",
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      const lines = out.split('\n');
      if (lines.length < 2) return [];
      // BusyBox ps: PID USER VSZ STAT COMMAND
      const result = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length < 4) continue;
        result.push({
          pid: parseInt(parts[0]) || 0,
          user: parts[1],
          cpu: 0,  // BusyBox ps 无 CPU% 列
          mem: Math.round((parseInt(parts[2]) || 0) / 1024),  // VSZ KB → MB
          command: parts.slice(4).join(' ').substring(0, 200)
        });
      }
      return result;
    } catch (_) { return []; }
  }

  /** 获取网络连接 */
  async getConnections() {
    try {
      const out = execSync(
        "netstat -an 2>/dev/null | grep -E 'ESTABLISHED|LISTEN' | head -30 || netstat -an -p tcp 2>/dev/null | head -30",
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      const result = [];
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        result.push({
          proto: parts[0],
          local: parts[3] || '',
          remote: parts[4] || '',
          state: parts[5] || 'UNKNOWN'
        });
      }
      return result;
    } catch (_) { return []; }
  }
}

module.exports = LocalProvider;
