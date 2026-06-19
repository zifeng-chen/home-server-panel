<template>
  <aside class="sidebar">
    <div class="logo">🖥</div>
    <nav class="nav">
      <router-link v-for="item in navItems" :key="item.path" :to="item.path"
        class="nav-item" :class="{ active: $route.path === item.path || (item.path !== '/' && $route.path.startsWith(item.path)) }">
        <el-icon :size="20"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebar-footer">
      <span class="version">v{{ version }}</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Odometer, Connection, Key, Coin, Share, Switch,
  Loading, Timer, Box, Monitor, Setting
} from '@element-plus/icons-vue'
const { t } = useI18n()
const version = '0.8.1'

const navItems = computed(() => [
  { label: t('sidebar.dashboard'), path: '/',          icon: Odometer },
  { label: t('sidebar.ddns'),      path: '/ddns',      icon: Connection },
  { label: t('sidebar.ssl'),       path: '/ssl',       icon: Key },
  { label: t('sidebar.nginx'),     path: '/nginx',     icon: Coin },
  { label: t('sidebar.proxy'),     path: '/proxy',     icon: Share },
  { label: t('sidebar.port'),      path: '/port',      icon: Switch },
  { label: t('sidebar.pm2'),       path: '/pm2',       icon: Loading },
  { label: t('sidebar.cron'),      path: '/cron',      icon: Timer },
  { label: t('sidebar.docker'),    path: '/docker',    icon: Box },
  { label: t('sidebar.ssh'),       path: '/ssh',       icon: Monitor },
  { label: t('sidebar.settings'),  path: '/settings',  icon: Setting },
])
</script>

<style scoped>
.sidebar {
  width: 220px;
  height: 100vh;
  background: var(--bg-glass);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  flex-shrink: 0;
}
.logo {
  font-size: 28px;
  text-align: center;
  padding: 8px 0 20px;
}
.nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--dur-fast) var(--ease-out);
}
.nav-item:hover {
  background: var(--border-color);
  color: var(--text-primary);
}
.nav-item.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.nav-label { white-space: nowrap; }
.sidebar-footer { padding: 12px 12px 4px; }
.version { font-size: 11px; color: var(--text-tertiary); }
</style>
