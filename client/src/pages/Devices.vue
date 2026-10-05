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
      <button class="d-scan-btn batch" @click="openBatch">⌨️ 批量命令</button>
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
          <!-- 卡头顶栏：图标 + 名称/IP + 状态 -->
          <div class="dc-head">
            <span class="dc-icon">{{ devIcon(dev) }}</span>
            <div class="dc-head-mid">
              <span class="dc-name">{{ dev.name || dev.hostname || dev.id }}</span>
              <div class="dc-meta">
                <span class="dc-ip">{{ dev.ip || '—' }}</span>
                <span v-if="dev.tags" class="dc-badge">{{ dev.tags }}</span>
              </div>
            </div>
            <span class="dc-dot" :class="dev.status"></span>
          </div>
          <!-- 指标 2×2 网格 -->
          <div v-if="dev.status === 'online' && dev.latest" class="dc-gauge-grid">
            <div class="dcg-cell">
              <span class="dcg-val" :class="cpuLevel(dev.latest.cpu)">{{ dev.latest.cpu ?? '—' }}<small>%</small></span>
              <span class="dcg-lbl">CPU</span>
            </div>
            <div class="dcg-cell">
              <span class="dcg-val" :class="memLevel(dev.latest.memory_pct)">{{ dev.latest.memory_pct ?? '—' }}<small>%</small></span>
              <span class="dcg-lbl">内存</span>
            </div>
            <div class="dcg-cell">
              <span class="dcg-val" :class="diskLevel(dev.latest.disk_pct)">{{ dev.latest.disk_pct ?? '—' }}<small>%</small></span>
              <span class="dcg-lbl">磁盘</span>
            </div>
            <div class="dcg-cell">
              <span class="dcg-val sm">{{ fmtUptime(dev.latest.uptime) }}</span>
              <span class="dcg-lbl">运行</span>
            </div>
          </div>
          <div v-else-if="dev.status === 'online'" class="dc-no-data">等待指标数据...</div>
          <!-- 离线提示 -->
          <div v-else class="dc-offline-msg">最后在线 {{ fmtTime(dev.last_seen) }}</div>
          <!-- 悬浮操作栏 -->
          <div class="dc-hover-bar" @click.stop>
            <button class="dch-btn" title="命令" @click="showCommand(dev)">⌨️</button>
            <button v-if="dev.id !== 'dev_local' && dev.status === 'online'" class="dch-btn" title="SSH" @click="openSsh(dev)">🔗</button>
            <button class="dch-btn" title="标签" @click="startEditTag(dev)">{{ dev.tags ? '🏷️' : '🏷' }}</button>
            <button class="dch-btn danger" title="删除" @click="confirmDelete(dev)">🗑</button>
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
        <button class="dch-btn" style="width:auto;padding:4px 12px;font-size:12px" @click="openAlertForm()">+ 添加</button>
      </div>
      <div v-if="store.alertRules?.length" class="d-list">
        <div v-for="r in store.alertRules" :key="r.id" class="d-list-item alert-item">
          <span class="dli-icon">⚠️</span>
          <div class="dli-info">
            <span class="dli-name">{{ r.name }}</span>
            <span class="dli-sub">{{ r.metric }} {{ r.metric === 'cpu' ? '≥' : '>' }} {{ r.threshold }}{{ r.metric === 'disk_pct' || r.metric === 'memory_pct' ? '%' : '' }} · {{ r.device_id || '全部设备' }}</span>
          </div>
          <el-switch :model-value="!!r.enabled" @change="toggleAlert(r)" size="small" />
          <button class="dch-btn" @click="openAlertForm(r)">✏️</button>
          <button class="dch-btn danger" @click="deleteAlert(r)">🗑</button>
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
    <!-- 弹窗：告警规则编辑（系统指标 + 自定义规则）                   -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="alertVisible" :title="alertEdit ? '编辑规则' : '添加规则'" width="460" append-to-body destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="alertFm.name" placeholder="如 CPU 过高" maxlength="30" /></el-form-item>
        <el-form-item label="指标">
          <el-select v-model="alertFm.metric" @change="onMetricChange">
            <el-option-group label="系统指标">
              <el-option v-for="m in metricList.filter(x=>x.source==='metric')" :key="m.value" :label="m.label" :value="m.value" />
            </el-option-group>
            <el-option-group label="自定义规则">
              <el-option v-for="m in metricList.filter(x=>x.source==='command')" :key="m.value" :label="m.label" :value="m.value" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item v-if="curMetric?.source === 'command'" label="目标">
          <el-input v-model="alertFm.target" :placeholder="curMetric?.help || '进程名/端口号'" />
        </el-form-item>
        <el-form-item :label="alertFm.metric === 'conn' ? '连接数阈值' : '阈值'">
          <el-input-number v-model="alertFm.threshold" :min="0" :max="alertFm.metric === 'conn' ? 100000 : 100" :step="1" />
          <span style="margin-left:6px;font-size:12px;color:#94a3b8">{{ curMetric?.unit || '' }}</span>
        </el-form-item>
        <el-form-item label="条件">
          <el-select v-model="alertFm.operator">
            <el-option label="大于 (gt)" value="gt" />
            <el-option label="小于 (lt)" value="lt" />
            <el-option label="等于 (eq)" value="eq" />
            <el-option label="不等于 (ne)" value="ne" />
          </el-select>
        </el-form-item>
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

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- 弹窗：批量命令（Phase 3 FR-3.4）                              -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <el-dialog v-model="batchVisible" title="批量命令" width="880" top="6vh" append-to-body destroy-on-close>
      <!-- 目标设备 -->
      <div class="bd-sec">
        <div class="bd-sec-head">
          <span>目标设备 <b>{{ batchIds.length }}</b> / 在线 {{ onlineDevices.length }}</span>
          <span class="bd-sec-acts">
            <el-button link size="small" @click="batchIds = onlineDevices.map(d => d.id)">全选在线</el-button>
            <el-button link size="small" @click="batchIds = []">清空</el-button>
          </span>
        </div>
        <el-checkbox-group v-model="batchIds" class="bd-devs">
          <el-checkbox v-for="d in devices" :key="d.id" :value="d.id" :disabled="d.status !== 'online'">
            <span class="bd-dev-name">{{ d.name || d.hostname || d.id }}</span>
            <span class="bd-dev-ip">{{ d.ip }}</span>
            <span v-if="d.status !== 'online'" class="bd-dev-off">离线</span>
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <!-- 命令模板 -->
      <div class="bd-sec">
        <div class="bd-sec-head"><span>命令模板</span><span class="bd-sec-acts">点击填入下方命令</span></div>
        <div class="bd-tpls">
          <button v-for="tp in batchTemplates" :key="tp.id" class="bd-tpl"
                  :class="{ on: batchCommand === tp.command }" @click="batchCommand = tp.command">
            <span class="bd-tpl-lbl">{{ tp.icon }} {{ tp.label }}</span>
            <code class="bd-tpl-cmd">{{ tp.command }}</code>
          </button>
        </div>
      </div>

      <!-- 命令输入 -->
      <div class="bd-sec">
        <el-input v-model="batchCommand" type="textarea" :rows="2" placeholder="df -h" />
        <div class="bd-foot">
          <span class="bd-hint">并发 5 · 单设备超时 30s · 结果按设备聚合</span>
          <el-button type="primary" size="small" :loading="batchRunning" @click="doBatchRun">执行</el-button>
        </div>
      </div>

      <!-- 结果 -->
      <div v-if="batchResults.length" class="bd-sec">
        <div class="bd-sec-head">
          <span>
            执行结果 · 成功 <b class="ok">{{ batchSummary.ok }}</b> / {{ batchSummary.total }}
            · {{ batchSummary.totalMs }}ms
          </span>
          <span class="bd-sec-acts">
            <el-button link size="small" @click="batchDiff = !batchDiff">
              {{ batchDiff ? '显示全部' : '仅显示差异' }}
            </el-button>
          </span>
        </div>
        <div v-if="batchDiff && !displayResults.length" class="bd-hist-empty">所有设备输出一致</div>
        <div class="bd-results">
          <div v-for="r in displayResults" :key="r.deviceId" class="bd-res" :class="{ err: !r.ok }">
            <div class="bd-res-head">
              <span class="bd-res-name">{{ r.deviceName }}</span>
              <el-tag size="small" :type="r.ok ? 'success' : 'danger'" effect="plain">
                {{ r.ok ? 'OK' : 'exit ' + r.exitCode }}
              </el-tag>
              <span class="bd-res-time">{{ r.duration }}ms</span>
            </div>
            <pre class="bd-res-out">{{ r.stdout || r.error || '(无输出)' }}</pre>
          </div>
        </div>
      </div>

      <!-- 历史 -->
      <div class="bd-sec">
        <div class="bd-sec-head">
          <span>历史记录</span>
          <span class="bd-sec-acts">
            <el-button link size="small" @click="loadBatchHistory">刷新</el-button>
            <el-button link size="small" @click="doClearBatchHistory">清空</el-button>
          </span>
        </div>
        <div v-if="batchHistory.length" class="bd-hist">
          <div v-for="h in batchHistory.slice(0, 8)" :key="h.id" class="bd-hist-item" @click="replayHistory(h)">
            <code class="bd-hist-cmd">{{ h.command }}</code>
            <span class="bd-hist-meta">{{ h.at }} · 成功 {{ h.summary?.ok }}/{{ h.summary?.total }} · {{ h.summary?.totalMs }}ms</span>
          </div>
        </div>
        <div v-else class="bd-hist-empty">暂无历史</div>
      </div>

      <template #footer>
        <el-button @click="batchVisible = false">关闭</el-button>
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
const alertFm = ref<Record<string,any>>({ name: '', metric: 'cpu', threshold: 90, device_id: '', operator: 'gt', target: '' })
const alertSaving = ref(false)

// ── 批量命令（Phase 3 FR-3.4）──
const batchVisible = ref(false)
const batchIds = ref<string[]>([])
const batchCommand = ref('df -h')
const batchTemplates = ref<any[]>([])
const batchRunning = ref(false)
const batchResults = ref<any[]>([])
const batchSummary = ref<any>({ total: 0, ok: 0, failed: 0, totalMs: 0 })
const batchHistory = ref<any[]>([])
const batchDiff = ref(false)

const onlineDevices = computed(() => devices.value.filter((d: any) => d.status === 'online'))

const normOut = (s: any) => String(s || '').replace(/\s+/g, ' ').trim()

// “仅显示差异”：隐藏与多数设备输出一致的设备
const displayResults = computed(() => {
  if (!batchDiff.value) return batchResults.value
  const groups = new Map<string, number>()
  for (const r of batchResults.value) {
    const k = normOut(r.stdout || r.error)
    groups.set(k, (groups.get(k) || 0) + 1)
  }
  let maxKey = ''
  let maxN = -1
  for (const [k, n] of groups) if (n > maxN) { maxN = n; maxKey = k }
  return batchResults.value.filter(r => normOut(r.stdout || r.error) !== maxKey)
})

async function openBatch() {
  batchVisible.value = true
  batchIds.value = onlineDevices.value.map((d: any) => d.id)
  if (!batchTemplates.value.length) {
    try {
      const r = await api.get('/v2/batch/templates') as any
      batchTemplates.value = r?.data || []
    } catch { /* ignore */ }
  }
  loadBatchHistory()
}

async function loadBatchHistory() {
  try {
    const r = await api.get('/v2/batch/history', { params: { limit: 20 } }) as any
    batchHistory.value = r?.data || []
  } catch { batchHistory.value = [] }
}

function replayHistory(h: any) {
  batchCommand.value = h.command || ''
  batchResults.value = h.results || []
  batchSummary.value = h.summary || { total: 0, ok: 0, failed: 0, totalMs: 0 }
  batchDiff.value = false
}

async function doBatchRun() {
  if (!batchIds.value.length) { ElMessage.warning('请至少选择一台设备'); return }
  if (!batchCommand.value.trim()) { ElMessage.warning('请输入命令'); return }
  batchRunning.value = true
  batchDiff.value = false
  try {
    const r = await api.post('/v2/batch/run', {
      deviceIds: batchIds.value,
      command: batchCommand.value.trim(),
    }, { timeout: 180000 }) as any
    batchResults.value = r?.data?.results || []
    batchSummary.value = r?.data?.summary || { total: 0, ok: 0, failed: 0, totalMs: 0 }
    ElMessage.success(`完成：成功 ${batchSummary.value.ok}/${batchSummary.value.total}`)
    loadBatchHistory()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '执行失败')
  } finally {
    batchRunning.value = false
  }
}

async function doClearBatchHistory() {
  try {
    await ElMessageBox.confirm('清空全部批量执行历史？', '确认', { type: 'warning' })
  } catch { return }
  try {
    await api.delete('/v2/batch/history')
    batchHistory.value = []
    ElMessage.success('已清空')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '清空失败')
  }
}

// ── 从后端拿指标列表 ──
const metricList = ref<any[]>([])
const curMetric = computed(() => metricList.value.find((m: any) => m.value === alertFm.value.metric))
function onMetricChange(val: string) {
  const m = metricList.value.find((x: any) => x.value === val)
  if (m) { alertFm.value.operator = m.defaultOp || 'gt'; alertFm.value.threshold = m.defaultThreshold || 90; alertFm.value.target = '' }
}

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
// ── 指标等级（用于 CSS class）──
const cpuLevel = (v: number | null | undefined) => v == null ? '' : v > 90 ? 'crit' : v > 70 ? 'warn' : 'ok'
const memLevel = (v: number | null | undefined) => v == null ? '' : v > 90 ? 'crit' : v > 70 ? 'warn' : 'ok'
const diskLevel = (v: number | null | undefined) => v == null ? '' : v > 90 ? 'crit' : v > 70 ? 'warn' : 'ok'

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
  if (row) {
    alertEdit.value = row
    alertFm.value = { name: row.name, metric: row.metric || 'cpu', threshold: Number(row.threshold) || 90, device_id: row.device_id || '', operator: row.operator || 'gt', target: row.target || '' }
  } else {
    alertEdit.value = null
    alertFm.value = { name: '', metric: 'cpu', threshold: 90, device_id: '', operator: 'gt', target: '' }
  }
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

onMounted(() => { loadAll(); loadMetrics() })

async function loadMetrics() {
  try {
    const res = await store.loadMetricList()
    if (res?.data) metricList.value = res.data
  } catch (_) {}
}
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
.d-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.d-card {
  position: relative; padding: 16px; border-radius: 14px; background: #fff;
  border: 1px solid #f1f5f9; cursor: pointer; overflow: hidden;
  transition: all .2s;
}
.d-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,.08); border-color: #e2e8f0; }
.d-card.offline { opacity: .5; }
/* 卡头顶栏 */
.dc-head { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.dc-icon { font-size: 26px; flex-shrink: 0; }
.dc-head-mid { flex: 1; min-width: 0; }
.dc-name { font-size: 14px; font-weight: 600; color: #1A1A1A; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-meta { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
.dc-ip { font-size: 11px; color: #64748b; }
.dc-badge {
  font-size: 10px; padding: 1px 7px; border-radius: 5px; background: #eef2ff; color: #4f7cff;
  max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dc-dot.online { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.4); }
.dc-dot.offline { background: #94a3b8; }
/* 指标 2×2 网格 */
.dc-gauge-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-bottom: 10px;
}
.dcg-cell { text-align: center; padding: 8px 4px; border-radius: 10px; background: #f8fafc; }
.dcg-val { font-size: 22px; font-weight: 700; display: block; color: #1A1A1A; }
.dcg-val small { font-size: 12px; font-weight: 500; }
.dcg-val.ok { color: #22c55e; }
.dcg-val.warn { color: #f59e0b; }
.dcg-val.crit { color: #ef4444; }
.dcg-val.sm { font-size: 13px; }
.dcg-lbl { font-size: 10px; color: #94a3b8; display: block; margin-top: 2px; }
.dc-no-data { font-size: 12px; color: #94a3b8; padding: 8px 0; text-align: center; }
.dc-offline-msg { font-size: 12px; color: #94a3b8; padding: 8px 0; text-align: center; }
/* 悬浮操作栏 */
.dc-hover-bar {
  display: flex; gap: 4px; justify-content: center; padding-top: 8px;
  opacity: 0; transform: translateY(4px); transition: all .2s;
  border-top: 1px solid #f1f5f9;
}
.d-card:hover .dc-hover-bar { opacity: 1; transform: translateY(0); }
.dch-btn {
  width: 32px; height: 32px; border: 1px solid #e2e8f0; border-radius: 8px;
  background: transparent; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.dch-btn:hover { background: #f1f5f9; }
.dch-btn.danger:hover { color: #ef4444; border-color: #fecaca; }

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

/* ══ 批量命令 ══ */
.d-scan-btn.batch { background: #eef2ff; color: #4f7cff; border-color: #c7d2fe; }
.d-scan-btn.batch:hover { background: #4f7cff; color: #fff; }

.bd-sec { margin-bottom: 16px; }
.bd-sec-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 8px;
}
.bd-sec-head b { color: #4f7cff; }
.bd-sec-head .ok { color: #15c39a; }
.bd-sec-acts { font-weight: 400; display: flex; gap: 4px; }

.bd-devs {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 6px; max-height: 168px; overflow-y: auto;
  padding: 8px 10px; border: 1px solid #eef0f4; border-radius: 8px; background: #fafbfc;
}
.bd-devs :deep(.el-checkbox) { margin-right: 0; height: 26px; }
.bd-dev-name { font-size: 12px; color: #1f2937; }
.bd-dev-ip { font-size: 11px; color: #94a3b8; margin-left: 6px; }
.bd-dev-off { font-size: 11px; color: #cbd5e1; margin-left: 6px; }

.bd-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 8px; }
.bd-tpl {
  text-align: left; padding: 8px 10px; border: 1px solid #e8ecf3; border-radius: 8px;
  background: #fff; cursor: pointer; transition: all .15s; display: flex; flex-direction: column; gap: 3px;
}
.bd-tpl:hover { border-color: #4f7cff; background: #f7faff; }
.bd-tpl.on { border-color: #4f7cff; background: #eef2ff; }
.bd-tpl-lbl { font-size: 12px; color: #1f2937; font-weight: 500; }
.bd-tpl-cmd {
  font-size: 10.5px; color: #94a3b8; font-family: ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.bd-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.bd-hint { font-size: 11px; color: #a8b0bd; }

.bd-results { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.bd-res { border: 1px solid #eef0f4; border-radius: 8px; overflow: hidden; }
.bd-res.err { border-color: #fde2e2; }
.bd-res-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: #fafbfc; border-bottom: 1px solid #f1f3f7;
}
.bd-res-name { font-size: 12px; font-weight: 600; color: #1f2937; }
.bd-res-time { font-size: 11px; color: #a8b0bd; margin-left: auto; }
.bd-res-out {
  margin: 0; padding: 8px 10px; font-size: 11.5px; line-height: 1.5;
  font-family: ui-monospace, monospace; color: #475569; background: #fff;
  max-height: 150px; overflow: auto; white-space: pre-wrap;
}

.bd-hist { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.bd-hist-item {
  display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  border-radius: 6px; background: #fafbfc; cursor: pointer; border: 1px solid transparent;
}
.bd-hist-item:hover { background: #f2f6ff; border-color: #dbe4ff; }
.bd-hist-cmd {
  font-size: 11.5px; color: #334155; font-family: ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
}
.bd-hist-meta { font-size: 11px; color: #a8b0bd; flex-shrink: 0; }
.bd-hist-empty { font-size: 12px; color: #b8c0cc; padding: 10px; text-align: center; }
</style>
