<template>
  <div class="dashboard">
    <!-- ===== Row 1: Stats Cards (new) ===== -->
    <section class="stats-row">
      <div class="stat-card glass" v-for="card in statCards" :key="card.key"
        :class="card.key" @click="card.link && $router.push(card.link)">
        <div class="stat-icon">{{ card.icon }}</div>
        <div class="stat-body">
          <span class="stat-val" :class="{ pulse: card.pulse }">{{ card.value }}</span>
          <span class="stat-label">{{ card.label }}</span>
        </div>
        <div class="stat-bg" :style="{ background: card.color }"></div>
      </div>
    </section>

    <!-- ===== Row 2: System Overview + Operation Log (original) ===== -->
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

    <!-- ===== Row 3: Service Overview (original) ===== -->
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

    <!-- ===== Row 4: Topology | Resource (new) ===== -->
    <section class="row-dual">
      <div class="panel glass topology-panel">
        <h3 class="panel-title"><span class="dot" style="background:#22c55e"></span> 网络拓扑</h3>
        <div class="topo-svg-wrap">
          <svg :viewBox="`0 0 ${topoBox.w} ${topoBox.h}`" class="topo-svg">
            <line v-for="(l,i) in topoLinks" :key="'l'+i"
              :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
              :stroke="l.active ? '#4F7CFF33' : '#ffffff0d'"
              :stroke-width="l.width" stroke-linecap="round" />
            <circle v-for="(p,i) in particles" :key="'p'+i"
              :cx="p.x" :cy="p.y" r="2.5" :fill="p.color" opacity="0.8" />
            <g v-for="n in topoNodes" :key="n.id" :transform="`translate(${n.x},${n.y})`">
              <circle v-if="n.online" r="28" fill="none" :stroke="n.color" stroke-width="1" opacity="0.2">
                <animate attributeName="r" from="28" to="38" dur="2s" repeatCount="indefinite"/>
                <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite"/>
              </circle>
              <circle r="22" :fill="n.color + '1a'" :stroke="n.color" stroke-width="2"/>
              <text y="-26" text-anchor="middle" font-size="11" fill="var(--text-secondary)">{{ n.label }}</text>
              <text y="5" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">{{ n.ip }}</text>
              <text y="18" text-anchor="middle" font-size="18">{{ n.emoji }}</text>
            </g>
          </svg>
        </div>
        <div class="topo-legend">
          <span><span class="dot" style="background:#22c55e"></span>在线</span>
          <span><span class="dot" style="background:#4F7CFF"></span>数据流</span>
        </div>
      </div>

      <div class="panel glass resource-panel">
        <h3 class="panel-title"><span class="dot" style="background:#4F7CFF"></span> 资源总览</h3>
        <div class="resource-metrics">
          <div class="rm-item" v-for="m in resourceMetrics" :key="m.key">
            <div class="rm-header">
              <span class="rm-name">{{ m.name }}</span>
              <span class="rm-val">{{ m.value }}<small>{{ m.unit }}</small></span>
            </div>
            <canvas :ref="el => setCanvasRef(m.key, el)" :width="m.w" :height="m.h" class="rm-chart"></canvas>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== Row 5: Timeline (new) ===== -->
    <section class="panel glass timeline-panel">
      <h3 class="panel-title"><span class="dot" style="background:#F59E0B"></span> 事件时间线</h3>
      <div class="timeline" v-if="timelineItems.length">
        <div class="tl-item" v-for="(item, i) in timelineItems" :key="i" :class="item.type">
          <div class="tl-dot" :style="{ background: item.color }"></div>
          <div class="tl-time">{{ item.time }}</div>
          <div class="tl-body">
            <span class="tl-icon">{{ item.icon }}</span>
            <span class="tl-msg">{{ item.message }}</span>
          </div>
        </div>
      </div>
      <div v-else class="panel-empty">暂无事件</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSystemStore } from '../stores/system'
import api from '../api'
import nginxPng from '../assets/nginx.png'
import mysqlPng from '../assets/mysql.png'
import dockerPng from '../assets/docker.png'
import sshPng from '../assets/ssh.png'
import pm2Png from '../assets/pm2.png'
import pm2DarkPng from '../assets/pm2-dark.png'
import acmePng from '../assets/acme.png'

const router = useRouter()
const sys = useSystemStore()

// ===== Original: System Info =====
const publicIp = computed(() => {
  const ips = sys.sysInfo?.ips || []
  const pub = ips.filter((ip: string) => !/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(ip))
  return pub.length ? pub.join(', ') : '--'
})

// ===== Original: Operation Logs =====
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

// ===== Original: Services =====
const isDark = ref(false)
function updateTheme() {
  const root = document.documentElement
  isDark.value = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
}
const services = ref([
  { name: 'Nginx',    online: false, icon: nginxPng, color: '#4F7CFF' },
  { name: 'MySQL',    online: false, icon: mysqlPng, color: '#FF9A3D' },
  { name: 'Docker',   online: false, icon: dockerPng, color: '#15C39A' },
  { name: 'SSH',      online: false, icon: sshPng, color: '#A78BFA' },
  { name: 'PM2',      online: false, icon: pm2Png, color: '#F59E0B' },
  { name: 'acme.sh',  online: false, icon: acmePng, color: '#EC4899' },
])
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
      try {
        const dbRes = await api.get('/db/status') as any
        svcMap['mysql'] = dbRes?.data?.connected === true
      } catch {}
      if (!svcMap['pm2'] && res.data?.pm2?.length === 0) {
        try { const pm2Res = await api.get('/process/pm2/status') as any; svcMap['pm2'] = pm2Res?.data?.running === true } catch {}
      }
      services.value.forEach(s => { s.online = svcMap[s.name.toLowerCase()] ?? false })
    }
  } catch {}
}

function fmtUptime(s: number) {
  if (!s || s < 0) return '--'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return (d ? d + '天 ' : '') + h + '时' + m + '分' + sec + '秒'
}

// ===== New: Stats Cards =====
const statCards = ref([
  { key: 'devices', icon: '🖥️', value: '--', label: '在线设备', link: '/devices', color: '#4F7CFF', pulse: false },
  { key: 'alerts',  icon: '⚠️', value: '--', label: '活跃告警', link: '/devices', color: '#F59E0B', pulse: false },
  { key: 'uptime',  icon: '⏱️', value: '--', label: '运行时长', link: '', color: '#10B981', pulse: false },
  { key: 'network', icon: '🌐', value: '--', label: '总流量(h)', link: '', color: '#A78BFA', pulse: false },
])

// ===== New: Topology =====
const topoBox = ref({ w: 600, h: 280 })
const topoNodes = ref<any[]>([])
const topoLinks = ref<any[]>([])
const particles = ref<any[]>([])
let particleTimer: any = null

const defaultTopo = {
  nodes: [
    { id: 'gw', label: 'iStoreOS', ip: '192.168.100.1', type: 'router', emoji: '📡', color: '#F59E0B', online: true },
    { id: 'nas', label: 'iOSun', ip: '192.168.100.110', type: 'nas', emoji: '💾', color: '#8B5CF6', online: true },
    { id: 'mac', label: 'MacBook', ip: '192.168.100.145', type: 'desktop', emoji: '💻', color: '#4F7CFF', online: true },
  ],
  links: [
    { source: 'gw', target: 'nas', active: true },
    { source: 'gw', target: 'mac', active: true },
  ]
}

function layoutTopology(nodes: any[], links: any[], width: number, height: number) {
  const centerX = width / 2, centerY = height / 2
  const router = nodes.find((n: any) => n.type === 'router') || nodes[0]
  const others = nodes.filter((n: any) => n.id !== router.id)
  const positionedNodes: any[] = [{ ...router, x: centerX, y: centerY, online: router.online !== false }]
  const ringR = Math.min(width, height) * 0.32
  others.forEach((n: any, i: number) => {
    const angle = -Math.PI / 2 + (i / Math.max(others.length, 1)) * 2 * Math.PI
    positionedNodes.push({ ...n, x: centerX + ringR * Math.cos(angle), y: centerY + ringR * Math.sin(angle), online: n.online !== false })
  })
  const positionedLinks = links.map((l: any) => {
    const src = positionedNodes.find((n: any) => n.id === l.source)
    const tgt = positionedNodes.find((n: any) => n.id === l.target)
    const active = l.active !== false && src?.online && tgt?.online
    return { ...l, x1: src?.x || 0, y1: src?.y || 0, x2: tgt?.x || 0, y2: tgt?.y || 0, active, width: active ? 2.5 : 1 }
  })
  return { nodes: positionedNodes, links: positionedLinks }
}

function animateParticles(links: any[]) {
  if (particleTimer) clearInterval(particleTimer)
  const activeLinks = links.filter((l: any) => l.active)
  if (activeLinks.length === 0) { particles.value = []; return }
  let t = 0
  particleTimer = setInterval(() => {
    t += 0.03
    particles.value = activeLinks.map((l: any, i: number) => {
      const phase = (t + i * 0.7) % 1
      return { x: l.x1 + (l.x2 - l.x1) * phase, y: l.y1 + (l.y2 - l.y1) * phase, color: '#4F7CFF' }
    })
  }, 50)
}

// ===== New: Resource Charts =====
const resourceMetrics = ref([
  { key: 'cpu', name: 'CPU', value: '--', unit: '%', w: 280, h: 76 },
  { key: 'memory', name: '内存', value: '--', unit: '%', w: 280, h: 76 },
  { key: 'disk', name: '磁盘', value: '--', unit: '%', w: 280, h: 76 },
  { key: 'network', name: '网络', value: '--', unit: ' KB/s', w: 280, h: 76 },
])
const canvasRefs: Record<string, HTMLCanvasElement> = {}
function setCanvasRef(key: string, el: any) { if (el) canvasRefs[key] = el }

function drawMiniChart(canvas: HTMLCanvasElement, data: number[], color: string, maxVal: number) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height, pad = 4
  ctx.clearRect(0, 0, w, h)
  const plotW = w - pad * 2, plotH = h - pad * 2
  const peak = maxVal || Math.max(...data, 1)

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, color + '40')
  grad.addColorStop(1, color + '05')

  ctx.beginPath()
  ctx.moveTo(pad, h - pad)
  data.forEach((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * plotW
    const y = h - pad - (v / peak) * plotH
    ctx.lineTo(x, y)
  })
  ctx.lineTo(pad + plotW, h - pad)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  data.forEach((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * plotW
    const y = h - pad - (v / peak) * plotH
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.stroke()

  if (data.length) {
    const lastX = pad + ((data.length - 1) / Math.max(data.length - 1, 1)) * plotW
    const lastY = h - pad - (data[data.length - 1] / peak) * plotH
    ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  }
}

// ===== New: Timeline =====
const timelineItems = ref<any[]>([])
function mergeTimeline(logEntries: any[], alerts: any[], devices: any[]) {
  const items: any[] = []
  for (const l of (logEntries || []).slice(0, 12)) {
    const t = l.time || ''
    items.push({ time: t.match(/\d{2}:\d{2}:\d{2}/)?.[0] || t.slice(-8) || '', message: l.message || '', type: 'log', icon: '📋', color: '#6B7280', sortTime: l.time || '' })
  }
  for (const d of (devices || [])) {
    if (d.online) items.push({ time: '最近', message: `${d.name || d.hostname} 在线`, type: 'device', icon: '🟢', color: '#22C55E', sortTime: d.lastSeen || '' })
  }
  for (const a of (alerts || [])) {
    if (a.enabled) items.push({ time: '监控中', message: `告警: ${a.name} (${a.metric} > ${a.threshold}%)`, type: 'alert', icon: '⚠️', color: '#F59E0B', sortTime: '' })
  }
  items.sort((a: any, b: any) => b.sortTime.localeCompare(a.sortTime))
  return items.slice(0, 15)
}

// ===== New: Cockpit Data =====
async function fetchOverview() {
  try {
    const res = await api.get('/v2/dashboard/overview') as any
    if (!res.success) return
    const d = res.data

    statCards.value[0].value = `${d.stats?.onlineDevices || 0} / ${d.stats?.totalDevices || 0}`
    statCards.value[1].value = d.stats?.activeAlerts || 0
    statCards.value[1].pulse = (d.stats?.activeAlerts || 0) > 0

    // Topology
    const topoData = d.topology || {}
    const managedNodes = (topoData.managed || []).map((n: any) => ({
      id: n.id, label: n.label, ip: n.ip, type: n.type || 'server',
      emoji: typeEmoji(n.type), color: typeColor(n.type), online: n.online !== false
    }))
    const topoLinks = (topoData.links || []).map((l: any) => ({
      source: l.source, target: l.target, active: l.rx > 0 || l.tx > 0
    }))
    const { nodes, links } = layoutTopology(
      managedNodes.length ? managedNodes : defaultTopo.nodes,
      topoLinks.length ? topoLinks : defaultTopo.links,
      topoBox.value.w, topoBox.value.h
    )
    topoNodes.value = nodes
    topoLinks.value = links
    animateParticles(links)

    // Resources
    const allDevices = d.devices || []
    const cpuData = allDevices.filter((dev: any) => dev.cpu != null).map((dev: any) => dev.cpu)
    const memData = allDevices.filter((dev: any) => dev.memory != null).map((dev: any) => dev.memory)
    const diskData = allDevices.filter((dev: any) => dev.disk != null).map((dev: any) => dev.disk)
    const netData = allDevices.filter((dev: any) => dev.net_rx != null).map((dev: any) => dev.net_rx)
    const avg = (arr: number[]) => arr.length ? (arr.reduce((a: number,b: number) => a+b,0)/arr.length).toFixed(1) : '--'
    resourceMetrics.value[0].value = avg(cpuData)
    resourceMetrics.value[1].value = avg(memData)
    resourceMetrics.value[2].value = avg(diskData)
    resourceMetrics.value[3].value = netData.length ? (netData.reduce((a: number,b: number) => a+b,0)/1024).toFixed(0) : '--'

    // Total traffic for stats card
    if (netData.length) statCards.value[3].value = (netData.reduce((a: number,b: number) => a+b,0)/1024).toFixed(0) + ' KB/s'

    await nextTick()
    drawMiniChart(canvasRefs['cpu'], cpuData.length > 1 ? cpuData : [30,45,38,52,41,48], '#4F7CFF', 100)
    drawMiniChart(canvasRefs['memory'], memData.length > 1 ? memData : [55,60,58,62,59,61], '#A78BFA', 100)
    drawMiniChart(canvasRefs['disk'], diskData.length > 1 ? diskData : [28,29,30,31,30,32], '#F59E0B', 100)
    drawMiniChart(canvasRefs['network'], netData.length > 1 ? netData.map((v: number) => v/1024) : [120,450,280,600,350,520], '#22C55E', 1000)

    timelineItems.value = mergeTimeline(d.logs || [], d.alerts || [], allDevices)
  } catch (e) {
    console.error('[Dashboard] fetchOverview:', e)
  }
}

let uptimeTimer: any = null
async function fetchUptime() {
  try {
    const res = await api.get('/system/uptime') as any
    if (res.success) {
      const s = res.data.uptime || 0
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
      statCards.value[2].value = d ? `${d}d ${h}h` : `${h}h ${m}m`
    }
  } catch {}
}

function typeEmoji(t: string) {
  const m: Record<string, string> = { router:'📡', nas:'💾', desktop:'💻', server:'🖥️', iot:'🔌', phone:'📱', unknown:'❓' }
  return m[t] || '🖥️'
}
function typeColor(t: string) {
  const m: Record<string, string> = { router:'#F59E0B', nas:'#8B5CF6', desktop:'#4F7CFF', server:'#3B82F6', iot:'#EC4899', unknown:'#6B7280' }
  return m[t] || '#6B7280'
}

// ===== Lifecycle =====
onMounted(async () => {
  updateTheme()
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  await Promise.all([fetchLogs(), fetchServices(), fetchOverview(), fetchUptime()])
  uptimeTimer = setInterval(fetchUptime, 10000)
})

onUnmounted(() => {
  if (particleTimer) clearInterval(particleTimer)
  if (uptimeTimer) clearInterval(uptimeTimer)
})
</script>

<style scoped>
/* ===== Layout ===== */
.dashboard { display: flex; flex-direction: column; gap: 20px; max-width: 1400px; margin: 0 auto; padding: 20px 24px; }

/* ===== Original Cards ===== */
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

/* ===== Services ===== */
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.service-item {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; border-radius: var(--radius-md);
  background: var(--bg-base); border: 1px solid var(--border-color);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.service-item.online { border-color: transparent; }
.service-item:hover { box-shadow: var(--shadow-md); }
.s-icon-wrap {
  width: 48px; height: 48px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background var(--dur-fast); padding: 8px;
}
.s-icon-img { width: 32px; height: 32px; object-fit: contain; }
.s-info { display: flex; flex-direction: column; gap: 2px; }
.s-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.s-status { font-size: 12px; font-weight: 500; }

/* ===== Glass Panel ===== */
.glass {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
.panel { padding: 20px 24px; }
.panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.panel-empty { color: var(--text-tertiary); font-size: 13px; text-align: center; padding: 24px 0; }

/* ===== Stats Row ===== */
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card {
  position: relative; display: flex; align-items: center; gap: 16px;
  padding: 20px 24px; cursor: pointer; overflow: hidden;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-bg { position: absolute; top: -30%; right: -20%; width: 120px; height: 120px; border-radius: 50%; opacity: 0.08; pointer-events: none; }
.stat-icon { font-size: 28px; flex-shrink: 0; position: relative; z-index: 1; }
.stat-body { position: relative; z-index: 1; display: flex; flex-direction: column; }
.stat-val { font-size: 28px; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.stat-label { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.stat-val.pulse { animation: pulse-glow 2s infinite; }
@keyframes pulse-glow { 0%,100% { text-shadow: 0 0 0 transparent; } 50% { text-shadow: 0 0 12px #F59E0Baa; } }

/* ===== Row Dual ===== */
.row-dual { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* ===== Topology ===== */
.topo-svg-wrap { overflow: hidden; }
.topo-svg { width: 100%; height: 260px; display: block; }
.topo-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: var(--text-tertiary); }
.topo-legend span { display: flex; align-items: center; gap: 4px; }

/* ===== Resource ===== */
.resource-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rm-item { padding: 6px; }
.rm-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.rm-name { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px; }
.rm-val { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.rm-val small { font-size: 10px; font-weight: 400; color: var(--text-tertiary); margin-left: 2px; }
.rm-chart { width: 100%; height: 70px; display: block; }

/* ===== Timeline ===== */
.timeline { position: relative; padding-left: 2px; max-height: 280px; overflow-y: auto; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 4px; bottom: 4px; width: 1px; background: var(--border-color); }
.tl-item { position: relative; display: flex; align-items: baseline; gap: 12px; padding: 6px 0 6px 20px; font-size: 12px; }
.tl-dot { position: absolute; left: 3px; top: 10px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--bg-glass); z-index: 1; }
.tl-time { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 11px; min-width: 56px; flex-shrink: 0; }
.tl-body { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.tl-icon { font-size: 12px; flex-shrink: 0; }
.tl-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-item.alert .tl-msg { color: #F59E0B; font-weight: 500; }
.tl-item.device .tl-msg { color: #22C55E; }

/* ===== Responsive ===== */
@media (max-width: 1100px) { .stats-row { grid-template-columns: repeat(2, 1fr); } .row-dual { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .row-top { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .dashboard { padding: 12px; } .stats-row { grid-template-columns: 1fr; } .resource-metrics { grid-template-columns: 1fr; } }
</style>
