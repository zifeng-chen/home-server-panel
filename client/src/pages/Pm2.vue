<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2>{{ $t('pm2.title') }}</h2>
        <p class="sub">{{ statusText }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="installed" type="primary" @click="showAddProc = true" :icon="Plus" size="default">{{ $t('common.add') }}{{ $t('port.process') }}</el-button>
        <el-button v-if="!installed" type="primary" @click="doInstall" :loading="installing" :icon="Download">{{ $t('pm2.install') }}</el-button>
        <el-button v-else @click="load" :loading="loading" :icon="Refresh">{{ $t('common.refresh') }}</el-button>
      </div>
    </div>

    <!-- Not installed -->
    <div v-if="!installed && !installing" class="empty-card">
      <div class="empty-icon">📦</div>
      <p class="empty-title">{{ $t('pm2.notInstalled') }}</p>
      <p class="empty-desc">{{ $t('pm2.subtitle') }}</p>
    </div>

    <!-- Installing progress -->
    <div v-if="installing" class="card install-log">
      <p class="install-start">{{ $t('pm2.install') }}...</p>
      <pre class="log-output">{{ installLog }}</pre>
    </div>

    <!-- Processes table -->
    <div v-if="installed">
      <el-table v-if="processes.length" :data="processes" v-loading="loading" stripe class="data-table">
        <el-table-column prop="name" :label="$t('common.name')" min-width="140">
          <template #default="{ row }">
            <span class="proc-name">{{ row.name }}</span>
            <span class="proc-meta">ID: {{ row.id }} · PID: {{ row.pid || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small" effect="dark">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mode" :label="$t('common.type')" width="70" />
        <el-table-column prop="cpu" label="CPU" width="80">
          <template #default="{ row }">{{ row.cpu || 0 }}%</template>
        </el-table-column>
        <el-table-column prop="memory" :label="$t('dashboard.memory')" width="90">
          <template #default="{ row }">{{ fmtMem(row.memory) }}</template>
        </el-table-column>
        <el-table-column :label="$t('topbar.uptime')" width="110">
          <template #default="{ row }">{{ fmtTime(row.uptime) }}</template>
        </el-table-column>
        <el-table-column prop="restarts" :label="$t('nginx.restart')" width="60" />
        <el-table-column :label="$t('common.actions')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="doAction(row.name,'restart')" size="small">{{ $t('nginx.restart') }}</el-button>
            <el-button link type="warning" @click="doAction(row.name,'stop')" v-if="row.status === 'online'" size="small">{{ $t('nginx.stop') }}</el-button>
            <el-button link type="primary" @click="doAction(row.name,'start')" v-else size="small">{{ $t('nginx.start') }}</el-button>
            <el-button link type="danger" @click="confirmDelete(row.name)" size="small">{{ $t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty state when installed but no processes -->
      <div v-else-if="!loading" class="empty-card">
        <div class="empty-icon">🚀</div>
        <p class="empty-title">{{ $t('common.noData') }}</p>
        <p class="empty-desc">{{ $t('pm2.subtitle') }}</p>
      </div>
    </div>

    <!-- Add process dialog -->
    <el-dialog v-model="showAddProc" :title="$t('common.add') + ' PM2'" width="480">
      <el-form :model="addProc" label-width="80px">
        <el-form-item :label="$t('common.name')" required>
          <el-input v-model="addProc.name" placeholder="hsp-server" />
        </el-form-item>
        <el-form-item :label="$t('cron.command')" required>
          <el-input v-model="addProc.script" placeholder="src/server.js" />
        </el-form-item>
        <el-form-item label="工作目录">
          <el-input v-model="addProc.cwd" placeholder="" />
        </el-form-item>
        <el-form-item label="参数">
          <el-input v-model="addProc.args" placeholder="--port 4567" />
          <el-input v-model="addProc.args" placeholder="如 --port 4567" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddProc = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doAddProc" :loading="addingProc">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh, Plus } from '@element-plus/icons-vue'
import api from '../api'
const { t } = useI18n()

const loading   = ref(false)
const installed = ref(false)
const processes = ref<any[]>([])
const version   = ref('')
const installing = ref(false)
const installLog  = ref('')
const showAddProc = ref(false)
const addingProc  = ref(false)
const addProc = ref({ name: '', script: '', cwd: '', args: '' })

const statusText = computed(() => {
  if (!installed.value) return t('pm2.notInstalled')
  const on = processes.value.filter((p: any) => p.status === 'online').length
  return `v${version.value} · ${on}/${processes.value.length} ${t('common.online')}`
})

async function load() {
  loading.value = true
  try {
    const [sRes, pRes] = await Promise.all([
      api.get('/pm2/status') as any,
      api.get('/pm2') as any
    ])
    if (sRes?.success) {
      installed.value = sRes.data?.installed !== false
      version.value = sRes.data?.version || ''
    }
    // The response from pm2-service is { success, data: { processes, summary } }
    if (pRes?.success) {
      processes.value = pRes.data?.processes || []
    }
  } catch (e) {
    // PM2 not responding - might not be installed
    installed.value = false
    processes.value = []
  }
  finally { loading.value = false }
}

async function doInstall() {
  installing.value = true
  installLog.value = ''
  try {
    const res = await api.post('/pm2/install') as any
    if (res?.success) {
      ElMessage.success(t('common.success'))
      try { await api.post('/pm2/start-daemon') } catch {}
      await load()
    } else {
      ElMessage.error(res?.message || t('common.error'))
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { installing.value = false }
}

async function doAction(name: string, action: string) {
  try {
    const res = await api.post(`/pm2/${name}/${action}`) as any
    if (res?.success) { ElMessage.success(res.message || t('common.success')); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function confirmDelete(name: string) {
  try {
    await ElMessageBox.confirm(t('common.confirmDelete'), t('common.delete'), { type: 'warning' })
  } catch { return }
  try {
    const res = await api.delete(`/pm2/${name}`) as any
    if (res?.success) { ElMessage.success(t('common.success')); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function doAddProc() {
  if (!addProc.value.name || !addProc.value.script) {
    ElMessage.warning(t('common.error'))
    return
  }
  addingProc.value = true
  try {
    const res = await api.post('/pm2/add', {
      name: addProc.value.name,
      script: addProc.value.script,
      cwd: addProc.value.cwd || undefined,
      args: addProc.value.args || undefined
    }) as any
    if (res?.success) {
      ElMessage.success(t('common.success'))
      showAddProc.value = false
      addProc.value = { name: '', script: '', cwd: '', args: '' }
      await load()
    } else {
      ElMessage.error(res?.message || t('common.error'))
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { addingProc.value = false }
}

function fmtMem(m: any) { if (!m) return '--'; const v = typeof m === 'string' ? parseFloat(m) : m; return (v / 1048576).toFixed(1) + ' MB' }
function fmtTime(s: number) {
  if (!s || s < 0) return '--'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.proc-name { font-weight: 600; display: block; }
.proc-meta { font-size: 11px; color: var(--text-tertiary); display: block; margin-top: 2px; }

/* Empty state */
.empty-card {
  text-align: center;
  padding: 64px 24px;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.6; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: var(--text-tertiary); }

/* Install log */
.install-log { font-size: 13px; }
.install-start { color: var(--accent); font-weight: 500; margin-bottom: 8px; }
.log-output { background: var(--bg-base); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
</style>
