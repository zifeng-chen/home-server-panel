<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('cron.title') }}</h2>
        <p class="sub">{{ $t('cron.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="showAdd" :icon="Plus">{{ $t('cron.addJob') }}</el-button>
    </div>

    <el-table :data="jobs" v-loading="loading" stripe class="data-table">
      <el-table-column prop="name" :label="$t('common.name')" min-width="140" />
      <el-table-column prop="schedule" :label="$t('cron.schedule')" width="140">
        <template #default="{ row }"><code class="mono">{{ row.schedule }}</code></template>
      </el-table-column>
      <el-table-column prop="command" :label="$t('cron.command')" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" :label="$t('common.type')" width="90">
        <template #default="{ row }"><el-tag size="small">{{ row.type || 'custom' }}</el-tag></template>
      </el-table-column>
      <el-table-column :label="$t('common.status')" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="() => toggle(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="runNow(row)" size="small">{{ $t('common.submit') }}</el-button>
          <el-button link @click="showEdit(row)" size="small">{{ $t('common.edit') }}</el-button>
          <el-button link type="danger" @click="confirmDelete(row)" size="small">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? $t('cron.editJob') : $t('cron.addJob')" width="480">
      <el-form :model="form" label-width="90px">
        <el-form-item :label="$t('common.name')"><el-input v-model="form.name" :placeholder="$t('cron.desc')" /></el-form-item>
        <el-form-item :label="$t('cron.schedule')"><el-input v-model="form.schedule" placeholder="0 2 * * *" /></el-form-item>
        <el-form-item :label="$t('cron.command')"><el-input v-model="form.command" type="textarea" :rows="3" placeholder="sh /path/to/script.sh" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'
const { t } = useI18n()

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
  } catch { ElMessage.error(t('common.error')) }
  finally { loading.value = false }
}

function showAdd() { editId.value = ''; form.value = { name: '', schedule: '', command: '' }; dialogVisible.value = true }
function showEdit(row: any) { editId.value = row.id; form.value = { name: row.name, schedule: row.schedule, command: row.command }; dialogVisible.value = true }

async function doSave() {
  if (!form.value.name || !form.value.schedule) return ElMessage.warning(t('common.error'))
  saving.value = true
  try {
    let res: any
    if (editId.value) { res = await api.put(`/cron/${editId.value}`, form.value) }
    else { res = await api.post('/cron', form.value) }
    if (res.success) { ElMessage.success(res.message || t('common.success')); dialogVisible.value = false; await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch  { ElMessage.error(t('common.error')) }
  finally { saving.value = false }
}

async function toggle(row: any) {
  try {
    const res = await api.post(`/cron/${row.id}/toggle`) as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function runNow(row: any) {
  try {
    const res = await api.post(`/cron/${row.id}/run`) as any
    if (res.success) ElMessage.success(t('common.success'))
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(t('cron.deleteConfirm'), t('common.confirmDelete'))
  try {
    const res = await api.delete(`/cron/${row.id}`) as any
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
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.mono { font-family: var(--font-mono); font-size: 13px; color: var(--accent); }
</style>
