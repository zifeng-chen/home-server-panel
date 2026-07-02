<!-- ================================================================
  设备总控台 — 统一纳管 + 发现双区
  家庭服务器面板 v0.9.4-beta
================================================================ -->
<template>
  <div class="d-root">
    <!-- ── 统计亮片 ── -->
    <div class="d-stats">
      <div class="d-stat" :class="{ active: tab === 'managed' }" @click="tab = 'managed'">
        <span class="ds-num">{{ store.stats?.online || 0 }}</span>
        <span class="ds-lbl">在线</span>
      </div>
      <div class="d-stat" :class="{ active: tab === 'offline' }" @click="tab = 'offline'">
        <span class="ds-num off">{{ store.stats?.offline || 0 }}</span>
        <span class="ds-lbl">离线</span>
      </div>
      <div class="d-stat">
        <span class="ds-num">{{ devices.length }}</span>
        <span class="ds-lbl">已纳管</span>
      </div>
      <div class="d-stat" :class="{ active: tab === 'unmanaged' }" @click="tab = 'unmanaged'">
        <span class="ds-num accent">{{ unmanagedCount }}</span>
        <span class="ds-lbl">未纳管</span>
      </div>
      <button class="d-scan-btn" @click="scanToggle" :disabled="scanning">
        {{ scanning ? '扫描中...' : '🔍 扫描发现' }}
      </button>
    </div>

    <!-- ── 扫描进度条 ── -->
    <div v-if="scanning" class="d-scan-bar">
      <div class="dsb-fill" :style="{ width: scanProgress + '%' }"></div>
      <span class="dsb-text">{{ scanDetail }} ({{ scanProgress }}%)</span>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 已纳管设备卡片（tab=managed/offline 时显示）                     -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-if="tab !== 'unmanaged' && filteredDevices.length" class="d-section">
      <h3 class="d-section-title">🤖 已纳管设备</h3>
      <div class="d-card-grid">
        <div v-for="dev in filteredDevices" :key="dev.id"
             class="d-card" :class="{ offline: dev.status !== 'online' }"
             @click="openDetail(dev)">
          <!-- 卡片头部 -->
          <div class="dc-top">
            <span class="dc-icon">{{ devIcon(dev) }}</span>
            <div class="dc-info">
              <span class="dc-name">{{ dev.name || dev.hostname || dev.id }}</span>
              <span class="dc-ip">{{ dev.ip || '—' }}</span>
            </div>
            <span class="dc-dot" :class="dev.status"></span>
          </div>
          <!-- 指标数据（在线设备） -->
          <div v-if="dev.status === 'online' && dev.latest" class="dc-metrics">
            <div class="dcm-item" v-if="dev.latest.cpu !== null && dev.latest.cpu !== undefined">
              <span class="dcm-val" :style="{ color: cpuColor(dev.latest.cpu) }">{{ dev.latest.cpu }}%</span>
              <span class="dcm-key">CPU</span>
            </div>
            <div class="dcm-item" v-if="dev.latest.memory_pct !== null && dev.latest.memory_pct !== undefined">
              <span class="dcm-val" :style="{ color: memColor(dev.latest.memory_pct) }">{{ dev.latest.memory_pct }}%</span>
              <span class="dcm-key">内存</span>
            </div>
            <div class="dcm-item" v-if="dev.latest.disk_pct !== null && dev.latest.disk_pct !== undefined">
              <span class="dcm-val" :style="{ color: diskColor(dev.latest.disk_pct) }">{{ dev.latest.disk_pct }}%</span>
              <span class="dcm-key">磁盘</span>
            </div>
            <div class="dcm-item" v-if="dev.latest.uptime !== null && dev.latest.uptime !== undefined">
              <span class="dcm-val sm">{{ fmtUptime(dev.latest.uptime) }}</span>
              <span class="dcm-key">运行</span>
            </div>
          </div>
          <div v-else-if="dev.status === 'online'" class="dc-metrics">
            <span class="dc-no-data">等待数据...</span>
          </div>
          <!-- 离线设备 -->
          <div v-else class="dc-offline-msg">
            <span>最后在线 {{ fmtTime(dev.last_seen) }}</span>
          </div>
          <!-- 快捷操作 -->
          <div class="dc-actions" @click.stop>
            <button class="dca-btn" @click="showCommand(dev)">⌨️ 命令</button>
            <button v-if="dev.id !== 'dev_local' && dev.status === 'online'" class="dca-btn" @click="openSsh(dev)">🔗 SSH</button>
            <button class="dca-btn" @click="startEditTag(dev)">{{ dev.tags ? '🏷️' : '➕' }}</button>
            <button class="dca-btn danger" @click="confirmDelete(dev)">🗑️</button>
          </div>
          <!-- 标签条 -->
          <div class="dc-tags" v-if="dev.tags">
            <span class="dct-chip">{{ dev.tags }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="tab !== 'unmanaged' && !filteredDevices.length && !store.loading" class="d-empty">
      暂无{{ tab === 'offline' ? '离线' : '已纳管' }}设备
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 发现设备列表（tab=unmanaged / 扫描完成后自动展开）              -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-if="showUnmanaged && unmanagedDevices.length" class="d-section">
      <div class="d-section-head">
        <h3 class="d-section-title">📡 发现设备（未纳管）</h3>
        <span class="dsh-count">共 {{ unmanagedCount }} 台</span>
      </div>
      <div class="d-list">
        <div v-for="d in unmanagedDevices" :key="d.ip + d.mac" class="d-list-item">
          <span class="dli-icon">{{ devIcon(d) }}</span>
          <div class="dli-info">
            <span class="dli-name">{{ d.hostname || d.ip }}</span>
            <span class="dli-sub">{{ d.ip }}<span v-if="d.mac"> · {{ d.mac }}</span><span v-if="d.vendor"> · {{ d.vendor }}</span></span>
          </div>
          <button class="dli-install" @click="installAgent(d)">📥 安装 Agent</button>
        </div>
      </div>
    </div>

    <!-- 未纳管为空 -->
    <div v-if="showUnmanaged && !unmanagedDevices.length && !scanning && scanAttempted" class="d-empty">
      未发现新设备
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 告警规则区域（精简复用）                                       -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div class="d-section">
      <div class="d-section-head">
        <h3 class="d-section-title">⚠️ 告警规则</h3>
        <button class="dca-btn" @click="openAlertForm()">+ 添加</button>
      </div>
      <div v-if="store.alertRules?.length" class="d-list">
        <div v-for="r in store.alertRules" :key="r.id" class="d-list-item alert-item">
          <span class="dli-icon">⚠️</span>
          <div class="dli-info">
            <span class="dli-name">{{ r.name }}</span>
            <span class="dli-sub">{{ r.metric }} {{ r.metric === 'cpu' ? '≥' : '>' }} {{ r.threshold }}{{ r.metric === 'disk_pct' || r.metric === 'memory_pct' ? '%' : '' }} · {{ r.device_id || '全部设备' }}</span>
          </div>
          <el-switch :model-value="!!r.enabled" @change="toggleAlert(r)" size="small" />
          <button class="dca-btn mini" @click="openAlertForm(r)">✏️</button>
          <button class="dca-btn mini danger" @click="deleteAlert(r)">🗑️</button>
        </div>
      </div>
      <div v-else-if="!store.alertLoading" class="d-empty">暂无告警规则</div>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 弹窗：命令下发                                                -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="cmdVisible" title="下发命令" width="440" append-to-body destroy-on-close>
      <el-form>
        <el-form-item label="设备"><el-input :model-value="cmdTarget?.name" disabled /></el-form-item>
        <el-form-item label="命令">
          <el-input v-model="cmdText" type="textarea" rows="3" placeholder="输入命令..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cmdVisible = false">取消</el-button>
        <el-button type="primary" @click="doCmd" :loading="cmdSending">执行</el-button>
      </template>
    </el-dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 弹窗：标签编辑                                                -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="tagVisible" title="设备标签" width="360" append-to-body destroy-on-close>
      <el-form>
        <el-form-item label="标签"><el-input v-model="tagText" placeholder="如：陈先生的MacBook / 书房" maxlength="50" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tagVisible = false">取消</el-button>
        <el-button type="primary" @click="doSaveTag" :loading="tagSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 弹窗：安装 Agent                                              -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="installVisible" title="安装 Agent" width="380" append-to-body destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="目标 IP"><el-input :model-value="installTarget?.ip" disabled /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="installUser" placeholder="root" /></el-form-item>
        <el-form-item label="SSH 密码"><el-input v-model="installPass" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="installVisible = false">取消</el-button>
        <el-button type="primary" @click="doInstall" :loading="installing">安装</el-button>
      </template>
      <div v-if="installMsg" class="d-install-msg" :class="installOk ? 'ok' : 'err'">{{ installMsg }}</div>
    </el-dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 弹窗：告警规则编辑                                            -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="alertVisible" :title="alertEdit ? '编辑规则' : '添加规则'" width="420" append-to-body destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="alertFm.name" placeholder="如 CPU 过高" maxlength="30" /></el-form-item>
        <el-form-item label="指标">
          <el-select v-model="alertFm.metric">
            <el-option label="CPU" value="cpu" />
            <el-option label="内存" value="memory_pct" />
            <el-option label="磁盘" value="disk_pct" />
          </el-select>
        </el-form-item>
        <el-form-item label="阈值"><el-input-number v-model="alertFm.threshold" :min="1" :max="100" /></el-form-item>
        <el-form-item label="设备">
          <el-select v-model="alertFm.device_id" placeholder="全部设备" clearable>
            <el-option v-for="d in devices" :key="d.id" :label="d.name || d.hostname || d.id" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="alertVisible = false">取消</el-button>
        <el-button type="primary" @click="doSaveAlert" :loading="alertSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDevicesStore } from '../stores/devices'
import api from '../api'

const store = useDevicesStore()
const router = useRouter()

// ── Tab ──
const tab = ref('managed') // 'managed' | 'offline' | 'unmanaged'

// ── 设备数据 ──
const devices = ref<any[]>([])

// ── 扫描 ──
const scanning = ref(false)
const scanProgress = ref(0)
const scanDetail = ref('')
const scanAttempted = ref(false)
const discovered = ref<any[]>([])
let scanTimer: any = null

// ── 未纳管列表（聚合去重）──
const unmanagedDevices = computed(() => {
  const managedIPs = new Set(devices.value.map(d => d.ip).filter(Boolean))
  const managedHosts = new Set(devices.value.map(d => d.hostname).filter(Boolean))
  return discovered.value.filter(d => {
    if (managedIPs.has(d.ip)) return false
    if (d.hostname && managedHosts.has(d.hostname)) return false
    return true
  })
})
const unmanagedCount = computed(() => unmanagedDevices.value.length)
const showUnmanaged = computed(() => tab.value === 'unmanaged' || (scanAttempted.value && unmanagedDevices.value.length > 0))

// ── 已纳管筛选 ──
const filteredDevices = computed(() => {
  if (tab.value === 'offline') return devices.value.filter(d => d.status !== 'online')
  if (tab.value === 'unmanaged') return []
  return devices.value // managed = all
})

// ── 命令 ──
const cmdVisible = ref(false)
const cmdTarget = ref<any>(null)
const cmdText = ref('')
const cmdSending = ref(false)

// ── 标签 ──
const tagVisible = ref(false)
const tagTarget = ref<any>(null)
const tagText = ref('')
const tagSaving = ref(false)

// ── 安装 ──
const installVisible = ref(false)
const installTarget = ref<any>(null)
const installUser = ref('root')
const installPass = ref('')
const installing = ref(false)
const installMsg = ref('')
const installOk = ref(false)

// ── 告警 ──
const alertVisible = ref(false)
const alertEdit = ref<any>(null)
const alertFm = ref({ name: '', metric: 'cpu', threshold: 90, device_id: '' })
const alertSaving = ref(false)

// ── 辅助函数 ──
const devIcon = (d: any) => {
  const n = (d.name || d.hostname || '').toLowerCase()
  if (d.type === 'nas' || n.includes('nas') || n.includes('iosun')) return '💾'
  if (d.type === 'router' || n.includes('router') || n.includes('istore')) return '📶'
  if (d.type === 'phone' || n.includes('phone')) return '📱'
  if (d.os?.includes('Darwin') || n.includes('mac')) return '🍎'
  if (d.os?.includes('Windows') || n.includes('win')) return '🪟'
  if (d.vendor?.includes('Apple')) return '🍎'
  if (d.vendor?.includes('HP') || d.type === 'printer') return '🖨️'
  if (d.vendor?.includes('Samsung') || d.type === 'media') return '📺'
  if (d.os?.includes('Linux')) return '🐧'
  return '🖥️'
}
const fmtTime = (t: string) => {
  if (!t) return '—'
  const d = new Date(t.endsWith('Z') ? t : t + 'Z')
  return isNaN(d.getTime()) ? t : d.toLocaleString('zh-CN', { hour12: false })
}
const fmtUptime = (s: number) => {
  if (!s) return '—'
  if (s < 3600) return Math.floor(s / 60) + '分'
  if (s < 86400) return Math.floor(s / 3600) + '时'
  return Math.floor(s / 86400) + '天'
}
const cpuColor = (v: number) => v > 90 ? '#ef4444' : v > 70 ? '#f59e0b' : '#22c55e'
const memColor = (v: number) => v > 90 ? '#ef4444' : v > 70 ? '#f59e0b' : '#3b82f6'
const diskColor = (v: number) => v > 90 ? '#ef4444' : v > 70 ? '#f59e0b' : '#8b5cf6'

// ── 数据加载 ──
async function loadAll() {
  try {
    store.loadStats()
    store.loadAlertRules()
    const res = await api.get('/v2/device/overview') as any
    if (res?.success) devices.value = res.data || []
  } catch {}
}

// ── 扫描（精简版，复用现有 discovery API）──
async function scanToggle() {
  if (scanning.value) return
  scanning.value = true
  scanProgress.value = 0
  scanDetail.value = '初始化...'
  discovered.value = []
  try {
    const { data: r } = await api.post('/v2/discovery/scan', { range: '192.168.100.0/24', method: 'auto' }) as any
    if (r.success && r.data?.scanId) pollScan(r.data.scanId)
    else { scanning.value = false; scanAttempted.value = false }
  } catch { scanning.value = false }
}
function pollScan(scanId: string) {
  scanTimer = setInterval(async () => {
    try {
      const { data: r } = await api.get(`/v2/discovery/scan/${scanId}`) as any
      if (r.success && r.data) {
        scanProgress.value = r.data.progress ?? 0
        scanDetail.value = r.data.detail || ''
        if (r.data.devices?.length) discovered.value = r.data.devices
        if (r.data.completed) { clearInterval(scanTimer); scanning.value = false; scanAttempted.value = true }
      }
    } catch { clearInterval(scanTimer); scanning.value = false }
  }, 1500)
}

// ── 命令 ──
function showCommand(dev: any) { cmdTarget.value = dev; cmdText.value = ''; cmdVisible.value = true }
async function doCmd() {
  if (!cmdText.value.trim()) return ElMessage.warning('请输入命令')
  cmdSending.value = true
  try { await store.sendCommand(cmdTarget.value!.id, cmdText.value); ElMessage.success('已下发'); cmdVisible.value = false }
  catch { ElMessage.error('失败') } finally { cmdSending.value = false }
}

// ── SSH ──
function openSsh(dev: any) {
  sessionStorage.setItem('ssh_preset', JSON.stringify({ host: dev.ip || dev.id, port: 22, username: 'root', name: dev.name || dev.hostname }))
  router.push('/ssh')
}

// ── 标签 ──
function startEditTag(dev: any) { tagTarget.value = dev; tagText.value = dev.tags || ''; tagVisible.value = true }
async function doSaveTag() {
  if (!tagTarget.value) return
  tagSaving.value = true
  try { await api.put(`/v2/device/${tagTarget.value.id}/tags`, { tags: tagText.value }); ElMessage.success('已保存'); tagVisible.value = false; loadAll() }
  catch { ElMessage.error('失败') } finally { tagSaving.value = false }
}

// ── 删除 ──
async function confirmDelete(dev: any) {
  try {
    await ElMessageBox.confirm(`确定删除 ${dev.name || dev.hostname || dev.id}？历史数据将一并清除。`, '删除设备', { type: 'warning' })
    await store.deleteDevice(dev.id)
    ElMessage.success('已删除')
    loadAll()
  } catch {}
}

// ── 安装 Agent ──
function installAgent(row: any) { installTarget.value = row; installPass.value = ''; installUser.value = 'root'; installMsg.value = ''; installVisible.value = true }
async function doInstall() {
  if (!installTarget.value || !installPass.value) return ElMessage.warning('请输入 SSH 密码')
  installing.value = true; installMsg.value = ''
  try {
    const { data: r } = await api.post('/v2/install', { host: installTarget.value.ip, username: installUser.value || 'root', password: installPass.value, arch: 'amd64' }) as any
    installOk.value = r.success !== false
    installMsg.value = 'Agent 安装已启动，等待设备上线...'
    ElMessage.success(installMsg.value)
  } catch (e: any) {
    installOk.value = false
    installMsg.value = e?.response?.data?.message || e.message || '安装失败'
  } finally { installing.value = false }
}

// ── 告警 ──
function openAlertForm(row?: any) {
  if (row) { alertEdit.value = row; alertFm.value = { name: row.name, metric: row.metric || 'cpu', threshold: row.threshold || 90, device_id: row.device_id || '' } }
  else { alertEdit.value = null; alertFm.value = { name: '', metric: 'cpu', threshold: 90, device_id: '' } }
  alertVisible.value = true
}
async function doSaveAlert() {
  if (!alertFm.value.name.trim()) return ElMessage.warning('请输入规则名称')
  alertSaving.value = true
  try {
    if (alertEdit.value) await store.updateAlertRule(alertEdit.value.id, alertFm.value)
    else await store.createAlertRule(alertFm.value)
    ElMessage.success('已保存'); alertVisible.value = false; store.loadAlertRules()
  } catch { ElMessage.error('失败') } finally { alertSaving.value = false }
}
async function deleteAlert(row: any) {
  try { await store.deleteAlertRule(row.id); ElMessage.success('已删除') } catch { ElMessage.error('失败') }
}
async function toggleAlert(row: any) { try { await store.toggleAlertRule(row.id) } catch {} }

// ── 详情 ──
function openDetail(dev: any) { router.push(`/devices/${dev.id}`) }

onMounted(() => loadAll())
</script>

<style scoped>
.d-root { max-width: 1400px; margin: 0 auto; }
.d-stats { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.d-stat {
  padding: 12px 20px; border-radius: 14px; background: var(--bg-glass, #fff);
  border: 1px solid var(--border-color, #e2e8f0); cursor: pointer;
  text-align: center; min-width: 80px; transition: all .2s;
}
.d-stat:hover { border-color: var(--accent, #4f7cff); }
.d-stat.active { border-color: var(--accent, #4f7cff); background: #eef2ff; }
.ds-num { font-size: 26px; font-weight: 800; color: #1A1A1A; display: block; }
.ds-num.off { color: #94a3b8; }
.ds-num.accent { color: #4f7cff; }
.ds-lbl { font-size: 11px; color: #64748b; }
.d-scan-btn {
  margin-left: auto; padding: 9px 18px; border: 1px dashed var(--border-color, #e2e8f0);
  border-radius: 12px; background: transparent; cursor: pointer; font-size: 13px;
  color: #64748b; transition: all .2s;
}
.d-scan-btn:hover { border-color: var(--accent, #4f7cff); color: var(--accent, #4f7cff); }
.d-scan-btn:disabled { opacity: .5; cursor: not-allowed; }

/* 扫描进度 */
.d-scan-bar { position: relative; height: 6px; background: #f1f5f9; border-radius: 3px; margin-bottom: 16px; overflow: hidden; }
.dsb-fill { height: 100%; background: linear-gradient(90deg, #4f7cff, #15c39a); border-radius: 3px; transition: width .4s; }
.dsb-text { position: absolute; right: 0; top: -18px; font-size: 11px; color: #64748b; }

/* 区域 */
.d-section { margin-bottom: 24px; }
.d-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.d-section-title { font-size: 14px; font-weight: 600; color: #1A1A1A; margin: 0; }
.dsh-count { font-size: 12px; color: #94a3b8; }
.d-empty { padding: 32px; text-align: center; color: #94a3b8; font-size: 13px; }

/* 卡片网格 */
.d-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.d-card {
  position: relative; padding: 14px; border-radius: 14px; background: #fff;
  border: 1px solid #f1f5f9; cursor: pointer; transition: all .2s;
}
.d-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,.08); border-color: #e2e8f0; }
.d-card.offline { opacity: .55; }
.dc-top { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.dc-icon { font-size: 24px; }
.dc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dc-name { font-size: 14px; font-weight: 600; color: #1A1A1A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-ip { font-size: 11px; color: #64748b; }
.dc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dc-dot.online { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.4); }
.dc-dot.offline { background: #94a3b8; }

/* 指标 */
.dc-metrics { display: flex; gap: 14px; margin-bottom: 8px; }
.dcm-item { display: flex; flex-direction: column; align-items: center; }
.dcm-val { font-size: 18px; font-weight: 700; }
.dcm-val.sm { font-size: 12px; }
.dcm-key { font-size: 10px; color: #94a3b8; }
.dc-no-data { font-size: 11px; color: #94a3b8; }
.dc-offline-msg { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }

/* 操作按钮 */
.dc-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.dca-btn {
  padding: 3px 10px; border: 1px solid #e2e8f0; border-radius: 8px;
  background: transparent; cursor: pointer; font-size: 11px; transition: all .15s;
}
.dca-btn:hover { background: #f1f5f9; }
.dca-btn.danger:hover { color: #ef4444; border-color: #fecaca; }
.dca-btn.mini { padding: 2px 6px; font-size: 10px; }

/* 标签 */
.dc-tags { margin-top: 6px; }
.dct-chip { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #eef2ff; color: #4f7cff; font-size: 11px; }

/* 发现设备列表 */
.d-list { display: flex; flex-direction: column; gap: 6px; }
.d-list-item {
  display: flex; gap: 10px; align-items: center; padding: 10px 14px;
  border-radius: 10px; background: #fff; border: 1px solid #f1f5f9;
  transition: border-color .15s;
}
.d-list-item:hover { border-color: #e2e8f0; }
.dli-icon { font-size: 20px; flex-shrink: 0; }
.dli-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dli-name { font-size: 13px; font-weight: 600; color: #1A1A1A; }
.dli-sub { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dli-install {
  padding: 5px 12px; border: 1px solid #4f7cff; border-radius: 8px; background: #eef2ff;
  color: #4f7cff; cursor: pointer; font-size: 11px; flex-shrink: 0; transition: all .15s;
}
.dli-install:hover { background: #4f7cff; color: #fff; }

/* 告警 */
.alert-item { cursor: default; }
.alert-item .dli-info { pointer-events: none; }

/* 安装消息 */
.d-install-msg { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
.d-install-msg.ok { background: #f0fdf4; color: #166534; }
.d-install-msg.err { background: #fef2f2; color: #991b1b; }
</style>
