<template>
  <div class="layout">
    <SideBar />
    <div class="main-area">
      <TopBar />
      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
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
}
.fade-enter-active, .fade-leave-active { transition: opacity var(--dur-fast) var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
