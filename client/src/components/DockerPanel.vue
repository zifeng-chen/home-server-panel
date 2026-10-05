<template>
  <div class="card dp">
    <!-- 头部 -->
    <div class="dp-head">
      <span class="dp-title">
        <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:6px;vertical-align:-3px">
          <path d="M22 10.5h-2.5V8h-3v2.5H14V8h-3v2.5H8.5V8h-3v2.5H3V13c0 4.5 3 7.5 8 7.5 4.6 0 8-2.6 8.6-6.5H22v-3.5z" fill="none" stroke="#2496ED" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        {{ $t('docker.title') }}
      </span>
      <div class="dp-tools">
        <el-tag v-if="status" size="small" :type="status.available ? 'success' : 'info'" effect="plain">
          {{ status.available ? 'Docker ' + (status.version || '') : $t('docker.notAvailable') }}
        </el-tag>
        <el-tag v-if="status && status.available" size="small" effect="plain" type="info">
          {{ status.running || 0 }}/{{ status.containers || 0 }} {{ $t('docker.running') }}
        </el-tag>
        <el-button size="small" @click="refresh" :loading="loading">{{ $t('common.refresh') }}</el-button>
      </div>
    </div>

    <!-- 不可用 -->
    <div v-if="status && !status.available" class="dp-empty">
      <div class="dp-empty-ic">🐳</div>
      <p>{{ status.installed === false ? $t('docker.notInstalled') : $t('docker.daemonDown') }}</p>
      <p class="dp-empty-hint">{{ status.error }}</p>
    </div>

    <template v-else>
      <el-tabs v-model="tab" class="dp-tabs">
        <!-- ===== 容器 ===== -->
        <el-tab-pane :label="`${$t('docker.containers')} (${containers.length})`" name="containers">
          <div class="dp-filter">
            <el-input v-model="filter" size="small" :placeholder="$t('docker.filterPlaceholder')" clearable style="max-width:240px" />
            <el-checkbox v-model="showAll" size="small" @change="refresh">{{ $t('docker.showAll') }}</el-checkbox>
            <el-button size="small" :loading="statsLoading" @click="loadStats">{{ $t('docker.loadStats') }}</el-button>
          </div>

          <div v-if="loading" class="dp-empty">...</div>
          <div v-else-if="!filtered.length" class="dp-empty">{{ $t('docker.noContainers') }}</div>
          <div v-else class="dp-list">
            <div v-for="c in filtered" :key="c.name" class="dp-row" :class="c.state">
              <div class="dp-row-main">
                <span class="dp-state-dot" :class="c.state"></span>
                <code class="dp-name">{{ c.name }}</code>
                <span class="dp-image">{{ c.image }}</span>
                <el-tag size="small" :type="stateType(c.state)" effect="plain" class="dp-state">{{ stateLabel(c.state) }}</el-tag>
              </div>
              <div class="dp-row-meta">
                <span class="dp-status">{{ c.status }}</span>
                <span v-if="c.ports" class="dp-ports">{{ shortPorts(c.ports) }}</span>
                <span v-if="statOf(c.name)" class="dp-stat">
                  CPU {{ statOf(c.name).cpu }} · MEM {{ statOf(c.name).memPct }}
                </span>
              </div>
              <div class="dp-acts">
                <el-button v-if="c.state !== 'running'" link size="small" @click="doAction(c, 'start')">{{ $t('docker.start') }}</el-button>
                <el-button v-else link size="small" @click="doAction(c, 'stop')">{{ $t('docker.stop') }}</el-button>
                <el-button link size="small" @click="doAction(c, 'restart')">{{ $t('docker.restart') }}</el-button>
                <el-button link size="small" @click="openLogs(c)">{{ $t('docker.logs') }}</el-button>
                <el-button link size="small" class="danger" @click="doRemove(c)">{{ $t('common.delete') }}</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ===== 镜像 ===== -->
        <el-tab-pane :label="`${$t('docker.images')} (${images.length})`" name="images">
          <div class="dp-filter">
            <el-input v-model="pullImage" size="small" placeholder="nginx:alpine" style="max-width:240px" @keydown.enter="doPull" />
            <el-button size="small" type="primary" plain :loading="pulling" @click="doPull">{{ $t('docker.pull') }}</el-button>
            <el-button size="small" :loading="pruning" @click="doPrune">{{ $t('docker.prune') }}</el-button>
          </div>

          <pre v-if="pullOutput" class="dp-output">{{ pullOutput }}</pre>

          <div v-if="!images.length" class="dp-empty">{{ $t('docker.noImages') }}</div>
          <div v-else class="dp-list">
            <div v-for="im in images" :key="im.id + im.tag" class="dp-row">
              <div class="dp-row-main">
                <code class="dp-name">{{ im.dangling ? '<none>' : im.repository }}<span class="dp-tag">:{{ im.tag }}</span></code>
                <span class="dp-image">{{ im.size }}</span>
                <el-tag v-if="im.dangling" size="small" type="info" effect="plain">{{ $t('docker.dangling') }}</el-tag>
                <span class="dp-created">{{ im.created }}</span>
              </div>
              <div class="dp-acts">
                <el-button link size="small" class="danger" @click="doRemoveImage(im)">{{ $t('common.delete') }}</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ===== Compose ===== -->
        <el-tab-pane :label="$t('docker.compose')" name="compose">
          <div class="dp-filter">
            <el-input v-model="composeFile" size="small" placeholder="/root/docker-compose.yml" style="max-width:380px" />
            <el-button size="small" @click="doCompose('ps')" :loading="composing">ps</el-button>
            <el-button size="small" type="primary" plain @click="doCompose('up')" :loading="composing">up -d</el-button>
            <el-button size="small" @click="doCompose('logs')" :loading="composing">logs</el-button>
            <el-button size="small" @click="doCompose('restart')" :loading="composing">restart</el-button>
            <el-button size="small" class="danger-btn" @click="doCompose('down')" :loading="composing">down</el-button>
          </div>
          <p class="dp-hint">{{ $t('docker.composeHint') }}</p>
          <pre v-if="composeOutput" class="dp-output">{{ composeOutput }}</pre>
          <div v-if="!composeOutput" class="dp-empty">{{ $t('docker.composeEmpty') }}</div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- 日志抽屉 -->
    <el-drawer v-model="logsVisible" :title="logsTitle" size="620px" direction="rtl">
      <div class="dp-logbar">
        <el-select v-model="logTail" size="small" style="width:110px" @change="loadLogs">
          <el-option :value="100" label="100" />
          <el-option :value="200" label="200" />
          <el-option :value="500" label="500" />
          <el-option :value="1000" label="1000" />
        </el-select>
        <el-button size="small" @click="loadLogs" :loading="logLoading">{{ $t('common.refresh') }}</el-button>
        <el-checkbox v-model="logFollow" size="small">{{ $t('docker.follow') }}</el-checkbox>
      </div>
      <pre class="dp-logs">{{ logsText || '...' }}</pre>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const props = defineProps<{ deviceId: string }>()

const tab = ref('containers')
const loading = ref(false)
const status = ref<any>(null)
const containers = ref<any[]>([])
const images = ref<any[]>([])
const stats = ref<any[]>([])
const showAll = ref(true)
const filter = ref('')

const statsLoading = ref(false)
const pullImage = ref('')
const pulling = ref(false)
const pullOutput = ref('')
const pruning = ref(false)

const composeFile = ref('/root/docker-compose.yml')
const composing = ref(false)
const composeOutput = ref('')

const logsVisible = ref(false)
const logsTitle = ref('')
const logsText = ref('')
const logsTarget = ref('')
const logTail = ref(200)
const logLoading = ref(false)
const logFollow = ref(false)

let followTimer: any = null

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return containers.value
  return containers.value.filter(c =>
    (c.name || '').toLowerCase().includes(q) || (c.image || '').toLowerCase().includes(q))
})

function stateLabel(s: string) {
  const map: Record<string, string> = {
    running: 'running', exited: 'exited', created: 'created',
    paused: 'paused', restarting: 'restarting', dead: 'dead',
  }
  return map[s] || s || 'unknown'
}
function stateType(s: string) {
  if (s === 'running') return 'success'
  if (s === 'paused' || s === 'restarting') return 'warning'
  if (s === 'dead') return 'danger'
  return 'info'
}
function shortPorts(p: string) {
  return (p || '').split(',').map((x: string) => x.trim().replace(/\s*->\s*/, '→')).join(' · ').slice(0, 70)
}
function statOf(name: string) {
  return stats.value.find(s => s.name === name)
}

const errMsg = (e: any, fb: string) => e?.response?.data?.message || e?.message || fb

async function refresh() {
  loading.value = true
  try {
    const st = await api.get(`/v2/docker/${props.deviceId}/status`) as any
    status.value = st.data
    if (!st.data?.available) { containers.value = []; images.value = []; return }
    const [c, i] = await Promise.all([
      api.get(`/v2/docker/${props.deviceId}/containers`, { params: { all: showAll.value ? 1 : 0 } }) as any,
      api.get(`/v2/docker/${props.deviceId}/images`) as any,
    ])
    containers.value = c.data?.containers || []
    images.value = i.data?.images || []
    if (containers.value.some(x => x.state === 'running')) loadStats()
  } catch (e: any) {
    status.value = { available: false, error: errMsg(e, '连接失败') }
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    const r = await api.get(`/v2/docker/${props.deviceId}/stats`, { timeout: 60000 }) as any
    stats.value = r.data?.stats || []
  } catch { stats.value = [] }
  finally { statsLoading.value = false }
}

async function doAction(c: any, action: string) {
  try {
    const r = await api.post(`/v2/docker/${props.deviceId}/containers/${encodeURIComponent(c.name)}/action`, { action }, { timeout: 60000 }) as any
    ElMessage.success(`${action} ${c.name} ✓`)
    if (r?.data?.result) ElMessage({ message: r.data.result, type: 'info', duration: 2000 })
    refresh()
  } catch (e: any) {
    ElMessage.error(errMsg(e, `${action} 失败`))
  }
}

async function doRemove(c: any) {
  try {
    await ElMessageBox.confirm(`${t_remove(c.name)}`, t_confirm(), { type: 'warning' })
  } catch { return }
  try {
    await api.post(`/v2/docker/${props.deviceId}/containers/${encodeURIComponent(c.name)}/remove`, { force: true }, { timeout: 60000 })
    ElMessage.success('✓')
    refresh()
  } catch (e: any) {
    ElMessage.error(errMsg(e, '删除失败'))
  }
}

const t_remove = (n: string) => `确定删除容器 ${n}？`
const t_confirm = () => '确认'

function openLogs(c: any) {
  logsTarget.value = c.name
  logsTitle.value = `${c.name} · logs`
  logsVisible.value = true
  loadLogs()
}

async function loadLogs() {
  if (!logsTarget.value) return
  logLoading.value = true
  try {
    const r = await api.get(`/v2/docker/${props.deviceId}/containers/${encodeURIComponent(logsTarget.value)}/logs`, {
      params: { tail: logTail.value }, timeout: 30000,
    }) as any
    logsText.value = r.data?.logs || '(空)'
  } catch (e: any) {
    logsText.value = errMsg(e, '读取日志失败')
  } finally {
    logLoading.value = false
  }
}

async function doPull() {
  const img = pullImage.value.trim()
  if (!img) return
  pulling.value = true
  pullOutput.value = `$ docker pull ${img}\n...`
  try {
    const r = await api.post(`/v2/docker/${props.deviceId}/images/pull`, { image: img }, { timeout: 300000 }) as any
    pullOutput.value = r.data?.output || '(完成)'
    ElMessage.success('✓')
    refresh()
  } catch (e: any) {
    pullOutput.value = errMsg(e, '拉取失败')
    ElMessage.error('拉取失败')
  } finally {
    pulling.value = false
  }
}

async function doRemoveImage(im: any) {
  const ref = im.dangling ? im.id : `${im.repository}:${im.tag}`
  try {
    await ElMessageBox.confirm(`确定删除镜像 ${ref}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    await api.post(`/v2/docker/${props.deviceId}/images/remove`, { image: ref, force: true }, { timeout: 60000 })
    ElMessage.success('✓')
    refresh()
  } catch (e: any) {
    ElMessage.error(errMsg(e, '删除失败'))
  }
}

async function doPrune() {
  try {
    await ElMessageBox.confirm('清理悬空镜像（<none>:<none>）？', '确认', { type: 'warning' })
  } catch { return }
  pruning.value = true
  try {
    const r = await api.post(`/v2/docker/${props.deviceId}/images/prune`, { target: 'image' }, { timeout: 120000 }) as any
    ElMessage.success(r.data?.result || '✓')
    refresh()
  } catch (e: any) {
    ElMessage.error(errMsg(e, '清理失败'))
  } finally { pruning.value = false }
}

async function doCompose(action: string) {
  if (!composeFile.value.trim()) return
  if (action === 'down') {
    try {
      await ElMessageBox.confirm(`docker compose down (${composeFile.value})？会停止并删除容器`, '确认', { type: 'warning' })
    } catch { return }
  }
  composing.value = true
  composeOutput.value = `$ docker compose -f ${composeFile.value} ${action}\n...`
  try {
    const r = await api.post(`/v2/docker/${props.deviceId}/compose`, {
      file: composeFile.value.trim(), action,
    }, { timeout: 300000 }) as any
    composeOutput.value = r.data?.output || '(完成)'
    if (action !== 'ps' && action !== 'logs' && action !== 'config') refresh()
  } catch (e: any) {
    composeOutput.value = errMsg(e, 'compose 执行失败')
  } finally { composing.value = false }
}

onMounted(() => {
  refresh()
  followTimer = setInterval(() => {
    if (logFollow.value && logsVisible.value) loadLogs()
  }, 5000)
})

onUnmounted(() => clearInterval(followTimer))
</script>

<style scoped>
.dp { padding: 0; overflow: hidden; margin-top: 20px; }
.dp-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #eef0f4; }
.dp-title { font-weight: 500; font-size: 14px; display: flex; align-items: center; }
.dp-tools { display: flex; align-items: center; gap: 8px; }
.dp-tabs { padding: 0 16px 12px; }
.dp-tabs :deep(.el-tabs__header) { margin: 0 0 12px; }
.dp-filter { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.dp-hint { font-size: 12px; color: #a0a4ad; margin: 0 0 10px; }
.dp-empty { padding: 32px; text-align: center; color: #b8bcc4; font-size: 13px; }
.dp-empty-ic { font-size: 34px; margin-bottom: 6px; }
.dp-empty-hint { font-size: 12px; color: #c8ccd4; margin-top: 4px; }
.dp-list { max-height: 460px; overflow-y: auto; }
.dp-row { padding: 9px 10px; border-bottom: 1px solid #f5f6f8; }
.dp-row:hover { background: #f7faff; }
.dp-row-main { display: flex; align-items: center; gap: 10px; }
.dp-state-dot { width: 8px; height: 8px; border-radius: 50%; background: #c8ccd4; flex-shrink: 0; }
.dp-state-dot.running { background: #15C39A; }
.dp-state-dot.exited { background: #c8ccd4; }
.dp-state-dot.restarting, .dp-state-dot.paused { background: #E6A23C; }
.dp-state-dot.dead { background: #F56C6C; }
.dp-name { font-size: 13px; font-weight: 600; color: #303133; font-family: ui-monospace, monospace; }
.dp-tag { color: #909399; font-weight: 400; }
.dp-image { font-size: 12px; color: #909399; font-family: ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
.dp-state { flex-shrink: 0; }
.dp-row-meta { display: flex; gap: 14px; margin: 4px 0 0 18px; font-size: 12px; color: #a0a4ad; flex-wrap: wrap; }
.dp-ports { font-family: ui-monospace, monospace; color: #7f8290; }
.dp-stat { color: #4F7CFF; }
.dp-created { font-size: 12px; color: #a0a4ad; margin-left: auto; }
.dp-acts { display: flex; gap: 2px; margin-top: 4px; padding-left: 10px; }
.dp-acts .danger :deep(span), .danger :deep(span) { color: #F56C6C; }
.dp-output { font-size: 12px; background: #1f2330; color: #d7dae0; padding: 10px 12px; border-radius: 6px; max-height: 300px; overflow: auto; font-family: ui-monospace, monospace; margin: 0 0 10px; white-space: pre-wrap; }
.dp-logbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.dp-logs { font-size: 12px; background: #1f2330; color: #d7dae0; padding: 12px; border-radius: 6px; height: calc(100vh - 180px); overflow: auto; font-family: ui-monospace, monospace; margin: 0; white-space: pre-wrap; }
</style>
