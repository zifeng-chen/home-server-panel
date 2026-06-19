<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('docker.title') }}</h2>
        <p class="sub">{{ infoText }}</p>
      </div>
      <el-button @click="load" :loading="loading" :icon="Refresh">刷新</el-button>
    </div>

    <!-- 概览统计 -->
    <div class="stat-row" v-if="info">
      <div class="stat-item"><span class="num">{{ containers.length }}</span><span class="lbl">容器</span></div>
      <div class="stat-item"><span class="num green">{{ runningCount }}</span><span class="lbl">运行中</span></div>
      <div class="stat-item"><span class="num">{{ images.length }}</span><span class="lbl">镜像</span></div>
      <div class="stat-item"><span class="num purple">{{ volumes?.length || 0 }}</span><span class="lbl">数据卷</span></div>
    </div>

    <!-- 容器列表 -->
    <el-table :data="containers" v-loading="loading" stripe class="data-table">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="image" label="镜像" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span class="s-dot" :class="{ up: row.state === 'running' }"></span>
          {{ row.state }}
        </template>
      </el-table-column>
      <el-table-column label="端口" width="160">
        <template #default="{ row }">
          <template v-for="(p,i) in (row.ports || [])" :key="i">
            <el-link v-if="p.publicPort" :href="`http://${hostname}:${p.publicPort}`" target="_blank" type="primary" :underline="false" size="small">{{ p.publicPort }}→{{ p.privatePort }}</el-link>
            <span v-else class="dim">{{ p.privatePort }}</span>
            <template v-if="i < row.ports.length - 1">, </template>
          </template>
          <span v-if="!row.ports?.length" class="dim">--</span>
        </template>
      </el-table-column>
      <el-table-column label="CPU" width="80">
        <template #default="{ row }">{{ row.cpu || '--' }}</template>
      </el-table-column>
      <el-table-column label="内存" width="100">
        <template #default="{ row }">{{ row.memUsage || '--' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="doAction(row.id, 'start')" v-if="row.state !== 'running'" size="small">启动</el-button>
          <el-button link type="warning" @click="doAction(row.id, 'stop')" v-if="row.state === 'running'" size="small">停止</el-button>
          <el-button link type="primary" @click="doAction(row.id, 'restart')" size="small">重启</el-button>
          <el-button link @click="showLogs(row)" size="small">日志</el-button>
          <el-button link type="danger" @click="confirmDelete(row)" size="small">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 日志对话框 -->
    <el-dialog v-model="logVisible" :title="`日志: ${logTitle}`" width="700">
      <pre class="log-box">{{ logContent || '加载中...' }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import api from '../api'

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
const infoText = computed(() => info.value ? `Docker v${info.value.serverVersion || '--'} · ${info.value.containersRunning || 0} 运行中` : '')

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
  } catch { ElMessage.error('加载 Docker 数据失败') }
  finally { loading.value = false }
}

async function doAction(id: string, action: string) {
  try {
    const res = await api.post(`/docker/containers/${id}/${action}`) as any
    if (res.success) { ElMessage.success(res.message || `${action} 成功`); await load() }
    else ElMessage.error(res.message || `${action} 失败`)
  } catch { ElMessage.error(`${action} 失败`) }
}

async function showLogs(row: any) {
  logTitle.value = row.name
  logContent.value = '加载中...'
  logVisible.value = true
  try {
    const res = await api.get(`/docker/containers/${row.id}/logs`, { params: { lines: 200 } }) as any
    if (res.success) logContent.value = typeof res.data === 'string' ? res.data : res.data?.logs || ''
    else logContent.value = res.message || '获取日志失败'
  } catch { logContent.value = '获取日志失败' }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除容器 ${row.name}？`, '确认删除', { type: 'warning' })
  try {
    const res = await api.delete(`/docker/containers/${row.id}`) as any
    if (res.success) { ElMessage.success('已删除'); await load() }
    else ElMessage.error(res.message || '删除失败')
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
