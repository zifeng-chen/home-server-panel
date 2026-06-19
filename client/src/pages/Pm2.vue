<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('pm2.title') }}</h2>
        <p class="sub">{{ statusText }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="!installed" type="primary" @click="doInstall" :loading="installing" :icon="Download">安装 PM2</el-button>
        <el-button v-else @click="load" :loading="loading" :icon="Refresh">刷新</el-button>
      </div>
    </div>

    <!-- 未安装时 -->
    <div v-if="!installed && !installing" class="card">
      <p class="dim">PM2 未安装。点击"安装 PM2"开始安装。</p>
    </div>

    <!-- 安装进度 -->
    <div v-if="installing" class="card install-log">
      <p class="install-start">正在安装 PM2...</p>
      <pre class="log-output">{{ installLog }}</pre>
    </div>

    <!-- 进程列表 -->
    <el-table v-if="installed" :data="processes" v-loading="loading" stripe class="data-table">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="mode" label="模式" width="70" />
      <el-table-column prop="cpu" label="CPU" width="70">
        <template #default="{ row }">{{ row.cpu || 0 }}%</template>
      </el-table-column>
      <el-table-column prop="memory" label="内存" width="90">
        <template #default="{ row }">{{ fmtMem(row.memory) }}</template>
      </el-table-column>
      <el-table-column prop="uptime" label="运行时间" width="100" />
      <el-table-column prop="restarts" label="重启次" width="70" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="doAction(row.name,'restart')" size="small">重启</el-button>
          <el-button link type="warning" @click="doAction(row.name,'stop')" v-if="row.status === 'online'" size="small">停止</el-button>
          <el-button link type="primary" @click="doAction(row.name,'start')" v-else size="small">启动</el-button>
          <el-button link type="danger" @click="confirmDelete(row.name)" size="small">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'
import api from '../api'

const loading = ref(false)
const installed = ref(false)
const processes = ref<any[]>([])
const version = ref('')

const installing = ref(false)
const installLog = ref('')

const statusText = computed(() => {
  if (!installed.value) return 'PM2 未安装'
  const on = processes.value.filter((p: any) => p.status === 'online').length
  return `v${version.value} · ${on}/${processes.value.length} 在线`
})

async function load() {
  loading.value = true
  try {
    const [sRes, pRes] = await Promise.all([
      api.get('/pm2/status') as any,
      api.get('/pm2') as any
    ])
    if (sRes.success) {
      installed.value = sRes.data.installed !== false
      version.value = sRes.data.version || ''
    }
    if (pRes.success) processes.value = pRes.data || []
  } catch { /* ignore */ }
  finally { loading.value = false }
}

async function doInstall() {
  installing.value = true
  installLog.value = ''
  try {
    const res = await api.post('/pm2/install') as any
    if (res?.success) { ElMessage.success('PM2 安装成功'); await load() }
    else ElMessage.error(res?.message || '安装失败')
  } catch { ElMessage.error('安装失败') }
  finally { installing.value = false }
}

async function doAction(name: string, action: string) {
  try {
    const res = await api.post(`/pm2/${name}/${action}`) as any
    if (res.success) { ElMessage.success(res.message || `${action} 成功`); await load() }
    else ElMessage.error(res.message || '操作失败')
  } catch { ElMessage.error('操作失败') }
}

async function confirmDelete(name: string) {
  await ElMessageBox.confirm(`确定删除 PM2 进程 ${name}？`, '确认删除')
  try {
    const res = await api.delete(`/pm2/${name}`) as any
    if (res.success) { ElMessage.success('已删除'); await load() }
    else ElMessage.error(res.message || '删除失败')
  } catch { /* cancel */ }
}

function fmtMem(m: any) { if (!m) return '--'; const v = typeof m === 'string' ? parseFloat(m) : m; return (v / 1048576).toFixed(1) + ' MB' }

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.dim { color: var(--text-tertiary); font-size: 13px; }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.install-log { font-size: 13px; }
.install-start { color: var(--accent); font-weight: 500; margin-bottom: 8px; }
.log-output { background: var(--bg-base); padding: 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
</style>
