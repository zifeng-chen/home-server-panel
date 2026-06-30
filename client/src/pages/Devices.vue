<template>
  <div class="devices-page">
    <!-- 统计概览 -->
    <div class="stats-row">
      <div class="stat-card" @click="$refs?.discoveryDialog?.show()" style="cursor:pointer">
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
      <div class="stat-card scan" @click="showDiscovery = true">
        <span class="stat-val">🔍</span>
        <span class="stat-label">{{ $t('discovery.title') }}</span>
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

    <!-- ===== 设备发现浮窗 ===== -->
    <el-dialog v-model="showDiscovery" :title="$t('discovery.title')" width="820" :close-on-click-modal="false" destroy-on-close>
      <div class="disco-body">
        <!-- Scan Bar -->
        <section class="scan-bar">
          <div class="scan-controls">
            <div class="control-group">
              <label class="control-label">{{ $t('discovery.scanRange') }}</label>
              <el-input v-model="scanRange" :placeholder="$t('discovery.cidrPlaceholder')" :disabled="isScanning" size="small" class="range-input" />
            </div>
            <div class="control-group">
              <label class="control-label">{{ $t('discovery.scanMethod') }}</label>
              <el-select v-model="scanMethod" :disabled="isScanning" size="small" class="method-select">
                <el-option :label="$t('discovery.auto')" value="auto" />
                <el-option :label="$t('discovery.arp')" value="arp" />
                <el-option :label="$t('discovery.mdns')" value="mdns" />
                <el-option :label="$t('discovery.nmap')" value="nmap" />
              </el-select>
            </div>
            <el-button :type="isScanning ? 'danger' : 'primary'" :loading="isScanning" @click="isScanning ? stopScan() : startScan()" size="small" class="scan-btn">
              {{ isScanning ? $t('discovery.stopScan') : $t('discovery.startScan') }}
            </el-button>
          </div>
        </section>

        <!-- Progress -->
        <section v-if="scanProgress" class="progress-section">
          <div class="progress-header">
            <span class="progress-stage">
              <el-icon class="is-loading" v-if="!scanProgress.completed"><Loading /></el-icon>
              <el-icon v-else><CircleCheckFilled /></el-icon>
              {{ scanProgress.detail }}
            </span>
            <span class="progress-pct">{{ scanProgress.progress }}%</span>
          </div>
          <el-progress :percentage="scanProgress.progress" :status="scanProgress.completed ? 'success' : ''" :stroke-width="6" />
        </section>

        <!-- Result Table -->
        <section v-if="discoveredDevices.length" class="result-section" style="margin-top:12px">
          <el-table :data="discoveredDevices" size="small" stripe max-height="320">
            <el-table-column prop="hostname" :label="$t('devices.hostname')" min-width="120">
              <template #default="{ row }">{{ row.hostname || row.label || row.ip }}</template>
            </el-table-column>
            <el-table-column prop="ip" :label="$t('devices.ip')" width="150">
              <template #default="{ row }"><code class="mono">{{ row.ip }}</code></template>
            </el-table-column>
            <el-table-column prop="mac" :label="$t('discovery.mac')" width="160">
              <template #default="{ row }"><code class="mono">{{ row.mac || '-' }}</code></template>
            </el-table-column>
            <el-table-column prop="vendor" :label="$t('discovery.vendor')" min-width="130">
              <template #default="{ row }">{{ row.vendor || '-' }}</template>
            </el-table-column>
            <el-table-column :label="$t('common.status')" width="80">
              <template #default="{ row }">
                <el-tag :type="row.managed ? 'success' : 'info'" size="small" effect="dark">
                  {{ row.managed ? $t('devices.online') : $t('discovery.newDevice') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="$t('common.actions')" width="130">
              <template #default="{ row }">
                <el-button v-if="!row.managed" link type="primary" size="small" @click="installAgent(row)">安装 Agent</el-button>
                <span v-else class="text-muted">已管理</span>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- Empty -->
        <div v-if="!isScanning && !discoveredDevices.length && scanAttempted" class="panel-empty" style="margin-top:20px">
          {{ $t('discovery.noDevices') }}
        </div>

        <!-- Install Password Form -->
        <el-dialog v-model="installVisible" :title="$t('discovery.installAgent')" width="380" append-to-body>
          <el-form label-width="80px">
            <el-form-item :label="$t('discovery.targetHost')">
              <el-input :model-value="installTarget?.ip" disabled />
            </el-form-item>
            <el-form-item :label="$t('discovery.sshPassword')">
              <el-input v-model="installPassword" type="password" show-password />
            </el-form-item>
            <el-form-item :label="$t('discovery.sshUser')">
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
      <template #footer>
        <el-button @click="showDiscovery = false">{{ $t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 命令下发弹窗 -->
    <el-dialog v-model="commandVisible" :title="$t('devices.sendCommand')" width="480" append-to-body>
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
import { Loading, CircleCheckFilled } from '@element-plus/icons-vue'
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
const scanMethod = ref('auto')
const isScanning = ref(false)
const scanAttempted = ref(false)
const scanProgress = ref<{ detail: string; progress: number; completed: boolean } | null>(null)
const discoveredDevices = ref<any[]>([])
let scanPollTimer: any = null

async function startScan() {
  isScanning.value = true
  scanAttempted.value = true
  discoveredDevices.value = []
  try {
    const res = await api.get('/v2/discovery/scan', { params: { range: scanRange.value, method: scanMethod.value } }) as any
    if (res.data?.scanId) {
      pollScan(res.data.scanId)
    } else {
      isScanning.value = false
      discoveredDevices.value = res.data?.devices || []
      scanProgress.value = { detail: t('discovery.scanComplete'), progress: 100, completed: true }
    }
  } catch { isScanning.value = false; ElMessage.error(t('common.error')) }
}
async function pollScan(scanId: string) {
  scanPollTimer = setInterval(async () => {
    try {
      const res = await api.get(`/v2/discovery/scan/${scanId}`) as any
      if (res.data) {
        scanProgress.value = res.data
        discoveredDevices.value = (res.data.devices || []).map((d: any) => ({
          ...d,
          managed: store.devices.some(dev => dev.ip === d.ip || dev.hostname === d.hostname)
        }))
        if (res.data.completed) { stopScan() }
      }
    } catch { stopScan() }
  }, 1500)
}
function stopScan() {
  isScanning.value = false
  if (scanPollTimer) { clearInterval(scanPollTimer); scanPollTimer = null }
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
    // Start polling install progress
    pollInstall(res.data?.installId)
  } catch (e: any) {
    installResult.value = { message: e?.response?.data?.message || e.message || t('common.error'), error: true }
  } finally { installing.value = false }
}
let installPollTimer: any = null
async function pollInstall(installId: string) {
  if (!installId) return
  installPollTimer = setInterval(async () => {
    try {
      const res = await api.get(`/v2/install/${installId}`) as any
      if (res.success && res.data?.status === 'done') {
        clearInterval(installPollTimer)
        store.load()
        store.loadStats()
      }
    } catch { clearInterval(installPollTimer) }
  }, 2000)
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
async function toggleAlert(row: any) {
  try { await store.toggleAlertRule(row.id) } catch {}
}
</script>

<style scoped>
.devices-page { }

.stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
.stat-card { flex: 1; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; text-align: center; }
.stat-card.online { border-left: 3px solid var(--el-color-success); }
.stat-card.offline { border-left: 3px solid var(--el-color-info); }
.stat-card.scan { border-left: 3px solid var(--accent); background: var(--accent); color: #fff; }
.stat-card.scan .stat-val { font-size: 24px; }
.stat-card.scan .stat-label { color: rgba(255,255,255,0.85); }
.stat-val { font-size: 28px; font-weight: 700; display: block; color: var(--text-primary); }
.stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

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

/* Discovery Dialog */
.disco-body { }
.scan-bar { }
.scan-controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.control-group { display: flex; flex-direction: column; gap: 4px; }
.control-label { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }
.range-input { width: 180px; }
.method-select { width: 100px; }
.progress-section { margin-top: 14px; padding: 12px; background: var(--bg-base); border-radius: 8px; }
.progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; color: var(--text-secondary); }
.progress-stage { display: flex; align-items: center; gap: 6px; }
.progress-pct { font-weight: 600; color: var(--accent); }
.panel-empty { color: var(--text-tertiary); font-size: 13px; text-align: center; padding: 24px 0; }
.text-muted { color: var(--text-tertiary); font-size: 12px; }
.install-result { margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
.install-result.success { background: #22c55e15; color: #22c55e; }
.install-result.error { background: #ef444415; color: #ef4444; }
</style>
