<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('ssl.title') }}</h2>
        <p class="sub">{{ $t('ssl.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="!acmeInstalled" type="primary" @click="showInstall = true" :icon="Download">安装 acme.sh</el-button>
        <el-button v-else @click="showIssue = true" type="primary" :icon="Plus">{{ $t('ssl.issue') }}</el-button>
        <el-button @click="renewAll" :loading="renewing" :disabled="!acmeInstalled">{{ $t('ssl.renew') }}</el-button>
      </div>
    </div>

    <!-- 证书列表 -->
    <el-table :data="certs" v-loading="loading" stripe class="data-table">
      <el-table-column prop="domain" :label="$t('ssl.domain')" min-width="180" />
      <el-table-column :label="$t('ssl.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="certTag(row.status)" size="small">{{ certLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="expiresAt" :label="$t('ssl.expiry')" min-width="170">
        <template #default="{ row }"><span class="mono">{{ fmtDate(row.expiresAt) }}</span></template>
      </el-table-column>
      <el-table-column :label="$t('ssl.validDays')" width="90">
        <template #default="{ row }">
          <span :class="{ warn: row.daysRemaining < 30, danger: row.daysRemaining < 7 }">{{ row.daysRemaining != null ? row.daysRemaining + ' ' + $t('ssl.days') : '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="220" fixed="right">
        <template #default="{ row }">
          <div class="ssl-actions">
            <el-button link type="primary" @click="doRenew(row)" size="small">{{ $t('ssl.renew') }}</el-button>
            <el-dropdown trigger="click" @command="(c: string) => exportCert(row.domain, c)">
              <el-button link size="small">{{ $t('ssl.export') }} <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="nginx">Nginx</el-dropdown-item>
                  <el-dropdown-item command="apache">Apache</el-dropdown-item>
                  <el-dropdown-item command="fullchain">Fullchain</el-dropdown-item>
                  <el-dropdown-item command="privkey">私钥</el-dropdown-item>
                  <el-dropdown-item command="all">{{ $t('ssl.allFiles') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button link type="danger" @click="confirmDelete(row)" size="small">{{ $t('common.delete') }}</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 安装 acme.sh 对话框 -->
    <el-dialog v-model="showInstall" :title="$t('ssl.title')" width="420">
      <el-form label-width="100px">
        <el-form-item :label="$t('ssl.domain')">
          <el-input v-model="installEmail" placeholder="admin@example.com" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInstall = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doInstall" :loading="installing">{{ $t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- 申请证书对话框 -->
    <el-dialog v-model="showIssue" :title="$t('ssl.issue')" width="480">
      <el-form label-width="100px">
        <el-form-item :label="$t('ssl.domain')"><el-input v-model="issueDomain" placeholder="example.com" /></el-form-item>
        <el-form-item :label="$t('ssl.fullChain')"><el-switch v-model="issueWildcard" /></el-form-item>
        <el-form-item :label="$t('ssl.ca')"><el-select v-model="issueProvider"><el-option :label="$t('ssl.zerossl')" value="zerossl" /><el-option :label="$t('ssl.letsencrypt')" value="letsencrypt" /></el-select></el-form-item>
        <el-form-item :label="$t('ssl.forceRenew')"><el-switch v-model="issueForce" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showIssue = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doIssue" :loading="issuing">{{ $t('ssl.issue') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Plus, ArrowDown } from '@element-plus/icons-vue'
import api from '../api'
const { t } = useI18n()

const loading = ref(false)
const certs = ref<any[]>([])
const acmeInstalled = ref(false)

function isCertValid(status: string) { return status === 'valid' || status === 'warning' }
function certTag(status: string) {
  if (status === 'valid') return 'success'
  if (status === 'warning') return 'warning'
  return 'danger'
}
function certLabel(status: string) {
  if (isCertValid(status)) return '有效'
  if (status === 'expiring') return '即将过期'
  return '已过期'
}

const showInstall = ref(false)
const installing = ref(false)
const installEmail = ref('admin@izifeng.com')

const showIssue = ref(false)
const issuing = ref(false)
const issueDomain = ref('')
const issueWildcard = ref(false)
const issueProvider = ref('zerossl')
const issueForce = ref(false)

const renewing = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await api.get('/cert') as any
    if (res.success) {
      certs.value = res.data.certificates || []
      acmeInstalled.value = !!res.data.acmeInstalled
    }
  } catch { ElMessage.error(t('common.error')) }
  finally { loading.value = false }
}

async function doInstall() {
  if (!installEmail.value) return ElMessage.warning(t('common.error'))
  installing.value = true
  try {
    const res = await api.post('/cert/acme/install', { email: installEmail.value }) as any
    if (res.success) { ElMessage.success(t('common.success')); showInstall.value = false; await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { installing.value = false }
}

async function doIssue() {
  if (!issueDomain.value) return ElMessage.warning(t('common.error'))
  issuing.value = true
  try {
    const res = await api.post('/cert/issue', { domain: issueDomain.value, wildcard: issueWildcard.value, force: issueForce.value, provider: issueProvider.value }) as any
    if (res.success) { ElMessage.success(t('common.success')); showIssue.value = false; await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { issuing.value = false }
}

async function doRenew(row: any) {
  try {
    const res = await api.post('/cert/renew', { domain: row.domain }) as any
    ElMessage.success(res.message || t('common.success'))
    await load()
  } catch { ElMessage.error(t('common.error')) }
}

async function renewAll() {
  renewing.value = true
  try {
    const res = await api.post('/cert/renew-all') as any
    ElMessage.success(res.message || t('common.success'))
    await load()
  } catch { ElMessage.error(t('common.error')) }
  finally { renewing.value = false }
}

function exportCert(domain: string, format: string) {
  window.open(`/api/cert/export/${domain}?format=${format}`, '_blank')
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.domain} 的证书吗？`, t('common.confirmDelete'))
  try {
    const res = await api.delete(`/cert/domains/${row.domain}`, { params: { deleteFiles: 'true' } }) as any
    if (res.success) { ElMessage.success(t('common.success')); await load() }
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
}

function fmtDate(d: string) { if (!d) return '--'; return new Date(d).toLocaleDateString('zh-CN') }

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; }
.data-table { border-radius: var(--radius-md); overflow: hidden; }
.mono { font-family: var(--font-mono); font-size: 12px; }
.warn { color: var(--accent-orange); }
.danger { color: var(--accent-red); font-weight: 600; }
.ssl-actions { display: flex; align-items: center; gap: 0; }
</style>
