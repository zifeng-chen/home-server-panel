<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('ssh.title') }}</h2>
        <p class="sub">管理 SSH 连接配置，快速连接远程服务器</p>
      </div>
      <el-button type="primary" @click="showAdd" :icon="Plus">添加连接</el-button>
    </div>

    <!-- 配置列表 -->
    <div class="grid" v-if="configs.length">
      <div class="ssh-card" v-for="cfg in configs" :key="cfg.id">
        <div class="cfg-header">
          <span class="cfg-name">{{ cfg.name || cfg.host }}</span>
          <span class="cfg-dot" :style="{ background: activeId === cfg.id ? 'var(--accent-green)' : 'var(--text-tertiary)' }"></span>
        </div>
        <div class="cfg-info">
          <span class="mono">{{ cfg.username }}@{{ cfg.host }}:{{ cfg.port || 22 }}</span>
        </div>
        <div class="cfg-actions">
          <el-button size="small" @click="doConnect(cfg)" :loading="connecting === cfg.id">连接</el-button>
          <el-button size="small" @click="showEdit(cfg)">编辑</el-button>
          <el-button size="small" type="danger" @click="confirmDelete(cfg)">删除</el-button>
        </div>
        <!-- 终端区域（连接后显示） -->
        <div v-if="activeId === cfg.id" class="term-wrap">
          <div class="term-bar">已连接 {{ cfg.username }}@{{ cfg.host }} <el-button link size="small" @click="disconnect">断开</el-button></div>
          <div ref="termRef" class="term-box"></div>
        </div>
      </div>
    </div>
    <div v-else class="card"><p class="dim">暂无保存的 SSH 连接，点击"添加连接"开始</p></div>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑连接' : '添加连接'" width="420">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="我的服务器" /></el-form-item>
        <el-form-item label="主机"><el-input v-model="form.host" placeholder="192.168.1.1" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="form.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="form.username" placeholder="root" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password placeholder="留空连接时手动输入" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 密码输入对话框 -->
    <el-dialog v-model="pwVisible" title="输入密码" width="320">
      <el-input v-model="pwInput" type="password" show-password placeholder="SSH 密码" @keyup.enter="doConnectWithPw" />
      <template #footer>
        <el-button @click="pwVisible = false">取消</el-button>
        <el-button type="primary" @click="doConnectWithPw" :loading="connecting !== null">连接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const configs = ref<any[]>([])
const activeId = ref<number | null>(null)
const connecting = ref<number | null>(null)

const dialogVisible = ref(false)
const editId = ref<number | null>(null)
const saving = ref(false)
const form = ref({ name: '', host: '', port: 22, username: 'root', password: '' })

const pwVisible = ref(false)
const pwInput = ref('')
const pwTarget = ref<any>(null)

async function load() {
  try {
    const res = await api.get('/ssh/config') as any
    if (res.success) configs.value = res.data || []
  } catch { /* */ }
}

function showAdd() { editId.value = null; form.value = { name: '', host: '', port: 22, username: 'root', password: '' }; dialogVisible.value = true }
function showEdit(row: any) { editId.value = row.id; form.value = { ...row, password: '' }; dialogVisible.value = true }

async function doSave() {
  if (!form.value.host) return ElMessage.warning('请填写主机地址')
  saving.value = true
  try {
    let res: any
    const payload: any = { ...form.value }
    if (!payload.password) delete (payload as any).password
    if (editId.value) { res = await api.put(`/ssh/config/${editId.value}`, payload) }
    else { res = await api.post('/ssh/config', payload) }
    if (res.success) { ElMessage.success('保存成功'); dialogVisible.value = false; await load() }
    else ElMessage.error(res.message || '保存失败')
  } catch { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除连接 ${row.name || row.host}？`, '确认删除')
  try {
    const res = await api.delete(`/ssh/config/${row.id}`) as any
    if (res.success) { ElMessage.success('已删除'); await load() }
    else ElMessage.error(res.message || '删除失败')
  } catch { /* cancel */ }
}

// 连接：如果有密码直接连，没密码弹输入框
function doConnect(cfg: any) {
  pwTarget.value = cfg
  if (cfg.password && cfg.password !== '••••••') {
    execConnect(cfg, cfg.password)
  } else {
    pwInput.value = ''
    pwVisible.value = true
  }
}
function doConnectWithPw() {
  if (pwTarget.value) execConnect(pwTarget.value, pwInput.value)
  pwVisible.value = false
}

async function execConnect(cfg: any, password: string) {
  connecting.value = cfg.id
  try {
    const res = await api.post('/ssh/connect', { configId: cfg.id, password }) as any
    if (res.success) {
      activeId.value = cfg.id
      ElMessage.success(`已连接 ${res.data.host}`)
    } else ElMessage.error(res.message || '连接失败')
  } catch { ElMessage.error('连接失败') }
  finally { connecting.value = null }
}

function disconnect() {
  activeId.value = null
  ElMessage.info('已断开')
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
.ssh-card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-header { display: flex; justify-content: space-between; align-items: center; }
.cfg-name { font-size: 15px; font-weight: 600; }
.cfg-dot { width: 8px; height: 8px; border-radius: 50%; }
.cfg-info { font-size: 13px; color: var(--text-tertiary); }
.cfg-actions { display: flex; gap: 8px; }
.mono { font-family: var(--font-mono); }
.term-wrap { margin-top: 8px; }
.term-bar { font-size: 12px; color: var(--text-secondary); padding: 6px 10px; background: var(--bg-base); border-radius: var(--radius-sm) var(--radius-sm) 0 0; display: flex; justify-content: space-between; align-items: center; }
.term-box { background: #000; height: 300px; border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-sm); text-align: center; }
.dim { color: var(--text-tertiary); font-size: 13px; }
</style>
