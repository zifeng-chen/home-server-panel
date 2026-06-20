<template>
  <div class="hsp-logo" :class="[`size-${size}`]">
    <!-- Logo Icon -->
    <div class="logo-img-wrap">
      <!-- PNG logos (preferred) -->
      <img
        :src="logoSrc"
        :alt="alt"
        class="logo-img"
        @error="onImgError"
      />
      <!-- SVG fallback -->
      <svg
        v-if="useSvgFallback"
        viewBox="0 0 48 48"
        class="logo-svg-fallback"
        fill="none"
      >
        <defs>
          <linearGradient id="hspLogoGrad" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" :stop-color="isDark ? '#6db3f8' : '#4d7cff'" />
            <stop offset="100%" :stop-color="isDark ? '#8b5cf6' : '#6366f1'" />
          </linearGradient>
        </defs>
        <!-- Server rack body -->
        <rect x="5" y="4" width="38" height="40" rx="8" stroke="url(#hspLogoGrad)" stroke-width="2" />
        <!-- Slots -->
        <rect x="11" y="12" width="26" height="4" rx="1.5" fill="url(#hspLogoGrad)" opacity="0.7" />
        <rect x="11" y="21" width="22" height="4" rx="1.5" fill="url(#hspLogoGrad)" opacity="0.5" />
        <rect x="11" y="30" width="18" height="4" rx="1.5" fill="url(#hspLogoGrad)" opacity="0.35" />
        <!-- Indicator LED -->
        <circle cx="37" cy="36" r="3.5" fill="#22c55e" opacity="0.9" />
        <circle cx="37" cy="36" r="5.5" fill="#22c55e" opacity="0.15" />
      </svg>
    </div>

    <!-- Brand text -->
    <div class="logo-text" v-if="showText">
      <span class="logo-en">Home Server Panel</span>
      <span class="logo-cn">家庭服务器控制面板</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  alt?: string
}>(), {
  size: 'md',
  showText: true,
  alt: 'Home Server Panel',
})

// Detect dark mode
const isDark = ref(false)
const useSvgFallback = ref(false)
const imgFailed = ref(false)

const logoSrc = computed(() => {
  if (imgFailed.value) return ''
  // Use logo1.png for light, logo2.png for dark
  const fname = isDark.value ? 'logo2.png' : 'logo1.png'
  try {
    return new URL(`../assets/${fname}`, import.meta.url).href
  } catch {
    return `/assets/${fname}`
  }
})

function onImgError() {
  imgFailed.value = true
  useSvgFallback.value = true
}

onMounted(() => {
  // Check initial theme
  const root = document.documentElement
  isDark.value = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'

  // Listen for theme changes (if using el-switch or similar)
  const observer = new MutationObserver(() => {
    isDark.value = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark'
    // Reset image error if theme changed (new image to try)
    imgFailed.value = false
    useSvgFallback.value = false
  })
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
})
</script>

<style scoped>
.hsp-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  user-select: none;
  max-width: 100%;
}

/* ── Sizes ── */
.size-sm .logo-img-wrap { width: 28px; height: 28px; }
.size-sm .logo-text .logo-en { font-size: 11px; }
.size-sm .logo-text .logo-cn { font-size: 9px; }

.size-md .logo-img-wrap { width: 36px; height: 36px; }
.size-md .logo-text .logo-en { font-size: 13px; }
.size-md .logo-text .logo-cn { font-size: 10px; }

.size-lg .logo-img-wrap { width: 56px; height: 56px; }
.size-lg .logo-text .logo-en { font-size: 18px; }
.size-lg .logo-text .logo-cn { font-size: 13px; }

.size-xl .logo-img-wrap { width: 120px; height: 120px; }
.size-xl .logo-text .logo-en { font-size: 22px; }
.size-xl .logo-text .logo-cn { font-size: 15px; }

/* ── Image wrapper ── */
.logo-img-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.logo-img, .logo-svg-fallback {
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* ── Brand text ── */
.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.logo-en {
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.logo-cn {
  font-weight: 500;
  color: var(--text-tertiary);
  white-space: nowrap;
}
</style>
