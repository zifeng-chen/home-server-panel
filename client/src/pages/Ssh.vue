<template>
  <div class="ssh-layout">
    <!-- 左侧连接列表 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h3>{{ $t('ssh.title') }}</h3>
        <el-button size="small" type="primary" @click="showAdd" :icon="Plus">{{ $t('common.add') }}</el-button>
      </div>
      <div class="config-list">
        <div
          v-for="cfg in configs"
          :key="cfg.id"
          class="config-card"
          :class="{ active: activeId === cfg.id, connected: activeId === cfg.id && wsReady }"
        >
          <div class="cfg-top">
            <div class="cfg-name">{{ cfg.name || cfg.host }}</div>
            <div class="cfg-actions">
              <el-tooltip :content="activeId === cfg.id && wsReady ? $t('ssh.disconnect') : $t('ssh.connect')" placement="top">
                <el-button
                  size="small" circle
                  :type="activeId === cfg.id && wsReady ? 'danger' : 'primary'"
                  @click="activeId === cfg.id && wsReady ? disconnect() : doConnect(cfg)"
                  :loading="connecting === cfg.id"
                  :icon="activeId === cfg.id && wsReady ? SwitchButton : Connection"
                />
              </el-tooltip>
              <el-tooltip :content="$t('common.edit')" placement="top">
                <el-button size="small" circle @click="showEdit(cfg)" :icon="Edit" />
              </el-tooltip>
              <el-tooltip :content="$t('common.delete')" placement="top">
                <el-button size="small" circle type="danger" @click="confirmDelete(cfg)" :icon="Delete" />
              </el-tooltip>
            </div>
          </div>
          <div class="cfg-detail">{{ cfg.username }}@{{ cfg.host }}:{{ cfg.port || 22 }}</div>
        </div>
        <div v-if="!configs.length" class="empty-hint">{{ $t('common.noData') }}</div>
      </div>
    </div>

    <!-- 右侧终端区域 -->
    <div class="terminal-area" ref="termContainer">
      <div v-if="!activeId" class="term-placeholder">
        <el-icon :size="48" color="var(--text-tertiary)"><Monitor /></el-icon>
        <p>{{ $t('ssh.subtitle') }}</p>
      </div>
      <template v-else>
        <div class="term-bar">
          <span class="term-bar-left">
            <span class="term-dot" :style="{ background: wsReady ? '#4ade80' : '#f87171' }"></span>
            {{ currentLabel }}
          </span>
          <el-button link size="small" @click="disconnect">{{ $t('ssh.disconnect') }}</el-button>
        </div>
        <div class="term-wrapper" ref="termWrapper">
          <div ref="termEl" class="term-box"></div>
          <div v-if="!wsReady && !wsError" class="term-overlay">
            <el-icon class="spin" :size="24"><Loading /></el-icon>
            <span>{{ $t('ssh.connecting') }}</span>
          </div>
          <div v-if="wsError" class="term-overlay clickable" @click="reconnect">
            <el-icon :size="24"><WarningFilled /></el-icon>
            <span>{{ wsError }}</span>
            <span class="reconnect-hint">{{ $t('ssh.reconnect') }}</span>
          </div>
          <div v-if="disconnected" class="term-overlay clickable" @click="reconnect">
            <el-icon :size="24"><Link /></el-icon>
            <span>{{ $t('ssh.disconnected') }}</span>
            <span class="reconnect-hint">{{ $t('ssh.reconnect') }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? $t('common.edit') : $t('common.add')" width="420">
      <el-form :model="form" label-width="80px">
        <el-form-item :label="$t('common.name')"><el-input v-model="form.name" placeholder="" /></el-form-item>
        <el-form-item :label="$t('ssh.host')"><el-input v-model="form.host" placeholder="192.168.1.1" /></el-form-item>
        <el-form-item :label="$t('ssh.port')"><el-input-number v-model="form.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item :label="$t('ssh.username')"><el-input v-model="form.username" placeholder="root" /></el-form-item>
        <el-form-item :label="$t('ssh.password')"><el-input v-model="form.password" type="password" show-password placeholder="" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 密码输入对话框 -->
    <el-dialog v-model="pwVisible" :title="$t('ssh.password')" width="320">
      <el-input
        ref="pwInputRef"
        v-model="pwInput"
        type="password"
        show-password
        :placeholder="$t('ssh.password')"
        @keyup.enter="doConnectWithPw"
      />
      <template #footer>
        <el-button @click="pwVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doConnectWithPw" :loading="connecting !== null">{{ $t('ssh.connect') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Monitor, Loading, WarningFilled, Link, SwitchButton, Connection, Edit, Delete } from '@element-plus/icons-vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import api from '../api'

// ============ 终端相关 ============
const termWrapper = ref<HTMLElement | null>(null)
const termEl = ref<HTMLElement | null>(null)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null

// ============ 状态 ============
const configs = ref<any[]>([])
const activeId = ref<number | null>(null)
const connecting = ref<number | null>(null)
const wsReady = ref(false)
const wsError = ref('')
const disconnected = ref(false)
const currentLabel = ref('')
const pwTarget = ref<any>(null)

const dialogVisible = ref(false)
const editId = ref<number | null>(null)
const saving = ref(false)
const form = ref({ name: '', host: '', port: 22, username: 'root', password: '' })

const pwVisible = ref(false)
const pwInput = ref('')
const pwInputRef = ref<any>(null)

// ============ 数据加载 ============
async function load() {
  try {
    const res = await api.get('/ssh/config') as any
    if (res.success) configs.value = res.data || []
  } catch { /* */ }
}

// ============ 配置 CRUD ============
function showAdd() {
  editId.value = null
  form.value = { name: '', host: '', port: 22, username: 'root', password: '' }
  dialogVisible.value = true
}

function showEdit(row: any) {
  editId.value = row.id
  form.value = { ...row, password: '' }
  dialogVisible.value = true
}

async function doSave() {
  if (!form.value.host) return ElMessage.warning($t('common.error'))
  saving.value = true
  try {
    let res: any
    const payload: any = { ...form.value }
    if (!payload.password) delete (payload as any).password
    if (editId.value) {
      res = await api.put(`/ssh/config/${editId.value}`, payload)
    } else {
      res = await api.post('/ssh/config', payload)
    }
    if (res.success) {
      ElMessage.success($t('common.success'))
      dialogVisible.value = false
      await load()
    } else {
      ElMessage.error(res.message || $t('common.error'))
    }
  } catch {
    ElMessage.error($t('common.error'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row: any) {
  try {
    await ElMessageBox.confirm($t('common.confirmDelete'), $t('common.delete'))
    const res = await api.delete(`/ssh/config/${row.id}`) as any
    if (res.success) { ElMessage.success($t('common.success')); await load() } else ElMessage.error(res.message || $t('common.error'))
  } catch { /* cancel */ }
}

// ============ SSH 连接 ============
async function fetchConfigDetail(id: number) {
  const res = await api.get(`/ssh/config/${id}`) as any
  if (res.success) return res.data
  return null
}

async function doConnect(cfg: any) {
  if (ws) disconnect()

  // 先获取完整配置（含密码）
  const detail = await fetchConfigDetail(cfg.id)
  if (!detail) { ElMessage.error($t('common.error')); return }

  pwTarget.value = detail
  if (detail.password && detail.password !== '••••••') {
    startConnection(detail)
  } else {
    pwInput.value = ''
    pwVisible.value = true
    nextTick(() => pwInputRef.value?.focus?.())
  }
}

function doConnectWithPw() {
  if (pwTarget.value) {
    const detail = { ...pwTarget.value, password: pwInput.value }
    startConnection(detail)
  }
  pwVisible.value = false
}

function startConnection(detail: any) {
  const id = detail.id
  connecting.value = id
  activeId.value = id
  wsError.value = ''
  disconnected.value = false
  wsReady.value = false
  currentLabel.value = `${detail.username}@${detail.host}:${detail.port || 22}`

  // 延迟初始化终端（等待 DOM 渲染）
  nextTick(() => initTerminal(detail))
}

function initTerminal(detail: any) {
  // 如果已存在终端实例则销毁
  if (term) {
    term.dispose()
    term = null
    fitAddon = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (!termEl.value) return

  // 创建 xterm 实例
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'underline',
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      selectionBackground: '#33467c',
      black: '#32344a',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#ad8ee6',
      cyan: '#449dab',
      white: '#787c99',
      brightBlack: '#444b6a',
      brightRed: '#ff7a93',
      brightGreen: '#b9f27c',
      brightYellow: '#ff9e64',
      brightBlue: '#7da6ff',
      brightMagenta: '#bb9af7',
      brightCyan: '#0db9d7',
      brightWhite: '#acb0d0'
    },
    allowProposedApi: true
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termEl.value)

  // 自适应容器
  nextTick(() => {
    try { fitAddon!.fit() } catch {}
  })

  // 监听容器尺寸变化
  resizeObserver = new ResizeObserver(() => {
    try { fitAddon!.fit() } catch {}
    if (ws && ws.readyState === WebSocket.OPEN && term) {
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      }))
    }
  })
  resizeObserver.observe(termWrapper.value!)

  // 键盘输入 → WebSocket
  term.onData((data: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  // 建立 WebSocket 连接
  connectWebSocket(detail)
}

function connectWebSocket(detail: any) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${location.host}/ws/ssh`
  ws = new WebSocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    connecting.value = null
    ws!.send(JSON.stringify({
      type: 'connect',
      host: detail.host,
      port: detail.port || 22,
      username: detail.username,
      password: detail.password,
      cols: term?.cols || 80,
      rows: term?.rows || 24
    }))
  }

  ws.onmessage = (event: MessageEvent) => {
    // 二进制数据 = 终端输出
    if (event.data instanceof ArrayBuffer) {
      const uint8 = new Uint8Array(event.data)
      term?.write(uint8)
      return
    }

    // JSON 控制消息
    try {
      const msg = JSON.parse(event.data as string)
      switch (msg.type) {
        case 'ready':
          wsReady.value = true
          disconnected.value = false
          wsError.value = ''
          term?.focus()
          break
        case 'error':
          wsError.value = msg.message || $t('common.error')
          wsReady.value = false
          break
        case 'status':
          if (msg.status === 'disconnected' || msg.status === 'shell-closed') {
            wsReady.value = false
            disconnected.value = true
          } else if (msg.status === 'error') {
            wsReady.value = false
            wsError.value = $t('common.error')
          }
          break
      }
    } catch {
      // 可能是纯文本数据，写入终端
      term?.write(event.data as string)
    }
  }

  ws.onerror = () => {
    wsError.value = $t('common.error')
    wsReady.value = false
    connecting.value = null
  }

  ws.onclose = () => {
    if (!disconnected.value && !wsError.value) {
      disconnected.value = true
    }
    wsReady.value = false
    connecting.value = null
  }
}

// ============ 断开/重连 ============
function disconnect() {
  if (ws) {
    try { ws.send(JSON.stringify({ type: 'disconnect' })) } catch {}
    ws.close()
    ws = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (term) {
    term.dispose()
    term = null
    fitAddon = null
  }
  activeId.value = null
  wsReady.value = false
  wsError.value = ''
  disconnected.value = false
  currentLabel.value = ''
}

function reconnect() {
  if (!activeId.value) return
  const cfg = configs.value.find(c => c.id === activeId.value)
  if (!cfg) return
  doConnect(cfg)
}

// ============ 生命周期 ============
onMounted(load)

onUnmounted(() => {
  disconnect()
})
</script>

<style scoped>
.ssh-layout {
  display: flex;
  height: calc(100vh - 48px - 48px); /* topbar 48 + content padding 24*2 */
  gap: 0;
}

/* 左侧边栏 */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.config-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-card {
  background: var(--bg-base);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  border: 1px solid transparent;
  transition: border-color var(--dur-fast);
}

.config-card.active {
  border-color: var(--accent);
}

.config-card.connected {
  border-color: var(--accent-green);
}

.cfg-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.cfg-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfg-detail {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.cfg-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.empty-hint {
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 32px 0;
}

/* 右侧终端 */
.terminal-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1b26;
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
  overflow: hidden;
  min-width: 0;
}

.term-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.term-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 14px;
  background: #24283b;
  font-size: 12px;
  color: #a9b1d6;
  flex-shrink: 0;
}

.term-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.term-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.term-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.term-box {
  position: absolute;
  inset: 0;
  padding: 4px 8px;
}

/* xterm overrides */
.term-box :deep(.xterm) {
  height: 100%;
}

.term-box :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.term-box :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 6px;
}

.term-box :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: #414868;
  border-radius: 3px;
}

/* 蒙层 */
.term-overlay {
  position: absolute;
  inset: 0;
  background: rgba(26, 27, 38, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #a9b1d6;
  font-size: 14px;
  z-index: 10;
  backdrop-filter: blur(4px);
}

.term-overlay.clickable {
  cursor: pointer;
}

.term-overlay.clickable:hover {
  background: rgba(26, 27, 38, 0.75);
}

.reconnect-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.spin {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg) }
  to { transform: rotate(360deg) }
}
</style>
