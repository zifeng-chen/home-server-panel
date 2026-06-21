<template>
  <header class="topbar">
    <div class="metrics">
      <div class="metric" v-for="m in metricsList" :key="m.key">
        <el-icon :size="14" :color="m.color"><component :is="m.icon" /></el-icon>
        <span class="val">{{ m.value }}</span>
        <span class="lbl">{{ m.label }}</span>
      </div>
    </div>
    <div class="user-area">
      <el-button link class="theme-btn" @click="toggleTheme" :title="$t('topbar.theme')">
        <el-icon :size="16"><component :is="isDark ? Sunny : Moon" /></el-icon>
      </el-button>
      <el-dropdown trigger="click" @command="handleCmd">
        <span class="user-btn">
          <el-icon :size="16"><UserFilled /></el-icon>
          {{ auth.user?.username || 'admin' }}
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="lang-zh">🇨🇳 中文</el-dropdown-item>
            <el-dropdown-item command="lang-en">🇺🇸 English</el-dropdown-item>
            <el-dropdown-item v-if="auth.isAdmin" command="users" divided>
              <el-icon><UserFilled /></el-icon> {{ $t('topbar.userMgmt') }}
            </el-dropdown-item>
            <el-dropdown-item command="logout" divided>
              <el-icon><SwitchButton /></el-icon> {{ $t('auth.logout') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSystemStore } from '../stores/system'
import { useAuthStore } from '../stores/auth'
import { Cpu, Memo, Download, Upload, TrendCharts, Timer, UserFilled, SwitchButton, Moon, Sunny } from '@element-plus/icons-vue'

const sys  = useSystemStore()
const auth = useAuthStore()
const router = useRouter()
const { locale } = useI18n()

const loadColor = computed(() => {
  const v = sys.load[0] || 0
  if (v > 2) return 'var(--accent-red)'
  if (v > 1) return 'var(--accent-orange)'
  return 'var(--text-tertiary)'
})

function fmtBytes(b: number) {
  if (!b || b < 0) return '0 B'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

function fmtUptime(s: number) {
  if (!s || s < 0) return '0秒'
  if (s < 60) return Math.floor(s) + '秒'
  if (s < 3600) return Math.floor(s / 60) + '分' + Math.floor(s % 60) + '秒'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h + '时' + m + '分' + sec + '秒'
}

const metricsList = computed(() => [
  { key: 'cpu',   icon: Cpu,     color: 'var(--accent)',       value: sys.cpu.toFixed(0) + '%',      label: 'CPU' },
  { key: 'mem',   icon: Memo,    color: 'var(--accent-green)',  value: sys.memPct.toFixed(0) + '%',    label: '内存' },
  { key: 'down',  icon: Download,color: 'var(--accent-purple)', value: fmtBytes(sys.netDown) + '/s', label: '下行' },
  { key: 'up',    icon: Upload,  color: 'var(--accent-teal)',   value: fmtBytes(sys.netUp) + '/s',   label: '上行' },
  { key: 'load',  icon: TrendCharts, color: loadColor.value,    value: (sys.load[0] || 0).toFixed(2), label: '负载' },
  { key: 'uptime',icon: Timer,   color: 'var(--text-tertiary)',  value: fmtUptime(sys.uptime),         label: '运行' },
])

const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('hsp_theme', isDark.value ? 'dark' : 'light')
}

function handleCmd(cmd: string) {
  if (cmd === 'logout') {
    auth.logout()
    sys.stopPolling()
    router.push('/login')
  } else if (cmd === 'users') {
    router.push('/users')
  } else if (cmd === 'lang-zh') {
    locale.value = 'zh-CN'
    localStorage.setItem('hsp_lang', 'zh-CN')
    location.reload()
  } else if (cmd === 'lang-en') {
    locale.value = 'en-US'
    localStorage.setItem('hsp_lang', 'en-US')
    location.reload()
  }
}
</script>

<style scoped>
.topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bg-glass);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  z-index: 10;
}
.metrics {
  display: flex;
  gap: 24px;
  align-items: center;
}
.metric {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: transform var(--dur-fast);
}
.metric:hover { transform: translateY(-1px); }
.metric .val {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  min-width: 48px;
}
.metric .lbl {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.user-area { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.theme-btn {
  color: var(--text-tertiary);
  padding: 6px;
  border-radius: var(--radius-md);
  transition: all var(--dur-fast);
}
.theme-btn:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--dur-fast);
}
.user-btn:hover {
  background: var(--border-color);
  color: var(--text-primary);
}
</style>
