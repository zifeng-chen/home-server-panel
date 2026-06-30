<template>
  <div class="devices-page">
    <!-- 统计概览 -->
    <div class="stats-row">
      <div class="stat-card" @click="showDiscovery = true" style="cursor:pointer">
        <span class="stat-num">{{ store.stats?.total || 0 }}</span>
        <span class="stat-lbl">{{ $t('devices.totalDevices') }}</span>
      </div>
      <div class="stat-card online">
        <span class="stat-num">{{ store.stats?.online || 0 }}</span>
        <span class="stat-lbl">{{ $t('devices.online') }}</span>
      </div>
      <div class="stat-card offline">
        <span class="stat-num">{{ store.stats?.offline || 0 }}</span>
        <span class="stat-lbl">{{ $t('devices.offline') }}</span>
      </div>
      <div class="stat-card scan" @click="showDiscovery = true">
        <span class="stat-num">🔍</span>
        <span class="stat-lbl">{{ $t('discovery.title') }}</span>
      </div>
    </div>

    <!-- 设备列表 -->
    <el-table :data="store.devices" v-loading="store.loading" stripe class="data-table" @row-click="openDetail" ref="tableRef" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="42" :selectable="isSelectable" />
      <el-table-column prop="name" :label="$t('devices.hostDevice')" min-width="140">
        <template #default="{ row }">
          <router-link :to="`/devices/${row.id}`" class="device-link" @click.stop>{{ row.name }}</router-link>
        </template>
      </el-table-column>
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
          <el-button link type="primary" @click.stop="showCommand(row)" size="small">{{ $t('devices.sendCommand') }}</el-button>
          <el-button v-if="row.status === 'online' && row.id !== 'dev_local'" link type="success" @click.stop="openSsh(row)" size="small">SSH</el-button>
          <el-popconfirm :title="$t('devices.delConfirm')" @confirm="doDelete(row)" :confirm-button-text="$t('common.confirm')" :cancel-button-text="$t('common.cancel')">
            <template #reference>
              <el-button link type="danger" @click.stop size="small">{{ $t('devices.delete') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 批量操作栏 -->
    <div v-if="selectedDevices.length" class="batch-bar">
      <span>{{ $t('devices.batchSelected', { n: selectedDevices.length }) }}</span>
      <el-button size="small" type="primary" @click="showBatchCommand">{{ $t('devices.batchCommand') }}</el-button>
    </div>

    <!-- ===== 设备发现浮窗 ===== -->
    <el-dialog v-model="showDiscovery" title="网络扫描" width="760" :close-on-click-modal="false" destroy-on-close class="discovery-dialog">
      <div class="disco-root">
        <!-- Scan Controls -->
        <div class="disco-controls">
          <div class="disco-field">
            <label>{{ $t('discovery.scanRange') }}</label>
            <div class="disco-input-group">
              <el-input v-model="scanRange" :disabled="isScanning" size="default" class="range-input" />
              <el-button type="primary" @click="startScan" :loading="isScanning" class="scan-btn">
                {{ isScanning ? '...' : '开始扫描' }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- Progress -->
        <div v-if="scanProgress" class="disco-progress">
          <div class="dp-head">
            <span class="dp-stage">{{ scanProgress.completed ? '✅' : '⏳' }} {{ scanProgress.detail || '准备中...' }}</span>
            <span class="dp-pct">{{ scanProgress.progress }}%</span>
          </div>
          <div class="dp-bar">
            <div class="dp-fill" :style="{ width: scanProgress.progress + '%' }" :class="{ done: scanProgress.completed }"></div>
          </div>
        </div>

        <!-- Results -->
        <div v-if="discoveredDevices.length" class="disco-results">
          <div class="dr-header">
            <span class="dr-count">发现 {{ discoveredDevices.length }} 台设备</span>
          </div>
          <div class="dr-grid">
            <div class="dr-card" v-for="d in discoveredDevices" :key="d.ip" :class="{ managed: d.managed }">
              <div class="drc-top">
                <span class="drc-icon">{{ deviceIcon(d) }}</span>
                <div class="drc-meta">
                  <span class="drc-name">{{ d.hostname || d.ip }}</span>
                  <code class="drc-ip">{{ d.ip }}</code>
                </div>
                <el-tag v-if="d.managed" type="success" size="small" effect="dark">受管</el-tag>
                <el-tag v-else type="info" size="small">新设备</el-tag>
              </div>
              <div class="drc-details">
                <span v-if="d.mac" class="drc-item"><small>MAC</small> <code>{{ d.mac }}</code></span>
                <span v-if="d.vendor" class="drc-item"><small>厂商</small> {{ d.vendor }}</span>
              </div>
              <div class="drc-actions" v-if="!d.managed">
                <el-button size="small" type="primary" plain @click="installAgent(d)">安装 Agent</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty -->
        <div v-if="!isScanning && !discoveredDevices.length && scanAttempted" class="disco-empty">
          <span class="empty-icon">📡</span>
          <span>未发现新设备</span>
          <span class="empty-hint">尝试扩大扫描范围或更换扫描方式</span>
        </div>

        <!-- Install Form -->
        <el-dialog v-model="installVisible" title="安装 Agent" width="380" append-to-body>
          <el-form label-width="80px">
            <el-form-item label="目标主机">
              <el-input :model-value="installTarget?.ip" disabled />
            </el-form-item>
            <el-form-item label="SSH 密码">
              <el-input v-model="installPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="installUser" placeholder="root" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="installVisible = false">{{ $t('common.cancel') }}</el-button>
            <el-button type="primary" @click="doInstall" :loading="installing">{{ $t('common.submit') }}</el-button>
          </template>
          <div v-if="installResult" class="install-result" :class="installResult.error ? 'error' : 'success'">
            {{ installResult.message }}
          </div>
        </el-dialog>
      </div>
    </el-dialog>

    <!-- 命令下发弹窗 -->
    <el-dialog v-model="commandVisible" :title="$t('devices.sendCommand')" width="480" append-to-body>
      <el-form>
        <el-form-item :label="$t('common.name')">
          <el-input :model-value="commandTarget?.name" disabled />
        </el-form-item>
        <el-form-item label="Command">
          <el-input v-model="commandText" type="textarea" :rows="3" :placeholder="$t('devices.commandPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="commandVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSendCommand" :loading="sending">{{ $t('common.submit') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批量命令弹窗 -->
    <el-dialog v-model="batchVisible" :title="$t('devices.batchCommand')" width="550" append-to-body>
      <div class="batch-list">
        <el-tag v-for="d in selectedDevices" :key="d.id" size="small" style="margin:0 4px 4px 0">{{ d.name }}</el-tag>
      </div>
      <el-form style="margin-top:12px">
        <el-form-item label="Command">
          <el-input v-model="commandText" type="textarea" :rows="4" :placeholder="$t('devices.batchPlaceholder')" />
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
        <el-button type="primary" @click="doBatchCommand" :loading="batchSending">{{ $t('common.submit') }}</el-button>
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
    <el-dialog v-model="alertFormVisible" :title="alertEditId ? $t('common.edit') : $t('devices.alertAdd')" width="420" destroy-on-close append-to-body>
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
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDevicesStore } from '../stores/devices'
import { useI18n } from 'vue-i18n'
import api from '../api'

const { t } = useI18n()
const store = useDevicesStore()
const router = useRouter()

interface Device { id: string; name: string; hostname: string; ip: string; os: string; arch: string; version: string; status: string; last_seen: string; tags?: string }

// ===== Discovery State =====
const showDiscovery = ref(false)
const scanRange = ref('192.168.100.0/24')
const isScanning = ref(false)
const scanAttempted = ref(false)
const scanProgress = ref<{ detail: string; progress: number; completed: boolean } | null>(null)
const discoveredDevices = ref<any[]>([])
let scanPollTimer: any = null

function deviceIcon(d: any) {
  const type = d.type || ''
  if (type.includes('router') || d.hostname?.includes('iStore')) return '📡'
  if (type.includes('nas') || d.hostname?.includes('iOSun')) return '💾'
  if (type.includes('desktop') || d.hostname?.includes('Mac')) return '💻'
  if (type.includes('phone')) return '📱'
  return '🖥️'
}

async function startScan() {
  isScanning.value = true
  scanAttempted.value = true
  discoveredDevices.value = []
  scanProgress.value = { detail: '正在初始化...', progress: 0, completed: false }
  try {
    const res = await api.post('/v2/discovery/scan', { range: scanRange.value, method: 'auto' }) as any
    if (res.success && res.data?.scanId) {
      pollScan(res.data.scanId)
    } else if (res.success && res.data?.devices) {
      // Immediate result — no async
      isScanning.value = false
      discoveredDevices.value = res.data.devices.map((d: any) => ({
        ...d,
        managed: store.devices.some(dev => dev.ip === d.ip || dev.hostname === d.hostname)
      }))
      scanProgress.value = { detail: '扫描完成', progress: 100, completed: true }
    } else {
      isScanning.value = false
      ElMessage.error(res?.message || '扫描失败')
    }
  } catch (e: any) {
    isScanning.value = false
    ElMessage.error(e?.response?.data?.message || e.message || '扫描失败')
  }
}

async function pollScan(scanId: string) {
  scanPollTimer = setInterval(async () => {
    try {
      const res = await api.get(`/v2/discovery/scan/${scanId}`) as any
      if (res.success && res.data) {
        scanProgress.value = {
          detail: res.data.detail || '',
          progress: res.data.progress ?? 0,
          completed: res.data.completed
        }
        if (res.data.devices?.length) {
          discoveredDevices.value = res.data.devices.map((d: any) => ({
            ...d,
            managed: store.devices.some(dev => dev.ip === d.ip || dev.hostname === d.hostname)
          }))
        }
        if (res.data.completed) {
          clearInterval(scanPollTimer)
          scanPollTimer = null
          isScanning.value = false
        }
      }
    } catch {
      clearInterval(scanPollTimer)
      scanPollTimer = null
      isScanning.value = false
    }
  }, 1500)
}

// ===== Agent Install =====
const installVisible = ref(false)
const installTarget = ref<any>(null)
const installPassword = ref('')
const installUser = ref('root')
const installing = ref(false)
const installResult = ref<any>(null)

function installAgent(row: any) {
  installTarget.value = row
  installPassword.value = ''
  installUser.value = 'root'
  installResult.value = null
  installVisible.value = true
}
async function doInstall() {
  if (!installTarget.value) return
  installing.value = true
  installResult.value = null
  try {
    const res = await api.post('/v2/install', {
      host: installTarget.value.ip,
      username: installUser.value || 'root',
      password: installPassword.value,
      arch: 'amd64'
    }) as any
    installResult.value = { message: 'Agent 安装已启动，等待设备上线...', error: false }
    ElMessage.success(t('common.success'))
    installVisible.value = false
  } catch (e: any) {
    installResult.value = { message: e?.response?.data?.message || e.message || t('common.error'), error: true }
  } finally { installing.value = false }
}

// ===== Command =====
const commandVisible = ref(false)
const commandTarget = ref<Device | null>(null)
const commandText = ref('')
const sending = ref(false)

// ===== Batch =====
const selectedDevices = ref<Device[]>([])
const batchVisible = ref(false)
const batchResults = ref<any[]>([])
const batchSending = ref(false)

// ===== Tags =====
const editingTag = ref('')
const tagInput = ref('')
const tagInputRef = ref()

// ===== Alerts =====
const alertFormVisible = ref(false)
const alertEditId = ref<number | null>(null)
const alertForm = ref({ name: '', metric: 'cpu', threshold: 90, device_id: '' })
const alertSaving = ref(false)

onMounted(() => {
  store.load()
  store.loadStats()
  store.loadAlertRules()
})

function openDetail(row: Device) { router.push(`/devices/${row.id}`) }

function fmtTime(t: string) {
  if (!t) return '-'
  const d = new Date(t.slice(-1) === 'Z' ? t : t + 'Z')
  if (isNaN(d.getTime())) return t
  return d.toLocaleString()
}

function isSelectable(row: Device) { return row.status === 'online' || row.id === 'dev_local' }
function onSelectionChange(rows: Device[]) { selectedDevices.value = rows }

function startEditTag(row: Device) { editingTag.value = row.id; tagInput.value = row.tags || ''; nextTick(() => tagInputRef.value?.focus?.()) }
async function saveTag(row: Device) {
  try { await api.put(`/v2/device/${row.id}/tags`, { tags: tagInput.value }); row.tags = tagInput.value } catch {}
  editingTag.value = null
}

function openSsh(row: Device) {
  sessionStorage.setItem('ssh_preset', JSON.stringify({ host: row.ip || row.id, port: 22, username: 'root', name: row.name || row.hostname || row.id }))
  router.push('/ssh')
}

function showBatchCommand() { commandText.value = ''; batchResults.value = []; batchVisible.value = true }
async function doBatchCommand() {
  if (!commandText.value.trim()) return ElMessage.warning(t('devices.commandPlaceholder'))
  batchSending.value = true
  try {
    const { data } = await api.post('/v2/device/commands/batch', { deviceIds: selectedDevices.value.map(d => d.id), command: commandText.value }) as any
    batchResults.value = data?.data || []
    ElMessage.success(`${batchResults.value.length} ${t('devices.commandSent')}`)
  } catch { ElMessage.error(t('common.error')) } finally { batchSending.value = false }
}

function showCommand(row: Device) { commandTarget.value = row; commandText.value = ''; commandVisible.value = true }
async function doSendCommand() {
  if (!commandText.value.trim()) return ElMessage.warning(t('devices.commandPlaceholder'))
  sending.value = true
  try { await store.sendCommand(commandTarget.value!.id, commandText.value); ElMessage.success(t('common.success')); commandVisible.value = false }
  catch { ElMessage.error(t('common.error')) } finally { sending.value = false }
}

async function doDelete(row: Device) {
  try { await store.deleteDevice(row.id); ElMessage.success(t('common.success')); store.loadStats() }
  catch { ElMessage.error(t('common.error')) }
}

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
    if (alertEditId.value) { await store.updateAlertRule(alertEditId.value, alertForm.value) }
    else { await store.createAlertRule(alertForm.value) }
    ElMessage.success(t('common.success'))
    alertFormVisible.value = false
    store.loadAlertRules()
  } catch { ElMessage.error(t('common.error')) } finally { alertSaving.value = false }
}
async function deleteAlert(row: any) {
  try { await store.deleteAlertRule(row.id); ElMessage.success(t('common.success')) }
  catch { ElMessage.error(t('common.error')) }
}
async function toggleAlert(row: any) { try { await store.toggleAlertRule(row.id) } catch {} }
</script>

<style scoped>
.devices-page { }

.stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
.stat-card {
  flex: 1; padding: 18px 20px; border-radius: var(--radius-lg); text-align: center; cursor: pointer;
  background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-color);
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.stat-card.online { border-left: 3px solid var(--el-color-success); }
.stat-card.offline { border-left: 3px solid var(--el-color-info); }
.stat-card.scan { border-left: 3px solid var(--accent); background: linear-gradient(135deg, var(--accent), #6366f1); color: #fff; border-color: transparent; }
.stat-card.scan .stat-num { font-size: 24px; }
.stat-card.scan .stat-lbl { color: rgba(255,255,255,0.85); }
.stat-num { font-size: 28px; font-weight: 800; display: block; color: var(--text-primary); }
.stat-lbl { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }

.device-link { color: var(--accent); text-decoration: none; font-weight: 500; }
.device-link:hover { text-decoration: underline; }
.mono { font-family: monospace; font-size: 12px; }

.section { border-top: 1px solid var(--border-color); padding-top: 20px; margin-top: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h3 { margin: 0; font-size: 15px; }
.empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 13px; }

/* Batch */
.batch-bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--accent); color: #fff; border-radius: 8px; font-size: 13px; font-weight: 500; margin-top: 12px; }
.batch-bar .el-button { --el-button-bg-color: rgba(255,255,255,0.2); --el-button-text-color: #fff; --el-button-border-color: transparent; }
.batch-list { margin-bottom: 4px; }
.batch-results { margin-top: 12px; max-height: 300px; overflow-y: auto; }
.batch-result-item { margin-bottom: 10px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; }
.batch-device { font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px; }
.batch-output { margin: 6px 0 0; font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all; max-height: 100px; overflow-y: auto; color: var(--text-secondary); }

/* Tags */
.tag-cell { cursor: pointer; font-size: 12px; padding: 2px 8px; background: var(--bg-elevated); border-radius: 4px; display: inline-block; min-width: 40px; }
.tag-cell.placeholder { color: var(--text-tertiary); }

/* ===== Discovery Float ===== */
.disco-root { padding: 4px 0; }

.disco-controls { margin-bottom: 16px; }
.disco-field label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }
.disco-input-group { display: flex; gap: 10px; }
.range-input { flex: 1; }
.scan-btn { min-width: 110px; }

/* Progress bar (custom, matches glass theme) */
.disco-progress {
  padding: 16px 20px; margin-bottom: 16px; border-radius: var(--radius-md);
  background: var(--bg-base); border: 1px solid var(--border-color);
}
.dp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; }
.dp-stage { color: var(--text-secondary); }
.dp-pct { font-weight: 700; color: var(--accent); font-size: 14px; font-family: var(--font-mono); }
.dp-bar { width: 100%; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.dp-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #6366f1); border-radius: 3px; transition: width .4s ease; }
.dp-fill.done { background: #22c55e; }

/* Result grid */
.disco-results { }
.dr-header { margin-bottom: 12px; }
.dr-count { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.dr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; max-height: 350px; overflow-y: auto; }

.dr-card {
  padding: 14px 16px; border-radius: var(--radius-md);
  background: var(--bg-glass); border: 1px solid var(--border-color);
  backdrop-filter: blur(8px); transition: border-color var(--dur-fast);
}
.dr-card.managed { opacity: 0.7; }
.drc-top { display: flex; align-items: center; gap: 10px; }
.drc-icon { font-size: 22px; }
.drc-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.drc-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.drc-ip { font-size: 11px; color: var(--text-tertiary); }
.drc-details { display: flex; gap: 16px; margin-top: 10px; }
.drc-item { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-secondary); }
.drc-item small { font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }
.drc-actions { margin-top: 10px; display: flex; justify-content: flex-end; }

/* Empty */
.disco-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 40px 0; color: var(--text-tertiary); font-size: 14px;
}
.empty-icon { font-size: 40px; opacity: 0.4; }
.empty-hint { font-size: 12px; color: var(--text-quaternary); }

/* Install */
.install-result { margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
.install-result.success { background: #22c55e15; color: #22c55e; }
.install-result.error { background: #ef444415; color: #ef4444; }
</style>
