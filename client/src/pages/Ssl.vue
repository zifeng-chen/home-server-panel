<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('ssl.title') }}</h2>
        <p class="sub">acme.sh 自动申请与管理</p>
      </div>
      <div class="header-actions">
        <el-button v-if="!acmeInstalled" type="primary" @click="showInstall = true" :icon="Download">安装 acme.sh</el-button>
        <el-button v-else @click="showIssue = true" type="primary" :icon="Plus">申请证书</el-button>
        <el-button @click="renewAll" :loading="renewing" :disabled="!acmeInstalled">续期全部</el-button>
      </div>
    </div>

    <!-- 证书列表 -->
    <el-table :data="certs" v-loading="loading" stripe class="data-table">
      <el-table-column prop="domain" label="域名" min-width="180" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'valid' ? 'success' : 'danger'" size="small">{{ row.status === 'valid' ? '有效' : '无效' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="expiresAt" label="到期时间" min-width="170">
        <template #default="{ row }"><span class="mono">{{ fmtDate(row.expiresAt) }}</span></template>
      </el-table-column>
      <el-table-column label="剩余" width="90">
        <template #default="{ row }">
          <span :class="{ warn: row.daysRemaining < 30, danger: row.daysRemaining < 7 }">{{ row.daysRemaining != null ? row.daysRemaining + ' 天' : '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <div class="ssl-actions">
            <el-button link type="primary" @click="doRenew(row)" size="small">续期</el-button>
            <el-dropdown trigger="click" @command="(c: string) => exportCert(row.domain, c)">
              <el-button link size="small">导出 <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="nginx">Nginx</el-dropdown-item>
                  <el-dropdown-item command="apache">Apache</el-dropdown-item>
                  <el-dropdown-item command="fullchain">Fullchain</el-dropdown-item>
                  <el-dropdown-item command="key">私钥</el-dropdown-item>
                  <el-dropdown-item command="all">全部打包</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button link type="danger" @click="confirmDelete(row)" size="small">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 安装 acme.sh 对话框 -->
    <el-dialog v-model="showInstall" title="安装 acme.sh" width="420">
      <el-form label-width="100px">
        <el-form-item label="联系邮箱">
          <el-input v-model="installEmail" placeholder="admin@example.com" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInstall = false">取消</el-button>
        <el-button type="primary" @click="doInstall" :loading="installing">安装</el-button>
      </template>
    </el-dialog>

    <!-- 申请证书对话框 -->
    <el-dialog v-model="showIssue" title="申请证书" width="480">
      <el-form label-width="100px">
        <el-form-item label="域名"><el-input v-model="issueDomain" placeholder="example.com" /></el-form-item>
        <el-form-item label="通配符"><el-switch v-model="issueWildcard" /></el-form-item>
        <el-form-item label="CA"><el-select v-model="issueProvider"><el-option label="ZeroSSL" value="zerossl" /><el-option label="Let's Encrypt" value="letsencrypt" /></el-select></el-form-item>
        <el-form-item label="强制重新申请"><el-switch v-model="issueForce" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showIssue = false">取消</el-button>
        <el-button type="primary" @click="doIssue" :loading="issuing">申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Plus, ArrowDown } from '@element-plus/icons-vue'
import api from '../api'

const loading = ref(false)
const certs = ref<any[]>([])
const acmeInstalled = ref(false)

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
  } catch { ElMessage.error('加载证书列表失败') }
  finally { loading.value = false }
}

async function doInstall() {
  if (!installEmail.value) return ElMessage.warning('请输入邮箱')
  installing.value = true
  try {
    const res = await api.post('/cert/acme/install', { email: installEmail.value }) as any
    if (res.success) { ElMessage.success('安装成功'); showInstall.value = false; await load() }
    else ElMessage.error(res.message || '安装失败')
  } catch { ElMessage.error('安装失败') }
  finally { installing.value = false }
}

async function doIssue() {
  if (!issueDomain.value) return ElMessage.warning('请输入域名')
  issuing.value = true
  try {
    const res = await api.post('/cert/issue', { domain: issueDomain.value, wildcard: issueWildcard.value, force: issueForce.value, provider: issueProvider.value }) as any
    if (res.success) { ElMessage.success('证书申请成功'); showIssue.value = false; await load() }
    else ElMessage.error(res.message || '申请失败')
  } catch { ElMessage.error('申请失败') }
  finally { issuing.value = false }
}

async function doRenew(row: any) {
  try {
    const res = await api.post('/cert/renew', { domain: row.domain }) as any
    ElMessage.success(res.message || '续期成功')
    await load()
  } catch { ElMessage.error('续期失败') }
}

async function renewAll() {
  renewing.value = true
  try {
    const res = await api.post('/cert/renew-all') as any
    ElMessage.success(res.message || '批量续期完成')
    await load()
  } catch { ElMessage.error('批量续期失败') }
  finally { renewing.value = false }
}

function exportCert(domain: string, format: string) {
  window.open(`/api/cert/export/${domain}?format=${format}`, '_blank')
}

async function confirmDelete(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.domain} 的证书吗？`, '确认删除')
  try {
    const res = await api.delete(`/cert/domains/${row.domain}`, { params: { deleteFiles: 'true' } }) as any
    if (res.success) { ElMessage.success('已删除'); await load() }
    else ElMessage.error(res.message || '删除失败')
  } catch { ElMessage.error('删除失败') }
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
