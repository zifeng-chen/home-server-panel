<template>
  <div class="cockpit">
    <!-- ===== Row 1: Stats Cards ===== -->
    <section class="stats-row">
      <div class="stat-card glass" v-for="card in statCards" :key="card.key" :class="card.key" @click="card.link && $router.push(card.link)">
        <div class="stat-icon">{{ card.icon }}</div>
        <div class="stat-body">
          <span class="stat-val" :class="{ pulse: card.pulse }">{{ card.value }}</span>
          <span class="stat-label">{{ card.label }}</span>
        </div>
        <div class="stat-bg" :style="{ background: card.color }"></div>
      </div>
    </section>

    <!-- ===== Row 2: Topology | Resource ===== -->
    <section class="row-dual">
      <!-- Network Topology (SVG) -->
      <div class="panel glass topology-panel">
        <h3 class="panel-title">
          <span class="dot" style="background:#22c55e"></span> 网络拓扑
        </h3>
        <div class="topo-svg-wrap" ref="topoRef">
          <svg :viewBox="`0 0 ${topoBox.w} ${topoBox.h}`" class="topo-svg">
            <!-- Links -->
            <line v-for="(l,i) in topoLinks" :key="'l'+i"
              :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
              :stroke="l.active ? '#4F7CFF33' : '#ffffff0d'"
              :stroke-width="l.width"
              stroke-linecap="round"
            />
            <!-- Animated data particles on links -->
            <circle v-for="(p,i) in particles" :key="'p'+i"
              :cx="p.x" :cy="p.y" r="2.5"
              :fill="p.color" opacity="0.8"
            />
            <!-- Nodes -->
            <g v-for="n in topoNodes" :key="n.id" :transform="`translate(${n.x},${n.y})`">
              <!-- Pulse ring for online -->
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
          <span><span class="dot" style="background:#ef4444"></span>离线</span>
          <span><span class="dot" style="background:#4F7CFF"></span>数据流</span>
        </div>
      </div>

      <!-- Resource Overview (Stacked Area Chart) -->
      <div class="panel glass resource-panel">
        <h3 class="panel-title">
          <span class="dot" style="background:#4F7CFF"></span> 资源总览
        </h3>
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

    <!-- ===== Row 3: Unified Timeline ===== -->
    <section class="panel glass timeline-panel">
      <h3 class="panel-title">
        <span class="dot" style="background:#F59E0B"></span> 事件时间线
      </h3>
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
import api from '../api'

const router = useRouter()
const topoRef = ref<HTMLElement | null>(null)

// ===== Stats Cards =====
const statCards = ref([
  { key: 'devices', icon: '🖥️', value: '--', label: '在线设备', link: '/devices', color: '#4F7CFF', pulse: false },
  { key: 'alerts',  icon: '⚠️', value: '--', label: '活跃告警', link: '/devices', color: '#F59E0B', pulse: false },
  { key: 'uptime',  icon: '⏱️', value: '--', label: '运行时长', link: '', color: '#10B981', pulse: false },
  { key: 'network', icon: '🌐', value: '--', label: '总流量(h)', link: '', color: '#A78BFA', pulse: false },
])

// ===== Topology =====
const topoBox = ref({ w: 600, h: 300 })
const topoNodes = ref<any[]>([])
const topoLinks = ref<any[]>([])
const particles = ref<any[]>([])
const topologyReady = ref(false)
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
  // Radial layout: router at center, others on concentric rings
  const centerX = width / 2
  const centerY = height / 2

  const router = nodes.find(n => n.type === 'router') || nodes[0]
  const others = nodes.filter(n => n.id !== router.id)

  const positionedNodes: any[] = []
  // Router at center
  positionedNodes.push({ ...router, x: centerX, y: centerY, online: router.online !== false })

  // Others on ring
  const ringRadius = Math.min(width, height) * 0.32
  const count = others.length
  const startAngle = -Math.PI / 2

  others.forEach((n, i) => {
    const angle = startAngle + (i / Math.max(count, 1)) * 2 * Math.PI
    positionedNodes.push({
      ...n,
      x: centerX + ringRadius * Math.cos(angle),
      y: centerY + ringRadius * Math.sin(angle),
      online: n.online !== false
    })
  })

  // Positioned links
  const positionedLinks = links.map(l => {
    const src = positionedNodes.find(n => n.id === l.source)
    const tgt = positionedNodes.find(n => n.id === l.target)
    const active = l.active !== false && src?.online && tgt?.online
    return {
      ...l,
      x1: src?.x || 0, y1: src?.y || 0,
      x2: tgt?.x || 0, y2: tgt?.y || 0,
      active,
      width: active ? 2.5 : 1
    }
  })

  return { nodes: positionedNodes, links: positionedLinks }
}

function animateParticles(links: any[]) {
  if (particleTimer) clearInterval(particleTimer)
  const activeLinks = links.filter(l => l.active)
  if (activeLinks.length === 0) { particles.value = []; return }

  let t = 0
  particleTimer = setInterval(() => {
    t += 0.03
    particles.value = activeLinks.map((l, i) => {
      const phase = (t + i * 0.7) % 1
      return {
        x: l.x1 + (l.x2 - l.x1) * phase,
        y: l.y1 + (l.y2 - l.y1) * phase,
        color: '#4F7CFF'
      }
    })
  }, 50)
}

// ===== Resource Charts =====
const resourceMetrics = ref([
  { key: 'cpu', name: 'CPU', value: '--', unit: '%', w: 300, h: 80 },
  { key: 'memory', name: '内存', value: '--', unit: '%', w: 300, h: 80 },
  { key: 'disk', name: '磁盘', value: '--', unit: '%', w: 300, h: 80 },
  { key: 'network', name: '网络', value: '--', unit: ' KB/s', w: 300, h: 80 },
])
const canvasRefs: Record<string, HTMLCanvasElement> = {}
function setCanvasRef(key: string, el: any) {
  if (el) canvasRefs[key] = el
}

function drawMiniChart(canvas: HTMLCanvasElement, data: number[], color: string, maxVal: number) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const pad = 4
  const plotW = w - pad * 2, plotH = h - pad * 2
  const peak = maxVal || Math.max(...data, 1)

  // Gradient fill
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

  // Line
  ctx.beginPath()
  data.forEach((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * plotW
    const y = h - pad - (v / peak) * plotH
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Dot at current
  if (data.length > 0) {
    const lastX = pad + ((data.length - 1) / Math.max(data.length - 1, 1)) * plotW
    const lastY = h - pad - (data[data.length - 1] / peak) * plotH
    ctx.beginPath()
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
}

// ===== Timeline =====
const timelineItems = ref<any[]>([])

function mergeTimeline(logs: any[], alerts: any[], devices: any[]) {
  const items: any[] = []

  // Log entries
  for (const l of (logs || []).slice(0, 12)) {
    const t = l.time || ''
    const ts = t.match(/\d{2}:\d{2}:\d{2}/)?.[0] || t.slice(-8) || ''
    items.push({
      time: ts,
      message: l.message || '',
      type: 'log',
      icon: '📋',
      color: '#6B7280',
      sortTime: l.time || ''
    })
  }

  // Device online/offline events (last 6h)
  for (const d of (devices || [])) {
    if (d.online) {
      items.push({
        time: '最近',
        message: `${d.name || d.hostname} 在线`,
        type: 'device',
        icon: '🟢',
        color: '#22C55E',
        sortTime: d.lastSeen || ''
      })
    }
  }

  // Alerts
  for (const a of (alerts || [])) {
    if (a.enabled) {
      items.push({
        time: '监控中',
        message: `告警: ${a.name} (${a.metric} > ${a.threshold}%)`,
        type: 'alert',
        icon: '⚠️',
        color: '#F59E0B',
        sortTime: ''
      })
    }
  }

  // Sort by time descending
  items.sort((a, b) => b.sortTime.localeCompare(a.sortTime))
  return items.slice(0, 15)
}

// ===== Data Fetch =====
async function fetchOverview() {
  try {
    const res = await api.get('/v2/dashboard/overview') as any
    if (!res.success) return
    const d = res.data

    // Stats
    statCards.value[0].value = `${d.stats?.onlineDevices || 0} / ${d.stats?.totalDevices || 0}`
    statCards.value[1].value = d.stats?.activeAlerts || 0
    statCards.value[1].pulse = (d.stats?.activeAlerts || 0) > 0
    // uptime: fetch separately
    // network: calculate from devices

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

    // Resource: collect metrics from all devices
    const allDevices = d.devices || []
    const cpuData = allDevices.filter((d: any) => d.cpu != null).map((d: any) => d.cpu)
    const memData = allDevices.filter((d: any) => d.memory != null).map((d: any) => d.memory)
    const diskData = allDevices.filter((d: any) => d.disk != null).map((d: any) => d.disk)
    const netData = allDevices.filter((d: any) => d.net_rx != null).map((d: any) => d.net_rx)

    const avgCpu = cpuData.length ? (cpuData.reduce((a: number,b: number) => a+b, 0) / cpuData.length).toFixed(1) : '--'
    const avgMem = memData.length ? (memData.reduce((a: number,b: number) => a+b, 0) / memData.length).toFixed(1) : '--'
    const avgDisk = diskData.length ? (diskData.reduce((a: number,b: number) => a+b, 0) / diskData.length).toFixed(1) : '--'
    const totalNet = netData.length ? (netData.reduce((a: number,b: number) => a+b, 0) / 1024).toFixed(0) : '--'

    resourceMetrics.value[0].value = avgCpu
    resourceMetrics.value[1].value = avgMem
    resourceMetrics.value[2].value = avgDisk
    resourceMetrics.value[3].value = totalNet

    // Draw mini charts
    await nextTick()
    drawMiniChart(canvasRefs['cpu'], cpuData.length > 1 ? cpuData : [30,45,38,52,41,48], '#4F7CFF', 100)
    drawMiniChart(canvasRefs['memory'], memData.length > 1 ? memData : [55,60,58,62,59,61], '#A78BFA', 100)
    drawMiniChart(canvasRefs['disk'], diskData.length > 1 ? diskData : [28,29,30,31,30,32], '#F59E0B', 100)
    drawMiniChart(canvasRefs['network'], netData.length > 1 ? netData.map((v: number) => v/1024) : [120,450,280,600,350,520], '#22C55E', 1000)

    // Timeline
    timelineItems.value = mergeTimeline(d.logs || [], d.alerts || [], allDevices)

    topologyReady.value = true
  } catch (e) {
    console.error('[Cockpit] fetchOverview:', e)
  }
}

// ===== Uptime =====
let uptimeTimer: any = null
async function fetchUptime() {
  try {
    const res = await api.get('/system/uptime') as any
    if (res.success) {
      statCards.value[2].value = fmtUptime(res.data.uptime || 0)
    }
  } catch {}
}

function fmtUptime(s: number) {
  if (!s || s < 0) return '--'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : `${h}h ${m}m`
}

// ===== Helpers =====
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
  await fetchOverview()
  await fetchUptime()
  uptimeTimer = setInterval(fetchUptime, 10000)
})

onUnmounted(() => {
  if (particleTimer) clearInterval(particleTimer)
  if (uptimeTimer) clearInterval(uptimeTimer)
})
</script>

<style scoped>
.cockpit {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 24px;
}

/* ===== Glass Panel Base ===== */
.glass {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

/* ===== Stats Row ===== */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  cursor: pointer;
  overflow: hidden;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-bg {
  position: absolute;
  top: -30%; right: -20%;
  width: 120px; height: 120px;
  border-radius: 50%;
  opacity: 0.08;
  pointer-events: none;
}
.stat-icon { font-size: 28px; flex-shrink: 0; position: relative; z-index: 1; }
.stat-body { position: relative; z-index: 1; display: flex; flex-direction: column; }
.stat-val {
  font-size: 28px; font-weight: 800; color: var(--text-primary); line-height: 1.1;
}
.stat-label { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.stat-val.pulse { animation: pulse-glow 2s infinite; }
@keyframes pulse-glow {
  0%,100% { text-shadow: 0 0 0 transparent; }
  50% { text-shadow: 0 0 12px #F59E0Baa; }
}

/* ===== Row Dual ===== */
.row-dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* ===== Panel ===== */
.panel { padding: 20px 24px; }
.panel-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  margin: 0 0 16px; display: flex; align-items: center; gap: 8px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.panel-empty { color: var(--text-tertiary); font-size: 13px; text-align: center; padding: 24px 0; }

/* ===== Topology ===== */
.topo-svg-wrap { overflow: hidden; }
.topo-svg { width: 100%; height: 280px; display: block; }
.topo-legend {
  display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: var(--text-tertiary);
}
.topo-legend span { display: flex; align-items: center; gap: 4px; }

/* ===== Resource ===== */
.resource-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rm-item { padding: 8px; }
.rm-header {
  display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;
}
.rm-name { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px; }
.rm-val { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.rm-val small { font-size: 10px; font-weight: 400; color: var(--text-tertiary); margin-left: 2px; }
.rm-chart { width: 100%; height: 70px; display: block; }

/* ===== Timeline ===== */
.timeline {
  position: relative;
  padding-left: 2px;
  max-height: 320px;
  overflow-y: auto;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 7px; top: 4px; bottom: 4px;
  width: 1px;
  background: var(--border-color);
}
.tl-item {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0 6px 20px;
  font-size: 12px;
}
.tl-dot {
  position: absolute;
  left: 3px; top: 10px;
  width: 9px; height: 9px;
  border-radius: 50%;
  border: 2px solid var(--bg-glass);
  z-index: 1;
}
.tl-time {
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 11px;
  min-width: 56px;
  flex-shrink: 0;
}
.tl-body { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.tl-icon { font-size: 12px; flex-shrink: 0; }
.tl-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-item.alert .tl-msg { color: #F59E0B; font-weight: 500; }
.tl-item.device .tl-msg { color: #22C55E; }

/* ===== Responsive ===== */
@media (max-width: 1100px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .row-dual { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .cockpit { padding: 12px; }
  .stats-row { grid-template-columns: 1fr; }
  .resource-metrics { grid-template-columns: 1fr; }
}
</style>
