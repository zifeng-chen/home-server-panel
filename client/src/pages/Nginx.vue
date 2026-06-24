<template>
  <div class="page">
    <!-- ========== Nginx 状态 & 控制 ========== -->
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
          <el-button @click="doUninstall" size="small" type="danger" :loading="uninstalling">卸载</el-button>
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

    <!-- ========== 反向代理规则 ========== -->
    <div class="proxy-header" v-if="installed">
      <h3 class="section-title">{{ $t('proxy.title') }}</h3>
      <span class="proxy-count" v-if="stats">{{ stats.total }} {{ $t('nginx.rules') }} · {{ stats.enabled }} {{ $t('proxy.enabled') }}</span>
      <div class="proxy-actions">
        <el-button type="primary" @click="showAddEdit(null)" :icon="Plus">{{ $t('nginx.addRule') }}</el-button>
        <el-button @click="exportConfig">{{ $t('nginx.exportConfig') }}</el-button>
      </div>
    </div>

    <!-- 规则表格 -->
    <el-table v-if="installed" :data="rules" v-loading="loadingRules" stripe class="data-table no-white-mask">
      <el-table-column prop="sourceHost" :label="$t('proxy.sourceAddr')" min-width="150" />
      <el-table-column :label="$t('nginx.target')" min-width="200">
        <template #default="{ row }">{{ row.targetProtocol || 'http' }}://{{ row.targetHost }}:{{ row.targetPort || 80 }}</template>
      </el-table-column>
      <el-table-column prop="note" :label="$t('cron.desc')" min-width="140" show-overflow-tooltip />
      <el-table-column :label="$t('nginx.ssl')" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.ssl" type="success" size="small">{{ $t('nginx.sslEnable') }}</el-tag>
          <el-tag v-else type="info" size="small">{{ $t('nginx.sslDisable') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sslCert" :label="$t('ssl.certificate')" min-width="140" show-overflow-tooltip />
      <el-table-column :label="$t('nginx.accessible')" width="80" align="center">
        <template #default="{ row }">
          <el-tooltip :content="row._checkMsg || $t('nginx.checking')" placement="top">
            <el-icon v-if="row._checking" class="is-loading" :size="16"><Loading /></el-icon>
            <el-tag v-else-if="row._checkOk" type="success" size="small" effect="plain">OK</el-tag>
            <el-tag v-else-if="row._checkError" type="danger" size="small" effect="plain">✗</el-tag>
            <span v-else class="check-dash">—</span>
          </el-tooltip>
        </template>
      </el-table-column>
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
    <el-dialog v-model="dialogVisible" :title="editId ? $t('nginx.editRule') : $t('nginx.addRule')" width="560" destroy-on-close>
      <div class="dialog-body">
        <!-- 来源地址 -->
        <div class="form-row">
          <label class="form-label">{{ $t('proxy.sourceAddr') }}</label>
          <el-input v-model="form.sourceHost" placeholder="example.com" @change="onDomainChange" />
        </div>
        <!-- 目标地址 + 端口 -->
        <div class="form-row">
          <label class="form-label">{{ $t('nginx.target') }}</label>
          <div class="target-group">
            <el-select v-model="form.targetProtocol" style="width:82px">
              <el-option label="HTTP" value="http" />
              <el-option label="HTTPS" value="https" />
            </el-select>
            <el-input v-model="form.targetHost" placeholder="localhost" style="flex:1" />
            <span class="target-sep">:</span>
            <el-input v-model.number="form.targetPort" placeholder="80" style="width:80px" />
          </div>
        </div>
        <!-- 备注 -->
        <div class="form-row">
          <label class="form-label">{{ $t('cron.desc') }}</label>
          <el-input v-model="form.note" placeholder="面板代理 / API 服务 / …" />
        </div>
        <!-- SSL -->
        <div class="form-row">
          <label class="form-label">{{ $t('nginx.ssl') }}</label>
          <div class="ssl-toggle-row">
            <el-switch v-model="form.ssl" @change="onSslChange" />
            <span class="ssl-hint" v-if="!form.ssl">{{ $t('nginx.sslHint') }}</span>
          </div>
        </div>
        <!-- 证书选择（开启 SSL 后显示）-->
        <div class="form-row" v-if="form.ssl">
          <label class="form-label">{{ $t('ssl.certificate') }}</label>
          <el-select v-model="form.sslCert" filterable clearable :placeholder="$t('ssl.selectCert')" style="width:100%" @change="onCertChange">
            <el-option-group v-if="matchedCerts.length" :label="$t('ssl.matchedCerts')">
              <el-option v-for="c in matchedCerts" :key="c.domain" :value="c.domain" :label="c.domain">
                <div class="cert-option">
                  <span>{{ c.domain }}</span>
                  <el-tag size="small" effect="plain" :type="c.daysRemaining < 30 ? 'warning' : ''">{{ c.daysRemaining }}d</el-tag>
                </div>
              </el-option>
            </el-option-group>
            <el-option-group v-if="otherCerts.length" :label="$t('ssl.otherCerts')">
              <el-option v-for="c in otherCerts" :key="c.domain" :value="c.domain" :label="c.domain" :disabled="true">
                <div class="cert-option">
                  <span>{{ c.domain }}</span>
                  <el-tag size="small" effect="plain" :type="c.daysRemaining < 30 ? 'warning' : ''">{{ c.daysRemaining }}d</el-tag>
                </div>
              </el-option>
            </el-option-group>
            <template v-if="!matchedCerts.length && !otherCerts.length">
              <el-option v-for="c in allCerts" :key="c.domain" :value="c.domain" :label="c.domain" />
            </template>
          </el-select>
          <p class="cert-no-match" v-if="form.sourceHost && !matchedCerts.length && allCerts.length">
            未找到匹配 <strong>{{ form.sourceHost }}</strong> 的泛域名证书
          </p>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSaveRule" :loading="saving" :disabled="!canSave">{{ editId ? $t('common.save') : $t('common.add') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, VideoPause, Refresh, RefreshRight, Plus, Loading } from '@element-plus/icons-vue'
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
const uninstalling = ref(false)

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
    if (installed.value) { await loadRules(); await nextTick(checkAllAccessible) }
  } catch { /* ignore */ }
}

// ── Nginx 操作 ──
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

async function doUninstall() {
  await ElMessageBox.confirm('确定要卸载 Nginx 吗？已有反向代理规则会失效。', '卸载 Nginx', { confirmButtonText: '确认卸载', type: 'warning' })
  uninstalling.value = true
  try {
    const res = await api.post('/nginx/uninstall') as any
    if (res.success) { ElMessage.success(res.message); await load() }
    else ElMessage.error(res.message || '卸载失败')
  } catch { ElMessage.error('卸载失败') }
  finally { uninstalling.value = false }
}

// ── 反向代理规则 ──
const loadingRules = ref(false)
const rules   = ref<any[]>([])
const stats   = ref<any>(null)

const dialogVisible = ref(false)
const saving   = ref(false)
const editId   = ref('')
const form     = ref<any>({ sourceHost: '', targetHost: '', targetProtocol: 'http', targetPort: 80, ssl: false, sslCert: '', note: '' })

// 证书列表（按匹配分组）
const allCerts      = ref<any[]>([])
const matchedCerts  = ref<any[]>([])
const otherCerts    = ref<any[]>([])

// 是否已选中匹配的证书
const selectedCertMatched = ref(true)

function _groupCerts(certs: any[] /* domain param unused kept for call sig */) {
  const matched: any[] = [], other: any[] = []
  certs.forEach((c: any) => (c.matched ? matched : other).push(c))
  matchedCerts.value = matched
  otherCerts.value = other
  allCerts.value = certs
}

async function loadRules() {
  loadingRules.value = true
  try {
    const res = await api.get('/proxy') as any
    if (res.success) {
      rules.value = res.data.rules || []
      stats.value = res.data.stats
    }
  } catch { /* ignore */ }
  finally { loadingRules.value = false }
}

async function loadCerts(domain?: string) {
  try {
    const url = domain ? `/proxy/cert-match?domain=${encodeURIComponent(domain)}` : '/proxy/cert-match'
    const res = await api.get(url) as any
    if (res.success) {
      const certs = (res.data.certificates || []).filter((c: any) => c.status !== 'expired' && c.status !== 'revoked')
      _groupCerts(certs, domain || '')
    }
  } catch { allCerts.value = []; matchedCerts.value = []; otherCerts.value = [] }
}

function onDomainChange(val: string) {
  form.sslCert = '' // 清空之前选的证书
  if (val) loadCerts(val)
  else { matchedCerts.value = []; otherCerts.value = [] }
}

function onSslChange(enabled: boolean) {
  if (!enabled) form.sslCert = ''
}

function onCertChange(cert: string) {
  // 检查选中的是否在匹配列表中
  selectedCertMatched.value = matchedCerts.value.some((c: any) => c.domain === cert)
}

// 是否可以提交
const canSave = computed(() => {
  if (!form.value.sourceHost || !form.value.targetHost) return false
  if (form.value.ssl) {
    // 开启 SSL 时必须选证书，且证书必须匹配
    if (!form.value.sslCert) return false
    return selectedCertMatched.value
  }
  return true
})

function showAddEdit(row: any | null) {
  if (row) {
    editId.value = row.id
    form.value = { ...row }
    selectedCertMatched.value = true // 编辑时默认匹配
  } else {
    editId.value = ''
    form.value = { sourceHost: '', targetHost: '', targetProtocol: 'http', targetPort: 80, ssl: false, sslCert: '', note: '' }
    selectedCertMatched.value = true
  }
  dialogVisible.value = true
  loadCerts(form.value.sourceHost)
}

async function doSaveRule() {
  saving.value = true
  try {
    let res: any
    if (editId.value) {
      res = await api.put(`/proxy/${editId.value}`, form.value)
    } else {
      res = await api.post('/proxy', form.value)
    }
    if (res.success) { ElMessage.success(res.message || t('common.success')); dialogVisible.value = false; await loadRules(); await nextTick(checkAllAccessible) }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { saving.value = false }
}

async function toggle(row: any) {
  try {
    const res = await api.post(`/proxy/${row.id}/toggle`) as any
    if (res.success) { ElMessage.success(res.message); await loadRules(); await nextTick(checkAllAccessible) }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(t('proxy.deleteConfirm'), t('common.confirmDelete'))
  try {
    const res = await api.delete(`/proxy/${row.id}`) as any
    if (res.success) { ElMessage.success(res.message); await loadRules(); await nextTick(checkAllAccessible) }
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

// ── 可访问性检测 ──
async function checkAllAccessible() {
  for (const r of rules.value) {
    if (!r.enabled) continue
    r._checking = true
    checkOneRule(r)
  }
}
async function checkOneRule(row: any) {
  row._checking = true
  row._checkOk = false
  row._checkError = false
  row._checkMsg = t('nginx.checking')
  const proto = row.ssl && row.targetProtocol === 'https' ? 'https' : 'http'
  const url = `${proto}://${row.targetHost}:${row.targetPort || 80}/`
  try {
    const res = await api.get(`/proxy/check?url=${encodeURIComponent(url)}`) as any
    if (res.success && res.data?.accessible) {
      row._checkOk = true
      row._checkMsg = `HTTP ${res.data.statusCode || 200}`
    } else {
      row._checkError = true
      row._checkMsg = res.data?.error || res.message || '无法访问'
    }
  } catch (e: any) {
    row._checkError = true
    row._checkMsg = e?.message || '检测失败'
  } finally {
    row._checking = false
  }
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

/* ── Nginx 状态区 ── */
.nginx-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.status-title { font-size: 20px; font-weight: 700; margin: 0; flex-shrink: 0; }
.status-badge { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 10px; background: rgba(239,68,68,0.12); color: #ef4444; flex-shrink: 0; }
.status-badge.running { background: rgba(34,197,94,0.12); color: #22c55e; }
.status-ver { font-size: 13px; color: var(--text-tertiary); flex-shrink: 0; }
.nginx-actions { display: flex; gap: 6px; flex-shrink: 0; }
.info-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; }
.info-chip .lbl { color: var(--text-tertiary); font-size: 11px; }
.info-chip .val { color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info-chip .val.mono { font-family: var(--font-mono); font-size: 11px; }

.guide { background: var(--bg-base); padding: 16px; border-radius: var(--radius-sm); font-size: 12px; font-family: var(--font-mono); white-space: pre-wrap; word-break: break-all; overflow-x: auto; max-height: 400px; }

/* ── 反向代理标题行 ── */
.proxy-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.proxy-header .section-title { font-size: 17px; font-weight: 600; margin: 0; white-space: nowrap; }
.proxy-count { font-size: 13px; color: var(--text-tertiary); }
.proxy-actions { margin-left: auto; display: flex; gap: 8px; }

.data-table { border-radius: var(--radius-md); overflow: hidden; }
.check-dash { color: var(--text-tertiary); font-size: 14px; }

/* ── 对话框表单 ── */
.dialog-body { display: flex; flex-direction: column; gap: 18px; }
.form-row { display: flex; align-items: flex-start; gap: 14px; }
.form-label {
  flex-shrink: 0;
  width: 72px;
  padding-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-align: right;
}
.form-row .el-input,
.form-row .el-select { flex: 1; }

.target-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.target-sep {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  padding: 0 2px;
}
.ssl-toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}
.ssl-hint { font-size: 12px; color: var(--text-tertiary); }

/* ── 证书选项 ── */
.cert-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.cert-no-match {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
}
.cert-no-match strong { color: var(--accent-orange); }
</style>
