<template>
  <div class="device-detail">
    <!-- 面包屑 -->
    <div class="breadcrumb">
      <router-link to="/devices" class="bc-link">{{ $t('devices.title') }}</router-link>
      <span class="bc-sep">/</span>
      <span class="bc-current">{{ device?.name || device?.hostname || '...' }}</span>
      <el-tag v-if="device" :type="device.status === 'online' ? 'success' : 'info'" size="small" effect="dark" style="margin-left:10px">
        {{ device.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
      </el-tag>
    </div>

    <!-- 加载态 -->
    <div v-if="!device && loading" class="skeleton">
      <div class="sk-row"><div class="sk-block" style="width:60%"></div></div>
      <div class="sk-grid"><div class="sk-block"></div><div class="sk-block"></div><div class="sk-block"></div><div class="sk-block"></div></div>
      <div class="sk-block" style="height:240px"></div>
    </div>

    <template v-if="device">
      <!-- ===== 设备信息卡片 ===== -->
      <div class="info-card">
        <div class="info-left">
          <div class="device-icon">
            <svg viewBox="0 0 64 64" width="48" height="48">
              <rect x="8" y="6" width="48" height="36" rx="4" :fill="device.status==='online'?'#15C39A18':'#90939918'" :stroke="device.status==='online'?'#15C39A':'#909399'" stroke-width="1.5"/>
              <rect x="16" y="46" width="32" height="6" rx="2" :fill="device.status==='online'?'#15C39A10':'#90939910'" :stroke="device.status==='online'?'#15C39A':'#909399'" stroke-width="1"/>
              <rect x="20" y="50" width="24" height="2" rx="1" :fill="device.status==='online'?'#15C39A40':'#90939940'"/>
              <circle cx="32" cy="23" r="6" :fill="device.status==='online'?'#15C39A20':'#90939920'" :stroke="device.status==='online'?'#15C39A':'#909399'" stroke-width="1.5"/>
            </svg>
          </div>
          <div class="info-text">
            <h2 class="device-name">{{ device.name || device.hostname }}</h2>
            <div class="info-meta">
              <span><span class="meta-label">IP</span> <code>{{ device.ip }}</code></span>
              <span><span class="meta-label">OS</span> {{ device.os }} {{ device.arch }}</span>
              <span><span class="meta-label">{{ $t('devices.version') }}</span> {{ device.version }}</span>
            </div>
          </div>
        </div>
        <div class="info-actions">
          <el-button v-if="device.status === 'online' && device.id !== 'dev_local'" @click="openSsh">
            <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:4px"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4l-8 5-8-5V6l8 5 8-5z" fill="currentColor"/></svg>
            SSH
          </el-button>
          <el-button @click="showCommandPanel = !showCommandPanel">
            <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:4px"><path d="M9 2h6v2H9zm2 4v4h2V6zm-6.5 7l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {{ $t('devices.sendCommand') }}
          </el-button>
          <el-button type="danger" plain @click="doDelete">
            <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:4px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
            {{ $t('devices.delete') }}
          </el-button>
        </div>
      </div>

      <!-- 命令输入面板 -->
      <div v-if="showCommandPanel" class="command-panel card">
        <div class="panel-header">
          <span>{{ $t('devices.sendCommand') }}</span>
          <el-button link @click="showCommandPanel = false">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
          </el-button>
        </div>
        <div class="cmd-form">
          <el-input v-model="cmdText" type="textarea" :rows="3" placeholder="e.g. uname -a / df -h / docker ps" @keydown.ctrl.enter="doSendCmd" />
          <div class="cmd-foot">
            <span class="cmd-hint">Ctrl+Enter {{ $t('common.submit') }}</span>
            <el-button type="primary" @click="doSendCmd" :loading="cmdSending" size="small">{{ $t('common.submit') }}</el-button>
          </div>
        </div>
        <div v-if="cmdResult !== null" class="cmd-result">
          <pre>{{ cmdResult }}</pre>
        </div>
      </div>

      <!-- ===== 实时指标仪表盘（SVG 环形） ===== -->
      <div class="gauges-row">
        <!-- CPU -->
        <div class="gauge-card card">
          <h4 class="gauge-label">CPU</h4>
          <div class="ring-chart">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="#f0f1f5" stroke-width="12" />
              <circle cx="70" cy="70" r="58" fill="none" :stroke="cpuColor" stroke-width="12"
                stroke-linecap="round" :stroke-dasharray="cpuDash" stroke-dashoffset="0"
                transform="rotate(-90 70 70)" class="ring-arc" />
              <text x="70" y="64" text-anchor="middle" class="ring-pct">{{ fmtNum(liveMetrics.cpu) }}<tspan class="ring-unit">%</tspan></text>
              <text x="70" y="84" text-anchor="middle" class="ring-sub">CPU</text>
            </svg>
          </div>
          <div class="gauge-detail">
            <span>{{ os.cpus || 1 }} {{ $t('devices.cpuCores') }}</span>
            <span class="gauge-sub">Load {{ fmtNum(liveMetrics.load0) }}</span>
          </div>
        </div>

        <!-- 内存 -->
        <div class="gauge-card card">
          <h4 class="gauge-label">{{ $t('devices.memory') }}</h4>
          <div class="ring-chart">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="#f0f1f5" stroke-width="12" />
              <circle cx="70" cy="70" r="58" fill="none" :stroke="memColor" stroke-width="12"
                stroke-linecap="round" :stroke-dasharray="memDash" stroke-dashoffset="0"
                transform="rotate(-90 70 70)" class="ring-arc" />
              <text x="70" y="64" text-anchor="middle" class="ring-pct">{{ fmtNum(liveMetrics.memory_pct) }}<tspan class="ring-unit">%</tspan></text>
              <text x="70" y="84" text-anchor="middle" class="ring-sub">{{ fmtMem(liveMetrics.memory_used) }} / {{ fmtMem(liveMetrics.memory_total) }}</text>
            </svg>
          </div>
        </div>

        <!-- 磁盘 -->
        <div class="gauge-card card">
          <h4 class="gauge-label">{{ $t('devices.disk') }}</h4>
          <div class="ring-chart">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="#f0f1f5" stroke-width="12" />
              <circle cx="70" cy="70" r="58" fill="none" :stroke="diskColor" stroke-width="12"
                stroke-linecap="round" :stroke-dasharray="diskDash" stroke-dashoffset="0"
                transform="rotate(-90 70 70)" class="ring-arc" />
              <text x="70" y="64" text-anchor="middle" class="ring-pct">{{ fmtNum(liveMetrics.disk_pct) }}<tspan class="ring-unit">%</tspan></text>
              <text x="70" y="84" text-anchor="middle" class="ring-sub">{{ fmtMem(liveMetrics.disk_used) }} / {{ fmtMem(liveMetrics.disk_total) }}</text>
            </svg>
          </div>
        </div>

        <!-- 网络 + 运行时间 -->
        <div class="gauge-card card net-card">
          <h4 class="gauge-label">{{ $t('devices.network') }}</h4>
          <div class="net-stats">
            <div class="net-item down">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 9l-7 7-7-7" fill="none" stroke="#4F7CFF" stroke-width="2" stroke-linecap="round"/></svg>
              <div class="net-info">
                <span class="net-val">{{ fmtBytes(liveMetrics.net_rx) }}/s</span>
                <span class="net-dir-label">↓ {{ $t('devices.download') }}</span>
              </div>
            </div>
            <div class="net-divider"></div>
            <div class="net-item up">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 15l7-7 7 7" fill="none" stroke="#15C39A" stroke-width="2" stroke-linecap="round"/></svg>
              <div class="net-info">
                <span class="net-val">{{ fmtBytes(liveMetrics.net_tx) }}/s</span>
                <span class="net-dir-label">↑ {{ $t('devices.upload') }}</span>
              </div>
            </div>
          </div>
          <div class="net-uptime">
            <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span class="uptime-val">{{ fmtUptime(liveMetrics.uptime) }}</span>
          </div>
        </div>
      </div>

      <!-- ===== 趋势图 ===== -->
      <div class="card trend-section">
        <div class="trend-header">
          <h4>{{ $t('devices.trend') }}</h4>
          <div class="trend-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#4F7CFF"></span>CPU</span>
            <span class="legend-item"><span class="legend-dot" style="background:#15C39A"></span>MEM</span>
            <span class="legend-item"><span class="legend-dot" style="background:#F59E0B"></span>DISK</span>
          </div>
          <el-button-group size="small">
            <el-button :type="range===30?'primary':''" @click="switchRange(30)" size="small">30m</el-button>
            <el-button :type="range===60?'primary':''" @click="switchRange(60)" size="small">1h</el-button>
            <el-button :type="range===180?'primary':''" @click="switchRange(180)" size="small">3h</el-button>
            <el-button :type="range===720?'primary':''" @click="switchRange(720)" size="small">12h</el-button>
            <el-button :type="range===1440?'primary':''" @click="switchRange(1440)" size="small">24h</el-button>
          </el-button-group>
        </div>
        <div class="trend-body">
          <canvas ref="trendCanvas" class="trend-canvas"></canvas>
        </div>
      </div>

      <!-- ===== 进程 & 连接 & 命令 ===== -->
      <div class="detail-grid">
        <div class="card panel">
          <div class="panel-header">
            <span>{{ $t('devices.processes') }}</span>
            <el-button link size="small" @click="fetchProcesses" :loading="procsLoading">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35A7.958 7.958 0 0012 4a8 8 0 108 8h-2a6 6 0 11-6-6c1.85 0 3.55.85 4.65 2.15L14 11h7V4l-3.35 2.35z" fill="currentColor"/></svg>
            </el-button>
          </div>
          <div class="panel-body" v-if="procsList.length">
            <div class="proc-item" v-for="p in procsList" :key="p.pid">
              <div class="proc-main">
                <code class="proc-cmd">{{ p.command }}</code>
                <span class="proc-meta">PID {{ p.pid }} · {{ p.user }}</span>
              </div>
              <div class="proc-bars">
                <span class="proc-bar cpu-bar" :style="{ width: Math.min((p.cpu || 0), 100) + '%' }"></span>
                <span class="proc-bar mem-bar" :style="{ width: Math.min(((p.mem || 0) / (maxProcMem || 1)) * 100, 100) + '%' }"></span>
              </div>
            </div>
          </div>
          <div v-else class="panel-empty">{{ procsLoading ? '...' : $t('devices.noProcesses') }}</div>
        </div>

        <div class="card panel">
          <div class="panel-header">
            <span>{{ $t('devices.connections') }}</span>
            <el-button link size="small" @click="fetchConnections" :loading="connsLoading">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17.65 6.35A7.958 7.958 0 0012 4a8 8 0 108 8h-2a6 6 0 11-6-6c1.85 0 3.55.85 4.65 2.15L14 11h7V4l-3.35 2.35z" fill="currentColor"/></svg>
            </el-button>
          </div>
          <div class="panel-body" v-if="connsList.length">
            <div class="conn-item" v-for="c in connsList" :key="c.local + c.remote + c.proto">
              <span class="conn-proto">{{ c.proto }}</span>
              <span class="conn-addr">{{ c.local }}</span>
              <span class="conn-arrow">→</span>
              <span class="conn-addr">{{ c.remote || '*' }}</span>
              <el-tag size="small" :type="c.state === 'LISTEN' ? 'info' : 'success'" class="conn-state">{{ c.state }}</el-tag>
            </div>
          </div>
          <div v-else class="panel-empty">{{ connsLoading ? '...' : $t('devices.noConnections') }}</div>
        </div>

        <div class="card panel">
          <div class="panel-header">
            <span>{{ $t('devices.commandHistory') }}</span>
          </div>
          <div class="panel-body" v-if="device.commands?.length">
            <div class="cmd-item" v-for="c in device.commands.slice(0, 20)" :key="c.id">
              <div class="cmd-head">
                <code class="cmd-cmd">{{ c.command }}</code>
                <el-tag size="small" :type="c.status === 'completed' ? 'success' : c.status === 'failed' ? 'danger' : 'info'">{{ c.status }}</el-tag>
              </div>
              <div class="cmd-time">{{ fmtTime(c.created_at) }}</div>
              <pre v-if="c.result" class="cmd-output">{{ c.result.slice(0, 200) }}{{ c.result.length > 200 ? '...' : '' }}</pre>
            </div>
          </div>
          <div v-else class="panel-empty">{{ $t('devices.noCommands') }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDevicesStore } from '../stores/devices'
import api from '../api'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useDevicesStore()

const deviceId = computed(() => route.params.id as string)
const device = computed(() => store.currentDevice)
const loading = ref(false)

// 实时指标（独立请求，每 5 秒刷新）
const liveMetrics = ref({
  cpu: 0, memory_pct: 0, memory_used: 0, memory_total: 0,
  disk_pct: 0, disk_used: 0, disk_total: 0,
  net_rx: 0, net_tx: 0, uptime: 0, load0: 0
})
const os = ref({ cpus: 1, hostname: '', platform: '', arch: '' })

// 环形仪表盘 stroke-dasharray
const RING_CIRCUMFERENCE = 2 * Math.PI * 58 // ~364.42
const cpuDash = computed(() => {
  const pct = Math.min(100, Math.max(0, liveMetrics.value.cpu)) / 100
  return `${(RING_CIRCUMFERENCE * pct).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`
})
const memDash = computed(() => {
  const pct = Math.min(100, Math.max(0, liveMetrics.value.memory_pct)) / 100
  return `${(RING_CIRCUMFERENCE * pct).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`
})
const diskDash = computed(() => {
  const pct = Math.min(100, Math.max(0, liveMetrics.value.disk_pct)) / 100
  return `${(RING_CIRCUMFERENCE * pct).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`
})

// 环形颜色
const cpuColor = computed(() => {
  const v = liveMetrics.value.cpu
  if (v > 80) return '#F56C6C'; if (v > 60) return '#E6A23C'; return '#4F7CFF'
})
const memColor = computed(() => {
  const v = liveMetrics.value.memory_pct
  if (v > 80) return '#F56C6C'; if (v > 60) return '#E6A23C'; return '#15C39A'
})
const diskColor = computed(() => {
  const v = liveMetrics.value.disk_pct
  if (v > 80) return '#F56C6C'; if (v > 60) return '#E6A23C'; return '#8B5CF6'
})

// 命令面板
const showCommandPanel = ref(false)
const cmdText = ref('')
const cmdSending = ref(false)
const cmdResult = ref<string | null>(null)

// 趋势图
const trendCanvas = ref<HTMLCanvasElement>()
const trendData = ref<any[]>([])
const range = ref(60)

// 进程
const procsList = ref<any[]>([])
const procsLoading = ref(false)
const maxProcMem = computed(() => Math.max(1, ...procsList.value.map((p: any) => p.mem || 0)))

// 连接
const connsList = ref<any[]>([])
const connsLoading = ref(false)

let liveTimer: any = null
let trendTimer: any = null
let animFrame = 0

// ===== 实时指标轮询 =====
async function fetchLiveMetrics() {
  if (!device.value) return
  try {
    // dev_local 用本地端点，远程 Agent 暂用 DB 数据
    const url = device.value.id === 'dev_local'
      ? `/v2/device/${device.value.id}/metrics/local`
      : `/v2/device/${device.value.id}`
    const { data } = await api.get(url) as any
    if (device.value.id === 'dev_local') {
      const m = data
      liveMetrics.value = {
        cpu: m.cpu || 0,
        memory_pct: m.memory?.pct || 0,
        memory_used: m.memory?.used || 0,
        memory_total: m.memory?.total || 0,
        disk_pct: m.disk?.pct || 0,
        disk_used: m.disk?.used || 0,
        disk_total: m.disk?.total || 0,
        net_rx: m.net?.rx || 0,
        net_tx: m.net?.tx || 0,
        uptime: m.uptime || 0,
        load0: m.load?.[0] || 0
      }
    } else {
      const m = data.metrics?.[0] || {}
      liveMetrics.value = {
        cpu: parseFloat(m.cpu) || 0,
        memory_pct: parseFloat(m.memory_pct) || 0,
        memory_used: 0, memory_total: 0,
        disk_pct: parseFloat(m.disk_pct) || 0,
        disk_used: 0, disk_total: 0,
        net_rx: parseFloat(m.net_rx) || 0,
        net_tx: parseFloat(m.net_tx) || 0,
        uptime: parseInt(m.uptime) || 0,
        load0: 0
      }
    }
  } catch { /* */ }
}

// ===== 加载 =====
onMounted(async () => {
  loading.value = true
  try {
    await store.loadDetail(deviceId.value)
    if (!store.currentDevice) {
      ElMessage.error(t('devices.notFound'))
      router.replace('/devices')
      return
    }
    // 获取系统信息
    if (device.value.id === 'dev_local') {
      try {
        const { data } = await api.get(`/v2/device/${device.value.id}/metrics/local`) as any
        os.value = { cpus: data.cpus || os.cpus().length, hostname: data.hostname, platform: data.platform, arch: data.arch }
      } catch { /* */ }
    }
    await Promise.all([fetchLiveMetrics(), loadTrend(), fetchProcesses(), fetchConnections()])
    // 定期拉取实时指标
    if (device.value.status === 'online') {
      liveTimer = setInterval(fetchLiveMetrics, 5000)
    }
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearInterval(liveTimer)
  clearInterval(trendTimer)
  cancelAnimationFrame(animFrame)
})

// ===== 趋势图 =====
async function loadTrend() {
  if (!device.value) return
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/metrics`) as any
    trendData.value = data?.data || data || []
    await nextTick()
    drawTrend()
  } catch {
    trendData.value = []
  }
}

function switchRange(r: number) {
  range.value = r
  loadTrend()
}

function drawTrend() {
  cancelAnimationFrame(animFrame)
  animFrame = requestAnimationFrame(() => {
    const canvas = trendCanvas.value
    if (!canvas) return
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    const dpr = window.devicePixelRatio || 1
    const w = rect.width - 4
    const h = 280

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const rows = trendData.value
    const pad = { top: 16, right: 16, bottom: 28, left: 42 }
    const pw = w - pad.left - pad.right
    const ph = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    if (!rows || rows.length < 2) {
      ctx.fillStyle = '#999'
      ctx.font = '13px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(t('devices.noTrendData'), w / 2, h / 2)
      return
    }

    // 水平网格线
    const gridLines = 5
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (ph / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(w - pad.right, y)
      ctx.strokeStyle = i === 0 ? '#e0e0e0' : '#f5f5f5'
      ctx.lineWidth = 0.5
      ctx.setLineDash(i === 0 ? [] : [3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      const label = Math.round(100 - (100 / gridLines) * i)
      ctx.fillStyle = '#999'
      ctx.font = '10px -apple-system, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(label + '%', pad.left - 8, y)
    }

    // X轴标签
    const n = rows.length
    const labelCount = Math.min(6, n)
    const step = Math.max(1, Math.floor((n - 1) / (labelCount - 1)))
    ctx.fillStyle = '#999'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    for (let j = 0; j < labelCount; j++) {
      const idx = j * step
      if (idx >= n) continue
      const x = pad.left + (pw / (n - 1)) * idx
      const t = rows[idx].collected_at
      const d = new Date(t)
      const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      ctx.fillText(timeStr, x, h - 4)
    }

    // 曲线
    const series = [
      { key: 'cpu', color: '#4F7CFF', label: 'CPU' },
      { key: 'memory_pct', color: '#15C39A', label: 'MEM' },
      { key: 'disk_pct', color: '#8B5CF6', label: 'DISK' }
    ]
    series.forEach(s => drawTrendLine(ctx, rows, pad, pw, ph, s.color, s.key))
  })
}

function drawTrendLine(ctx: CanvasRenderingContext2D, rows: any[], pad: any, pw: number, ph: number, color: string, key: string) {
  const n = rows.length
  if (n < 2) return
  const xStep = pw / (n - 1)

  // 填充
  ctx.beginPath()
  const firstX = pad.left
  const firstVal = Math.min(100, Math.max(0, parseFloat(rows[0][key]) || 0))
  const firstY = pad.top + ph - (firstVal / 100) * ph
  ctx.moveTo(firstX, firstY)

  for (let i = 1; i < n; i++) {
    const x = pad.left + i * xStep
    const val = Math.min(100, Math.max(0, parseFloat(rows[i][key]) || 0))
    const y = pad.top + ph - (val / 100) * ph
    const prevX = pad.left + (i - 1) * xStep
    const prevVal = Math.min(100, Math.max(0, parseFloat(rows[i - 1][key]) || 0))
    const prevY = pad.top + ph - (prevVal / 100) * ph
    const cpX = (prevX + x) / 2
    ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y)
  }

  // 底部闭合
  ctx.lineTo(pad.left + (n - 1) * xStep, pad.top + ph)
  ctx.lineTo(pad.left, pad.top + ph)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph)
  grad.addColorStop(0, color + '25')
  grad.addColorStop(1, color + '00')
  ctx.fillStyle = grad
  ctx.fill()

  // 描边
  ctx.beginPath()
  ctx.moveTo(pad.left, firstY)
  for (let i = 1; i < n; i++) {
    const x = pad.left + i * xStep
    const val = Math.min(100, Math.max(0, parseFloat(rows[i][key]) || 0))
    const y = pad.top + ph - (val / 100) * ph
    const prevX = pad.left + (i - 1) * xStep
    const prevVal = Math.min(100, Math.max(0, parseFloat(rows[i - 1][key]) || 0))
    const prevY = pad.top + ph - (prevVal / 100) * ph
    const cpX = (prevX + x) / 2
    ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
}

// ===== 进程 =====
async function fetchProcesses() {
  if (!device.value) return
  procsLoading.value = true
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/processes`) as any
    procsList.value = data || []
  } catch { procsList.value = [] }
  finally { procsLoading.value = false }
}

// ===== 连接 =====
async function fetchConnections() {
  if (!device.value) return
  connsLoading.value = true
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/connections`) as any
    connsList.value = data || []
  } catch { connsList.value = [] }
  finally { connsLoading.value = false }
}

// ===== 命令 =====
async function doSendCmd() {
  if (!cmdText.value.trim() || !device.value) return
  cmdSending.value = true
  cmdResult.value = null
  try {
    const res = await store.sendCommand(device.value.id, cmdText.value.trim())
    cmdResult.value = res?.result || t('devices.noResponse')
  } catch (e: any) {
    cmdResult.value = `Error: ${e.message}`
  } finally {
    cmdSending.value = false
  }
}

// ===== 删除 =====
async function doDelete() {
  try {
    await ElMessageBox.confirm(t('devices.delConfirm'), t('common.delete'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
    await store.deleteDevice(deviceId.value)
    ElMessage.success(t('common.success'))
    router.replace('/devices')
  } catch { /* cancelled */ }
}

// ===== SSH =====
function openSsh() {
  if (!device.value) return
  sessionStorage.setItem('ssh_preset', JSON.stringify({
    host: device.value.ip,
    port: 22,
    username: 'root',
    name: device.value.name || device.value.hostname
  }))
  router.push('/ssh')
}

// ===== 工具函数 =====
function fmtTime(t: string) {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  return d.toLocaleString()
}
function fmtNum(v: number | undefined) {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? '0' : Math.round(n * 10) / 10
}
function fmtBytes(b: number | undefined) {
  const n = parseFloat(String(b ?? 0))
  if (isNaN(n) || n === 0) return '0 B'
  if (n < 1024) return n.toFixed(0) + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtMem(mb: number | undefined) {
  const n = parseFloat(String(mb ?? 0))
  if (isNaN(n) || n === 0) return '0 MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' GB'
  return Math.round(n) + ' MB'
}
function fmtUptime(sec: number | undefined) {
  const s = parseInt(String(sec ?? 0)) || 0
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  return `${h}h ${m}m`
}
</script>

<style scoped>
.device-detail {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 0 80px;
}

/* === 面包屑 === */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0 16px;
  font-size: 13px;
  color: #999;
}
.bc-link { color: #4F7CFF; text-decoration: none; }
.bc-link:hover { text-decoration: underline; }
.bc-current { color: #333; font-weight: 500; }

/* === 信息卡片 === */
.info-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}
.info-left { display: flex; align-items: center; gap: 16px; }
.device-icon { flex-shrink: 0; }
.device-name { font-size: 20px; font-weight: 600; margin: 0 0 6px; color: #1a1a1a; }
.info-meta { display: flex; gap: 20px; font-size: 13px; color: #666; flex-wrap: wrap; }
.info-meta code { background: #f5f6f8; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
.meta-label { color: #999; margin-right: 4px; }
.info-actions { display: flex; gap: 8px; }

/* === 仪表盘行 === */
.gauges-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.gauge-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  padding: 20px 16px 16px;
  text-align: center;
  transition: box-shadow 0.2s;
}
.gauge-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.gauge-label {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* SVG 环形图 */
.ring-chart { width: 140px; height: 140px; margin: 0 auto 8px; }
.ring-chart svg { width: 100%; height: 100%; }
.ring-arc { transition: stroke-dasharray 0.6s ease, stroke 0.6s ease; }
.ring-pct { font-size: 28px; font-weight: 700; fill: #1a1a1a; }
.ring-unit { font-size: 14px; font-weight: 400; fill: #999; }
.ring-sub { font-size: 11px; fill: #999; }

.gauge-detail {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  display: flex;
  justify-content: center;
  gap: 12px;
}
.gauge-sub { color: #bbb; }

/* 网络卡片 */
.net-card { display: flex; flex-direction: column; }
.net-stats { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 0; }
.net-item { display: flex; align-items: center; gap: 8px; }
.net-divider { width: 1px; height: 36px; background: #e8e8e8; }
.net-info { display: flex; flex-direction: column; }
.net-val { font-size: 15px; font-weight: 700; color: #1a1a1a; }
.net-dir-label { font-size: 11px; color: #999; }
.net-uptime {
  display: flex; align-items: center; justify-content: center;
  gap: 6px; padding-top: 12px; border-top: 1px solid #f0f0f0;
  color: #999; font-size: 12px; margin-top: auto;
}
.uptime-val { font-variant-numeric: tabular-nums; }

/* === 趋势图 === */
.trend-section {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  padding: 20px 24px;
  margin-bottom: 20px;
}
.trend-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.trend-header h4 { margin: 0; font-size: 14px; font-weight: 600; color: #333; }
.trend-legend { display: flex; gap: 12px; margin-left: auto; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #999; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.trend-body { }
.trend-canvas { width: 100%; display: block; border-radius: 6px; }

/* === 三列面板 === */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #f0f0f0;
  font-size: 13px; font-weight: 600; color: #333;
}
.panel-body { padding: 8px; max-height: 400px; overflow-y: auto; }
.panel-empty { padding: 24px; text-align: center; color: #ccc; font-size: 13px; }

/* 进程 */
.proc-item { padding: 6px 8px; border-bottom: 1px solid #f9f9f9; }
.proc-item:last-child { border: none; }
.proc-main { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
.proc-cmd { font-size: 12px; color: #333; font-family: 'SF Mono', 'Menlo', monospace; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proc-meta { font-size: 11px; color: #bbb; white-space: nowrap; }
.proc-bars { display: flex; gap: 3px; }
.proc-bar { height: 3px; border-radius: 2px; }
.cpu-bar { background: #4F7CFF; }
.mem-bar { background: #15C39A; }

/* 连接 */
.conn-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-bottom: 1px solid #f9f9f9; font-size: 12px;
}
.conn-item:last-child { border: none; }
.conn-proto { color: #4F7CFF; font-weight: 600; font-size: 11px; width: 28px; flex-shrink: 0; }
.conn-addr { font-family: 'SF Mono', 'Menlo', monospace; font-size: 11px; color: #555; }
.conn-arrow { color: #ccc; flex-shrink: 0; }
.conn-state { margin-left: auto; }

/* 命令 */
.cmd-item { padding: 8px; border-bottom: 1px solid #f9f9f9; }
.cmd-item:last-child { border: none; }
.cmd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.cmd-cmd { font-size: 12px; font-family: 'SF Mono', 'Menlo', monospace; color: #333; }
.cmd-time { font-size: 11px; color: #bbb; margin-bottom: 4px; }
.cmd-output { font-size: 11px; color: #666; font-family: 'SF Mono', 'Menlo', monospace; margin: 0; max-height: 80px; overflow-y: auto; background: #fafafa; padding: 4px 6px; border-radius: 4px; }

/* 命令面板 */
.command-panel { background: #fff; border-radius: 12px; border: 1px solid #e8e8e8; margin-bottom: 20px; }
.cmd-form { padding: 8px 16px 12px; }
.cmd-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.cmd-hint { font-size: 12px; color: #ccc; }
.cmd-result { padding: 0 16px 16px; }
.cmd-result pre { font-size: 12px; background: #fafafa; padding: 10px; border-radius: 6px; font-family: 'SF Mono', 'Menlo', monospace; margin: 0; max-height: 300px; overflow-y: auto; }

/* 骨架屏 */
.skeleton { display: flex; flex-direction: column; gap: 16px; }
.sk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.sk-block { height: 140px; background: linear-gradient(90deg, #f5f6f8 25%, #eef0f3 50%, #f5f6f8 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 12px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* 响应式 */
@media (max-width: 1100px) {
  .gauges-row { grid-template-columns: repeat(2, 1fr); }
  .detail-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 700px) {
  .gauges-row { grid-template-columns: 1fr; }
  .detail-grid { grid-template-columns: 1fr; }
  .info-card { flex-direction: column; align-items: flex-start; }
  .trend-header { flex-direction: column; align-items: flex-start; }
  .trend-legend { margin-left: 0; }
}
</style>
