<template>
  <div class="card wt">
    <!-- 头部 -->
    <div class="wt-head">
      <span class="wt-title">
        <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:6px;vertical-align:-3px">
          <rect x="2" y="4" width="20" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
          <path d="M6 9l3 3-3 3M12 15h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ $t('terminal.title') }}
        <span class="wt-host">{{ host || deviceId }}</span>
      </span>
      <div class="wt-tools">
        <el-button size="small" @click="newTab">＋ {{ $t('terminal.newTab') }}</el-button>
        <el-button size="small" :disabled="!active" @click="reconnect">{{ $t('terminal.reconnect') }}</el-button>
        <el-button size="small" :disabled="!active" @click="doCopy">{{ $t('terminal.copy') }}</el-button>
        <el-button size="small" :disabled="!active" @click="doPaste">{{ $t('terminal.paste') }}</el-button>
        <el-button size="small" :disabled="!active" @click="doClear">{{ $t('terminal.clear') }}</el-button>
      </div>
    </div>

    <!-- 标签栏 -->
    <div class="wt-tabs">
      <div v-for="tb in tabs" :key="tb.id" class="wt-tab" :class="{ active: tb.id === activeId }" @click="activeId = tb.id">
        <span class="wt-dot" :class="tb.connected ? 'on' : 'off'"></span>
        <span class="wt-tab-name">{{ tb.title }}</span>
        <span class="wt-x" @click.stop="closeTab(tb)">×</span>
      </div>
      <div v-if="!tabs.length" class="wt-empty-hint">{{ $t('terminal.noTab') }}</div>
    </div>

    <!-- 终端容器 -->
    <div class="wt-body">
      <div v-for="tb in tabs" v-show="tb.id === activeId" :key="tb.id" class="wt-term"
           :ref="(el: any) => registerEl(tb.id, el)"></div>
      <div v-if="!tabs.length" class="wt-placeholder">
        <el-button type="primary" plain size="small" @click="newTab">{{ $t('terminal.open') }}</el-button>
        <p class="wt-note">{{ $t('terminal.lineModeNote') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'

const props = defineProps<{ deviceId: string; host?: string }>()

interface Tab {
  id: string
  title: string
  term: any
  fit: any
  el: HTMLElement | null
  ws: WebSocket | null
  ro: ResizeObserver | null
  connected: boolean
  manualClose: boolean
  retries: number
  seq: number
}

const tabs = ref<Tab[]>([])
const activeId = ref('')
const seq = ref(0)

const active = computed(() => tabs.value.find(t => t.id === activeId.value) || null)

const THEME = {
  background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#32344a', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
  blue: '#7aa2f7', magenta: '#ad8ee6', cyan: '#449dab', white: '#787c99',
  brightBlack: '#444b6a', brightRed: '#ff7a93', brightGreen: '#b9f27c',
  brightYellow: '#ff9e64', brightBlue: '#7da6ff', brightMagenta: '#bb9af7',
  brightCyan: '#0db9d7', brightWhite: '#acb0d0',
}

function registerEl(id: string, el: any) {
  const tb = tabs.value.find(t => t.id === id)
  if (!tb) return
  tb.el = (el as HTMLElement) || null
  if (tb.el && !tb.term) {
    nextTick(() => initTerm(tb))
  }
}

function newTab() {
  seq.value += 1
  const id = `t${seq.value}_${Date.now().toString(36)}`
  const tb: Tab = {
    id, title: `${props.host || props.deviceId} #${seq.value}`,
    term: null, fit: null, el: null, ws: null, ro: null,
    connected: false, manualClose: false, retries: 0, seq: seq.value,
  }
  tabs.value.push(tb)
  activeId.value = id
}

function initTerm(tb: Tab) {
  if (!tb.el || tb.term) return
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: THEME,
    scrollback: 5000,
    convertEol: false,
    allowProposedApi: true,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(tb.el)
  try { fit.fit() } catch { /* ignore */ }

  term.onData((data: string) => {
    if (tb.ws && tb.ws.readyState === WebSocket.OPEN) {
      tb.ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  tb.term = term
  tb.fit = fit

  const ro = new ResizeObserver(() => {
    try { fit.fit() } catch { /* ignore */ }
    if (tb.ws && tb.ws.readyState === WebSocket.OPEN) {
      tb.ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
  })
  ro.observe(tb.el)
  tb.ro = ro

  connect(tb)
  nextTick(() => term.focus())
}

function connect(tb: Tab) {
  if (tb.ws) { try { tb.ws.close() } catch { /* ignore */ } }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const q = new URLSearchParams({ id: props.deviceId })
  if (props.host) q.set('host', props.host)
  const ws = new WebSocket(`${proto}//${location.host}/api/v2/terminal/ws?${q.toString()}`)
  tb.ws = ws

  ws.onopen = () => { tb.retries = 0 }

  ws.onmessage = (ev: MessageEvent) => {
    let msg: any
    try { msg = JSON.parse(ev.data as string) } catch {
      tb.term?.write(ev.data as string)
      return
    }
    switch (msg.type) {
      case 'ready':
        tb.connected = true
        break
      case 'data':
        tb.term?.write(msg.data || '')
        break
      case 'error':
        tb.term?.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`)
        break
      case 'pong':
        break
      default:
        break
    }
  }

  ws.onclose = () => {
    tb.connected = false
    if (tb.manualClose) return
    if (tb.retries >= 5) {
      tb.term?.write('\r\n\x1b[33m[连接已断开，重试上限，请手动重连]\x1b[0m\r\n')
      return
    }
    tb.retries += 1
    const delay = Math.min(1000 * tb.retries, 5000)
    tb.term?.write(`\r\n\x1b[33m[连接断开，${delay / 1000}s 后重连 #${tb.retries}]\x1b[0m\r\n`)
    setTimeout(() => { if (!tb.manualClose) connect(tb) }, delay)
  }

  ws.onerror = () => { tb.connected = false }
}

function reconnect() {
  const tb = active.value
  if (!tb) return
  tb.retries = 0
  tb.manualClose = false
  tb.term?.write('\r\n\x1b[36m[重新连接...]\x1b[0m\r\n')
  connect(tb)
}

function closeTab(tb: Tab) {
  tb.manualClose = true
  try { tb.ws?.close() } catch { /* ignore */ }
  try { tb.ro?.disconnect() } catch { /* ignore */ }
  try { tb.term?.dispose() } catch { /* ignore */ }
  tabs.value = tabs.value.filter(t => t.id !== tb.id)
  if (activeId.value === tb.id) activeId.value = tabs.value.length ? tabs.value[tabs.value.length - 1].id : ''
}

function doClear() {
  active.value?.term?.clear()
}

async function doCopy() {
  const tb = active.value
  if (!tb) return
  const sel = tb.term?.getSelection?.() || ''
  if (!sel) { ElMessage.info('请先用鼠标选中终端内容'); return }
  try {
    await navigator.clipboard.writeText(sel)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('剪贴板不可用（需 HTTPS 或 localhost）')
  }
}

async function doPaste() {
  const tb = active.value
  if (!tb) return
  try {
    const text = await navigator.clipboard.readText()
    if (text && tb.ws && tb.ws.readyState === WebSocket.OPEN) {
      tb.ws.send(JSON.stringify({ type: 'input', data: text }))
    }
  } catch {
    ElMessage.warning('剪贴板不可读（需 HTTPS 或 localhost）')
  }
}

onBeforeUnmount(() => {
  for (const tb of tabs.value) {
    tb.manualClose = true
    try { tb.ws?.close() } catch { /* ignore */ }
    try { tb.ro?.disconnect() } catch { /* ignore */ }
    try { tb.term?.dispose() } catch { /* ignore */ }
  }
  tabs.value = []
})
</script>

<style scoped>
.wt { padding: 0; overflow: hidden; margin-top: 20px; }
.wt-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #eef0f4; flex-wrap: wrap; }
.wt-title { font-weight: 500; font-size: 14px; display: flex; align-items: center; }
.wt-host { font-size: 12px; color: #909399; margin-left: 8px; font-family: ui-monospace, monospace; }
.wt-tools { display: flex; gap: 6px; flex-wrap: wrap; }
.wt-tabs { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fafbfc; border-bottom: 1px solid #eef0f4; overflow-x: auto; }
.wt-tab { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px 6px 0 0; font-size: 12px; color: #606266; cursor: pointer; background: #f0f2f5; white-space: nowrap; }
.wt-tab.active { background: #1a1b26; color: #c0caf5; }
.wt-dot { width: 7px; height: 7px; border-radius: 50%; background: #c8ccd4; }
.wt-dot.on { background: #15C39A; }
.wt-x { opacity: 0.5; padding: 0 2px; }
.wt-x:hover { opacity: 1; color: #F56C6C; }
.wt-empty-hint { font-size: 12px; color: #b8bcc4; }
.wt-body { background: #1a1b26; padding: 8px 10px; min-height: 380px; }
.wt-term { height: 420px; }
.wt-term :deep(.xterm) { height: 100%; padding: 4px; }
.wt-term :deep(.xterm-viewport) { background-color: transparent !important; }
.wt-term :deep(.xterm-viewport::-webkit-scrollbar) { width: 8px; }
.wt-term :deep(.xterm-viewport::-webkit-scrollbar-thumb) { background: #444b6a; border-radius: 4px; }
.wt-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 380px; }
.wt-note { font-size: 12px; color: #565f89; margin: 0; }
</style>
