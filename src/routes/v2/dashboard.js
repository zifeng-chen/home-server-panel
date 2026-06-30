// V2 全局驾驶舱数据聚合 — /api/v2/dashboard/overview
const express = require('express');
const router = express.Router();
const deviceService = require('../../services/v2/device-service');
const logService = require('../../services/log-service');
const dbService = require('../../services/db-service');
const discoveryService = require('../../services/v2/discovery-service');

// GET /api/v2/dashboard/overview — 一次性返回驾驶舱全部数据
router.get('/overview', async (req, res) => {
  try {
    const [
      deviceStats,
      allDevices,
      recentLogs,
      alertRules,
      topologyNodes
    ] = await Promise.all([
      // 1) 设备统计
      deviceService.getStats().catch(() => ({ online: 0, offline: 0, total: 0 })),
      // 2) 在线设备列表（含最近指标）
      deviceService.list({ pageSize: 50 }).catch(() => ({ devices: [] })),
      // 3) 最近操作日志（20条）
      logService.query({ limit: 20, offset: 0 }).catch(() => ({ list: [] })),
      // 4) 告警规则
      getAlertRules().catch(() => []),
      // 5) 拓扑节点（从已管理设备 + 最近一次发现的设备）
      getTopologyNodes().catch(() => ({ managed: [], discovered: [], links: [] }))
    ]);

    // 设备列表附上最近指标
    const devices = (allDevices.devices || []).map(d => ({
      id: d.id,
      deviceId: d.deviceId,
      name: d.name || d.hostname || d.ip,
      hostname: d.hostname,
      ip: d.ip,
      os: d.os,
      arch: d.arch,
      version: d.version,
      online: d.status === 'online' || d.online === true,
      lastSeen: d.last_seen || d.lastSeen,
      tags: d.tags || '',
      cpu: d.cpu || 0,
      memory: d.memory || 0,
      disk: d.disk || 0,
      net_rx: d.net_rx || 0,
      net_tx: d.net_tx || 0,
      uptime: d.uptime || 0
    }));

    // 统计卡
    const activeAlerts = alertRules.filter(r => r.enabled).length;

    res.json({
      success: true,
      data: {
        stats: {
          totalDevices: deviceStats.total || 0,
          onlineDevices: deviceStats.online || 0,
          offlineDevices: deviceStats.offline || 0,
          activeAlerts,
          totalAlerts: alertRules.length
        },
        devices,
        logs: (recentLogs.list || []).slice(0, 20).map(l => ({
          time: l.timeCst || l.time || '',
          message: l.message || l.action || '',
          module: l.module || '',
          level: l.level || 'info'
        })),
        alerts: alertRules.map(r => ({
          id: r.id,
          name: r.name,
          metric: r.metric,
          threshold: r.threshold,
          deviceId: r.device_id,
          enabled: r.enabled
        })),
        topology: topologyNodes
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 告警规则查询 =====
async function getAlertRules() {
  try {
    const pool = dbService.getPool ? dbService.getPool() : null;
    if (!pool) return [];
    const [rows] = await pool.query(
      'SELECT id, name, metric, threshold, device_id, enabled FROM alert_rules ORDER BY id DESC'
    );
    return rows || [];
  } catch { return []; }
}

// ===== 拓扑节点聚合 =====
async function getTopologyNodes() {
  try {
    // 已管理设备节点（去重：deviceId 优先保留 agent 版本，排除 dev_local）
    const allDevices = await deviceService.list({ pageSize: 100 }).catch(() => ({ devices: [] }));
    const seen = new Set();
    const managed = [];
    for (const d of (allDevices.devices || [])) {
      if (d.deviceId === 'dev_local') continue;
      const key = d.ip || d.hostname;
      if (seen.has(key)) continue;
      seen.add(key);
      managed.push({
        id: d.deviceId || d.id,
        label: d.hostname || d.name || d.ip || '?',
        ip: d.ip,
        type: guessType(d),
        online: d.status === 'online' || d.online === true,
        cpu: d.cpu || 0,
        memory: d.memory || 0,
        managed: true
      });
    }

    // 从发现引擎取最近扫描结果
    const discovered = [];
    try {
      const scans = discoveryService.activeScans;
      if (scans && scans.size > 0) {
        for (const [_, scan] of scans) {
          if (scan.devices && Array.isArray(scan.devices)) {
            for (const d of scan.devices) {
              if (!managed.find(m => m.ip === d.ip)) {
                discovered.push({
                  id: d.ip,
                  label: d.hostname || d.ip,
                  ip: d.ip,
                  type: d.type || 'unknown',
                  online: false,
                  managed: false,
                  mac: d.mac,
                  vendor: d.vendor
                });
              }
            }
          }
        }
      }
    } catch (_) {}

    // Links: 假设所有设备都连到路由器(iStoreOS)
    const router = managed.find(d => d.type === 'router') || managed[0];
    const links = [];
    if (router) {
      for (const d of managed) {
        if (d.id !== router.id) {
          links.push({ source: router.id, target: d.id, rx: d.net_rx || 0, tx: d.net_tx || 0 });
        }
      }
    }

    return { managed, discovered, links, routerId: router ? router.id : null };
  } catch { return { managed: [], discovered: [], links: [], routerId: null }; }
}

function guessType(d) {
  const name = (d.hostname || d.name || '').toLowerCase();
  if (name.includes('istore') || name.includes('router') || name.includes('openwrt')) return 'router';
  if (name.includes('nas') || name.includes('synology') || name.includes('iosun')) return 'nas';
  if (name.includes('mac') || name.includes('macbook') || name.includes('chende')) return 'desktop';
  if (name.includes('pi') || name.includes('raspberry')) return 'iot';
  return 'server';
}

// GET /api/v2/dashboard/recent-alerts — 最近告警（实时评估）
router.get('/recent-alerts', async (req, res) => {
  try {
    const [rules, allDevices] = await Promise.all([
      getAlertRules(),
      deviceService.list({ pageSize: 100 }).catch(() => ({ devices: [] }))
    ]);
    const devices = allDevices.devices || [];
    const triggered = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;
      const targetDevices = rule.device_id
        ? devices.filter(d => d.id === rule.device_id || d.deviceId === rule.device_id)
        : devices.filter(d => d.status === 'online' || d.online === true);

      for (const dev of targetDevices) {
        let currentVal = 0;
        if (rule.metric === 'cpu') currentVal = parseFloat(dev.cpu) || 0;
        else if (rule.metric === 'memory_pct') currentVal = parseFloat(dev.memory) || 0;
        else if (rule.metric === 'disk_pct') currentVal = parseFloat(dev.disk) || 0;
        // No net_rx in device list, skip network for now

        if (currentVal > (rule.threshold || 90)) {
          triggered.push({
            rule_name: rule.name,
            device_name: dev.name || dev.hostname || dev.id,
            device_id: dev.id || dev.deviceId,
            metric: rule.metric,
            value: currentVal,
            threshold: rule.threshold,
            level: currentVal > (rule.threshold * 1.1) ? 'danger' : 'warning'
          });
        }
      }
    }

    res.json({ success: true, data: triggered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
