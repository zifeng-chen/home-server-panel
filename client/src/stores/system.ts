import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useSystemStore = defineStore('system', () => {
  const cpu    = ref(0)
  const memPct = ref(0)
  const netDown = ref(0)  // bytes/s
  const netUp   = ref(0)
  const load   = ref<number[]>([0, 0, 0])
  const uptime = ref(0)
  const sysInfo = ref<any>(null)

  let timer: ReturnType<typeof setInterval> | null = null
  let uptimeTickTimer: ReturnType<typeof setInterval> | null = null

  async function fetchInfo() {
    try {
      const res = await api.get('/system/info') as any
      if (res.success) sysInfo.value = res.data
    } catch { /* ignore */ }
  }

  async function pollMonitor() {
    try {
      const res = await api.get('/monitor') as any
      if (!res.success) return
      const { live, history } = res.data
      cpu.value    = live.cpu || 0
      memPct.value = live.memory?.pct || 0
      load.value   = live.load || [0, 0, 0]
      uptime.value = live.uptime || 0
      const last = history?.network?.slice(-1)[0]
      if (last) {
        netDown.value = last.rxRate || 0
        netUp.value   = last.txRate || 0
      }
    } catch { /* ignore */ }
  }

  function startPolling(ms = 5000) {
    pollMonitor()
    timer = setInterval(pollMonitor, ms)
  }

  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }

  function startUptimeTicking() {
    if (uptimeTickTimer) return
    uptimeTickTimer = setInterval(() => { uptime.value++ }, 1000)
  }

  function stopUptimeTicking() {
    if (uptimeTickTimer) { clearInterval(uptimeTickTimer); uptimeTickTimer = null }
  }

  return { cpu, memPct, netDown, netUp, load, uptime, sysInfo, fetchInfo, pollMonitor, startPolling, stopPolling, startUptimeTicking, stopUptimeTicking }
})
