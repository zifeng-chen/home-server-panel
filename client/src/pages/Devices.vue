<template>
  <div class="devices-page">
    <!-- 统计概览 -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-val">{{ store.stats?.total || 0 }}</span>
        <span class="stat-label">{{ $t('devices.totalDevices') }}</span>
      </div>
      <div class="stat-card online">
        <span class="stat-val">{{ store.stats?.online || 0 }}</span>
        <span class="stat-label">{{ $t('devices.online') }}</span>
      </div>
      <div class="stat-card offline">
        <span class="stat-val">{{ store.stats?.offline || 0 }}</span>
        <span class="stat-label">{{ $t('devices.offline') }}</span>
      </div>
    </div>

    <!-- 设备列表 -->
    <el-table :data="store.devices" v-loading="store.loading" stripe class="data-table" @row-click="showDetail" ref="tableRef" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="42" :selectable="isSelectable" />
      <el-table-column prop="name" :label="$t('common.name')" min-width="140" />
      <el-table-column :label="$t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small" effect="dark">
            {{ row.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="tags" :label="$t('devices.tags')" width="120">
        <template #default="{ row }">
          <el-input v-if="editingTag === row.id" v-model="tagInput" size="small" @blur="saveTag(row)" @keyup.enter="saveTag(row)" ref="tagInputRef" />
          <span v-else @click.stop="startEditTag(row)" class="tag-cell" :class="{ placeholder: !row.tags }">
            {{ row.tags || $t('devices.clickToTag') }}
          </span>
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
      <el-table-column :label="$t('common.actions')" width="215" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="showCommand(row)" size="small">
            {{ $t('devices.sendCommand') }}
          </el-button>
          <el-button v-if="row.status === 'online' && row.id !== 'dev_local'" link type="success" @click.stop="openSsh(row)" size="small">
            SSH
          </el-button>
          <el-popconfirm :title="$t('devices.delConfirm')" @confirm="doDelete(row)" :confirm-button-text="$t('common.confirm')" :cancel-button-text="$t('common.cancel')">
            <template #reference>
              <el-button link type="danger" @click.stop size="small">{{ $t('devices.delete') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 批量操作栏 -->
    <div v-if="selectedDevices.length > 0" class="batch-bar">
      <span>{{ $t('devices.batchSelected', { n: selectedDevices.length }) }}</span>
      <el-button size="small" type="primary" @click="showBatchCommand">
        {{ $t('devices.batchCommand') }}
      </el-button>
    </div>

    <!-- ===== 设备详情弹窗 ===== -->
    <el-dialog v-model="detailVisible" :title="detailDevice?.name || $t('devices.detail')" width="760px">
      <div v-if="detailDevice">
        <div class="desc-row">
          <div class="desc-block"><span class="desc-label">{{ $t('devices.hostname') }}</span> {{ detailDevice.hostname }}</div>
          <div class="desc-block"><span class="desc-label">IP</span> {{ detailDevice.ip }}</div>
          <div class="desc-block"><span class="desc-label">OS</span> {{ detailDevice.os }} {{ detailDevice.arch }}</div>
          <div class="desc-block"><span class="desc-label">{{ $t('devices.version') }}</span> {{ detailDevice.version }}</div>
        </div>

        <!-- 指标历史表 -->
        <h4>{{ $t('devices.metrics') }}</h4>
        <div v-if="detailDevice.metrics?.length" style="max-height: 240px; overflow-y: auto">
          <el-table :data="detailDevice.metrics.slice(0, 30)" size="small" stripe>
            <el-table-column :label="$t('devices.cpu')" width="70">
              <template #default="{ row }">{{ toFixed(row.cpu, 1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.memory')" width="70">
              <template #default="{ row }">{{ toFixed(row.memory_pct, 1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.disk')" width="70">
              <template #default="{ row }">{{ toFixed(row.disk_pct, 1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.network')" width="200">
              <template #default="{ row }">
                <span style="color:#4F7CFF">↓{{ fmtBytes(row.net_rx) }}/s</span>
                <span style="margin:0 6px"></span>
                <span style="color:#15C39A">↑{{ fmtBytes(row.net_tx) }}/s</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('devices.uptime')" width="100">
              <template #default="{ row }">{{ fmtUptime(row.uptime) }}</template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="160">
              <template #default="{ row }">{{ fmtTime(row.collected_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noMetrics') }}</div>

        <!-- 趋势图 -->
        <h4>{{ $t('devices.trend') }}
          <el-button-group size="small" style="margin-left:8px">
            <el-button :type="trendRange===60?'primary':''" @click="trendRange=60;loadTrend()">1h</el-button>
            <el-button :type="trendRange===720?'primary':''" @click="trendRange=720;loadTrend()">12h</el-button>
            <el-button :type="trendRange===10080?'primary':''" @click="trendRange=10080;loadTrend()">7d</el-button>
          </el-button-group>
        </h4>
        <canvas ref="trendCanvas" width="720" height="200" class="trend-chart"></canvas>

        <!-- 进程列表 -->
        <h4>{{ $t('devices.processes') }}
          <el-button link size="small" @click="loadProcesses" :loading="processesLoading" style="margin-left:8px">
            {{ $t('common.refresh') }}
          </el-button>
        </h4>
        <div v-if="processesData.length" style="max-height: 240px; overflow-y: auto">
          <el-table :data="processesData" size="small" stripe>
            <el-table-column prop="pid" label="PID" width="70" />
            <el-table-column prop="user" :label="$t('devices.procUser')" width="80" />
            <el-table-column label="CPU" width="70">
              <template #default="{ row }">{{ row.cpu }}%</template>
            </el-table-column>
            <el-table-column label="MEM" width="70">
              <template #default="{ row }">{{ row.mem }}MB</template>
            </el-table-column>
            <el-table-column prop="command" :label="$t('devices.procCommand')" min-width="200" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.command }}</code></template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else-if="!processesLoading" class="empty">{{ $t('devices.noProcesses') }}</div>

        <!-- 网络连接 -->
        <h4>{{ $t('devices.connections') }}
          <el-button link size="small" @click="loadConnections" :loading="connsLoading" style="margin-left:8px">
            {{ $t('common.refresh') }}
          </el-button>
        </h4>
        <div v-if="connsData.length" style="max-height: 240px; overflow-y: auto">
          <el-table :data="connsData" size="small" stripe>
            <el-table-column prop="proto" label="Proto" width="65" />
            <el-table-column prop="local" :label="$t('devices.connLocal')" min-width="200" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.local }}</code></template>
            </el-table-column>
            <el-table-column prop="remote" :label="$t('devices.connRemote')" min-width="200" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.remote }}</code></template>
            </el-table-column>
            <el-table-column prop="state" :label="$t('devices.connState')" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="row.state === 'LISTEN' ? 'info' : 'success'">{{ row.state }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else-if="!connsLoading" class="empty">{{ $t('devices.noConnections') }}</div>

        <!-- 命令历史 -->
        <h4>{{ $t('devices.commandHistory') }}</h4>
        <div v-if="detailDevice.commands?.length" style="max-height: 200px; overflow-y: auto">
          <el-table :data="detailDevice.commands.slice(0, 20)" size="small" stripe>
            <el-table-column prop="command" :label="$t('devices.command')" min-width="180" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.command }}</code></template>
            </el-table-column>
            <el-table-column :label="$t('common.status')" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'info'">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="160">
              <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noCommands') }}</div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">{{ $t('common.close') }}</el-button>
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

    <!-- ===== 批量命令弹窗 ===== -->
    <el-dialog v-model="batchVisible" :title="$t('devices.batchCommand')" width="550">
      <div class="batch-list">
        <el-tag v-for="d in selectedDevices" :key="d.id" size="small" style="margin:0 4px 4px 0">
          {{ d.name }}
        </el-tag>
      </div>
      <el-form style="margin-top:12px">
        <el-form-item label="Command">
          <el-input v-model="commandText" type="textarea" :rows="4"
            :placeholder="$t('devices.batchPlaceholder')" />
        </el-form-item>
      </el-form>
      <div v-if="batchResults.length" class="batch-results">
        <div v-for="r in batchResults" :key="r.deviceId" class="batch-result-item">
          <span class="batch-device">{{ r.deviceId }}</span>
          <el-tag :type="r.status === 'completed' ? 'success' : 'danger'" size="small">{{ r.status }}</el-tag>
          <pre class="batch-output">{{ r.result || r.error }}</pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="batchVisible = false">{{ $t('common.close') }}</el-button>
        <el-button type="primary" @click="doBatchCommand" :loading="batchSending">
          {{ $t('common.submit') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 告警规则区域 ===== -->
    <div class="section" style="margin-top: 24px">
      <div class="section-header">
        <h3>{{ $t('devices.alerts') }}</h3>
        <el-button size="small" type="primary" @click="showAlertForm(null)">+ {{ $t('devices.alertAdd') }}</el-button>
      </div>
      <el-table :data="store.alertRules" v-loading="store.alertLoading" size="small" stripe>
        <el-table-column prop="name" :label="$t('devices.alertName')" min-width="120" />
        <el-table-column :label="$t('devices.alertMetric')" width="80">
          <template #default="{ row }">{{ row.metric }}</template>
        </el-table-column>
        <el-table-column :label="$t('devices.alertThreshold')" width="100">
          <template #default="{ row }">{{ row.metric === 'disk_pct' || row.metric === 'memory_pct' || row.metric === 'cpu' ? row.threshold + '%' : row.threshold }}</template>
        </el-table-column>
        <el-table-column :label="$t('devices.alertDevice')" width="130">
          <template #default="{ row }">{{ row.device_id || $t('devices.alertAllDevices') }}</template>
        </el-table-column>
        <el-table-column :label="$t('devices.alertEnabled')" width="80">
          <template #default="{ row }">
            <el-switch :model-value="!!row.enabled" @change="toggleAlert(row)" size="small" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="100">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="showAlertForm(row)">{{ $t('common.edit') }}</el-button>
            <el-button link type="danger" size="small" @click="deleteAlert(row)">{{ $t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!store.alertRules?.length && !store.alertLoading" class="empty">{{ $t('devices.alertNoRules') }}</div>
    </div>

    <!-- 告警规则编辑弹窗 -->
    <el-dialog v-model="alertFormVisible" :title="alertEditId ? $t('common.edit') : $t('devices.alertAdd')" width="420" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item :label="$t('devices.alertName')">
          <el-input v-model="alertForm.name" placeholder="如 CPU 过高" maxlength="30" />
        </el-form-item>
        <el-form-item :label="$t('devices.alertMetric')">
          <el-select v-model="alertForm.metric">
            <el-option label="CPU" value="cpu" />
            <el-option :label="$t('devices.memory')" value="memory_pct" />
            <el-option :label="$t('devices.disk')" value="disk_pct" />
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
import { ref, onMounted, nextTick, watch } from 'vue'
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

// ---------- details ----------
const detailVisible = ref(false)
const detailDevice = ref<DeviceDetail | null>(null)
const trendCanvas = ref()
const trendData = ref<any[]>([])
const trendRange = ref(60)
const processesData = ref<any[]>([])
const processesLoading = ref(false)
const connsData = ref<any[]>([])
const connsLoading = ref(false)
let localTimer: any = null

// ---------- command ----------
const commandVisible = ref(false)
const commandTarget = ref<Device | null>(null)
const commandText = ref('')
const sending = ref(false)

// ---------- batch ----------
const selectedDevices = ref<Device[]>([])
const batchVisible = ref(false)
const batchResults = ref<any[]>([])
const batchSending = ref(false)

// ---------- tags ----------
const editingTag = ref('')
const tagInput = ref('')
const tagInputRef = ref()

// ---------- alert ----------
const alertFormVisible = ref(false)
const alertEditId = ref<number | null>(null)
const alertForm = ref({ name: '', metric: 'cpu', threshold: 90, device_id: '' })
const alertSaving = ref(false)

// ---------- lifecycle ----------
watch(detailVisible, (v) => {
  if (!v) { clearInterval(localTimer); localTimer = null }
})

onMounted(() => {
  store.load()
  store.loadStats()
  store.loadAlertRules()
})

function refresh() {
  store.load()
  store.loadAlertRules()
}

function fmtTime(t: string) {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  return d.toLocaleString()
}

function toFixed(v: any, n: number) {
  const num = parseFloat(v)
  return isNaN(num) ? '0' : num.toFixed(n)
}

function fmtBytes(b: any) {
  const n = parseFloat(b)
  if (isNaN(n) || n === 0) return '0 B'
  if (n < 1024) return n.toFixed(0) + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function fmtUptime(s: any) {
  const sec = parseInt(s) || 0
  if (sec < 60) return sec + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  return d + 'd ' + h + 'h'
}

// ---------- detail ----------
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

// ---------- selection ----------
function isSelectable(row: Device) { return row.status === 'online' || row.id === 'dev_local' }
function onSelectionChange(rows: Device[]) { selectedDevices.value = rows }

// ---------- tags ----------
function startEditTag(row: Device) {
  editingTag.value = row.id
  tagInput.value = row.tags || ''
  nextTick(() => tagInputRef.value?.focus?.())
}
async function saveTag(row: Device) {
  try {
    await api.put(`/v2/device/${row.id}/tags`, { tags: tagInput.value })
    row.tags = tagInput.value
  } catch { /* ignore */ }
  editingTag.value = null
}

// ---------- SSH ----------
function openSsh(row: Device) {
  sessionStorage.setItem('ssh_preset', JSON.stringify({
    host: row.ip || row.id,
    port: 22,
    username: 'root',
    name: row.name || row.hostname || row.id
  }))
  window.location.hash = '#/ssh'
}

// ---------- batch ----------
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
      deviceIds: selectedDevices.value.map(d => d.id),
      command: commandText.value
    }) as any
    batchResults.value = data?.data || []
    ElMessage.success(`${batchResults.value.length} ${t('devices.commandSent')}`)
  } catch {
    ElMessage.error(t('common.error'))
  } finally { batchSending.value = false }
}

// ---------- command ----------
function showCommand(row: Device) {
  commandTarget.value = row
  commandText.value = ''
  commandVisible.value = true
}
async function doSendCommand() {
  if (!commandText.value.trim()) return ElMessage.warning(t('devices.commandPlaceholder'))
  sending.value = true
  try {
    await store.sendCommand(commandTarget.value!.id, commandText.value)
    ElMessage.success(t('common.success'))
    commandVisible.value = false
  } catch {
    ElMessage.error(t('common.error'))
  } finally { sending.value = false }
}

// ---------- delete ----------
async function doDelete(row: Device) {
  try {
    await store.deleteDevice(row.id)
    ElMessage.success(t('common.success'))
    store.loadStats()
  } catch {
    ElMessage.error(t('common.error'))
  }
}

// ---------- trend ----------
async function loadTrend() {
  if (!detailDevice.value) return
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value.id}/metrics`, {
      params: { range: trendRange.value }
    })
    trendData.value = data?.data || data || []
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
  if (rows.length < 2) {
    ctx.fillStyle = '#999'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(t('devices.noTrendData'), w / 2, h / 2)
    return
  }
  ctx.strokeStyle = '#e8e8e8'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = 10 + (h - 20) * i / 4
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }
  drawLine(ctx, rows, w, h, '#4F7CFF', 'cpu')
  drawLine(ctx, rows, w, h, '#15C39A', 'memory_pct')
  drawLine(ctx, rows, w, h, '#F59E0B', 'disk_pct')
}

function drawLine(ctx: any, rows: any[], w: number, h: number, color: string, key: string) {
  const n = rows.length
  const xStep = (w - 20) / (n - 1)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = 10 + i * xStep
    const val = Math.min(100, parseFloat(rows[i][key]) || 0)
    const y = h - 10 - val / 100 * (h - 20)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// ---------- processes ----------
async function loadProcesses() {
  if (!detailDevice.value) return
  processesLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value.id}/processes`)
    processesData.value = data?.data || []
  } catch { processesData.value = [] }
  finally { processesLoading.value = false }
}

// ---------- connections ----------
async function loadConnections() {
  if (!detailDevice.value) return
  connsLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/device/${detailDevice.value.id}/connections`)
    connsData.value = data?.data || []
  } catch { connsData.value = [] }
  finally { connsLoading.value = false }
}

// ---------- alert rules ----------
function showAlertForm(row: any) {
  if (row) {
    alertEditId.value = row.id
    alertForm.value = { name: row.name, metric: row.metric || 'cpu', threshold: row.threshold || 90, device_id: row.device_id || '' }
  } else {
    alertEditId.value = null
    alertForm.value = { name: '', metric: 'cpu', threshold: 90, device_id: '' }
  }
  alertFormVisible.value = true
}

async function doSaveAlert() {
  if (!alertForm.value.name.trim()) return ElMessage.warning(t('devices.alertName'))
  alertSaving.value = true
  try {
    if (alertEditId.value) {
      await store.updateAlertRule(alertEditId.value, alertForm.value)
    } else {
      await store.createAlertRule(alertForm.value)
    }
    ElMessage.success(t('common.success'))
    alertFormVisible.value = false
    store.loadAlertRules()
  } catch {
    ElMessage.error(t('common.error'))
  } finally { alertSaving.value = false }
}

async function deleteAlert(row: any) {
  try {
    await store.deleteAlertRule(row.id)
    ElMessage.success(t('common.success'))
  } catch { ElMessage.error(t('common.error')) }
}

async function toggleAlert(row: any) {
  try { await store.toggleAlertRule(row.id) } catch { /* ignore */ }
}
</script>

<style scoped>
.devices-page { }

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

.section { border-top: 1px solid var(--border-color); padding-top: 20px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h3 { margin: 0; font-size: 15px; }

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
</style>
