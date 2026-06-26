<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('devices.title') }}</h2>
        <p class="sub">{{ $t('devices.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="refresh" :icon="Refresh" :loading="store.loading">
        {{ $t('common.refresh') }}
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card online">
        <div class="stat-val">{{ store.stats.online }}</div>
        <div class="stat-label">{{ $t('devices.statsOnline') }}</div>
      </div>
      <div class="stat-card offline">
        <div class="stat-val">{{ store.stats.offline }}</div>
        <div class="stat-label">{{ $t('devices.statsOffline') }}</div>
      </div>
      <div class="stat-card total">
        <div class="stat-val">{{ store.stats.total }}</div>
        <div class="stat-label">{{ $t('devices.statsTotal') }}</div>
      </div>
    </div>

    <!-- 设备列表 -->
    <el-table :data="store.devices" v-loading="store.loading" stripe class="data-table" @row-click="showDetail">
      <el-table-column prop="name" :label="$t('common.name')" min-width="150" />
      <el-table-column :label="$t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small" effect="dark">
            {{ row.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="hostname" :label="$t('devices.hostname')" width="130" />
      <el-table-column prop="ip" :label="$t('devices.ip')" width="160">
        <template #default="{ row }"><code class="mono">{{ row.ip }}</code></template>
      </el-table-column>
      <el-table-column prop="os" :label="$t('devices.os')" width="110">
        <template #default="{ row }">{{ row.os }} {{ row.arch }}</template>
      </el-table-column>
      <el-table-column prop="version" :label="$t('devices.version')" width="100" />
      <el-table-column :label="$t('devices.lastSeen')" width="170">
        <template #default="{ row }">{{ fmtTime(row.last_seen) }}</template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="showCommand(row)" size="small">
            {{ $t('devices.sendCommand') }}
          </el-button>
          <el-popconfirm :title="$t('devices.delConfirm')" @confirm="doDelete(row)" :confirm-button-text="$t('common.confirm')" :cancel-button-text="$t('common.cancel')">
            <template #reference>
              <el-button link type="danger" @click.stop size="small">{{ $t('devices.delete') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- ===== 设备详情弹窗 ===== -->
    <el-dialog v-model="detailVisible" :title="detailDevice?.name" width="820" top="3vh" destroy-on-close>
      <template v-if="detailDevice">
        <!-- 基本信息 -->
        <el-descriptions :column="3" border size="small" class="desc-block">
          <el-descriptions-item :label="$t('common.status')">
            <el-tag :type="detailDevice.status === 'online' ? 'success' : 'info'" size="small" effect="dark">
              {{ detailDevice.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('devices.hostname')">{{ detailDevice.hostname }}</el-descriptions-item>
          <el-descriptions-item :label="$t('devices.ip')"><code>{{ detailDevice.ip }}</code></el-descriptions-item>
          <el-descriptions-item :label="$t('devices.os')">{{ detailDevice.os }} {{ detailDevice.arch }}</el-descriptions-item>
          <el-descriptions-item :label="$t('devices.version')">{{ detailDevice.version || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('devices.lastSeen')">{{ fmtTime(detailDevice.last_seen) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 指标历史表 -->
        <h4>{{ $t('devices.metrics') }}</h4>
        <div v-if="detailDevice.metrics?.length" style="max-height: 240px; overflow-y: auto">
          <el-table :data="detailDevice.metrics.slice(0, 30)" size="small" stripe>
            <el-table-column :label="$t('devices.cpu')" width="75">
              <template #default="{ row }">{{ row.cpu?.toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.memory')" width="75">
              <template #default="{ row }">{{ row.memory_pct?.toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.disk')" width="75">
              <template #default="{ row }">{{ row.disk_pct?.toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.network')" width="190">
              <template #default="{ row }">
                ↓{{ fmtBytes(row.net_rx) }}/s &nbsp; ↑{{ fmtBytes(row.net_tx) }}/s
              </template>
            </el-table-column>
            <el-table-column :label="$t('devices.uptime')" width="100">
              <template #default="{ row }">{{ fmtUptime(row.uptime) }}</template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="155">
              <template #default="{ row }">{{ fmtTime(row.collected_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noMetrics') }}</div>

        <!-- 趋势图 -->
        <h4>{{ $t('devices.trend') }}
          <span class="trend-tabs">
            <el-button size="small" :type="trendRange === 60 ? 'primary' : ''" @click="loadTrend(60)">{{ $t('devices.trend1h') }}</el-button>
            <el-button size="small" :type="trendRange === 360 ? 'primary' : ''" @click="loadTrend(360)">{{ $t('devices.trend6h') }}</el-button>
            <el-button size="small" :type="trendRange === 1440 ? 'primary' : ''" @click="loadTrend(1440)">{{ $t('devices.trend24h') }}</el-button>
          </span>
        </h4>
        <div class="chart-wrap">
          <canvas ref="trendCanvas" width="760" height="240" class="trend-canvas"></canvas>
        </div>

        <!-- 命令历史 -->
        <h4>{{ $t('devices.commands') }}</h4>
        <div v-if="detailDevice.commands?.length" style="max-height: 180px; overflow-y: auto">
          <el-table :data="detailDevice.commands.slice(0, 10)" size="small" stripe>
            <el-table-column prop="command" label="Command" min-width="180" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.command }}</code></template>
            </el-table-column>
            <el-table-column :label="$t('common.status')" width="90">
              <template #default="{ row }">
                <el-tag :type="cmdTagType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="155">
              <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noCommands') }}</div>
      </template>
    </el-dialog>

    <!-- ===== 命令下发弹窗 ===== -->
    <el-dialog v-model="commandVisible" :title="$t('devices.sendCommand')" width="480">
      <el-form>
        <el-form-item :label="$t('common.name')">
          <el-input :model-value="commandTarget?.name" disabled />
        </el-form-item>
        <el-form-item label="Command">
          <el-input v-model="commandText" type="textarea" :rows="3"
            :placeholder="$t('devices.commandPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="commandVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSendCommand" :loading="sending">
          {{ $t('common.submit') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 告警规则区域 ===== -->
    <div class="section">
      <div class="section-header">
        <h3>{{ $t('devices.alerts') }}</h3>
        <el-button size="small" type="primary" @click="showAlertForm(null)">+ {{ $t('devices.alertAdd') }}</el-button>
      </div>
      <el-table :data="store.alertRules" v-loading="store.alertLoading" size="small" stripe>
        <el-table-column prop="name" :label="$t('devices.alertName')" min-width="120" />
        <el-table-column :label="$t('devices.alertMetric')" width="80">
          <template #default="{ row }">{{ row.metric === 'cpu' ? $t('devices.cpu') : row.metric === 'memory' ? $t('devices.memory') : $t('devices.disk') }}</template>
        </el-table-column>
        <el-table-column width="110">
          <template #default="{ row }">
            {{ row.operator === 'gt' ? $t('devices.opGt') : $t('devices.opLt') }} {{ row.threshold }}%
          </template>
        </el-table-column>
        <el-table-column :label="$t('devices.alertDevice')" width="130">
          <template #default="{ row }">{{ row.device_id || $t('devices.alertAllDevices') }}</template>
        </el-table-column>
        <el-table-column :label="$t('devices.alertEnabled')" width="80">
          <template #default="{ row }">
            <el-switch :model-value="!!row.enabled" @change="store.toggleAlertRule(row.id)" size="small" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="100">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="doDeleteAlert(row)">{{ $t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!store.alertRules?.length && !store.alertLoading" class="empty">{{ $t('devices.alertNoRules') }}</div>
    </div>

    <!-- 告警规则编辑弹窗 -->
    <el-dialog v-model="alertFormVisible" :title="$t('devices.alertAdd')" width="420" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item :label="$t('devices.alertName')">
          <el-input v-model="alertForm.name" placeholder="如 CPU 过高" maxlength="30" />
        </el-form-item>
        <el-form-item :label="$t('devices.alertMetric')">
          <el-select v-model="alertForm.metric">
            <el-option label="CPU" value="cpu" />
            <el-option :label="$t('devices.memory')" value="memory" />
            <el-option :label="$t('devices.disk')" value="disk" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('devices.alertThreshold')">
          <el-input-number v-model="alertForm.threshold" :min="1" :max="100" :step="1" />
        </el-form-item>
        <el-form-item :label="$t('devices.alertDevice')">
          <el-select v-model="alertForm.device_id" :placeholder="$t('devices.alertAllDevices')" clearable>
            <el-option v-for="d in store.devices" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="alertFormVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSaveAlert" :loading="alertSaving">{{ $t('common.submit') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useDevicesStore } from '../stores/devices'
import type { Device, DeviceDetail, AlertRule } from '../stores/devices'

const { t } = useI18n()
const store = useDevicesStore()

const detailVisible = ref(false)
const detailDevice = ref<DeviceDetail | null>(null)
const commandVisible = ref(false)
const commandTarget = ref<Device | null>(null)
const commandText = ref('')
const sending = ref(false)

// Trend chart
const trendCanvas = ref<HTMLCanvasElement | null>(null)
const trendRange = ref(60)

// Alert form
const alertFormVisible = ref(false)
const alertForm = ref({ name: '', metric: 'cpu', threshold: 90, device_id: '' })
const alertSaving = ref(false)

onMounted(() => {
  store.load()
  store.loadAlertRules()
})

function refresh() {
  store.load()
  store.loadAlertRules()
}

async function showDetail(row: Device) {
  detailVisible.value = true
  detailDevice.value = null
  await store.loadDetail(row.id)
  detailDevice.value = store.currentDevice
  await nextTick()
  trendRange.value = 60
  drawTrend([], [], [])
}

async function loadTrend(minutes: number) {
  trendRange.value = minutes
  if (!detailDevice.value) return
  const metrics = detailDevice.value.metrics || []
  // Filter metrics within time range
  if (metrics.length === 0) { drawTrend([], [], []); return }
  const now = Date.now()
  const cutoff = now - minutes * 60 * 1000
  const filtered = metrics.filter(m => new Date(m.collected_at).getTime() > cutoff).reverse()
  if (filtered.length === 0) { drawTrend([], [], []); return }

  const labels = filtered.map(m => {
    const d = new Date(m.collected_at)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  })
  const cpu = filtered.map(m => m.cpu ?? 0)
  const mem = filtered.map(m => m.memory_pct ?? 0)
  const disk = filtered.map(m => m.disk_pct ?? 0)
  drawTrend(labels, cpu, mem, disk)
}

function drawTrend(labels: string[], cpu: number[], mem: number[], disk: number[]) {
  const canvas = trendCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const pad = { top: 20, right: 20, bottom: 30, left: 40 }
  const pw = W - pad.left - pad.right
  const ph = H - pad.top - pad.bottom

  ctx.clearRect(0, 0, W, H)

  // Background
  const isDark = document.documentElement.classList.contains('dark')
  ctx.fillStyle = isDark ? '#1a1a2e' : '#fafbfc'
  ctx.fillRect(0, 0, W, H)

  // Grid
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph / 4) * i
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke()
  }

  // Y-axis labels
  ctx.fillStyle = isDark ? '#888' : '#999'
  ctx.font = '10px monospace'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const val = 100 - i * 25
    const y = pad.top + (ph / 4) * i
    ctx.fillText(val + '%', pad.left - 6, y + 4)
  }

  if (labels.length === 0) {
    ctx.fillStyle = isDark ? '#555' : '#ccc'
    ctx.textAlign = 'center'
    ctx.font = '13px sans-serif'
    ctx.fillText(t('devices.noMetrics'), W / 2, H / 2)
    return
  }

  // X-axis labels (max 12)
  ctx.textAlign = 'center'
  const xStep = Math.max(1, Math.floor(labels.length / 12))
  for (let i = 0; i < labels.length; i += xStep) {
    const x = pad.left + (pw / Math.max(1, labels.length - 1)) * i
    ctx.fillText(labels[i], x, H - pad.bottom + 14)
  }

  // Draw lines
  const lines = [
    { data: cpu, color: '#5DA9FF', label: 'CPU' },
    { data: mem, color: '#A78BFA', label: 'RAM' },
    { data: disk, color: '#5BE7C4', label: 'Disk' }
  ]

  const yScale = (v: number) => pad.top + ph - (v / 100) * ph

  for (const line of lines) {
    ctx.strokeStyle = line.color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < line.data.length; i++) {
      const x = pad.left + (pw / Math.max(1, line.data.length - 1)) * i
      const y = yScale(Math.min(100, Math.max(0, line.data[i])))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Legend
    const lx = W - pad.right - 180 + lines.indexOf(line) * 70
    ctx.fillStyle = line.color
    ctx.fillRect(lx, 4, 10, 10)
    ctx.fillStyle = isDark ? '#ccc' : '#444'
    ctx.textAlign = 'left'
    ctx.font = '10px sans-serif'
    ctx.fillText(line.label, lx + 12, 13)
  }
}

function showCommand(row: Device) {
  commandTarget.value = row
  commandText.value = ''
  commandVisible.value = true
}

async function doSendCommand() {
  if (!commandText.value.trim() || !commandTarget.value) {
    return ElMessage.warning(t('devices.commandPlaceholder'))
  }
  sending.value = true
  try {
    await store.sendCommand(commandTarget.value.id, commandText.value)
    ElMessage.success(t('devices.commandSent'))
    commandVisible.value = false
  } catch {
    ElMessage.error(t('common.error'))
  }
  finally { sending.value = false }
}

async function doDelete(row: Device) {
  try {
    await store.deleteDevice(row.id)
    ElMessage.success(t('common.success'))
    if (detailDevice.value?.id === row.id) detailVisible.value = false
  } catch {
    ElMessage.error(t('common.error'))
  }
}

// Alert CRUD
function showAlertForm(_rule: AlertRule | null) {
  alertForm.value = { name: '', metric: 'cpu', threshold: 90, device_id: '' }
  alertFormVisible.value = true
}

async function doSaveAlert() {
  if (!alertForm.value.name.trim()) return ElMessage.warning(t('devices.alertName'))
  alertSaving.value = true
  try {
    await store.createAlertRule({
      name: alertForm.value.name,
      metric: alertForm.value.metric,
      operator: 'gt',
      threshold: alertForm.value.threshold,
      device_id: alertForm.value.device_id || undefined
    })
    ElMessage.success(t('common.success'))
    alertFormVisible.value = false
    store.loadAlertRules()
  } catch {
    ElMessage.error(t('common.error'))
  }
  finally { alertSaving.value = false }
}

async function doDeleteAlert(rule: AlertRule) {
  try {
    await ElMessageBox.confirm(t('devices.alertDelete'), t('common.warning'), { type: 'warning' })
    await store.deleteAlertRule(rule.id)
    ElMessage.success(t('common.success'))
  } catch { /* cancelled */ }
}

// Watch for detail device change → redraw trend
watch(() => detailDevice.value?.metrics, (metrics) => {
  if (detailVisible.value && metrics) {
    nextTick(() => loadTrend(trendRange.value))
  }
}, { deep: false })

function fmtTime(ts: string) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function fmtBytes(bytes: number | null) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function fmtUptime(secs: number | null) {
  if (!secs || secs <= 0) return '-'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function cmdTagType(status: string) {
  const map: Record<string, any> = { pending: 'info', running: 'warning', success: 'success', failed: 'danger' }
  return map[status] || 'info'
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0; }
.sub { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }

.stats-row { display: flex; gap: 16px; }
.stat-card {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  text-align: center;
}
.stat-val { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.stat-card.online .stat-val { color: var(--accent-green); }
.stat-card.offline .stat-val { color: var(--text-tertiary); }
.stat-card.total .stat-val { color: var(--accent); }

.data-table { width: 100%; cursor: pointer; }

.mono { font-family: var(--font-mono); font-size: 12px; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; }
html.dark .mono { background: rgba(255,255,255,0.06); }

.empty { text-align: center; color: var(--text-tertiary); padding: 24px; font-size: 13px; }

h4 { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 16px 0 8px; display: flex; align-items: center; gap: 12px; }

/* Trend */
.trend-tabs { font-weight: 400; display: flex; gap: 4px; }
.trend-tabs .el-button { padding: 4px 10px; font-size: 12px; }
.chart-wrap { border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; }
.trend-canvas { width: 100%; height: auto; display: block; }

/* Section */
.section { margin-top: 4px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-header h3 { font-size: 16px; font-weight: 600; margin: 0; color: var(--text-primary); }

.desc-block { margin-bottom: 4px; }
</style>
