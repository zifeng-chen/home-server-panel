// V2 MetricsCollector — 本地设备指标周期采集
// 每分钟调用 LocalProvider.getMetrics() → deviceService.reportMetrics()
// 零新依赖，复用现有 service 层

let intervalId = null;
let deviceService = null;
let LocalProvider = null;

/**
 * 采集并上报一次指标
 */
let alertService = null;

async function collectOnce() {
  if (!deviceService || !LocalProvider) return;
  try {
    const provider = new LocalProvider();
    const metrics = await provider.getMetrics();
    await deviceService.reportMetrics('dev_local', metrics);
    // 每次采集后检查告警规则
    if (alertService) {
      try { await alertService.checkAlerts('dev_local'); } catch (_) {}
    }
  } catch (err) {
    // 静默吞掉单次采集错误（网络抖动 / DB 短暂不可用）
    console.warn('[MetricsCollector] 上报失败:', err.message?.slice(0, 80));
  }
}

/**
 * 启动采集器
 * @param {number} intervalMs 采集间隔（默认 60000 = 1 分钟）
 */
function start(intervalMs = 60000) {
  if (intervalId) return;
  // 延迟加载，确保 MySQL 已初始化
  deviceService = require('./device-service');
  LocalProvider = require('./local-provider');
  try { alertService = require('./alert-service'); } catch (_) {}

  // 启动后立即采集一次
  setTimeout(() => collectOnce(), 5000);

  intervalId = setInterval(collectOnce, intervalMs);
  console.log(`[MetricsCollector] 已启动（每 ${intervalMs / 1000}s 采集一次）`);
}

/**
 * 停止采集器
 */
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[MetricsCollector] 已停止');
  }
}

module.exports = { start, stop, collectOnce };
