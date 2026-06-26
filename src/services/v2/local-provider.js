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

    return {
      cpu: os.loadavg()[0],
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

  /** 获取系统进程 Top N（按 CPU/内存排序） */
  async getProcessList(limit = 10) {
    try {
      const isBusyBox = os.platform() !== 'darwin' &&
        (execSync('ps --version 2>&1 || true', { encoding: 'utf8', timeout: 2000 }).includes('BusyBox') ||
         os.platform() === 'linux');
      const isMac = os.platform() === 'darwin';
      // macOS: ps aux; Linux/BusyBox: ps (BusyBox 无 aux)
      const cmd = isMac
        ? `ps aux | head -${limit + 1}`
        : (isBusyBox
          ? `ps | head -${limit + 1}`
          : `ps aux --sort=-%cpu | head -${limit + 1}`);
      const out = execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim();
      const lines = out.split('\n').slice(1);
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (isMac) {
          // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
          return { user: parts[0] || '-', pid: parts[1] || '-', cpu: parts[2] || '0', mem: parts[3] || '0', command: parts.slice(10).join(' ') || '-' };
        } else if (isBusyBox) {
          // PID USER VSZ STAT COMMAND (BusyBox 无 %CPU/%MEM)
          return { user: parts[1] || '-', pid: parts[0] || '-', cpu: '-', mem: '-', command: parts.slice(4).join(' ') || '-' };
        } else {
          // USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
          return { user: parts[0] || '-', pid: parts[1] || '-', cpu: parts[2] || '0', mem: parts[3] || '0', command: parts.slice(10).join(' ') || '-' };
        }
      });
    } catch (_) { return []; }
  }

  /** 获取活跃网络连接 */
  async getNetworkConnections() {
    try {
      const cmd = os.platform() === 'darwin'
        ? 'netstat -an -p tcp | grep ESTABLISHED | head -20'
        : 'netstat -an 2>/dev/null | grep -E "ESTABLISHED|LISTEN" | head -20';
      const out = execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim();
      const lines = out.split('\n').filter(l => l.trim());
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        // Proto Recv-Q Send-Q LocalAddress:Port ForeignAddress:Port State
        if (parts.length >= 6) {
          return {
            proto: parts[0] || '-',
            local: parts[3] || '-',
            remote: parts[4] || '-',
            state: parts[5] || 'ESTABLISHED'
          };
        }
        return { proto: '-', local: '-', remote: '-', state: '-', raw: line };
      }).filter(c => c.proto !== '-');
    } catch (_) { return []; }
  }
}

module.exports = LocalProvider;
