<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('users.title') }}</h2>
        <p class="sub">{{ $t('users.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="openCreate" :icon="Plus" v-if="isAdmin">{{ $t('users.addUser') }}</el-button>
    </div>

    <div class="card">
      <el-table :data="users" stripe size="default" v-loading="loading" empty-text="暂无用户">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" :label="$t('users.username')" min-width="120" />
        <el-table-column :label="$t('users.role')" width="120">
          <template #default="{row}">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small" effect="plain">
              {{ row.role === 'admin' ? $t('users.admin') : $t('users.user') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('users.createdAt')" width="180">
          <template #default="{row}">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="$t('users.updatedAt')" width="180">
          <template #default="{row}">{{ formatTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column v-if="isAdmin" :label="$t('common.actions')" width="160" fixed="right">
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
    <el-dialog v-model="dialogVisible" :title="editingUser ? $t('users.editUserTitle') : $t('users.addUserTitle')" width="480px" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item :label="$t('users.username')" prop="username">
          <el-input v-model="form.username" :placeholder="$t('users.usernameHint')" :disabled="!!editingUser" />
        </el-form-item>
        <el-form-item :label="$t('users.password')" prop="password">
          <el-input v-model="form.password" type="password" show-password :placeholder="editingUser ? $t('users.passwordEditHint') : $t('users.passwordHint')" />
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
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import api from '../api'

const { t } = useI18n()
const users = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingUser = ref<any>(null)
const currentUser = reactive({ username: '', role: 'user' })
const isAdmin = computed(() => currentUser.role === 'admin')

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

async function fetchMe() {
  try { const res = await api.get('/users/me') as any; if (res.success) { currentUser.username = res.data.username; currentUser.role = res.data.role } } catch { /* */ }
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
  // 新建时密码必填
  (rules.password as any).unshift({ required: true, message: '请输入密码', trigger: 'blur' })
  dialogVisible.value = true
}

function openEdit(user: any) {
  editingUser.value = user
  form.username = user.username
  form.password = ''
  form.role = user.role
  // 编辑时密码选填
  const pwRule = rules.password as any[]
  const idx = pwRule.findIndex((r: any) => r.required)
  if (idx >= 0) pwRule.splice(idx, 1)
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

onMounted(async () => {
  await fetchMe()
  if (isAdmin.value) fetchUsers()
})
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); overflow-x: auto; }
@media (max-width: 768px) {
  .card { padding: 12px; }
  .page-header .el-button { width: 100%; }
}
</style>
