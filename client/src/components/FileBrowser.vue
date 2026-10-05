<template>
  <div class="card fb">
    <div class="fb-head">
      <span class="fb-title">
        <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:6px;vertical-align:-3px"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
        {{ $t('files.title') }}
      </span>
      <div class="fb-tools">
        <el-button size="small" @click="refresh" :loading="loading">{{ $t('files.refresh') }}</el-button>
        <el-button size="small" @click="promptNewFile">{{ $t('files.newFile') }}</el-button>
        <el-button size="small" type="primary" plain @click="triggerUpload">{{ $t('files.upload') }}</el-button>
        <input ref="fileInput" type="file" style="display:none" @change="onUpload" />
      </div>
    </div>

    <div class="fb-path">
      <el-button link size="small" :disabled="!parent" @click="go(parent)">↑ {{ $t('files.up') }}</el-button>
      <code class="fb-cwd">{{ cwd }}</code>
    </div>

    <div class="fb-body">
      <div class="fb-list">
        <div v-if="loading" class="fb-empty">...</div>
        <div v-else-if="error" class="fb-empty err">{{ error }}</div>
        <div v-else-if="!entries.length" class="fb-empty">{{ $t('files.empty') }}</div>
        <template v-else>
          <div v-for="e in entries" :key="e.name" class="fb-row" :class="{ dir: e.isDir }" @click="open(e)">
            <svg v-if="e.isDir" class="fb-ic" viewBox="0 0 24 24" width="15" height="15"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" fill="none" stroke="#E6A23C" stroke-width="1.6"/></svg>
            <svg v-else class="fb-ic" viewBox="0 0 24 24" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="#909399" stroke-width="1.6"/><path d="M14 2v6h6" fill="none" stroke="#909399" stroke-width="1.6"/></svg>
            <span class="fb-name">{{ e.name }}</span>
            <span class="fb-size">{{ e.isDir ? '' : fmtSize(e.size) }}</span>
            <span class="fb-time">{{ e.modTime }}</span>
            <el-button class="fb-del" link size="small" @click.stop="del(e)">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="#F56C6C"/></svg>
            </el-button>
          </div>
        </template>
      </div>

      <div v-if="viewing" class="fb-view">
        <div class="fb-view-head">
          <code class="fb-view-path">{{ viewing.path }}</code>
          <div class="fb-view-acts">
            <el-button size="small" @click="download(viewing.path)">{{ $t('files.download') }}</el-button>
            <el-button v-if="viewing.encoding === 'utf8'" size="small" type="primary" :loading="saving" @click="save">{{ $t('files.save') }}</el-button>
            <el-button size="small" @click="viewing = null">{{ $t('files.close') }}</el-button>
          </div>
        </div>
        <el-input v-if="viewing.encoding === 'utf8'" v-model="viewing.content" type="textarea" :rows="16" class="fb-editor" />
        <div v-else class="fb-empty">{{ $t('files.binary') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const props = defineProps<{ deviceId: string }>()

const cwd = ref('/')
const parent = ref('')
const entries = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const viewing = ref<any>(null)
const fileInput = ref<HTMLInputElement>()

function fmtSize(n: number) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

async function load(p: string) {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.post(`/v2/file/${props.deviceId}/list`, { path: p }) as any
    cwd.value = data.path
    parent.value = data.parent
    entries.value = data.files || []
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.message || '读取失败'
  } finally {
    loading.value = false
  }
}

function refresh() { load(cwd.value) }
function go(p: string) { if (p) load(p) }

async function open(e: any) {
  if (e.isDir) { load(cwd.value.replace(/\/$/, '') + '/' + e.name); return }
  try {
    const { data } = await api.post(`/v2/file/${props.deviceId}/read`, { path: cwd.value.replace(/\/$/, '') + '/' + e.name }) as any
    viewing.value = { ...data }
  } catch (e2: any) {
    ElMessage.error(e2?.response?.data?.message || e2?.message || '读取失败')
  }
}

async function save() {
  if (!viewing.value) return
  saving.value = true
  try {
    await api.post(`/v2/file/${props.deviceId}/write`, { path: viewing.value.path, content: viewing.value.content })
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function del(e: any) {
  const full = cwd.value.replace(/\/$/, '') + '/' + e.name
  try {
    await ElMessageBox.confirm(`确定删除 ${e.name}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    await api.post(`/v2/file/${props.deviceId}/delete`, { path: full })
    ElMessage.success('已删除')
    if (viewing.value?.path === full) viewing.value = null
    refresh()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || err?.message || '删除失败')
  }
}

async function promptNewFile() {
  try {
    const { value } = await ElMessageBox.prompt('输入新文件名', '新建文件', { inputPlaceholder: 'test.txt' })
    if (!value) return
    const full = cwd.value.replace(/\/$/, '') + '/' + value
    await api.post(`/v2/file/${props.deviceId}/write`, { path: full, content: '' })
    ElMessage.success('已创建')
    refresh()
  } catch { /* cancelled */ }
}

function triggerUpload() { fileInput.value?.click() }

async function onUpload(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    const b64 = String(reader.result).split(',')[1] || ''
    try {
      await api.post(`/v2/file/${props.deviceId}/upload`, { path: cwd.value, name: file.name, content: b64 })
      ElMessage.success('上传成功')
      refresh()
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || e?.message || '上传失败')
    }
  }
  reader.readAsDataURL(file)
  input.value = ''
}

async function download(p: string) {
  try {
    const blob = await api.get(`/v2/file/${props.deviceId}/download`, { params: { path: p }, responseType: 'blob' }) as any
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = p.split('/').pop() || 'download'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error('下载失败')
  }
}

onMounted(() => load('/'))
</script>

<style scoped>
.fb { padding: 0; overflow: hidden; margin-top: 20px; }
.fb-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eef0f4; }
.fb-title { font-weight: 500; font-size: 14px; display: flex; align-items: center; }
.fb-path { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: #fafbfc; border-bottom: 1px solid #eef0f4; }
.fb-cwd { font-size: 12px; color: #606266; font-family: ui-monospace, monospace; }
.fb-body { display: grid; grid-template-columns: 1fr; }
.fb-body:has(.fb-view) { grid-template-columns: 1fr 1fr; }
.fb-list { max-height: 420px; overflow-y: auto; }
.fb-row { display: grid; grid-template-columns: 20px 1fr 80px 150px 32px; align-items: center; gap: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f5f6f8; }
.fb-row:hover { background: #f5f8ff; }
.fb-row.dir .fb-name { color: #E6A23C; font-weight: 500; }
.fb-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-size, .fb-time { color: #a0a4ad; font-size: 12px; font-variant-numeric: tabular-nums; }
.fb-del { opacity: 0; }
.fb-row:hover .fb-del { opacity: 1; }
.fb-empty { padding: 32px; text-align: center; color: #b8bcc4; font-size: 13px; grid-column: 1 / -1; }
.fb-empty.err { color: #F56C6C; }
.fb-view { border-left: 1px solid #eef0f4; display: flex; flex-direction: column; }
.fb-view-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #eef0f4; }
.fb-view-path { font-size: 12px; color: #606266; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-view-acts { display: flex; gap: 6px; flex-shrink: 0; }
.fb-editor :deep(textarea) { font-family: ui-monospace, monospace; font-size: 12px; border: none; border-radius: 0; }
</style>
