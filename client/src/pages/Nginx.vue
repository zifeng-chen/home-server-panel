<template>
  <div class="page">
    <!-- ========== Nginx 状态 & 控制（全部同一行） ========== -->
    <div class="card" v-if="installed">
      <div class="nginx-status-row">
        <h2 class="status-title">Nginx</h2>
        <span class="status-badge" :class="{ running: running }">{{ running ? $t('dashboard.running') : $t('dashboard.stopped') }}</span>
        <span class="status-ver">{{ $t('nginx.version') }} {{ nginxVer }}</span>
        <div class="nginx-actions">
          <el-button @click="doAction('start')" size="small" :icon="VideoPlay" :disabled="running" :loading="acting === 'start'">{{ $t('nginx.start') }}</el-button>
          <el-button @click="doAction('stop')" size="small" :icon="VideoPause" :disabled="!running" :loading="acting === 'stop'">{{ $t('nginx.stop') }}</el-button>
          <el-button @click="doAction('reload')" size="small" :icon="Refresh" :loading="acting === 'reload'">{{ $t('nginx.reload') }}</el-button>
          <el-button @click="doAction('restart')" size="small" :icon="RefreshRight" :loading="acting === 'restart'">{{ $t('nginx.restart') }}</el-button>
        </div>
        <span class="info-chip"><span class="lbl">{{ $t('nginx.configPath') }}</span><span class="val mono">{{ confPath }}</span></span>
        <span class="info-chip"><span class="lbl">PID</span><span class="val mono">{{ pid || '--' }}</span></span>
      </div>
    </div>

    <!-- 未安装 -->
    <div class="page-header" v-if="!installed">
      <div>
        <h2>{{ $t('nginx.title') }}</h2>
        <p class="sub">{{ statusText }}</p>
      </div>
      <el-button type="primary" @click="installGuide" :loading="loadingInst">{{ $t('nginx.install') }}</el-button>
    </div>

    <!-- 安装指南 -->
    <div class="card" v-if="showGuide">
      <h3>{{ $t('nginx.install') }}</h3>
      <pre class="guide">{{ guideText }}</pre>
    </div>

    <!-- ========== 反向代理规则 → 标题与统计并行 ========== -->
    <div class="proxy-header" v-if="installed">
      <h3 class="section-title">{{ $t('proxy.title') }}</h3>
      <span class="proxy-count" v-if="stats">{{ stats.total }} / {{ stats.enabled }} {{ $t('proxy.enabled') }}</span>
      <div class="proxy-actions">
        <el-button type="primary" @click="showAddEdit(null)" :icon="Plus">{{ $t('nginx.addRule') }}</el-button>
        <el-button @click="exportConfig">{{ $t('nginx.exportConfig') }}</el-button>
      </div>
    </div>

    <!-- 规则表格 -->
    <el-table v-if="installed" :data="rules" v-loading="loadingRules" stripe class="data-table no-white-mask">
      <el-table-column prop="sourceHost" :label="$t('nginx.domain')" min-width="160" />
      <el-table-column :label="$t('nginx.target')" min-width="200">
        <template #default="{ row }">{{ row.targetProtocol || 'http' }}://{{ row.targetHost }}:{{ row.targetPort || 80 }}</template>
      </el-table-column>
      <el-table-column :label="$t('nginx.ssl')" width="70">
        <template #default="{ row }"><el-tag :type="row.ssl ? 'success' : 'info'" size="small">{{ row.ssl ? $t('nginx.sslEnable') : $t('nginx.sslDisable') }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="sslCert" :label="$t('ssl.certificate')" min-width="160" show-overflow-tooltip />
      <el-table-column :label="$t('common.status')" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="() => toggle(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showAddEdit(row)">{{ $t('common.edit') }}</el-button>
          <el-button link type="danger" @click="confirmDelete(row)">{{ $t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? $t('nginx.editRule') : $t('nginx.addRule')" width="520">
      <el-form :model="form" label-width="100px">
        <el-form-item :label="$t('nginx.domain')"><el-input v-model="form.sourceHost" placeholder="example.com" /></el-form-item>
        <el-form-item :label="$t('nginx.targetHost')"><el-input v-model="form.targetHost" placeholder="localhost" />
          <el-select v-model="form.targetProtocol" style="width:90px;margin-left:8px"><el-option label="http" value="http" /><el-option label="https" value="https" /></el-select>
          <el-input-number v-model="form.targetPort" :min="1" :max="65535" style="width:100px;margin-left:4px" />
        </el-form-item>
        <el-form-item :label="$t('nginx.ssl')"><el-switch v-model="form.ssl" /></el-form-item>
        <el-form-item :label="$t('ssl.certificate')" v-if="form.ssl">
          <el-select v-model="form.sslCert" filterable clearable :placeholder="$t('ssl.certificate')">
            <el-option v-for="c in sslCerts" :key="c.domain" :value="c.domain" :label="c.domain" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('cron.desc')"><el-input v-model="form.note" placeholder="" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSaveRule" :loading="saving">{{ editId ? $t('common.save') : $t('common.add') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, VideoPause, Refresh, RefreshRight, Plus } from '@element-plus/icons-vue'
import api from '../api'
const { t } = useI18n()

// ── Nginx 状态 ──
const installed = ref(false)
const running   = ref(false)
const nginxVer  = ref('')
const confPath  = ref('')
const pid       = ref<string | number>('')
const acting    = ref('')
const loadingInst = ref(false)

const showGuide = ref(false)
const guideText = ref('')

const statusText = computed(() => {
  if (!installed.value) return 'Nginx 未安装 / Not installed'
  return running.value ? t('dashboard.running') : t('dashboard.stopped')
})

async function load() {
  try {
    const res = await api.get('/nginx/status') as any
    if (res.success) {
      const d = res.data
      installed.value = d.installed !== false
      running.value   = d.running === true
      nginxVer.value  = d.version || '--'
      confPath.value  = d.confPath || '--'
      pid.value       = d.pid || '--'
    }
    if (installed.value) await loadRules()
  } catch { /* ignore */ }
}

async function doAction(action: string) {
  acting.value = action
  try {
    const res = await api.post(`/nginx/${action}`) as any
    if (res.success) { ElMessage.success(res.message || `${action} 成功`); await load() }
    else ElMessage.error(res.message || `${action} 失败`)
  } catch { ElMessage.error(`${action} 失败`) }
  finally { acting.value = '' }
}

async function installGuide() {
  loadingInst.value = true
  try {
    const res = await api.get('/nginx/install-guide') as any
    if (res.success) {
      guideText.value = typeof res.data === 'string' ? res.data : res.data.guide || JSON.stringify(res.data, null, 2)
      showGuide.value = !showGuide.value
    }
  } catch { ElMessage.error('获取安装指南失败') }
  finally { loadingInst.value = false }
}

// ── 反向代理规则 ──
const loadingRules = ref(false)
const rules   = ref<any[]>([])
const stats   = ref<any>(null)

const dialogVisible = ref(false)
const saving   = ref(false)
const editId   = ref('')
const form     = ref<any>({ sourceHost: '', targetHost: '', targetProtocol: 'http', targetPort: 80, ssl: false, sslCert: '', note: '' })
const sslCerts = ref<any[]>([])

async function loadRules() {
  loadingRules.value = true
  try {
    const res = await api.get('/proxy') as any
    if (res.success) {
      rules.value = res.data.rules || []
      stats.value = res.data.stats || null
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { loadingRules.value = false }
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

async function doSaveRule() {
  if (!form.value.sourceHost || !form.value.targetHost) return ElMessage.warning(t('common.error'))
  saving.value = true
  try {
    let res: any
    if (editId.value) {
      res = await api.put(`/proxy/${editId.value}`, form.value)
    } else {
      res = await api.post('/proxy', form.value)
    }
    if (res.success) { ElMessage.success(res.message || t('common.success')); dialogVisible.value = false; await loadRules() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { saving.value = false }
}

async function toggle(row: any) {
  try {
    const res = await api.post(`/proxy/${row.id}/toggle`) as any
    if (res.success) { ElMessage.success(res.message); await loadRules() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(t('proxy.deleteConfirm'), t('common.confirmDelete'))
  try {
    const res = await api.delete(`/proxy/${row.id}`) as any
    if (res.success) { ElMessage.success(res.message); await loadRules() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { /* cancelled */ }
}

async function exportConfig() {
  try {
    const res = await api.get('/proxy/config/preview') as any
    if (res.success && res.data?.config) {
      const blob = new Blob([res.data.config], { type: 'text/plain' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'proxy-nginx.conf'; a.click()
    }
  } catch { ElMessage.error(t('common.error')) }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.card h3 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

/* ── Nginx 状态区（单行全排列）── */
.nginx-status-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.status-title { font-size: 20px; font-weight: 700; margin: 0; flex-shrink: 0; }
.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
  background: rgba(239,68,68,0.12);
  color: #ef4444;
  flex-shrink: 0;
}
.status-badge.running {
  background: rgba(34,197,94,0.12);
  color: #22c55e;
}
.status-ver { font-size: 13px; color: var(--text-tertiary); flex-shrink: 0; }
.nginx-actions { display: flex; gap: 6px; flex-shrink: 0; }
.info-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.info-chip .lbl {
  color: var(--text-tertiary);
  font-size: 11px;
}
.info-chip .val {
  color: var(--text-secondary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-chip .val.mono { font-family: var(--font-mono); font-size: 11px; }

/* ── 安装指南 ── */
.guide { background: var(--bg-base); padding: 16px; border-radius: var(--radius-sm); font-size: 12px; font-family: var(--font-mono); white-space: pre-wrap; word-break: break-all; overflow-x: auto; max-height: 400px; }

/* ── 反向代理标题行（标题+数量+按钮并行）── */
.proxy-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.proxy-header .section-title { font-size: 17px; font-weight: 600; margin: 0; white-space: nowrap; }
.proxy-count { font-size: 13px; color: var(--text-tertiary); }
.proxy-actions { margin-left: auto; display: flex; gap: 8px; }

/* ── 表格 ── */
.data-table { border-radius: var(--radius-md); overflow: hidden; }
</style>
