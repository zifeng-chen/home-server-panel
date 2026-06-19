<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('cron.title') }}</h2>
        <p class="sub">{{ jobs.length }} 个任务</p>
      </div>
      <el-button type="primary" @click="showAdd" :icon="Plus">添加任务</el-button>
    </div>

    <el-table :data="jobs" v-loading="loading" stripe class="data-table">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="schedule" label="Cron 表达式" width="140">
        <template #default="{ row }"><code class="mono">{{ row.schedule }}</code></template>
      </el-table-column>
      <el-table-column prop="command" label="命令" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="90">
        <template #default="{ row }"><el-tag size="small">{{ row.type || 'custom' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="() => toggle(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="runNow(row)" size="small">执行</el-button>
          <el-button link @click="showEdit(row)" size="small">编辑</el-button>
          <el-button link type="danger" @click="confirmDelete(row)" size="small">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑任务' : '添加任务'" width="480">
      <el-form :model="form" label-width="90px">
        <el-form-item label="任务名称"><el-input v-model="form.name" placeholder="备份数据库" /></el-form-item>
        <el-form-item label="Cron 表达"><el-input v-model="form.schedule" placeholder="0 2 * * *" /></el-form-item>
        <el-form-item label="执行命令"><el-input v-model="form.command" type="textarea" :rows="3" placeholder="sh /path/to/script.sh" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const loading = ref(false)
const saving  = ref(false)
const jobs    = ref<any[]>([])

const dialogVisible = ref(false)
const editId = ref('')
const form   = ref({ name: '', schedule: '', command: '' })

async function load() {
  loading.value = true
  try {
    const res = await api.get('/cron') as any
    if (res.success) jobs.value = res.data.jobs || []
  } catch { ElMessage.error('加载任务列表失败') }
  finally { loading.value = false }
}

function showAdd() { editId.value = ''; form.value = { name: '', schedule: '', command: '' }; dialogVisible.value = true }
function showEdit(row: any) { editId.value = row.id; form.value = { name: row.name, schedule: row.schedule, command: row.command }; dialogVisible.value = true }

async function doSave() {
  if (!form.value.name || !form.value.schedule) return ElMessage.warning('请填写名称和 Cron 表达式')
  saving.value = true
  try {
    let res: any
    if (editId.value) { res = await api.put(`/cron/${editId.value}`, form.value) }
    else { res = await api.post('/cron', form.value) }
    if (res.success) { ElMessage.success(res.message || '保存成功'); dialogVisible.value = false; await load() }
    else ElMessage.error(res.message || '保存失败')
  } catch  { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function toggle(row: any) {
  try {
    const res = await api.post(`/cron/${row.id}/toggle`) as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || '操作失败')
  } catch { ElMessage.error('操作失败') }
}

async function runNow(row: any) {
  try {
    const res = await api.post(`/cron/${row.id}/run`) as any
    if (res.success) ElMessage.success('任务已执行')
    else ElMessage.error(res.message || '执行失败')
  } catch { ElMessage.error('执行失败') }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除任务 ${row.name}？`, '确认删除')
  try {
    const res = await api.delete(`/cron/${row.id}`) as any
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
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.mono { font-family: var(--font-mono); font-size: 13px; color: var(--accent); }
</style>
