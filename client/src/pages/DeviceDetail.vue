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
              <span><span class="meta-label">{{ $t('devices.hostname') }}</span> {{ device.hostname }}</span>
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

      <!-- ===== 实时指标仪表盘 ===== -->
      <div class="gauges-row">
        <!-- CPU 仪表 -->
        <div class="gauge-card card">
          <h4 class="gauge-label">CPU</h4>
          <div class="gauge-body">
            <canvas ref="cpuGauge" width="160" height="160"></canvas>
            <div class="gauge-value">{{ fmtNum(metrics?.cpu) }}<span class="gauge-unit">%</span></div>
          </div>
        </div>
        <!-- 内存仪表 -->
        <div class="gauge-card card">
          <h4 class="gauge-label">{{ $t('devices.memory') }}</h4>
          <div class="gauge-body">
            <canvas ref="memGauge" width="160" height="160"></canvas>
            <div class="gauge-value">{{ fmtNum(metrics?.memory_pct) }}<span class="gauge-unit">%</span></div>
          </div>
        </div>
        <!-- 磁盘仪表 -->
        <div class="gauge-card card">
          <h4 class="gauge-label">{{ $t('devices.disk') }}</h4>
          <div class="gauge-body">
            <canvas ref="diskGauge" width="160" height="160"></canvas>
            <div class="gauge-value">{{ fmtNum(metrics?.disk_pct) }}<span class="gauge-unit">%</span></div>
          </div>
        </div>
        <!-- 网络流量 -->
        <div class="gauge-card card net-card">
          <h4 class="gauge-label">{{ $t('devices.network') }}</h4>
          <div class="net-stats">
            <div class="net-item down">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 9l-7 7-7-7" fill="none" stroke="#4F7CFF" stroke-width="2" stroke-linecap="round"/></svg>
              <span class="net-val">{{ fmtBytes(metrics?.net_rx) }}/s</span>
              <span class="net-dir">↓</span>
            </div>
            <div class="net-item up">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 15l7-7 7 7" fill="none" stroke="#15C39A" stroke-width="2" stroke-linecap="round"/></svg>
              <span class="net-val">{{ fmtBytes(metrics?.net_tx) }}/s</span>
              <span class="net-dir">↑</span>
            </div>
          </div>
          <div class="net-uptime">
            <span class="uptime-label">{{ $t('devices.uptime') }}</span>
            <span class="uptime-val">{{ fmtUptime(metrics?.uptime) }}</span>
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
            <el-button :type="range===360?'primary':''" @click="switchRange(360)" size="small">6h</el-button>
            <el-button :type="range===720?'primary':''" @click="switchRange(720)" size="small">12h</el-button>
            <el-button :type="range===10080?'primary':''" @click="switchRange(10080)" size="small">7d</el-button>
          </el-button-group>
        </div>
        <canvas ref="trendCanvas" class="trend-canvas"></canvas>
      </div>

      <!-- ===== 进程 & 连接 & 命令（三列） ===== -->
      <div class="detail-grid">
        <!-- 进程列表 -->
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
                <span class="proc-cpu" :style="{ width: Math.min(p.cpu || 0, 100) + '%' }"></span>
                <span class="proc-mem" :style="{ width: Math.min((p.mem || 0) / (maxProcMem || 1) * 100, 100) + '%' }"></span>
              </div>
            </div>
          </div>
          <div v-else class="panel-empty">{{ procsLoading ? '...' : $t('devices.noProcesses') }}</div>
        </div>

        <!-- 网络连接 -->
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

        <!-- 命令历史 -->
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
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
const metrics = computed(() => device.value?.metrics?.[0] || null)

// 命令面板
const showCommandPanel = ref(false)
const cmdText = ref('')
const cmdSending = ref(false)
const cmdResult = ref<string | null>(null)

// 仪表盘
const cpuGauge = ref<HTMLCanvasElement>()
const memGauge = ref<HTMLCanvasElement>()
const diskGauge = ref<HTMLCanvasElement>()

// 趋势图
const trendCanvas = ref<HTMLCanvasElement>()
const trendData = ref<any[]>([])
const range = ref(60)

// 进程
const procsList = ref<any[]>([])
const procsLoading = ref(false)
const maxProcMem = computed(() => Math.max(1, ...procsList.value.map(p => p.mem || 0)))

// 连接
const connsList = ref<any[]>([])
const connsLoading = ref(false)

let animFrame = 0
let refreshTimer: any = null

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
    await Promise.all([loadTrend(), fetchProcesses(), fetchConnections()])
    drawGauges()
    startAutoRefresh()
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animFrame)
  clearInterval(refreshTimer)
})

// ===== 自动刷新 =====
function startAutoRefresh() {
  refreshTimer = setInterval(async () => {
    await store.loadDetail(deviceId.value)
    drawGauges()
  }, 10000) // 10秒刷新仪表盘
}

// ===== 仪表盘绘制 =====
function drawGauges() {
  const m = metrics.value
  if (!m) return
  drawGauge(cpuGauge.value, m.cpu || 0, '#4F7CFF', 'CPU')
  drawGauge(memGauge.value, m.memory_pct || 0, '#15C39A', 'MEM')
  drawGauge(diskGauge.value, m.disk_pct || 0, '#F59E0B', 'DISK')
}

function drawGauge(canvas: HTMLCanvasElement | undefined, value: number, color: string, _label: string) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const cx = w / 2, cy = h * 0.62
  const outerR = w * 0.38
  const innerR = outerR * 0.75
  const startAngle = Math.PI * 0.75
  const endAngle = Math.PI * 2.25
  const totalAngle = endAngle - startAngle

  ctx.clearRect(0, 0, w, h)

  // 背景弧
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, startAngle, endAngle)
  ctx.arc(cx, cy, innerR, endAngle, startAngle, true)
  ctx.closePath()
  ctx.fillStyle = window.getComputedStyle(canvas).getPropertyValue('--bg-base').trim() || '#f0f1f5'
  ctx.fill()
  ctx.strokeStyle = '#e8e8e8'
  ctx.lineWidth = 1
  ctx.stroke()

  // 数值弧
  const pct = Math.min(100, Math.max(0, value)) / 100
  const valAngle = startAngle + totalAngle * pct
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, startAngle, valAngle)
  ctx.arc(cx, cy, innerR, valAngle, startAngle, true)
  ctx.closePath()
  ctx.fillStyle = color + '22'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.stroke()

  // 刻度标记
  for (let i = 0; i <= 5; i++) {
    const a = startAngle + totalAngle * i / 5
    const x1 = cx + Math.cos(a) * (outerR - 6)
    const y1 = cy + Math.sin(a) * (outerR - 6)
    const x2 = cx + Math.cos(a) * outerR
    const y2 = cy + Math.sin(a) * outerR
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 1
    ctx.stroke()
    // 刻度文字
    const tx = cx + Math.cos(a) * (outerR + 14)
    const ty = cy + Math.sin(a) * (outerR + 14)
    ctx.fillStyle = '#999'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i * 20), tx, ty)
  }
}

// ===== 趋势图 =====
async function loadTrend() {
  if (!device.value) return
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/metrics`, {
      params: { range: range.value }
    }) as any
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
    const w = rect.width - 48 // padding
    const h = 260
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const rows = trendData.value
    const pad = { top: 20, right: 20, bottom: 32, left: 48 }
    const pw = w - pad.left - pad.right
    const ph = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    if (!rows || rows.length < 2) {
      ctx.fillStyle = '#999'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(t('devices.noTrendData'), w / 2, h / 2)
      return
    }

    // 网格线
    const gridLines = 5
    ctx.strokeStyle = '#eaeaea'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (ph / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(w - pad.right, y)
      ctx.stroke()
      // Y轴标签
      const label = Math.round(100 - (100 / gridLines) * i)
      ctx.fillStyle = '#999'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(label + '%', pad.left - 8, y)
    }

    // X轴时间标签
    const step = Math.max(1, Math.floor(rows.length / 6))
    ctx.fillStyle = '#999'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i < rows.length; i += step) {
      const x = pad.left + (pw / (rows.length - 1)) * i
      const t = rows[i].collected_at
      const timeStr = t ? new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
      ctx.fillText(timeStr, x, h - pad.bottom + 16)
    }

    // 曲线
    drawTrendLine(ctx, rows, pad, pw, ph, '#4F7CFF', 'cpu')
    drawTrendLine(ctx, rows, pad, pw, ph, '#15C39A', 'memory_pct')
    drawTrendLine(ctx, rows, pad, pw, ph, '#F59E0B', 'disk_pct')
  })
}

function drawTrendLine(ctx: CanvasRenderingContext2D, rows: any[], pad: any, pw: number, ph: number, color: string, key: string) {
  const n = rows.length
  const xStep = pw / (n - 1)

  // 填充渐变
  ctx.beginPath()
  let firstX = 0, firstY = 0
  for (let i = 0; i < n; i++) {
    const x = pad.left + i * xStep
    const val = Math.min(100, Math.max(0, parseFloat(rows[i][key]) || 0))
    const y = pad.top + ph - (val / 100) * ph
    if (i === 0) { ctx.moveTo(x, y); firstX = x; firstY = y }
    else {
      // 平滑曲线（二次贝塞尔）
      const prevX = pad.left + (i - 1) * xStep
      const prevVal = Math.min(100, Math.max(0, parseFloat(rows[i - 1][key]) || 0))
      const prevY = pad.top + ph - (prevVal / 100) * ph
      const cpX = (prevX + x) / 2
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y)
    }
    if (i === n - 1) {
      ctx.lineTo(x, pad.top + ph)
      ctx.lineTo(firstX, pad.top + ph)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph)
      grad.addColorStop(0, color + '30')
      grad.addColorStop(1, color + '02')
      ctx.fillStyle = grad
      ctx.fill()
    }
  }

  // 描边
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = pad.left + i * xStep
    const val = Math.min(100, Math.max(0, parseFloat(rows[i][key]) || 0))
    const y = pad.top + ph - (val / 100) * ph
    if (i === 0) ctx.moveTo(x, y)
    else {
      const prevX = pad.left + (i - 1) * xStep
      const prevVal = Math.min(100, Math.max(0, parseFloat(rows[i - 1][key]) || 0))
      const prevY = pad.top + ph - (prevVal / 100) * ph
      const cpX = (prevX + x) / 2
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y)
    }
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
}

// ===== 进程 =====
async function fetchProcesses() {
  if (!device.value) return
  procsLoading.value = true
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/processes`) as any
    procsList.value = (data?.data || []).slice(0, 30)
  } catch { procsList.value = [] }
  finally { procsLoading.value = false }
}

// ===== 连接 =====
async function fetchConnections() {
  if (!device.value) return
  connsLoading.value = true
  try {
    const { data } = await api.get(`/v2/device/${device.value.id}/connections`) as any
    connsList.value = (data?.data || []).slice(0, 40)
  } catch { connsList.value = [] }
  finally { connsLoading.value = false }
}

// ===== SSH =====
function openSsh() {
  if (!device.value) return
  sessionStorage.setItem('ssh_preset', JSON.stringify({
    host: device.value.ip || device.value.id,
    port: 22,
    username: 'root',
    name: device.value.name || device.value.hostname || device.value.id
  }))
  window.location.hash = '#/ssh'
}

// ===== 命令 =====
async function doSendCmd() {
  if (!cmdText.value.trim()) return ElMessage.warning(t('devices.commandPlaceholder'))
  cmdSending.value = true
  try {
    const res = await store.sendCommand(device.value!.id, cmdText.value)
    cmdResult.value = typeof res === 'string' ? res : JSON.stringify(res, null, 2)
    // 刷新命令历史
    await store.loadDetail(deviceId.value)
  } catch (e: any) {
    cmdResult.value = e?.message || String(e)
  } finally { cmdSending.value = false }
}

// ===== 删除 =====
async function doDelete() {
  if (!device.value) return
  try {
    await ElMessageBox.confirm(
      t('devices.delConfirm', { name: device.value.name }),
      t('devices.delete'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await store.deleteDevice(device.value.id)
    ElMessage.success(t('common.success'))
    router.replace('/devices')
  } catch { /* cancelled */ }
}

// ===== 工具函数 =====
function fmtTime(t: string) {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  return d.toLocaleString()
}
function fmtNum(v: number) {
  const n = parseFloat(String(v))
  return isNaN(n) ? '0.0' : n.toFixed(1)
}
function fmtBytes(b: number) {
  const n = parseFloat(String(b))
  if (isNaN(n) || n === 0) return '0 B'
  if (n < 1024) return n.toFixed(0) + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtUptime(s: number) {
  const sec = parseInt(String(s)) || 0
  if (sec < 60) return sec + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  return d + 'd ' + h + 'h'
}
</script>

<style scoped>
.device-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
}
.bc-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
}
.bc-link:hover { color: var(--accent); }
.bc-sep { margin: 0 2px; }
.bc-current { color: var(--text-secondary); }

/* 骨架屏 */
.skeleton { display: flex; flex-direction: column; gap: 20px; }
.sk-row { }
.sk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.sk-block {
  height: 160px;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-base) 50%, var(--bg-elevated) 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* 卡片 */
.card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}

/* 设备信息卡 */
.info-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 24px 28px;
  box-shadow: var(--shadow-sm);
  gap: 20px;
}
.info-left { display: flex; gap: 20px; align-items: center; flex: 1; min-width: 0; }
.device-icon { flex-shrink: 0; }
.device-name { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 8px; }
.info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.meta-label { color: var(--text-tertiary); margin-right: 4px; }
.info-meta code { font-family: var(--font-mono); font-size: 12px; color: var(--accent); background: var(--bg-base); padding: 1px 5px; border-radius: 3px; }
.info-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

/* 命令面板 */
.command-panel { }
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.cmd-form { display: flex; flex-direction: column; gap: 10px; }
.cmd-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.cmd-hint { font-size: 11px; color: var(--text-tertiary); }
.cmd-result { margin-top: 12px; }
.cmd-result pre {
  background: var(--bg-base);
  color: var(--text-secondary);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-family: var(--font-mono);
  overflow-x: auto;
  max-height: 260px;
  line-height: 1.5;
  margin: 0;
}

/* 仪表盘 */
.gauges-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.gauge-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px 16px;
}
.gauge-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.gauge-body { position: relative; display: flex; align-items: center; justify-content: center; }
.gauge-body canvas { display: block; }
.gauge-value {
  position: absolute;
  bottom: 20px;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.gauge-unit { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }

/* 网络卡片 */
.net-card { justify-content: flex-start; }
.net-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0;
  width: 100%;
}
.net-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-base);
}
.net-val { font-size: 15px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); flex: 1; }
.net-dir { font-size: 12px; color: var(--text-tertiary); }
.net-uptime {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 8px 14px;
  font-size: 13px;
}
.uptime-label { color: var(--text-tertiary); }
.uptime-val { color: var(--text-primary); font-weight: 600; }

/* 趋势图 */
.trend-section { }
.trend-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.trend-header h4 { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0; }
.trend-legend { display: flex; gap: 14px; margin-left: 8px; }
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-secondary); }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.trend-canvas { width: 100%; display: block; border-radius: var(--radius-md); }

/* 三列详情 */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
.panel { padding: 16px 20px; }
.panel-body { max-height: 340px; overflow-y: auto; }
.panel-empty { text-align: center; padding: 24px; color: var(--text-tertiary); font-size: 13px; }

/* 进程项 */
.proc-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.proc-item:last-child { border-bottom: none; }
.proc-main { display: flex; justify-content: space-between; align-items: baseline; }
.proc-cmd { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
.proc-meta { font-size: 10px; color: var(--text-tertiary); flex-shrink: 0; }
.proc-bars { display: flex; gap: 3px; height: 3px; border-radius: 2px; overflow: hidden; }
.proc-cpu { background: #4F7CFF; height: 100%; border-radius: 1px; display: block; min-width: 0; }
.proc-mem { background: #15C39A; height: 100%; border-radius: 1px; display: block; min-width: 0; }

/* 连接项 */
.conn-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}
.conn-item:last-child { border-bottom: none; }
.conn-proto {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
  min-width: 38px;
  font-size: 11px;
}
.conn-addr {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  min-width: 0;
}
.conn-arrow { color: var(--text-tertiary); flex-shrink: 0; font-size: 10px; }
.conn-state { flex-shrink: 0; }

/* 命令历史 */
.cmd-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.cmd-item:last-child { border-bottom: none; }
.cmd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.cmd-cmd { font-size: 12px; color: var(--text-primary); font-family: var(--font-mono); }
.cmd-time { font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px; }
.cmd-output {
  background: var(--bg-base);
  color: var(--text-secondary);
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  overflow-x: auto;
  max-height: 80px;
  line-height: 1.4;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 响应式 */
@media (max-width: 1100px) {
  .gauges-row { grid-template-columns: repeat(2, 1fr); }
  .detail-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 700px) {
  .gauges-row { grid-template-columns: 1fr; }
  .detail-grid { grid-template-columns: 1fr; }
  .info-card { flex-direction: column; }
  .info-actions { width: 100%; justify-content: flex-end; }
}
</style>
