<template>
  <div class="discovery-page">
    <!-- Page Header -->
    <header class="page-header">
      <div class="header-left">
        <h2 class="page-title">{{ t('discovery.title') }}</h2>
        <p class="page-subtitle">{{ t('discovery.subtitle') }}</p>
      </div>
      <div class="header-right">
        <el-button @click="showManualDialog = true" :icon="Plus" type="primary" plain size="small">
          {{ t('discovery.manualAdd') }}
        </el-button>
      </div>
    </header>

    <!-- Scan Control Bar -->
    <section class="scan-bar glass-card">
      <div class="scan-controls">
        <div class="control-group">
          <label class="control-label">{{ t('discovery.scanRange') }}</label>
          <el-input
            v-model="scanRange"
            :placeholder="t('discovery.cidrPlaceholder')"
            :disabled="isScanning"
            size="small"
            class="range-input"
          />
        </div>
        <div class="control-group">
          <label class="control-label">{{ t('discovery.scanMethod') }}</label>
          <el-select v-model="scanMethod" :disabled="isScanning" size="small" class="method-select">
            <el-option :label="t('discovery.auto')" value="auto" />
            <el-option :label="t('discovery.arp')" value="arp" />
            <el-option :label="t('discovery.mdns')" value="mdns" />
            <el-option :label="t('discovery.nmap')" value="nmap" />
          </el-select>
        </div>
        <el-button
          :type="isScanning ? 'danger' : 'primary'"
          :icon="isScanning ? Close : Search"
          :loading="isScanning"
          @click="isScanning ? stopScan() : startScan()"
          size="small"
          class="scan-btn"
        >
          {{ isScanning ? t('discovery.stopScan') : t('discovery.startScan') }}
        </el-button>
      </div>
    </section>

    <!-- Progress Bar -->
    <transition name="slide-fade">
      <section v-if="scanProgress" class="progress-section glass-card">
        <div class="progress-header">
          <span class="progress-stage">
            <el-icon class="is-loading" v-if="!scanProgress.completed"><Loading /></el-icon>
            <el-icon v-else-if="scanProgress.stage === 'error'"><CircleCloseFilled /></el-icon>
            <el-icon v-else><CircleCheckFilled /></el-icon>
            {{ scanProgress.detail }}
          </span>
          <span class="progress-percent">{{ scanProgress.percent }}%</span>
        </div>
        <el-progress
          :percentage="scanProgress.percent"
          :status="scanProgress.stage === 'error' ? 'exception' : scanProgress.completed ? 'success' : undefined"
          :stroke-width="6"
          :show-text="false"
          class="progress-bar"
        />
      </section>
    </transition>

    <!-- Stats Summary -->
    <section v-if="devices.length > 0" class="stats-row">
      <div class="stat-chip glass-card">
        <span class="stat-val">{{ devices.length }}</span>
        <span class="stat-lbl">{{ t('discovery.devicesFound') }}</span>
      </div>
      <div class="stat-chip glass-card managed">
        <span class="stat-val">{{ managedCount }}</span>
        <span class="stat-lbl">{{ t('discovery.managed') }}</span>
      </div>
      <div class="stat-chip glass-card installable">
        <span class="stat-val">{{ installableCount }}</span>
        <span class="stat-lbl">{{ t('discovery.unmanaged') }}</span>
      </div>
    </section>

    <!-- Device Cards Grid -->
    <section v-if="devices.length > 0" class="devices-grid">
      <div
        v-for="device in devices"
        :key="device.ip"
        class="device-card glass-card"
        :class="{ managed: device.managed, manageable: device.manageable && !device.managed }"
      >
        <!-- Card Header: Icon + Name + Status -->
        <div class="card-header">
          <div class="device-icon" :class="device.type">{{ typeEmoji(device.type) }}</div>
          <div class="device-name-line">
            <span class="device-name">{{ device.hostname || device.ip }}</span>
            <el-tag
              v-if="device.managed"
              size="small"
              type="success"
              effect="dark"
              class="status-tag"
            >
              {{ t('discovery.managed') }}
            </el-tag>
            <el-tag
              v-else
              size="small"
              type="info"
              effect="plain"
              class="status-tag"
            >
              {{ t('discovery.unmanaged') }}
            </el-tag>
          </div>
        </div>

        <!-- Card Body: Info -->
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">IP</span>
            <span class="info-value mono">{{ device.ip }}</span>
          </div>
          <div class="info-row" v-if="device.mac">
            <span class="info-label">MAC</span>
            <span class="info-value mono">{{ device.mac }}</span>
          </div>
          <div class="info-row" v-if="device.vendor">
            <span class="info-label">{{ t('discovery.vendor') }}</span>
            <span class="info-value">{{ device.vendor }}</span>
          </div>
          <div class="info-row" v-if="device.type && device.type !== 'unknown'">
            <span class="info-label">{{ t('common.type') }}</span>
            <span class="info-value">{{ t('discovery.type' + device.type.charAt(0).toUpperCase() + device.type.slice(1)) }}</span>
          </div>
          <div class="info-row" v-if="device.os_guess">
            <span class="info-label">OS</span>
            <span class="info-value">{{ device.os_guess }}</span>
          </div>
          <div class="info-row" v-if="device.open_ports && device.open_ports.length">
            <span class="info-label">{{ t('discovery.openPorts') }}</span>
            <span class="info-value ports">
              <span v-for="p in device.open_ports" :key="p" class="port-badge">{{ p }}</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ t('discovery.source') }}</span>
            <span class="info-value">{{ t('discovery.source' + (sourceLabel(device.source))) }}</span>
          </div>
        </div>

        <!-- Card Footer: Actions -->
        <div class="card-footer">
          <el-button
            v-if="device.managed"
            size="small"
            type="primary"
            plain
            @click="$router.push('/devices/' + device.agentDeviceId)"
          >
            {{ t('common.view') }}
          </el-button>
          <el-button
            v-else-if="device.manageable"
            size="small"
            type="primary"
            @click="installOnDevice(device)"
          >
            {{ t('discovery.installAgent') }}
          </el-button>
        </div>
      </div>
    </section>

    <!-- Empty State -->
    <section v-if="!isScanning && devices.length === 0 && !scanProgress" class="empty-state glass-card">
      <div class="empty-icon">🔍</div>
      <h3>{{ t('discovery.noDevicesFound') }}</h3>
      <p>{{ t('discovery.subtitle') }}</p>
      <el-button type="primary" :icon="Search" @click="startScan()" class="empty-btn">
        {{ t('discovery.startScan') }}
      </el-button>
    </section>

    <!-- Error State -->
    <section v-if="scanError" class="error-state glass-card">
      <div class="empty-icon">⚠️</div>
      <h3>{{ t('discovery.scanError') }}</h3>
      <p>{{ scanError }}</p>
    </section>

    <!-- Manual Add Dialog -->
    <el-dialog
      v-model="showManualDialog"
      :title="t('discovery.manualAddTitle')"
      width="480px"
      destroy-on-close
    >
      <div class="manual-add-form">
        <el-input
          v-model="manualIP"
          :placeholder="t('discovery.enterIP')"
          size="default"
          @keyup.enter="identifyDevice"
        >
          <template #append>
            <el-button
              :loading="isIdentifying"
              :icon="Search"
              @click="identifyDevice"
            >
              {{ t('discovery.identifyIP') }}
            </el-button>
          </template>
        </el-input>
      </div>

      <!-- Identified device result -->
      <div v-if="identifiedDevice" class="identified-result glass-card">
        <div class="result-header">
          <div class="device-icon" :class="identifiedDevice.type">{{ typeEmoji(identifiedDevice.type) }}</div>
          <div>
            <div class="result-name">{{ identifiedDevice.hostname || identifiedDevice.ip }}</div>
            <div class="result-ip mono">{{ identifiedDevice.ip }}</div>
          </div>
        </div>
        <div class="result-details" v-if="identifiedDevice.type && identifiedDevice.type !== 'unknown'">
          <div class="detail-row">
            <b>{{ t('common.type') }}:</b>
            {{ t('discovery.type' + identifiedDevice.type.charAt(0).toUpperCase() + identifiedDevice.type.slice(1)) }}
          </div>
          <div class="detail-row" v-if="identifiedDevice.os_guess"><b>OS:</b> {{ identifiedDevice.os_guess }}</div>
          <div class="detail-row" v-if="identifiedDevice.vendor"><b>{{ t('discovery.vendor') }}:</b> {{ identifiedDevice.vendor }}</div>
          <div class="detail-row" v-if="identifiedDevice.open_ports?.length">
            <b>{{ t('discovery.openPorts') }}:</b>
            <span v-for="p in identifiedDevice.open_ports" :key="p" class="port-badge">{{ p }}</span>
          </div>
        </div>
        <div class="result-details" v-else>
          <p class="no-info">{{ t('devices.noMetrics') }}</p>
        </div>
        <div class="result-actions" v-if="identifiedDevice.manageable">
          <el-button type="primary" size="small" @click="installOnDevice(identifiedDevice); showManualDialog = false">
            {{ t('discovery.installAgent') }}
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Search, Close, Loading, CircleCheckFilled, CircleCloseFilled, Plus } from '@element-plus/icons-vue'
import api from '../api'

const { t } = useI18n()

// ===== State =====
const scanRange = ref('192.168.100.0/24')
const scanMethod = ref('auto')
const isScanning = ref(false)
const devices = ref<any[]>([])
const scanProgress = ref<any>(null)
const scanError = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const showManualDialog = ref(false)
const manualIP = ref('')
const isIdentifying = ref(false)
const identifiedDevice = ref<any>(null)

// ===== Computed =====
const managedCount = computed(() => devices.value.filter(d => d.managed).length)
const installableCount = computed(() => devices.value.filter(d => d.manageable && !d.managed).length)

// ===== Polling =====
function startPoll(scanId: string) {
  stopPoll()
  pollTimer = setInterval(async () => {
    try {
      const res = await api.get(`/api/v2/discovery/scan/${scanId}`)
      if (res.success) {
        scanProgress.value = res.data
        if (res.data.devices) {
          devices.value = res.data.devices
        }
        if (res.data.completed) {
          stopPoll()
          isScanning.value = false
          scanError.value = res.data.stage === 'error' ? res.data.detail : ''
          ElMessage.success(t('discovery.scanComplete'))
        }
      }
    } catch {
      stopPoll()
      isScanning.value = false
    }
  }, 1500)
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ===== Actions =====
async function startScan() {
  try {
    scanError.value = ''
    isScanning.value = true
    devices.value = []
    scanProgress.value = { stage: 'starting', percent: 0, detail: '正在初始化...', completed: false }

    const res = await api.post('/api/v2/discovery/scan', {
      method: scanMethod.value,
      range: scanMethod.value === 'nmap' ? scanRange.value : undefined
    })

    if (res.success) {
      startPoll(res.data.scan_id)
    } else {
      isScanning.value = false
      ElMessage.error(t('discovery.scanError'))
    }
  } catch (e: any) {
    isScanning.value = false
    scanError.value = e.message || String(e)
    ElMessage.error(t('discovery.scanError'))
  }
}

function stopScan() {
  stopPoll()
  isScanning.value = false
  scanProgress.value = null
  ElMessage.info('扫描已停止')
}

async function identifyDevice() {
  if (!manualIP.value.trim()) return
  try {
    isIdentifying.value = true
    identifiedDevice.value = null
    const res = await api.get(`/api/v2/discovery/identify?ip=${encodeURIComponent(manualIP.value.trim())}`)
    if (res.success) {
      identifiedDevice.value = res.data
      // Also add to device list
      if (!devices.value.find(d => d.ip === res.data.ip)) {
        devices.value.unshift(res.data)
      }
    }
  } catch (e: any) {
    ElMessage.error(e.message || String(e))
  } finally {
    isIdentifying.value = false
  }
}

function installOnDevice(device: any) {
  // Phase 2 — for now, navigate to devices page
  ElMessage.info(`Phase 2: 安装 Agent 到 ${device.ip} — 即将支持`)
  // TODO Phase 2: open installer dialog
}

// ===== Helpers =====
function typeEmoji(type: string): string {
  const map: Record<string, string> = {
    router: '📡', server: '🖥️', nas: '💾', desktop: '💻',
    printer: '🖨️', media: '📺', iot: '🔌', phone: '📱',
    service: '🌐', unknown: '❓'
  }
  return map[type] || '❓'
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = { arp: 'Arp', 'ip-neigh': 'Arp', mdns: 'Mdns', nmap: 'Nmap', manual: 'Manual' }
  return map[source] || 'Arp'
}

// ===== Cleanup =====
onUnmounted(() => stopPoll())
</script>

<style scoped>
.discovery-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 28px;
}

/* Page Header */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* Scan Bar */
.scan-bar {
  padding: 16px 20px;
  margin-bottom: 16px;
}
.scan-controls {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.control-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.range-input { width: 260px; }
.method-select { width: 180px; }
.scan-btn { min-width: 110px; }

/* Progress */
.progress-section {
  padding: 14px 20px;
  margin-bottom: 16px;
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}
.progress-stage {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}
.progress-percent {
  font-weight: 700;
  color: var(--accent);
  font-size: 14px;
}
.progress-bar {
  width: 100%;
}

/* Stats */
.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.stat-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: var(--radius-md);
}
.stat-val {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
}
.stat-lbl {
  font-size: 12px;
  color: var(--text-secondary);
}
.stat-chip.managed .stat-val { color: #22c55e; }
.stat-chip.installable .stat-val { color: var(--accent); }

/* Device Grid */
.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* Device Card */
.device-card {
  padding: 16px 18px;
  transition: all var(--dur-fast) var(--ease-out);
  border: 1px solid transparent;
}
.device-card.managed { border-color: color-mix(in srgb, #22c55e 20%, transparent); }
.device-card.manageable { border-color: color-mix(in srgb, var(--accent) 15%, transparent); }
.device-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.device-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: 22px;
  background: var(--border-color);
  flex-shrink: 0;
}
.device-icon.router { background: color-mix(in srgb, #f59e0b 12%, transparent); }
.device-icon.nas { background: color-mix(in srgb, #8b5cf6 12%, transparent); }
.device-icon.server { background: color-mix(in srgb, #3b82f6 12%, transparent); }
.device-icon.desktop { background: color-mix(in srgb, #10b981 12%, transparent); }
.device-icon.iot { background: color-mix(in srgb, #ec4899 12%, transparent); }

.device-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.device-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-tag { flex-shrink: 0; }

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.info-label {
  color: var(--text-secondary);
  min-width: 40px;
  flex-shrink: 0;
}
.info-value {
  color: var(--text-primary);
  word-break: break-all;
}
.info-value.mono { font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; font-size: 11px; }
.info-value.ports { display: flex; gap: 4px; flex-wrap: wrap; }
.port-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--border-color);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: monospace;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

/* Empty & Error */
.empty-state, .error-state {
  text-align: center;
  padding: 60px 20px;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3, .error-state h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text-primary);
}
.empty-state p, .error-state p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}
.empty-btn { margin-top: 8px; }

/* Manual Add Dialog */
.manual-add-form {
  margin-bottom: 16px;
}
.identified-result {
  padding: 16px;
}
.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.result-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.result-ip { font-size: 12px; color: var(--text-secondary); }
.result-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}
.detail-row { display: flex; align-items: center; gap: 6px; }
.detail-row b { color: var(--text-primary); }
.no-info { font-style: italic; color: var(--text-secondary); margin: 0; }
.result-actions { text-align: right; }

/* Slide-fade transition */
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s ease-in; }
.slide-fade-enter-from { opacity: 0; transform: translateY(-10px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-10px); }

/* Glass card base */
.glass-card {
  background: var(--bg-glass);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
</style>
