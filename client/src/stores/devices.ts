import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface Device {
  id: string
  name: string
  hostname: string
  ip: string
  os: string
  arch: string
  version: string
  status: 'online' | 'offline'
  last_seen: string
  created_at: string
  tags?: string
}

export interface DeviceDetail extends Device {
  updated_at: string
  metrics: Metric[]
  commands: Command[]
  tags?: string
}

export interface Metric {
  cpu: number
  memory_pct: number
  disk_pct: number
  net_rx: number
  net_tx: number
  uptime: number
  collected_at: string
}

export interface Command {
  id: number
  command: string
  status: 'pending' | 'running' | 'success' | 'failed'
  result: string | null
  exit_code: number | null
  created_at: string
  executed_at: string | null
}

export interface DeviceStats {
  online: number
  offline: number
  total: number
}

export interface AlertRule {
  id: number
  name: string
  metric: string
  threshold: number
  device_id: string
  enabled: number
  created_at: string
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
  const stats = ref<DeviceStats>({ online: 0, offline: 0, total: 0 })
  const loading = ref(false)
  const currentDevice = ref<DeviceDetail | null>(null)
  const detailLoading = ref(false)
  const alertRules = ref<AlertRule[]>([])
  const alertLoading = ref(false)

  async function load() {
    loading.value = true
    try {
      const res = await api.get('/v2/device') as any
      if (res.success) {
        devices.value = res.data.devices || []
        const statsRes = await api.get('/v2/device/stats') as any
        if (statsRes.success) stats.value = statsRes.data
      }
    } catch { /* ignore */ }
    finally { loading.value = false }
  }

  async function loadStats() {
    try {
      const res = await api.get('/v2/device/stats') as any
      if (res.success) stats.value = res.data
    } catch { /* ignore */ }
  }

  async function loadDetail(deviceId: string) {
    detailLoading.value = true
    try {
      const res = await api.get(`/v2/device/${deviceId}`) as any
      if (res.success) currentDevice.value = res.data
    } catch { /* ignore */ }
    finally { detailLoading.value = false }
  }

  async function sendCommand(deviceId: string, command: string) {
    const res = await api.post('/v2/device/command', { deviceId, command }) as any
    if (!res.success) throw new Error(res.message || 'Failed')
    return res.data
  }

  async function deleteDevice(id: string) {
    const res = await api.delete(`/v2/device/${id}`) as any
    if (!res.success) throw new Error(res.message || 'Failed')
    devices.value = devices.value.filter(d => d.id !== id)
  }

  // --- alert rules ---
  async function loadAlertRules() {
    alertLoading.value = true
    try {
      const res = await api.get('/v2/alert/rules') as any
      if (res.success) alertRules.value = res.data || []
    } catch { /* ignore */ }
    finally { alertLoading.value = false }
  }

  async function createAlertRule(data: any) {
    const res = await api.post('/v2/alert/rule', data) as any
    if (!res.success) throw new Error(res.message || 'Failed')
  }

  async function updateAlertRule(id: number, data: any) {
    const res = await api.put(`/v2/alert/rule/${id}`, data) as any
    if (!res.success) throw new Error(res.message || 'Failed')
  }

  async function deleteAlertRule(id: number) {
    const res = await api.delete(`/v2/alert/rule/${id}`) as any
    if (!res.success) throw new Error(res.message || 'Failed')
    alertRules.value = alertRules.value.filter(r => r.id !== id)
  }

  async function toggleAlertRule(id: number) {
    const res = await api.post(`/v2/alert/rule/${id}/toggle`) as any
    if (!res.success) throw new Error(res.message || 'Failed')
    const r = alertRules.value.find(r => r.id === id)
    if (r) r.enabled = r.enabled ? 0 : 1
  }

  // --- metric list ---
  async function loadMetricList() {
    const res = await api.get('/v2/alert/metrics') as any
    return res || { data: [] }
  }

  return { devices, stats, loading, currentDevice, detailLoading, alertRules, alertLoading,
    load, loadStats, loadDetail, sendCommand, deleteDevice,
    loadAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule, loadMetricList }
})
