<template>
  <div class="page">
    <!-- 头部 -->
    <div class="page-header">
      <div>
        <h2>{{ $t('ddns.title') }}</h2>
        <p class="sub">{{ $t('ddns.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="showAddDlg = true" :icon="Plus">{{ $t('ddns.addDomain') }}</el-button>
        <el-button @click="refreshAll" :loading="refreshing" :icon="Refresh">{{ $t('common.refresh') }}</el-button>
      </div>
    </div>

    <!-- 密钥缺失提示 -->
    <el-alert v-if="credMissingAliyun" :title="$t('ddns.credMissing', { provider: '阿里云 (Aliyun)' })" type="warning" show-icon :closable="false" style="margin-bottom: 12px">
      <template #default>
        <span>{{ $t('ddns.credMissingHint') }} <el-button link type="primary" @click="goSettings">{{ $t('common.settings') }}</el-button></span>
      </template>
    </el-alert>

    <!-- 公网 IP -->
    <div class="ip-row">
      <div class="ip-card"><span class="ip-label">IPv4</span><code>{{ ipv4 || '--' }}</code></div>
      <div class="ip-card"><span class="ip-label">IPv6</span><code>{{ ipv6 || '--' }}</code></div>
    </div>

    <!-- 记录表格 -->
    <el-table :data="records" v-loading="loading" stripe class="data-table">
      <el-table-column :label="$t('ddns.provider')" width="80">
        <template #default="{ row }"><el-tag :type="row.provider === 'tencent' ? 'warning' : 'primary'" size="small">{{ row.provider === 'tencent' ? $t('ddns.tencent') : $t('ddns.aliyun') }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="domain" :label="$t('ddns.domain')" min-width="160" />
      <el-table-column prop="rr" :label="$t('ddns.rr')" width="100" />
      <el-table-column prop="recordType" :label="$t('ddns.type')" width="70" />
      <el-table-column prop="ip" :label="$t('ddns.value')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <code class="ip-code">{{ row.ip || row.value || '--' }}</code>
        </template>
      </el-table-column>
      <el-table-column label="同步" width="70" align="center">
        <template #default="{ row }">
          <el-tooltip :content="row.needsUpdate ? 'IP 已变化，需刷新' : 'IP 一致'">
            <el-icon :size="16" :color="row.needsUpdate ? 'var(--accent-orange)' : 'var(--accent-green)'">
              <WarningFilled v-if="row.needsUpdate" />
              <CircleCheckFilled v-else />
            </el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="line" :label="$t('ddns.line')" width="80" />
      <el-table-column prop="ttl" label="TTL" width="70" />
      <el-table-column :label="$t('ddns.status')" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled !== false" @change="() => toggleRecord(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column :label="$t('ddns.actions')" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)" :icon="Edit" size="small">{{ $t('common.edit') }}</el-button>
          <el-button link type="danger" @click="confirmDelete(row)" :icon="Delete" size="small">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 删除确认 -->
    <el-dialog v-model="delVisible" :title="$t('ddns.deleteConfirm')" width="360">
      <p>{{ $t('ddns.deleteDialog', { name: (delTarget?.rr || '') + '.' + (delTarget?.domain || '') }) }}</p>
      <template #footer>
        <el-button @click="delVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="danger" @click="doDelete" :loading="deleting">{{ $t('common.delete') }}</el-button>
      </template>
    </el-dialog>

    <!-- 添加对话框 -->
    <el-dialog v-model="showAddDlg" :title="$t('ddns.addDomain')" width="480">
      <el-form :model="addForm" label-width="80px">
        <el-form-item :label="$t('ddns.provider')">
          <el-radio-group v-model="addForm.provider" @change="onAddTypeChange">
            <el-radio value="aliyun">{{ $t('ddns.aliyun') }}</el-radio>
            <el-radio value="tencent">{{ $t('ddns.tencent') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('ddns.domain')" required>
          <el-input v-model="addForm.domain" placeholder="example.com" />
        </el-form-item>
        <el-form-item :label="$t('ddns.rr')">
          <el-input v-model="addForm.subdomain" placeholder="@ 或 www" />
        </el-form-item>
        <el-form-item :label="$t('ddns.type')">
          <el-select v-model="addForm.recordType" @change="onAddTypeChange">
            <el-option label="A (IPv4)" value="A" />
            <el-option label="AAAA (IPv6)" value="AAAA" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('ddns.value')">
          <el-input :model-value="addForm.value" disabled>
            <template #append>
              <el-tag size="small" type="success">自动获取</el-tag>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="TTL">
          <el-select v-model="addForm.ttl">
            <el-option label="120 (2分钟)" :value="120" />
            <el-option label="600 (10分钟)" :value="600" />
            <el-option label="1800 (30分钟)" :value="1800" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDlg = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doAdd" :loading="adding">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="showEditDlg" :title="$t('ddns.editRecord')" width="480">
      <el-form v-if="editTarget" :model="editForm" label-width="80px">
        <el-form-item :label="$t('ddns.domain')">
          <el-input :model-value="editTarget.domain" disabled />
        </el-form-item>
        <el-form-item :label="$t('ddns.rr')">
          <el-input v-model="editForm.rr" />
        </el-form-item>
        <el-form-item :label="$t('ddns.type')">
          <el-select v-model="editForm.recordType">
            <el-option label="A (IPv4)" value="A" />
            <el-option label="AAAA (IPv6)" value="AAAA" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('ddns.value')">
          <el-input v-model="editForm.ip" />
        </el-form-item>
        <el-form-item :label="$t('ddns.line')">
          <el-input v-model="editForm.line" placeholder="default" />
        </el-form-item>
        <el-form-item label="TTL">
          <el-select v-model="editForm.ttl">
            <el-option label="120" :value="120" />
            <el-option label="600" :value="600" />
            <el-option label="1800" :value="1800" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDlg = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doEdit" :loading="editing">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Refresh, Delete, Plus, Edit, WarningFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import api from '../api'
import { useRouter } from 'vue-router'
const { t } = useI18n()
const router = useRouter()

const loading    = ref(false)
const refreshing = ref(false)
const deleting   = ref(false)
const editing    = ref(false)
const records    = ref<any[]>([])
const ipv4       = ref('')
const ipv6       = ref('')

const delVisible = ref(false)
const delTarget  = ref<any>(null)

// 添加
const showAddDlg = ref(false)
const adding = ref(false)
const addForm = ref({ provider: 'aliyun', domain: '', subdomain: '@', recordType: 'A', value: '', ttl: 600 })

// 编辑
const showEditDlg = ref(false)
const editTarget  = ref<any>(null)
const editForm    = ref({ rr: '', recordType: '', ip: '', ttl: 600, line: '' })

// 根据记录类型自动填入公网 IP
const credMissingAliyun = ref(false)
const credMissingTencent = ref(false)

async function checkCredentials() {
  try {
    const res = await api.get('/ddns/credentials-status') as any
    if (res.success) {
      credMissingAliyun.value = !res.data.aliyun
      credMissingTencent.value = !res.data.tencent
    }
  } catch { /* ignore */ }
}

function goSettings() {
  router.push('/settings')
}

// 根据记录类型自动填入公网 IP
function onAddTypeChange() {
  addForm.value.value = addForm.value.recordType === 'AAAA' ? (ipv6.value || '获取中...') : (ipv4.value || '获取中...')
}

// 打开添加对话框时自动填入 IP
watch(showAddDlg, (v) => {
  if (v) onAddTypeChange()
})

// 加载数据
async function load() {
  loading.value = true
  try {
    const res = await api.get('/ddns') as any
    if (res.success) {
      records.value = (res.data.records || []).filter((r: any) => !r.error)
      ipv4.value = res.data.publicIpv4 || ''
      ipv6.value = res.data.publicIpv6 || ''
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { loading.value = false }
}

// Refresh All
async function refreshAll() {
  refreshing.value = true
  try {
    const res = await api.post('/ddns/refresh') as any
    ElMessage.success(res.message || t('common.success'))
    await load()
  } catch { ElMessage.error(t('common.error')) }
  finally { refreshing.value = false }
}

// 启用/停用
async function toggleRecord(row: any) {
  const recordId = row.id || ''
  try {
    const res = await api.post(`/ddns/record/${recordId}/toggle`, {
      provider: row.provider,
      status: row.enabled === false ? 'ENABLE' : 'DISABLE'
    }) as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

// 删除
function confirmDelete(row: any) {
  delTarget.value = row
  delVisible.value = true
}
async function doDelete() {
  if (!delTarget.value) return
  deleting.value = true
  try {
    const res = await api.delete(`/ddns/record/${delTarget.value.id}`) as any
    if (res.success) { ElMessage.success(t('common.success')); delVisible.value = false; await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { deleting.value = false }
}

// 添加域名
async function doAdd() {
  if (!addForm.value.domain.trim()) {
    ElMessage.warning(t('common.error'))
    return
  }
  adding.value = true
  try {
    const res = await api.post('/ddns/domains', {
      provider: addForm.value.provider,
      name: addForm.value.domain.trim(),
      subdomain: addForm.value.subdomain || '@',
      recordType: addForm.value.recordType,
      value: addForm.value.value,
      ttl: addForm.value.ttl
    }) as any
    if (res.success) {
      ElMessage.success(res.message || t('common.success'))
      showAddDlg.value = false
      addForm.value = { provider: 'aliyun', domain: '', subdomain: '@', recordType: 'A', value: '', ttl: 600 }
      await load()
    } else {
      ElMessage.error(res.message || t('common.error'))
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { adding.value = false }
}

// 编辑记录
function openEdit(row: any) {
  editTarget.value = row
  editForm.value = {
    rr: row.rr || '',
    recordType: row.recordType || 'A',
    ip: row.ip || row.value || '',
    ttl: row.ttl || 600,
    line: row.line || 'default'
  }
  showEditDlg.value = true
}
async function doEdit() {
  if (!editTarget.value) return
  editing.value = true
  try {
    const res = await api.put(`/ddns/record/${editTarget.value.id}`, {
      provider: editTarget.value.provider,
      rr: editForm.value.rr,
      type: editForm.value.recordType,
      value: editForm.value.ip,
      ttl: editForm.value.ttl,
      line: editForm.value.line
    }) as any
    if (res.success) { ElMessage.success(res.message || t('common.success')); showEditDlg.value = false; await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { editing.value = false }
}

onMounted(() => { load(); checkCredentials() })
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; }
.ip-row { display: flex; gap: 16px; }
.ip-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.ip-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); }
.ip-card code { font-size: 14px; font-family: var(--font-mono); color: var(--accent); }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.ip-code { font-family: var(--font-mono); font-size: 13px; color: var(--accent); }
</style>
