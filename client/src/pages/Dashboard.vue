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

    <!-- 资源监控 (圆环) -->
    <div class="row-monitor">
      <div class="card ring-card" v-for="ring in rings" :key="ring.key">
        <canvas :ref="el => ringRefs[ring.key] = el" width="140" height="140" class="ring-canvas"></canvas>
        <span class="ring-label">{{ ring.label() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSystemStore } from '../stores/system'
import api from '../api'

const sys = useSystemStore()
const { t } = useI18n()

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
    if (res.success && res.data?.records) {
      logs.value = res.data.records.map((r: any) => ({
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
      const svcMap: Record<string, boolean> = {}
      for (const cat of ['pm2', 'docker', 'system'] as const) {
        for (const p of res.data[cat] || []) {
          if (p.name) svcMap[p.name.toLowerCase()] = p.status === 'running'
        }
      }
      services.value.forEach(s => {
        s.online = svcMap[s.name.toLowerCase()] ?? false
      })
    }
  } catch { /* ignore */ }
}

// 资源环
const ringRefs = ref<Record<string, any>>({})
const rings = [
  { key: 'cpu',  label: () => t('dashboard.cpu'),  getVal: () => sys.cpu },
  { key: 'mem',  label: () => t('dashboard.memory'),  getVal: () => sys.memPct },
  { key: 'netD', label: () => t('dashboard.networkDown'), getVal: () => Math.min(sys.netDown / 1048576 * 100, 100) },
  { key: 'netU', label: () => t('dashboard.networkUp'), getVal: () => Math.min(sys.netUp   / 1048576 * 100, 100) },
]
let ringTimer: ReturnType<typeof setInterval> | null = null

function drawRings() {
  rings.forEach(r => {
    const c = ringRefs.value[r.key]
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = c.width, h = c.height
    const cx = w / 2, cy = h / 2, rOuter = 55, rInner = 40
    ctx.clearRect(0, 0, w, h)
    // bg ring
    ctx.beginPath()
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2)
    ctx.arc(cx, cy, rInner, Math.PI * 2, 0, true)
    const isDark = document.documentElement.classList.contains('dark'); ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
    ctx.fill()
    // value ring
    const pct = Math.min(r.getVal(), 100) / 100
    ctx.beginPath()
    ctx.arc(cx, cy, rOuter, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
    ctx.arc(cx, cy, rInner, -Math.PI / 2 + Math.PI * 2 * pct, -Math.PI / 2, true)
    ctx.fillStyle = 'var(--accent)'
    ctx.fill()
    // center text (use CSS variable for dark/light mode compatibility)
    ctx.fillStyle = getComputedStyle(c).color || '#1d1d1f'
    ctx.font = 'bold 22px ' + getComputedStyle(c).fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(r.getVal().toFixed(0) + '%', cx, cy)
  })
}

function fmtUptime(s: number) {
  if (!s || s < 0) return '--'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return (d ? d + '天 ' : '') + h + '时' + m + '分'
}

onMounted(async () => {
  await Promise.all([fetchLogs(), fetchServices()])
  await nextTick()
  drawRings()
  ringTimer = setInterval(drawRings, 5000)
})

onUnmounted(() => {
  if (ringTimer) clearInterval(ringTimer)
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
.row-monitor { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.ring-card { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ring-canvas { width: 140px; height: 140px; }
.ring-label { font-size: 12px; color: var(--text-tertiary); }

@media (max-width: 900px) { .row-top { grid-template-columns: 1fr; } .row-monitor { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .row-monitor { grid-template-columns: 1fr 1fr; } }
</style>
