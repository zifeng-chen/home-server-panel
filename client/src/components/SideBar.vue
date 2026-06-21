<template>
  <aside class="sidebar">
    <div class="logo-area">
      <Logo size="md" />
    </div>
    <nav class="nav">
      <router-link v-for="item in navItems" :key="item.path" :to="item.path"
        class="nav-item" :class="{ active: $route.path === item.path || (item.path !== '/' && $route.path.startsWith(item.path)) }">
        <div class="nav-icon-wrap">
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
        </div>
        <span class="nav-label">{{ item.label }}</span>
        <div v-if="$route.path === item.path || (item.path !== '/' && $route.path.startsWith(item.path))" class="active-dot" />
      </router-link>
    </nav>
    <div class="sidebar-footer">
      <div class="version-badge">v{{ version }}</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import Logo from './Logo.vue'
import {
  Odometer, Connection, Key, Coin, Switch,
  Loading, Timer, Box, Monitor, Setting, User
} from '@element-plus/icons-vue'

const { t } = useI18n()
const version = __APP_VERSION__
const authStore = useAuthStore()

const allNavItems = [
  { label: t('sidebar.dashboard'), path: '/',          icon: Odometer },
  { label: t('sidebar.ddns'),      path: '/ddns',      icon: Connection },
  { label: t('sidebar.ssl'),       path: '/ssl',       icon: Key },
  { label: t('sidebar.nginx'),     path: '/nginx',     icon: Coin },
  { label: t('sidebar.port'),      path: '/port',      icon: Switch },
  { label: t('sidebar.pm2'),       path: '/pm2',       icon: Loading },
  { label: t('sidebar.cron'),      path: '/cron',      icon: Timer },
  { label: t('sidebar.docker'),    path: '/docker',    icon: Box },
  { label: t('sidebar.ssh'),       path: '/ssh',       icon: Monitor },
  { label: t('sidebar.settings'),  path: '/settings',  icon: Setting },
  { label: t('sidebar.users'),     path: '/users',     icon: User, adminOnly: true },
]

const navItems = computed(() => allNavItems.filter(item => !item.adminOnly || authStore.isAdmin))

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
  padding: 16px 10px;
  flex-shrink: 0;
  position: relative;
}

/* Logo */
.logo-area {
  padding: 8px 10px 20px;
}

/* Nav */
.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--dur-fast) var(--ease-out);
  overflow: hidden;
}
.nav-item::before {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.nav-item:hover {
  color: var(--text-primary);
  background: var(--border-color);
}
.nav-item:hover::before { opacity: 1; }
.nav-item.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.nav-item.active::before { opacity: 0; }
.nav-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  transition: all var(--dur-fast) var(--ease-out);
}
.nav-item.active .nav-icon-wrap {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.nav-label { white-space: nowrap; }

/* Active dot indicator */
.active-dot {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
  animation: dotIn 0.3s var(--ease-spring);
}
@keyframes dotIn {
  from { height: 0; opacity: 0; }
  to   { height: 20px; opacity: 1; }
}

/* Footer */
.sidebar-footer {
  padding: 12px 10px 4px;
}
.version-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  letter-spacing: 0.3px;
}
</style>
