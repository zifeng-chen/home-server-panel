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
}

export interface DeviceDetail extends Device {
  updated_at: string
  metrics: Metric[]
  commands: Command[]
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

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
  const stats = ref<DeviceStats>({ online: 0, offline: 0, total: 0 })
  const loading = ref(false)
  const currentDevice = ref<DeviceDetail | null>(null)
  const detailLoading = ref(false)

  async function load() {
    loading.value = true
    try {
      const res = await api.get('/v2/device') as any
      if (res.success) {
        devices.value = res.data.devices || []
        // also update stats
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

  return { devices, stats, loading, currentDevice, detailLoading, load, loadStats, loadDetail, sendCommand }
})
