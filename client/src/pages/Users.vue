<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('users.title') }}</h2>
        <p class="sub">{{ $t('users.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="openCreate" :icon="Plus" v-if="auth.isAdmin">{{ $t('users.addUser') }}</el-button>
    </div>

    <div class="card">
      <el-table :data="users" stripe size="default" v-loading="loading" empty-text="暂无用户">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" :label="$t('users.username')" min-width="120" />
        <el-table-column :label="$t('users.role')" width="100">
          <template #default="{row}">
            <el-tag :type="row.role === 'admin' ? 'danger' : ''" size="small" effect="plain">
              {{ row.role === 'admin' ? $t('users.admin') : $t('users.user') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('users.createdAt')" width="170">
          <template #default="{row}">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="$t('users.updatedAt')" width="170">
          <template #default="{row}">{{ formatTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column v-if="auth.isAdmin" :label="$t('common.actions')" width="150" fixed="right">
          <template #default="{row}">
            <el-button text type="primary" size="small" @click="openEdit(row)" :icon="Edit">{{ $t('common.edit') }}</el-button>
            <el-popconfirm v-if="row.username !== 'admin'" :title="$t('users.deleteConfirm')" @confirm="doDelete(row.id)">
              <template #reference>
                <el-button text type="danger" size="small" :icon="Delete">{{ $t('common.delete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingUser ? $t('users.editUserTitle') : $t('users.addUserTitle')"
      width="520px"
      :close-on-click-modal="false"
      class="user-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px" class="user-form" @submit.prevent>
        <el-form-item :label="$t('users.username')" prop="username">
          <el-input v-model="form.username" :placeholder="$t('users.usernameHint')" :disabled="!!editingUser" />
        </el-form-item>
        <el-form-item :label="$t('users.password')" prop="password">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editingUser ? $t('users.passwordEditHint') : $t('users.passwordHint')" />
        </el-form-item>
        <el-form-item :label="$t('users.role')" prop="role">
          <el-radio-group v-model="form.role" :disabled="editingUser?.username === 'admin'">
            <el-radio label="admin">{{ $t('users.admin') }}</el-radio>
            <el-radio label="user">{{ $t('users.user') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const auth = useAuthStore()

const users = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingUser = ref<any>(null)

const form = reactive({ username: '', password: '', role: 'user' })
const formRef = ref<FormInstance>()

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '2-50 字符', trigger: 'blur' }
  ],
  password: [
    { min: 4, message: '至少 4 位', trigger: 'blur' }
  ]
}

function formatTime(s: string) {
  if (!s) return '-'
  return new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

async function fetchUsers() {
  loading.value = true
  try {
    const res = await api.get('/users') as any
    if (res.success) users.value = res.data || []
  } catch { ElMessage.error(t('common.error')) }
  finally { loading.value = false }
}

function openCreate() {
  editingUser.value = null
  form.username = ''
  form.password = ''
  form.role = 'user'
  const pwRule = rules.password as any[]
  if (!pwRule.some((r: any) => r.required)) {
    pwRule.unshift({ required: true, message: '请输入密码', trigger: 'blur' })
  }
  // 重置表单校验
  formRef.value?.resetFields()
  dialogVisible.value = true
}

function openEdit(user: any) {
  editingUser.value = user
  form.username = user.username
  form.password = ''
  form.role = user.role
  const pwRule = rules.password as any[]
  const idx = pwRule.findIndex((r: any) => r.required)
  if (idx >= 0) pwRule.splice(idx, 1)
  formRef.value?.resetFields()
  dialogVisible.value = true
}

async function doSave() {
  if (!formRef.value) return
  try { await formRef.value.validate() } catch { return }
  saving.value = true
  try {
    const payload: any = { username: form.username, role: form.role }
    if (form.password) payload.password = form.password

    if (editingUser.value) {
      const res = await api.put(`/users/${editingUser.value.id}`, payload) as any
      if (res.success) { ElMessage.success(t('users.updateSuccess')); dialogVisible.value = false; await fetchUsers() }
      else ElMessage.error(res.message || t('common.error'))
    } else {
      const res = await api.post('/users', payload) as any
      if (res.success) { ElMessage.success(t('users.createSuccess')); dialogVisible.value = false; await fetchUsers() }
      else ElMessage.error(res.message || t('common.error'))
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { saving.value = false }
}

async function doDelete(id: number) {
  try {
    const res = await api.delete(`/users/${id}`) as any
    if (res.success) { ElMessage.success(t('users.deleteSuccess')); await fetchUsers() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

onMounted(() => {
  if (auth.isAdmin) fetchUsers()
})
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.page-header h2 { font-size: 20px; font-weight: 600; margin: 0; color: var(--text-primary); }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); overflow-x: auto; }

/* 对话框暗色模式适配 */
:global(.dark) .user-dialog :deep(.el-dialog) {
  --el-dialog-bg-color: var(--bg-elevated, #1a1a2e);
}
.user-dialog :deep(.el-dialog__header) { padding-bottom: 8px; }
.user-dialog :deep(.el-dialog__body)  { padding-top: 8px; padding-bottom: 8px; }
.user-form :deep(.el-form-item) { margin-bottom: 18px; }
.user-form :deep(.el-form-item:last-child) { margin-bottom: 0; }

/* 暗色模式下 radio 文字可见 */
:global(body.dark) .user-dialog :deep(.el-radio__label) { color: var(--text-secondary, #c0c0d0); }
:global(body.dark) .user-dialog :deep(.el-radio.is-checked .el-radio__label) { color: var(--brand, #6366f1); }

/* 移动端 */
@media (max-width: 768px) {
  .card { padding: 12px; }
  .page-header .el-button { width: 100%; }
  .user-dialog :deep(.el-dialog) { width: 95vw !important; }
}
@media (max-width: 500px) {
  .user-form :deep(.el-form-item) { flex-direction: column; }
  .user-form :deep(.el-form-item__label) { width: auto !important; text-align: left; }
}
</style>
