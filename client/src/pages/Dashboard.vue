<template>
  <div class="dashboard">
    <!-- 系统概览 + 操作日志 (并排) -->
    <div class="row-top">
      <div class="card overview">
        <h3 class="card-title">{{ $t('dashboard.systemOverview') }}</h3>
        <div class="kv-list" v-if="sys.sysInfo">
          <div class="kv"><span class="k">{{ $t('dashboard.hostname') }}</span><span class="v">{{ sys.sysInfo.hostname }}</span></div>
          <div class="kv"><span class="k">{{ $t('dashboard.system') }}</span><span class="v">{{ sys.sysInfo.os }}</span></div>
          <div class="kv"><span class="k">{{ $t('dashboard.kernel') }}</span><span class="v">{{ sys.sysInfo.kernel }}</span></div>
          <div class="kv"><span class="k">{{ $t('dashboard.ip') }}</span><span class="v">{{ publicIp }}</span></div>
          <div class="kv"><span class="k">{{ $t('dashboard.uptime') }}</span><span class="v">{{ fmtUptime(sys.uptime) }}</span></div>
        </div>
      </div>
      <div class="card logs">
        <h3 class="card-title">{{ $t('dashboard.operationLog') }}</h3>
        <div class="log-list" v-if="logs.length">
          <div class="log-item" v-for="(l,i) in logs" :key="i">
            <span class="log-time">{{ l.time }}</span>
            <span class="log-msg">{{ l.message }}</span>
          </div>
        </div>
        <div v-else class="empty">{{ $t('dashboard.noLogs') }}</div>
      </div>
    </div>

    <!-- 服务概览 (全宽) -->
    <div class="card services">
      <h3 class="card-title">{{ $t('dashboard.serviceOverview') }}</h3>
      <div class="service-grid">
        <div class="service-item" v-for="s in services" :key="s.name">
          <div class="s-dot" :style="{ background: s.online ? 'var(--accent-green)' : 'var(--text-tertiary)' }"></div>
          <span class="s-name">{{ s.name }}</span>
          <el-tag :type="s.online ? 'success' : 'info'" size="small" effect="plain">{{ s.online ? $t('dashboard.running') : $t('dashboard.stopped') }}</el-tag>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSystemStore } from '../stores/system'
import api from '../api'

const sys = useSystemStore()

// 公网IP
const publicIp = computed(() => {
  const ips = sys.sysInfo?.ips || []
  const pub = ips.filter((ip: string) => !/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(ip))
  return pub.length ? pub.join(', ') : '--'
})

// 操作日志
const logs = ref<{ time: string; message: string }[]>([])
async function fetchLogs() {
  try {
    const res = await api.get('/log', { params: { page: 1, limit: 8 } }) as any
    if (res.success && res.data?.list) {
      logs.value = res.data.list.map((r: any) => ({
        time: r.timeCst?.match(/\d{2}:\d{2}/)?.[0] || '--:--',
        message: r.message || r.action || ''
      }))
    }
  } catch { /* ignore */ }
}

// 服务状态
const services = ref([
  { name: 'Nginx',    online: false },
  { name: 'MySQL',    online: false },
  { name: 'Docker',   online: false },
  { name: 'SSH',      online: false },
  { name: 'PM2',      online: false },
  { name: 'acme.sh',  online: false },
])
async function fetchServices() {
  try {
    const res = await api.get('/process') as any
    if (res.success && res.data) {
      const isOnline = (p: any) => p.status === 'running' || p.status === 'online' || p.status === 'active' || p.active === true
      const svcMap: Record<string, boolean> = {}
      for (const cat of ['pm2', 'docker', 'system'] as const) {
        for (const p of res.data[cat] || []) {
          if (p.name) svcMap[p.name.toLowerCase()] = isOnline(p)
        }
      }
      // MySQL: check via db status API
      try {
        const dbRes = await api.get('/db/status') as any
        svcMap['mysql'] = dbRes?.data?.connected === true
      } catch {}
      // PM2 daemon: check if pm2 jlist returned any processes
      if (!svcMap['pm2'] && res.data?.pm2?.length === 0) {
        try { const pm2Res = await api.get('/process/pm2/status') as any; svcMap['pm2'] = pm2Res?.data?.running === true } catch {}
      }
      services.value.forEach(s => {
        s.online = svcMap[s.name.toLowerCase()] ?? false
      })
    }
  } catch { /* ignore */ }
}

function fmtUptime(s: number) {
  if (!s || s < 0) return '--'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return (d ? d + '天 ' : '') + h + '时' + m + '分' + sec + '秒'
}

onMounted(async () => {
  await Promise.all([fetchLogs(), fetchServices()])
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}
.card-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; }
.row-top { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.kv-list { display: flex; flex-direction: column; gap: 8px; }
.kv { display: flex; justify-content: space-between; font-size: 13px; }
.kv .k { color: var(--text-tertiary); }
.kv .v { color: var(--text-primary); font-weight: 500; }
.log-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.log-item { display: flex; gap: 10px; font-size: 12px; }
.log-time { color: var(--text-tertiary); font-family: var(--font-mono); flex-shrink: 0; }
.log-msg { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: var(--text-tertiary); font-size: 13px; text-align: center; padding: 24px 0; }
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.service-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--bg-base); font-size: 13px; }
.s-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.s-name { flex: 1; color: var(--text-primary); }
@media (max-width: 900px) { .row-top { grid-template-columns: 1fr; } }
</style>
