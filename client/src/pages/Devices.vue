&lt;template&gt;
  &lt;div class="devices-page"&gt;
    &lt;!-- 统计概览 --&gt;
    &lt;div class="stats-row"&gt;
      &lt;div class="stat-card"&gt;
        &lt;span class="stat-val"&gt;{{ store.stats?.total || 0 }}&lt;/span&gt;
        &lt;span class="stat-label"&gt;{{ $t('devices.totalDevices') }}&lt;/span&gt;
      &lt;/div&gt;
      &lt;div class="stat-card online"&gt;
        &lt;span class="stat-val"&gt;{{ store.stats?.online || 0 }}&lt;/span&gt;
        &lt;span class="stat-label"&gt;{{ $t('devices.online') }}&lt;/span&gt;
      &lt;/div&gt;
      &lt;div class="stat-card offline"&gt;
        &lt;span class="stat-val"&gt;{{ store.stats?.offline || 0 }}&lt;/span&gt;
        &lt;span class="stat-label"&gt;{{ $t('devices.offline') }}&lt;/span&gt;
      &lt;/div&gt;
    &lt;/div&gt;

    &lt;!-- 设备列表 --&gt;
    &lt;el-table :data="store.devices" v-loading="store.loading" stripe class="data-table" @row-click="showDetail" ref="tableRef" @selection-change="onSelectionChange"&gt;
      &lt;el-table-column type="selection" width="42" :selectable="isSelectable" /&gt;
      &lt;el-table-column prop="name" :label="$t('common.name')" min-width="140" /&gt;
      &lt;el-table-column :label="$t('common.status')" width="90"&gt;
        &lt;template #default="{ row }"&gt;
          &lt;el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small" effect="dark"&gt;
            {{ row.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
          &lt;/el-tag&gt;
        &lt;/template&gt;
      &lt;/el-table-column&gt;
      &lt;el-table-column prop="tags" :label="$t('devices.tags')" width="120"&gt;
        &lt;template #default="{ row }"&gt;
          &lt;el-input v-if="editingTag === row.id" v-model="tagInput" size="small" @blur="saveTag(row)" @keyup.enter="saveTag(row)" ref="tagInputRef" /&gt;
          &lt;span v-else @click.stop="startEditTag(row)" class="tag-cell" :class="{ placeholder: !row.tags }"&gt;
            {{ row.tags || $t('devices.clickToTag') }}
          &lt;/span&gt;
        &lt;/template&gt;
      &lt;/el-table-column&gt;
      &lt;el-table-column prop="hostname" :label="$t('devices.hostname')" width="130" /&gt;
      &lt;el-table-column prop="ip" :label="$t('devices.ip')" width="160"&gt;
        &lt;template #default="{ row }"&gt;&lt;code class="mono"&gt;{{ row.ip }}&lt;/code&gt;&lt;/template&gt;
      &lt;/el-table-column&gt;
      &lt;el-table-column prop="os" :label="$t('devices.os')" width="110"&gt;
        &lt;template #default="{ row }"&gt;{{ row.os }} {{ row.arch }}&lt;/template&gt;
      &lt;/el-table-column&gt;
      &lt;el-table-column prop="version" :label="$t('devices.version')" width="100" /&gt;
      &lt;el-table-column :label="$t('devices.lastSeen')" width="170"&gt;
        &lt;template #default="{ row }"&gt;{{ fmtTime(row.last_seen) }}&lt;/template&gt;
      &lt;/el-table-column&gt;
      &lt;el-table-column :label="$t('common.actions')" width="215" fixed="right"&gt;
        &lt;template #default="{ row }"&gt;
          &lt;el-button link type="primary" @click.stop="showCommand(row)" size="small"&gt;
            {{ $t('devices.sendCommand') }}
          &lt;/el-button&gt;
          &lt;el-button v-if="row.status === 'online' &amp;&amp; row.id !== 'dev_local'" link type="success" @click.stop="openSsh(row)" size="small"&gt;
            SSH
          &lt;/el-button&gt;
          &lt;el-popconfirm :title="$t('devices.delConfirm')" @confirm="doDelete(row)" :confirm-button-text="$t('common.confirm')" :cancel-button-text="$t('common.cancel')"&gt;
            &lt;template #reference&gt;
              &lt;el-button link type="danger" @click.stop size="small"&gt;{{ $t('devices.delete') }}&lt;/el-button&gt;
            &lt;/template&gt;
          &lt;/el-popconfirm&gt;
        &lt;/template&gt;
      &lt;/el-table-column&gt;
    &lt;/el-table&gt;

    &lt;!-- 批量操作栏 --&gt;
    &lt;div v-if="selectedDevices.length &gt; 0" class="batch-bar"&gt;
      &lt;span&gt;{{ $t('devices.batchSelected', { n: selectedDevices.length }) }}&lt;/span&gt;
      &lt;el-button size="small" type="primary" @click="showBatchCommand"&gt;
        {{ $t('devices.batchCommand') }}
      &lt;/el-button&gt;
    &lt;/div&gt;

    &lt;!-- ===== 设备详情弹窗 ===== --&gt;
    &lt;el-dialog v-model="detailVisible" :title="detailDevice?.name || $t('devices.detail')" width="720px"&gt;
      &lt;div v-if="detailDevice"&gt;
        &lt;div class="desc-row"&gt;
          &lt;div class="desc-block"&gt;&lt;span class="desc-label"&gt;{{ $t('devices.hostname') }}&lt;/span&gt; {{ detailDevice.hostname }}&lt;/div&gt;
          &lt;div class="desc-block"&gt;&lt;span class="desc-label"&gt;IP&lt;/span&gt; {{ detailDevice.ip }}&lt;/div&gt;
          &lt;div class="desc-block"&gt;&lt;span class="desc-label"&gt;OS&lt;/span&gt; {{ detailDevice.os }} {{ detailDevice.arch }}&lt;/div&gt;
          &lt;div class="desc-block"&gt;&lt;span class="desc-label"&gt;{{ $t('devices.version') }}&lt;/span&gt; {{ detailDevice.version }}&lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- 最近指标 --&gt;
        &lt;h4&gt;{{ $t('devices.metrics') }}
          &lt;el-button-group size="small" style="margin-left:8px"&gt;
            &lt;el-button :type="trendRange===60?'primary':''" @click="trendRange=60;loadTrend()"&gt;1h&lt;/el-button&gt;
            &lt;el-button :type="trendRange===720?'primary':''" @click="trendRange=720;loadTrend()"&gt;12h&lt;/el-button&gt;
            &lt;el-button :type="trendRange===10080?'primary':''" @click="trendRange=10080;loadTrend()"&gt;7d&lt;/el-button&gt;
          &lt;/el-button-group&gt;
        &lt;/h4&gt;
        &lt;canvas ref="trendCanvas" width="680" height="200" class="trend-chart"&gt;&lt;/canvas&gt;

        &lt;!-- 进程列表 --&gt;
        &lt;h4&gt;{{ $t('devices.processes') }}
          &lt;el-button link size="small" @click="loadProcesses" :loading="processesLoading" style="margin-left:8px"&gt;
            {{ $t('common.refresh') }}
          &lt;/el-button&gt;
        &lt;/h4&gt;
        &lt;div v-if="processesData.length" style="max-height: 240px; overflow-y: auto"&gt;
          &lt;el-table :data="processesData" size="small" stripe&gt;
            &lt;el-table-column prop="pid" label="PID" width="70" /&gt;
            &lt;el-table-column prop="user" :label="$t('devices.procUser')" width="80" /&gt;
            &lt;el-table-column label="CPU" width="70"&gt;
              &lt;template #default="{ row }"&gt;{{ row.cpu }}%&lt;/template&gt;
            &lt;/el-table-column&gt;
            &lt;el-table-column label="MEM" width="70"&gt;
              &lt;template #default="{ row }"&gt;{{ row.mem }}%&lt;/template&gt;
            &lt;/el-table-column&gt;
            &lt;el-table-column prop="command" :label="$t('devices.procCommand')" min-width="200" show-overflow-tooltip&gt;
              &lt;template #default="{ row }"&gt;&lt;code class="mono"&gt;{{ row.command }}&lt;/code&gt;&lt;/template&gt;
            &lt;/el-table-column&gt;
          &lt;/el-table&gt;
        &lt;/div&gt;
        &lt;div v-else-if="!processesLoading" class="empty"&gt;{{ $t('devices.noProcesses') }}&lt;/div&gt;

        &lt;!-- 网络连接 --&gt;
        &lt;h4&gt;{{ $t('devices.connections') }}
          &lt;el-button link size="small" @click="loadConnections" :loading="connsLoading" style="margin-left:8px"&gt;
            {{ $t('common.refresh') }}
          &lt;/el-button&gt;
        &lt;/h4&gt;
        &lt;div v-if="connsData.length" style="max-height: 240px; overflow-y: auto"&gt;
          &lt;el-table :data="connsData" size="small" stripe&gt;
            &lt;el-table-column prop="proto" label="Proto" width="65" /&gt;
            &lt;el-table-column prop="local" :label="$t('devices.connLocal')" min-width="180" show-overflow-tooltip&gt;
              &lt;template #default="{ row }"&gt;&lt;code class="mono"&gt;{{ row.local }}&lt;/code&gt;&lt;/template&gt;
            &lt;/el-table-column&gt;
            &lt;el-table-column prop="remote" :label="$t('devices.connRemote')" min-width="180" show-overflow-tooltip&gt;
              &lt;template #default="{ row }"&gt;&lt;code class="mono"&gt;{{ row.remote }}&lt;/code&gt;&lt;/template&gt;
            &lt;/el-table-column&gt;
            &lt;el-table-column prop="state" :label="$t('devices.connState')" width="110"&gt;
              &lt;template #default="{ row }"&gt;
                &lt;el-tag size="small" :type="row.state === 'LISTEN' ? 'info' : 'success'"&gt;{{ row.state }}&lt;/el-tag&gt;
              &lt;/template&gt;
            &lt;/el-table-column&gt;
          &lt;/el-table&gt;
        &lt;/div&gt;
        &lt;div v-else-if="!connsLoading" class="empty"&gt;{{ $t('devices.noConnections') }}&lt;/div&gt;
      &lt;/div&gt;
      &lt;template #footer&gt;
        &lt;el-button @click="detailVisible = false"&gt;{{ $t('common.close') }}&lt;/el-button&gt;
      &lt;/template&gt;
    &lt;/el-dialog&gt;

    &lt;!-- ===== 命令下发弹窗 ===== --&gt;
    &lt;el-dialog v-model="commandVisible" :title="$t('devices.sendCommand')" width="480"&gt;
      &lt;el-form&gt;
        &lt;el-form-item :label="$t('common.name')"&gt;
          &lt;el-input :model-value="commandTarget?.name" disabled /&gt;
        &lt;/el-form-item&gt;
        &lt;el-form-item label="Command"&gt;
          &lt;el-input v-model="commandText" type="textarea" :rows="3"
            :placeholder="$t('devices.commandPlaceholder')" /&gt;
        &lt;/el-form-item&gt;
      &lt;/el-form&gt;
      &lt;template #footer&gt;
        &lt;el-button @click="commandVisible = false"&gt;{{ $t('common.cancel') }}&lt;/el-button&gt;
        &lt;el-button type="primary" @click="doSendCommand" :loading="sending"&gt;
          {{ $t('common.submit') }}
        &lt;/el-button&gt;
      &lt;/template&gt;
    &lt;/el-dialog&gt;

    &lt;!-- ===== 批量命令弹窗 ===== --&gt;
    &lt;el-dialog v-model="batchVisible" :title="$t('devices.batchCommand')" width="550"&gt;
      &lt;div class="batch-list"&gt;
        &lt;el-tag v-for="d in selectedDevices" :key="d.id" size="small" style="margin:0 4px 4px 0"&gt;
          {{ d.name }}
        &lt;/el-tag&gt;
      &lt;/div&gt;
      &lt;el-form style="margin-top:12px"&gt;
        &lt;el-form-item label="Command"&gt;
          &lt;el-input v-model="commandText" type="textarea" :rows="4"
            :placeholder="$t('devices.batchPlaceholder')" /&gt;
        &lt;/el-form-item&gt;
      &lt;/el-form&gt;
      &lt;div v-if="batchResults.length" class="batch-results"&gt;
        &lt;div v-for="r in batchResults" :key="r.deviceId" class="batch-result-item"&gt;
          &lt;span class="batch-device"&gt;{{ r.deviceId }}&lt;/span&gt;
          &lt;el-tag :type="r.status === 'completed' ? 'success' : 'danger'" size="small"&gt;{{ r.status }}&lt;/el-tag&gt;
          &lt;pre class="batch-output"&gt;{{ r.result || r.error }}&lt;/pre&gt;
        &lt;/div&gt;
      &lt;/div&gt;
      &lt;template #footer&gt;
        &lt;el-button @click="batchVisible = false"&gt;{{ $t('common.close') }}&lt;/el-button&gt;
        &lt;el-button type="primary" @click="doBatchCommand" :loading="batchSending"&gt;
          {{ $t('common.submit') }}
        &lt;/el-button&gt;
      &lt;/template&gt;
    &lt;/el-dialog&gt;
  &lt;/div&gt;
&lt;/template&gt;

&lt;script setup lang="ts"&gt;
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useDevicesStore } from '../stores/devices'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import api from '../api'

const { t } = useI18n()
const store = useDevicesStore()

const API_BASE = '/api/v2'

interface Device { id: string; name: string; hostname: string; ip: string; os: string; arch: string; version: string; status: string; last_seen: string; tags?: string }
interface DeviceDetail extends Device { metrics: any[]; commands: any[] }

const detailVisible = ref(false)
const detailDevice = ref&lt;DeviceDetail | null&gt;(null)
const commandVisible = ref(false)
const commandTarget = ref&lt;Device | null&gt;(null)
const commandText = ref('')
const sending = ref(false)

// Batch commands
const tableRef = ref()
const selectedDevices = ref&lt;Device[]&gt;([])
const batchVisible = ref(false)
const batchSending = ref(false)
const batchResults = ref&lt;any[]&gt;([])

// Tags
const editingTag = ref&lt;string | null&gt;(null)
const tagInput = ref('')
const tagInputRef = ref()

// Trend chart
const trendCanvas = ref()
const trendRange = ref(60)
const trendData = ref&lt;any[]&gt;([])

// Processes & Connections
const processesData = ref&lt;any[]&gt;([])
const connsData = ref&lt;any[]&gt;([])
const processesLoading = ref(false)
const connsLoading = ref(false)

// ---------- LocalProvider 指标自动刷新 ----------
let localTimer: any = null
const isLocal = (d: Device) =&gt; d.id === 'dev_local'

// Start local metrics polling when detail opens for local device
watch(detailVisible, (v) =&gt; {
  if (!v) { clearInterval(localTimer); localTimer = null; return }
})

onMounted(() =&gt; { store.load(); store.loadStats() })

function fmtTime(t: string) {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  return d.toLocaleString()
}

async function showDetail(row: Device) {
  detailVisible.value = true
  detailDevice.value = null
  processesData.value = []
  connsData.value = []
  await store.loadDetail(row.id)
  detailDevice.value = store.currentDevice
  await nextTick()
  trendRange.value = 60
  loadTrend()
  loadProcesses()
  loadConnections()
}

// Selection
function isSelectable(row: Device) { return row.status === 'online' || row.id === 'dev_local' }
function onSelectionChange(rows: Device[]) { selectedDevices.value = rows }

// Tags
function startEditTag(row: Device) {
  editingTag.value = row.id
  tagInput.value = row.tags || ''
  nextTick(() =&gt; tagInputRef.value?.focus?.())
}
async function saveTag(row: Device) {
  try {
    await api.put(`/v2/device/${row.id}/tags`, { tags: tagInput.value })
    row.tags = tagInput.value
  } catch { /* ignore */ }
  editingTag.value = null
}

// SSH shortcut
function openSsh(row: Device) {
  window.location.hash = '#/ssh'
}

// Batch commands
function showBatchCommand() {
  commandText.value = ''
  batchResults.value = []
  batchVisible.value = true
}
async function doBatchCommand() {
  if (!commandText.value.trim()) return ElMessage.warning(t('devices.commandPlaceholder'))
  batchSending.value = true
  try {
    const { data } = await api.post('/v2/device/commands/batch', {
      deviceIds: selectedDevices.value.map(d =&gt; d.id),
      command: commandText.value
    }) as any
    batchResults.value = data?.data || []
    ElMessage.success(`${batchResults.value.length} ${t('devices.commandSent')}`)
  } catch {
    ElMessage.error(t('common.error'))
  }
  finally { batchSending.value = false }
}

// Command
function showCommand(row: Device) {
  commandTarget.value = row
  commandText.value = ''
  commandVisible.value = true
}
async function doSendCommand() {
  if (!commandText.value.trim()) return
  sending.value = true
  try {
    const { data } = await axios.post(`${API_BASE}/device/command`, {
      deviceId: commandTarget.value?.id, command: commandText.value
    })
    ElMessage.success(t('devices.commandSent'))
    commandVisible.value = false
  } catch {
    ElMessage.error(t('common.error'))
  }
  finally { sending.value = false }
}

// Delete
async function doDelete(row: Device) {
  try {
    await axios.delete(`${API_BASE}/device/${row.id}`)
    ElMessage.success(t('devices.deleted'))
    await store.load()
  } catch {
    ElMessage.error(t('common.error'))
  }
}

// Trend chart
async function loadTrend() {
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value!.id}/metrics`, {
      params: { range: trendRange.value }
    })
    trendData.value = data?.data || []
    drawTrend()
  } catch { drawTrend() }
}

function drawTrend() {
  const canvas = trendCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  const rows = trendData.value || []
  ctx.clearRect(0, 0, w, h)
  if (rows.length &lt; 2) {
    ctx.fillStyle = '#999'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(t('devices.noTrendData'), w/2, h/2)
    return
  }

  // Draw grid
  ctx.strokeStyle = '#e8e8e8'
  ctx.lineWidth = 0.5
  for (let i = 0; i &lt;= 4; i++) {
    const y = 10 + (h-20) * i / 4
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // CPU line
  drawLine(ctx, rows, w, h, '#4F7CFF', 'cpu')
  // MEM line
  drawLine(ctx, rows, w, h, '#15C39A', 'memory_pct')
  // DISK line
  drawLine(ctx, rows, w, h, '#F59E0B', 'disk_pct')
}

function drawLine(ctx: any, rows: any[], w: number, h: number, color: string, key: string) {
  const n = rows.length
  const xStep = (w - 20) / (n - 1)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i &lt; n; i++) {
    const x = 10 + i * xStep
    const val = Math.min(100, parseFloat(rows[i][key]) || 0)
    const y = h - 10 - val / 100 * (h - 20)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// Processes
async function loadProcesses() {
  if (!detailDevice.value) return
  processesLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value.id}/processes`)
    processesData.value = data?.data || []
  } catch { processesData.value = [] }
  finally { processesLoading.value = false }
}

// Connections
async function loadConnections() {
  if (!detailDevice.value) return
  connsLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value.id}/connections`)
    connsData.value = data?.data || []
  } catch { connsData.value = [] }
  finally { connsLoading.value = false }
}
&lt;/script&gt;

&lt;style scoped&gt;
.stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
.stat-card { flex: 1; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; text-align: center; }
.stat-card.online { border-left: 3px solid var(--el-color-success); }
.stat-card.offline { border-left: 3px solid var(--el-color-info); }
.stat-val { font-size: 28px; font-weight: 700; display: block; color: var(--text-primary); }
.stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

.desc-row { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 16px; }
.desc-block { font-size: 13px; }
.desc-label { color: var(--text-secondary); margin-right: 4px; }
h4 { font-size: 14px; margin: 16px 0 8px; color: var(--text-primary); display: flex; align-items: center; }
.empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 13px; }
.trend-chart { width: 100%; height: auto; border: 1px solid var(--border-color); border-radius: 6px; margin-top: 8px; }
.mono { font-family: monospace; font-size: 12px; }

/* Batch */
.batch-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: var(--accent);
  color: #fff; border-radius: 8px;
  font-size: 13px; font-weight: 500;
  margin-top: 12px;
}
.batch-bar .el-button { --el-button-bg-color: rgba(255,255,255,0.2); --el-button-text-color: #fff; --el-button-border-color: transparent; }
.batch-list { margin-bottom: 4px; }
.batch-results { margin-top: 12px; max-height: 300px; overflow-y: auto; }
.batch-result-item { margin-bottom: 10px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; }
.batch-device { font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px; }
.batch-output { margin: 6px 0 0; font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all; max-height: 100px; overflow-y: auto; color: var(--text-secondary); }

/* Tags */
.tag-cell { cursor: pointer; font-size: 12px; padding: 2px 8px; background: var(--bg-elevated); border-radius: 4px; display: inline-block; min-width: 40px; }
.tag-cell.placeholder { color: var(--text-tertiary); }
&lt;/style&gt;
