<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="$t('users.title')"
    width="720px"
    :close-on-click-modal="true"
    class="users-dialog"
    destroy-on-close
  >
    <template #header>
      <div class="users-dialog-header">
        <span class="dialog-title">{{ $t('users.title') }}</span>
        <el-button type="primary" size="small" :icon="Plus" @click="openCreate" v-if="auth.isAdmin">
          {{ $t('users.addUser') }}
        </el-button>
      </div>
    </template>

    <el-table :data="users" stripe size="small" v-loading="loading" empty-text="暂无用户" max-height="400">
      <el-table-column prop="id" label="ID" width="50" />
      <el-table-column prop="username" :label="$t('users.username')" min-width="100" />
      <el-table-column :label="$t('users.role')" width="80">
        <template #default="{row}">
          <el-tag :type="row.role === 'admin' ? 'danger' : ''" size="small" effect="plain">
            {{ row.role === 'admin' ? $t('users.admin') : $t('users.user') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('users.createdAt')" width="160">
        <template #default="{row}">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column v-if="auth.isAdmin" :label="$t('common.actions')" width="140" fixed="right">
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

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingUser ? $t('users.editUserTitle') : $t('users.addUserTitle')"
      width="480px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" class="user-form" @submit.prevent>
        <el-form-item :label="$t('users.username')" prop="username">
          <el-input v-model="form.username" :placeholder="$t('users.usernameHint')" :disabled="!!editingUser" />
        </el-form-item>
        <el-form-item :label="$t('users.password')" prop="password">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editingUser ? $t('users.passwordEditHint') : $t('users.passwordHint')" />
        </el-form-item>
        <el-form-item :label="$t('users.role')" prop="role">
          <el-radio-group v-model="form.role" :disabled="editingUser?.username === 'admin'">
            <el-radio value="admin">{{ $t('users.admin') }}</el-radio>
            <el-radio value="user">{{ $t('users.user') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

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

// 对话框打开时自动加载用户列表
watch(() => props.visible, (v) => {
  if (v) fetchUsers()
})
</script>

<style scoped>
.users-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 32px;
}
.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.user-form :deep(.el-form-item) { margin-bottom: 16px; }
.user-form :deep(.el-form-item:last-child) { margin-bottom: 0; }

@media (max-width: 768px) {
  :deep(.el-dialog) { width: 95vw !important; }
}
</style>
