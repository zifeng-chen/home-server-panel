<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('proxy.title') }}</h2>
        <p class="sub">{{ statsText }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="showAddEdit(null)" :icon="Plus">添加规则</el-button>
        <el-button @click="exportConfig">导出配置</el-button>
      </div>
    </div>

    <!-- 统计 -->
    <div class="stat-row" v-if="stats">
      <div class="stat-item"><span class="num">{{ stats.total }}</span><span class="lbl">总数</span></div>
      <div class="stat-item"><span class="num green">{{ stats.enabled }}</span><span class="lbl">已启用</span></div>
      <div class="stat-item"><span class="num">{{ stats.disabled }}</span><span class="lbl">已停用</span></div>
      <div class="stat-item"><span class="num purple">{{ stats.sslCount }}</span><span class="lbl">SSL</span></div>
    </div>

    <!-- 规则表格 -->
    <el-table :data="rules" v-loading="loading" stripe class="data-table">
      <el-table-column prop="sourceHost" label="域名" min-width="160" />
      <el-table-column label="目标" min-width="200">
        <template #default="{ row }">{{ row.targetProtocol || 'http' }}://{{ row.targetHost }}:{{ row.targetPort || 80 }}</template>
      </el-table-column>
      <el-table-column label="SSL" width="70">
        <template #default="{ row }"><el-tag :type="row.ssl ? 'success' : 'info'" size="small">{{ row.ssl ? '开启' : '关闭' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="sslCert" label="证书" width="100" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="() => toggle(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showAddEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑规则' : '添加规则'" width="520">
      <el-form :model="form" label-width="100px">
        <el-form-item label="域名"><el-input v-model="form.sourceHost" placeholder="example.com" /></el-form-item>
        <el-form-item label="目标地址"><el-input v-model="form.targetHost" placeholder="localhost" />
          <el-select v-model="form.targetProtocol" style="width:90px;margin-left:8px"><el-option label="http" value="http" /><el-option label="https" value="https" /></el-select>
          <el-input-number v-model="form.targetPort" :min="1" :max="65535" style="width:100px;margin-left:4px" />
        </el-form-item>
        <el-form-item label="SSL"><el-switch v-model="form.ssl" /></el-form-item>
        <el-form-item label="SSL 证书" v-if="form.ssl">
          <el-select v-model="form.sslCert" filterable clearable placeholder="选择证书">
            <el-option v-for="c in sslCerts" :key="c.domain" :value="c.domain" :label="c.domain" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">{{ editId ? '保存' : '添加' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const loading = ref(false)
const rules   = ref<any[]>([])
const stats   = ref<any>(null)

const dialogVisible = ref(false)
const saving   = ref(false)
const editId   = ref('')
const form     = ref<any>({ sourceHost: '', targetHost: '', targetProtocol: 'http', targetPort: 80, ssl: false, sslCert: '', note: '' })
const sslCerts = ref<any[]>([])

const statsText = computed(() => {
  if (!stats.value) return ''
  return `总计 ${stats.value.total} 条规则，${stats.value.enabled} 条已启用`
})

async function load() {
  loading.value = true
  try {
    const res = await api.get('/proxy') as any
    if (res.success) {
      rules.value = res.data.rules || []
      stats.value = res.data.stats || null
    }
  } catch { ElMessage.error('加载代理规则失败') }
  finally { loading.value = false }
}

async function loadCerts() {
  try {
    const res = await api.get('/cert') as any
    if (res.success) sslCerts.value = (res.data.certificates || []).filter((c: any) => c.status === 'valid')
  } catch { /* ignore */ }
}

function showAddEdit(row: any | null) {
  if (row) {
    editId.value = row.id
    form.value = { ...row }
  } else {
    editId.value = ''
    form.value = { sourceHost: '', targetHost: '', targetProtocol: 'http', targetPort: 80, ssl: false, sslCert: '', note: '' }
  }
  dialogVisible.value = true
  loadCerts()
}

async function doSave() {
  if (!form.value.sourceHost || !form.value.targetHost) return ElMessage.warning('请填写域名和目标地址')
  saving.value = true
  try {
    let res: any
    if (editId.value) {
      res = await api.put(`/proxy/${editId.value}`, form.value)
    } else {
      res = await api.post('/proxy', form.value)
    }
    if (res.success) { ElMessage.success(res.message || '保存成功'); dialogVisible.value = false; await load() }
    else ElMessage.error(res.message || '保存失败')
  } catch { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function toggle(row: any) {
  try {
    const res = await api.post(`/proxy/${row.id}/toggle`) as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || '操作失败')
  } catch { ElMessage.error('操作失败') }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.sourceHost} 的代理规则吗？`, '确认删除')
  try {
    const res = await api.delete(`/proxy/${row.id}`) as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || '删除失败')
  } catch { /* cancelled */ }
}

async function exportConfig() {
  try {
    const res = await api.get('/proxy/config/preview') as any
    if (res.success && res.data?.config) {
      const blob = new Blob([res.data.config], { type: 'text/plain' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'proxy-nginx.conf'; a.click()
    }
  } catch { ElMessage.error('导出失败') }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; }
.stat-row { display: flex; gap: 24px; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-item .num { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.stat-item .num.green { color: var(--accent-green); }
.stat-item .num.purple { color: var(--accent-purple); }
.stat-item .lbl { font-size: 12px; color: var(--text-tertiary); }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
</style>
