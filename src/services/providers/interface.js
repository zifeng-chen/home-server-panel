/**
 * Provider 抽象接口
 *
 * 目标：消除 if(device.local) / if(device.remote) 分支判断。
 * HSP 调用方只需 provider.getMetrics(deviceId)，无需关心设备类型。
 */

/**
 * @typedef {Object} SystemMetrics
 * @property {number} cpu - CPU 使用率 (%)
 * @property {number} memory - 内存使用率 (%)
 * @property {number} disk - 磁盘使用率 (%)
 * @property {number} temperature - CPU 温度 (°C)
 * @property {number} load - 系统负载 (1min avg)
 * @property {Object} network - { rx: number, tx: number } (bytes)
 */

/**
 * MonitorProvider - 监控指标采集
 * @interface
 */
class MonitorProvider {
  /**
   * 获取设备监控指标
   * @param {string} deviceId - 设备 ID
   * @returns {Promise<SystemMetrics>}
   */
  async getMetrics(deviceId) {
    throw new Error('Not implemented');
  }

  /**
   * 获取历史指标
   * @param {string} deviceId
   * @param {number} limit
   * @returns {Promise<SystemMetrics[]>}
   */
  async getHistory(deviceId, limit = 60) {
    throw new Error('Not implemented');
  }
}

/**
 * DockerProvider - Docker 管理
 * @interface
 */
class DockerProvider {
  async listContainers(deviceId) {
    throw new Error('Not implemented');
  }
  async restartContainer(deviceId, containerName) {
    throw new Error('Not implemented');
  }
  async stopContainer(deviceId, containerName) {
    throw new Error('Not implemented');
  }
  async startContainer(deviceId, containerName) {
    throw new Error('Not implemented');
  }
  async getContainerLogs(deviceId, containerName, tail = 100) {
    throw new Error('Not implemented');
  }
}

/**
 * SystemProvider - 系统信息
 * @interface
 */
class SystemProvider {
  async getSystemInfo(deviceId) {
    throw new Error('Not implemented');
  }
}

/**
 * NginxProvider - Nginx 管理
 * @interface
 */
class NginxProvider {
  async getStatus(deviceId) {
    throw new Error('Not implemented');
  }
  async reload(deviceId) {
    throw new Error('Not implemented');
  }
  async testConfig(deviceId) {
    throw new Error('Not implemented');
  }
}

/**
 * PM2Provider - PM2 进程管理
 * @interface
 */
class PM2Provider {
  async listProcesses(deviceId) {
    throw new Error('Not implemented');
  }
  async restartProcess(deviceId, processName) {
    throw new Error('Not implemented');
  }
  async stopProcess(deviceId, processName) {
    throw new Error('Not implemented');
  }
}

module.exports = {
  MonitorProvider,
  DockerProvider,
  SystemProvider,
  NginxProvider,
  PM2Provider
};
