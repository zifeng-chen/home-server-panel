<template>
  <div class="layout">
    <SideBar />
    <div class="main-area">
      <TopBar />
      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import SideBar from '../components/SideBar.vue'
import TopBar from '../components/TopBar.vue'
import { useSystemStore } from '../stores/system'

const sys = useSystemStore()
onMounted(() => { sys.fetchInfo(); sys.startPolling(); sys.startUptimeTicking() })
onUnmounted(() => { sys.stopPolling(); sys.stopUptimeTicking() })
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  background: var(--bg-base);
  /* subtle gradient overlay */
  background-image:
    radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--accent) 3%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, color-mix(in srgb, var(--accent-purple) 2%, transparent) 0%, transparent 50%);
}

/* Page transitions */
.page-enter-active { transition: all 0.3s var(--ease-out); }
.page-leave-active { transition: all 0.15s var(--ease-out); }
.page-enter-from { opacity: 0; transform: translateY(6px) scale(0.995); }
.page-leave-to   { opacity: 0; transform: translateY(-2px) scale(0.998); }
</style>
