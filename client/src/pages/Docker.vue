<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('docker.title') }}</h2>
        <p class="sub">{{ infoText }}</p>
      </div>
      <el-button @click="load" :loading="loading" :icon="Refresh">{{ $t('common.refresh') }}</el-button>
    </div>

    <!-- 概览统计 -->
    <div class="stat-row" v-if="info">
      <div class="stat-item"><span class="num">{{ containers.length }}</span><span class="lbl">{{ $t('docker.containers') }}</span></div>
      <div class="stat-item"><span class="num green">{{ runningCount }}</span><span class="lbl">{{ $t('docker.running') }}</span></div>
      <div class="stat-item"><span class="num">{{ images.length }}</span><span class="lbl">{{ $t('docker.images') }}</span></div>
      <div class="stat-item"><span class="num purple">{{ volumes?.length || 0 }}</span><span class="lbl">{{ $t('port.port') }}</span></div>
    </div>

    <!-- 容器列表 -->
    <el-table :data="containers" v-loading="loading" stripe class="data-table">
      <el-table-column prop="name" :label="$t('common.name')" min-width="140" />
      <el-table-column prop="image" :label="$t('docker.images')" min-width="200" show-overflow-tooltip />
      <el-table-column :label="$t('common.status')" width="100">
        <template #default="{ row }">
          <span class="s-dot" :class="{ up: row.state === 'running' }"></span>
          {{ row.state }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('port.port')" width="160">
        <template #default="{ row }">
          <template v-for="(p,i) in (row.ports || [])" :key="i">
            <el-link v-if="p.publicPort" :href="`http://${hostname}:${p.publicPort}`" target="_blank" type="primary" underline="never" size="small">{{ p.publicPort }}→{{ p.privatePort }}</el-link>
            <span v-else class="dim">{{ p.privatePort }}</span>
            <template v-if="i < row.ports.length - 1">, </template>
          </template>
          <span v-if="!row.ports?.length" class="dim">--</span>
        </template>
      </el-table-column>
      <el-table-column label="CPU" width="80">
        <template #default="{ row }">{{ row.cpu || '--' }}</template>
      </el-table-column>
      <el-table-column :label="$t('dashboard.memory')" width="100">
        <template #default="{ row }">{{ row.memUsage || '--' }}</template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="doAction(row.id, 'start')" v-if="row.state !== 'running'" size="small">{{ $t('docker.start') }}</el-button>
          <el-button link type="warning" @click="doAction(row.id, 'stop')" v-if="row.state === 'running'" size="small">{{ $t('docker.stop') }}</el-button>
          <el-button link type="primary" @click="doAction(row.id, 'restart')" size="small">{{ $t('docker.restart') }}</el-button>
          <el-button link @click="showLogs(row)" size="small">{{ $t('docker.logs') }}</el-button>
          <el-button link type="danger" @click="confirmDelete(row)" size="small">{{ $t('docker.remove') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 日志对话框 -->
    <el-dialog v-model="logVisible" :title="$t('docker.logs') + ': ' + logTitle" width="700">
      <pre class="log-box">{{ logContent || $t('common.loading') }}</pre>
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

const loading = ref(false)
const info    = ref<any>(null)
const containers = ref<any[]>([])
const images  = ref<any[]>([])
const volumes = ref<any[]>([])

const logVisible = ref(false)
const logTitle   = ref('')
const logContent = ref('')

const hostname = window.location.hostname

const runningCount = computed(() => containers.value.filter((c: any) => c.state === 'running').length)
const infoText = computed(() => info.value ? `Docker v${info.value.serverVersion || '--'} · ${info.value.containersRunning || 0} ${t('docker.running')}` : '')

async function load() {
  loading.value = true
  try {
    const res = await api.get('/docker') as any
    if (res.success) {
      info.value       = res.data.info || null
      containers.value = res.data.containers || []
      images.value     = res.data.images || []
      volumes.value    = res.data.volumes || []
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { loading.value = false }
}

async function doAction(id: string, action: string) {
  try {
    const res = await api.post(`/docker/containers/${id}/${action}`) as any
    if (res.success) { ElMessage.success(res.message || t('common.success')); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function showLogs(row: any) {
  logTitle.value = row.name
  logContent.value = t('common.loading')
  logVisible.value = true
  try {
    const res = await api.get(`/docker/containers/${row.id}/logs`, { params: { lines: 200 } }) as any
    if (res.success) logContent.value = typeof res.data === 'string' ? res.data : res.data?.logs || ''
    else logContent.value = res.message || t('common.error')
  } catch { logContent.value = t('common.error') }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(t('common.confirmDelete'), t('common.delete'), { type: 'warning' })
  try {
    const res = await api.delete(`/docker/containers/${row.id}`) as any
    if (res.success) { ElMessage.success(t('common.success')); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { /* cancel */ }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.stat-row { display: flex; gap: 32px; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-item .num { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.stat-item .num.green { color: var(--accent-green); }
.stat-item .num.purple { color: var(--accent-purple); }
.stat-item .lbl { font-size: 12px; color: var(--text-tertiary); }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.s-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; background: var(--text-tertiary); }
.s-dot.up { background: var(--accent-green); }
.dim { color: var(--text-tertiary); font-size: 12px; }
.log-box { background: var(--bg-base); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; max-height: 500px; overflow-y: auto; }
</style>
