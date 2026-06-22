// V2 Provider 抽象层 — 统一本地/远程设备操作接口
// 解耦具体实现：LocalProvider 调用本地命令，RemoteProvider 通过 HTTP/WS 调用 Agent

/**
 * @interface MonitorProvider
 */
class MonitorProvider {
  /** @returns {Promise<{cpu:number, memory:{total:number,used:number,pct:number}, disk:{total:number,used:number,pct:number}, net:{rx:number,tx:number}, uptime:number, load:number[]}>} */
  async getMetrics() { throw new Error('Not implemented'); }
}

/**
 * @interface DockerProvider
 */
class DockerProvider {
  async listContainers() { throw new Error('Not implemented'); }
}

/**
 * @interface SystemProvider
 */
class SystemProvider {
  async getInfo() { throw new Error('Not implemented'); }
  async reboot() { throw new Error('Not implemented'); }
  async shutdown() { throw new Error('Not implemented'); }
}

/**
 * @interface NginxProvider
 */
class NginxProvider {
  async getStatus() { throw new Error('Not implemented'); }
  async reload() { throw new Error('Not implemented'); }
}

/**
 * Factory: 根据设备类型创建 Provider
 */
function createProvider(device, options = {}) {
  const { isLocal } = options;

  if (isLocal || device?.id === 'dev_local') {
    // 延迟加载避免循环依赖
    const LocalProvider = require('./local-provider');
    return new LocalProvider();
  }

  // TODO: V2.5 RemoteProvider（通过 HTTP/WS 调用远程 Agent）
  throw new Error(`Remote provider not yet implemented for device ${device?.id}`);
}

module.exports = {
  MonitorProvider,
  DockerProvider,
  SystemProvider,
  NginxProvider,
  createProvider
};
