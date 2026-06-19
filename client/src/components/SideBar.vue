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
import {
  Odometer, Connection, Key, Coin, Share, Switch,
  Loading, Timer, Box, Monitor, Setting
} from '@element-plus/icons-vue'
const version = '0.8.0'

const navItems = [
  { label: '仪表盘',  path: '/',          icon: Odometer },
  { label: 'DDNS',    path: '/ddns',      icon: Connection },
  { label: 'SSL',     path: '/ssl',       icon: Key },
  { label: 'Nginx',   path: '/nginx',     icon: Coin },
  { label: '代理',    path: '/proxy',     icon: Share },
  { label: '端口',    path: '/port',      icon: Switch },
  { label: 'PM2',     path: '/pm2',       icon: Loading },
  { label: 'Cron',    path: '/cron',      icon: Timer },
  { label: 'Docker',  path: '/docker',    icon: Box },
  { label: 'SSH',     path: '/ssh',       icon: Monitor },
  { label: '设置',    path: '/settings',  icon: Setting },
]
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
