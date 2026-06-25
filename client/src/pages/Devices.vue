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
      <el-table-column prop="name" :label="$t('common.name')" min-width="160" />
      <el-table-column :label="$t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small" effect="dark">
            {{ row.status === 'online' ? $t('devices.online') : $t('devices.offline') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="hostname" :label="$t('devices.hostname')" width="130" />
      <el-table-column prop="ip" :label="$t('devices.ip')" width="150">
        <template #default="{ row }"><code class="mono">{{ row.ip }}</code></template>
      </el-table-column>
      <el-table-column prop="os" :label="$t('devices.os')" width="110">
        <template #default="{ row }">{{ row.os }} {{ row.arch }}</template>
      </el-table-column>
      <el-table-column prop="version" :label="$t('devices.version')" width="100" />
      <el-table-column :label="$t('devices.lastSeen')" width="170">
        <template #default="{ row }">{{ fmtTime(row.last_seen) }}</template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="showCommand(row)" size="small">
            {{ $t('devices.sendCommand') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 设备详情弹窗 -->
    <el-dialog v-model="detailVisible" :title="detailDevice?.name" width="700" top="5vh">
      <template v-if="detailDevice">
        <el-descriptions :column="2" border size="small">
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

        <h4 style="margin-top: 20px; margin-bottom: 10px">{{ $t('devices.metrics') }}</h4>
        <div v-if="detailDevice.metrics?.length" style="max-height: 200px; overflow-y: auto">
          <el-table :data="detailDevice.metrics.slice(0, 20)" size="small" stripe>
            <el-table-column :label="$t('devices.cpu')" width="80">
              <template #default="{ row }">{{ row.cpu?.toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.memory')" width="80">
              <template #default="{ row }">{{ row.memory_pct?.toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column :label="$t('devices.network')" width="180">
              <template #default="{ row }">
                ↓{{ fmtBytes(row.net_rx) }}/s &nbsp; ↑{{ fmtBytes(row.net_tx) }}/s
              </template>
            </el-table-column>
            <el-table-column :label="$t('devices.uptime')" width="120">
              <template #default="{ row }">{{ fmtUptime(row.uptime) }}</template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="160">
              <template #default="{ row }">{{ fmtTime(row.collected_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noMetrics') }}</div>

        <h4 style="margin-top: 20px; margin-bottom: 10px">{{ $t('devices.commands') }}</h4>
        <div v-if="detailDevice.commands?.length" style="max-height: 200px; overflow-y: auto">
          <el-table :data="detailDevice.commands.slice(0, 10)" size="small" stripe>
            <el-table-column prop="command" label="Command" min-width="200" show-overflow-tooltip>
              <template #default="{ row }"><code class="mono">{{ row.command }}</code></template>
            </el-table-column>
            <el-table-column :label="$t('common.status')" width="90">
              <template #default="{ row }">
                <el-tag :type="cmdTagType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="$t('common.time')" width="160">
              <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="empty">{{ $t('devices.noCommands') }}</div>
      </template>
    </el-dialog>

    <!-- 下发命令弹窗 -->
    <el-dialog v-model="commandVisible" :title="$t('devices.sendCommand')" width="480">
      <el-form>
        <el-form-item :label="$t('common.name')">
          <el-input :model-value="commandTarget?.name" disabled />
        </el-form-item>
        <el-form-item :label="'Command'">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useDevicesStore } from '../stores/devices'
import type { Device, DeviceDetail } from '../stores/devices'

const { t } = useI18n()
const store = useDevicesStore()

const detailVisible = ref(false)
const detailDevice = ref<DeviceDetail | null>(null)
const commandVisible = ref(false)
const commandTarget = ref<Device | null>(null)
const commandText = ref('')
const sending = ref(false)

onMounted(() => { store.load() })

function refresh() { store.load() }

function showDetail(row: Device) {
  detailVisible.value = true
  detailDevice.value = null
  store.loadDetail(row.id).then(() => {
    detailDevice.value = store.currentDevice
  })
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

h4 { font-size: 14px; font-weight: 600; color: var(--text-primary); }
</style>
