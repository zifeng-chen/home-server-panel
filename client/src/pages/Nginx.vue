<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('nginx.title') }}</h2>
        <p class="sub">{{ statusText }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="!installed" type="primary" @click="installGuide" :loading="loadingInst">安装指南</el-button>
        <template v-else>
          <el-button @click="doAction('start')" :icon="VideoPlay" :disabled="running" :loading="acting === 'start'">启动</el-button>
          <el-button @click="doAction('stop')" :icon="VideoPause" :disabled="!running" :loading="acting === 'stop'">停止</el-button>
          <el-button @click="doAction('reload')" :icon="Refresh" :loading="acting === 'reload'">重载</el-button>
          <el-button @click="doAction('restart')" :icon="RefreshRight" :loading="acting === 'restart'">重启</el-button>
        </template>
      </div>
    </div>

    <!-- 状态卡片 -->
    <div class="card" v-if="installed">
      <div class="info-grid">
        <div class="info-item"><span class="lbl">版本</span><span class="val">{{ nginxVer }}</span></div>
        <div class="info-item"><span class="lbl">配置路径</span><span class="val mono">{{ confPath }}</span></div>
        <div class="info-item"><span class="lbl">PID</span><span class="val mono">{{ pid || '--' }}</span></div>
        <div class="info-item"><span class="lbl">运行用户</span><span class="val">{{ nginxUser }}</span></div>
      </div>
    </div>

    <!-- 安装指南 -->
    <div class="card" v-if="showGuide">
      <h3>安装指南</h3>
      <pre class="guide">{{ guideText }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, VideoPause, Refresh, RefreshRight } from '@element-plus/icons-vue'
import api from '../api'

const installed = ref(false)
const running   = ref(false)
const nginxVer  = ref('')
const confPath  = ref('')
const pid       = ref<string | number>('')
const nginxUser = ref('')
const acting    = ref('')
const loadingInst = ref(false)

const showGuide = ref(false)
const guideText = ref('')

const statusText = computed(() => {
  if (!installed.value) return 'Nginx 未安装'
  return running.value ? 'Nginx 运行中' : 'Nginx 已停止'
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
      nginxUser.value = d.user || '--'
    }
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

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.card h3 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .lbl { font-size: 12px; color: var(--text-tertiary); }
.info-item .val { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.mono { font-family: var(--font-mono); font-size: 13px; }
.guide { background: var(--bg-base); padding: 16px; border-radius: var(--radius-sm); font-size: 12px; font-family: var(--font-mono); white-space: pre-wrap; word-break: break-all; overflow-x: auto; max-height: 400px; }
</style>
