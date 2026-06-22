// V2 LocalProvider — 封装 V1 现有服务调用，本地设备（iStoreOS 自身）
// 复用现有 system/docker/nginx 服务，不重复实现

const os = require('os');

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
      disk: { total: 0, used: 0, pct: 0 }, // 后续通过 df 命令获取
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
}

module.exports = LocalProvider;
