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
        <div class="service-item" v-for="s in servicesDisplay" :key="s.name" :class="{ online: s.online }">
          <div class="s-icon-wrap" :style="{ background: s.online ? s.color + '18' : 'var(--bg-base)' }">
            <img :src="s.icon" :alt="s.name" class="s-icon-img" />
          </div>
          <div class="s-info">
            <span class="s-name">{{ s.name }}</span>
            <span class="s-status" :style="{ color: s.online ? s.color : 'var(--text-tertiary)' }">{{ s.online ? $t('dashboard.running') : $t('dashboard.stopped') }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSystemStore } from '../stores/system'
import api from '../api'
import nginxPng from '../assets/nginx.png'
import mysqlPng from '../assets/mysql.png'
import dockerPng from '../assets/docker.png'
import sshPng from '../assets/ssh.png'
import pm2Png from '../assets/pm2.png'
import pm2DarkPng from '../assets/pm2-dark.png'
import acmePng from '../assets/acme.png'

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

// 图标：白天用浅色版，暗黑用深色版
const isDark = ref(false)
function updateTheme() {
  const root = document.documentElement
  isDark.value = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
}

// 服务状态
const services = ref([
  { name: 'Nginx',    online: false, icon: nginxPng, color: '#4F7CFF' },
  { name: 'MySQL',    online: false, icon: mysqlPng, color: '#FF9A3D' },
  { name: 'Docker',   online: false, icon: dockerPng, color: '#15C39A' },
  { name: 'SSH',      online: false, icon: sshPng, color: '#A78BFA' },
  { name: 'PM2',      online: false, icon: pm2Png, color: '#F59E0B' },
  { name: 'acme.sh',  online: false, icon: acmePng, color: '#EC4899' },
])

// 暗色模式下 PM2 换成深色图标
const servicesDisplay = computed(() =>
  services.value.map(s => ({
    ...s,
    icon: s.name === 'PM2' && isDark.value ? pm2DarkPng : s.icon
  }))
)
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
  updateTheme()
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
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
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.service-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.service-item.online { border-color: transparent; }
.service-item:hover { box-shadow: var(--shadow-md); }
.s-icon-wrap {
  width: 48px; height: 48px;
  border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background var(--dur-fast);
  padding: 8px;
}
.s-icon-img {
  width: 32px; height: 32px;
  object-fit: contain;
}
.s-info { display: flex; flex-direction: column; gap: 2px; }
.s-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.s-status { font-size: 12px; font-weight: 500; }
@media (max-width: 900px) { .row-top { grid-template-columns: 1fr; } }
</style>
