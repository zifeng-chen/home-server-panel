<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('port.title') }}</h2>
        <p class="sub">{{ statsText }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="scan" :loading="scanning" :icon="Refresh">{{ $t('port.scan') }}</el-button>
      </div>
    </div>

    <el-table :data="ports" v-loading="scanning" stripe class="data-table">
      <el-table-column prop="port" :label="$t('port.port')" width="80" sortable />
      <el-table-column prop="protocol" :label="$t('port.protocol')" width="70">
        <template #default="{ row }"><el-tag :type="row.protocol === 'TCP' ? '' : 'warning'" size="small">{{ row.protocol }}</el-tag></template>
      </el-table-column>
      <el-table-column :label="$t('common.status')" width="80">
        <template #default="{ row }">
          <span class="dot" :style="{ background: row.status === 'LISTEN' ? 'var(--accent-green)' : 'var(--text-tertiary)' }"></span>
          {{ row.status }}
        </template>
      </el-table-column>
      <el-table-column prop="process" :label="$t('port.process')" min-width="140" />
      <el-table-column prop="pid" :label="$t('port.pid')" width="70" />
      <el-table-column :label="$t('port.accessible')" width="90">
        <template #default="{ row }">
          <el-link v-if="canOpen(row)" :href="openUrl(row)" target="_blank" type="primary" :underline="false">{{ openUrl(row) }}</el-link>
          <span v-else class="dim">--</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('port.actions')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="doKill(row)" :disabled="!canKill(row)">{{ $t('port.kill') }}</el-button>
          <el-button link type="primary" @click="doStart(row)">{{ $t('port.start') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 启动命令对话框 -->
    <el-dialog v-model="startVisible" :title="$t('port.startTitle')" width="420">
      <el-input v-model="startCommand" :placeholder="$t('port.startPlaceholder')" />
      <template #footer>
        <el-button @click="startVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doExecStart">{{ $t('port.startExecute') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import api from '../api'
const { t } = useI18n()

const ports   = ref<any[]>([])
const stats   = ref<any>(null)
const scanning = ref(false)

const startVisible = ref(false)
const startCommand = ref('')

const statsText = computed(() => {
  if (!stats.value) return ''
  return t('port.scan') + ': ' + (stats.value.total || 0)
})

function canOpen(row: any) {
  return row.status === 'LISTEN' && row.port && row.protocol === 'TCP'
}
function openUrl(row: any) {
  return `http://${window.location.hostname}:${row.port}`
}
function canKill(row: any) {
  return row.port > 1024 && row.port !== 3456
}

async function scan() {
  scanning.value = true
  try {
    const res = await api.get('/port/scan') as any
    if (res.success) {
      ports.value = res.data.ports || []
      stats.value = res.data.stats
      ElMessage.success(res.message || t('common.success'))
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { scanning.value = false }
}

async function doKill(row: any) {
  await ElMessageBox.confirm(t('port.confirmKill'), t('port.kill'))
  try {
    const res = await api.post(`/port/kill/${row.port}`) as any
    if (res.success) { ElMessage.success(res.message); await scan() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { /* cancel */ }
}

function doStart(row: any) {
  startCommand.value = row.process || ''
  startVisible.value = true
}
async function doExecStart() {
  if (!startCommand.value.trim()) return ElMessage.warning(t('common.error'))
  try {
    const res = await api.post('/port/start', { command: startCommand.value }) as any
    if (res.success) { ElMessage.success(res.message || t('common.success')); startVisible.value = false }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

onMounted(scan)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.dim { color: var(--text-tertiary); }
</style>
