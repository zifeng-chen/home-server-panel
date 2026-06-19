<template>
  <div class="page">
    <!-- 头部 -->
    <div class="page-header">
      <div>
        <h2>DDNS 动态域名</h2>
        <p class="sub">双云解析（阿里云 + 腾讯云），自动同步公网 IP</p>
      </div>
      <div class="header-actions">
        <el-button @click="refreshAll" :loading="refreshing" :icon="Refresh">刷新全部</el-button>
      </div>
    </div>

    <!-- 公网 IP -->
    <div class="ip-row">
      <div class="ip-card"><span class="ip-label">IPv4</span><code>{{ ipv4 || '--' }}</code></div>
      <div class="ip-card"><span class="ip-label">IPv6</span><code>{{ ipv6 || '--' }}</code></div>
    </div>

    <!-- 记录表格 -->
    <el-table :data="records" v-loading="loading" stripe class="data-table">
      <el-table-column label="云商" width="80">
        <template #default="{ row }"><el-tag :type="row.provider === 'tencent' ? 'warning' : 'primary'" size="small">{{ row.provider === 'tencent' ? '腾讯云' : '阿里云' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="domain" label="域名" min-width="160" />
      <el-table-column prop="rr" label="主机记录" width="100" />
      <el-table-column prop="recordType" label="类型" width="70" />
      <el-table-column prop="value" label="解析值" min-width="180" show-overflow-tooltip />
      <el-table-column prop="line" label="线路" width="80" />
      <el-table-column prop="ttl" label="TTL" width="70" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled !== false" @change="() => toggleRecord(row)" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="confirmDelete(row)" :icon="Delete" size="small">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 删除确认 -->
    <el-dialog v-model="delVisible" title="确认删除" width="360">
      <p>确定要删除 <b>{{ delTarget?.rr }}.{{ delTarget?.domain }}</b> 的 DNS 记录吗？</p>
      <template #footer>
        <el-button @click="delVisible = false">取消</el-button>
        <el-button type="danger" @click="doDelete" :loading="deleting">确认删除</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'
import api from '../api'

const loading    = ref(false)
const refreshing = ref(false)
const deleting   = ref(false)
const records    = ref<any[]>([])
const ipv4       = ref('')
const ipv6       = ref('')

const delVisible = ref(false)
const delTarget  = ref<any>(null)

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
  } catch { ElMessage.error('加载 DDNS 数据失败') }
  finally { loading.value = false }
}

// 刷新全部
async function refreshAll() {
  refreshing.value = true
  try {
    const res = await api.post('/ddns/refresh') as any
    ElMessage.success(res.message || '刷新完成')
    await load()
  } catch { ElMessage.error('刷新失败') }
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
    else ElMessage.error(res.message || '操作失败')
  } catch { ElMessage.error('操作失败') }
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
    if (res.success) { ElMessage.success('已删除'); delVisible.value = false; await load() }
    else ElMessage.error(res.message || '删除失败')
  } catch { ElMessage.error('删除失败') }
  finally { deleting.value = false }
}

onMounted(load)
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
</style>
