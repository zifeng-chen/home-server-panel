<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('port.title') }}</h2>
        <p class="sub">{{ statsText }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="scan" :loading="scanning" :icon="Refresh">扫描</el-button>
      </div>
    </div>

    <el-table :data="ports" v-loading="scanning" stripe class="data-table">
      <el-table-column prop="port" label="端口" width="80" sortable />
      <el-table-column prop="protocol" label="协议" width="70">
        <template #default="{ row }"><el-tag :type="row.protocol === 'TCP' ? '' : 'warning'" size="small">{{ row.protocol }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span class="dot" :style="{ background: row.status === 'LISTEN' ? 'var(--accent-green)' : 'var(--text-tertiary)' }"></span>
          {{ row.status }}
        </template>
      </el-table-column>
      <el-table-column prop="process" label="进程" min-width="140" />
      <el-table-column prop="pid" label="PID" width="70" />
      <el-table-column label="可访问" width="90">
        <template #default="{ row }">
          <el-link v-if="canOpen(row)" :href="openUrl(row)" target="_blank" type="primary" :underline="false">{{ openUrl(row) }}</el-link>
          <span v-else class="dim">--</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="doKill(row)" :disabled="!canKill(row)">终止</el-button>
          <el-button link type="primary" @click="doStart(row)">恢复</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 启动命令对话框 -->
    <el-dialog v-model="startVisible" title="启动服务" width="420">
      <el-input v-model="startCommand" placeholder="输入启动命令，如 nginx" />
      <template #footer>
        <el-button @click="startVisible = false">取消</el-button>
        <el-button type="primary" @click="doExecStart">执行</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import api from '../api'

const ports   = ref<any[]>([])
const stats   = ref<any>(null)
const scanning = ref(false)

const startVisible = ref(false)
const startCommand = ref('')

const statsText = computed(() => {
  if (!stats.value) return ''
  return `共 ${stats.value.total || 0} 个监听端口`
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
      ElMessage.success(res.message || '扫描完成')
    }
  } catch { ElMessage.error('扫描失败') }
  finally { scanning.value = false }
}

async function doKill(row: any) {
  await ElMessageBox.confirm(`确定终止端口 ${row.port} 上的进程 ${row.process || ''}？`, '确认终止')
  try {
    const res = await api.post(`/port/kill/${row.port}`) as any
    if (res.success) { ElMessage.success(res.message); await scan() }
    else ElMessage.error(res.message || '终止失败')
  } catch { /* cancel */ }
}

function doStart(row: any) {
  startCommand.value = row.process || ''
  startVisible.value = true
}
async function doExecStart() {
  if (!startCommand.value.trim()) return ElMessage.warning('请输入启动命令')
  try {
    const res = await api.post('/port/start', { command: startCommand.value }) as any
    if (res.success) { ElMessage.success(res.message || '已执行'); startVisible.value = false }
    else ElMessage.error(res.message || '执行失败')
  } catch { ElMessage.error('执行失败') }
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
