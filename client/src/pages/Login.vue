<template>
  <div class="login-page">
    <canvas ref="canvasRef" class="bg-canvas" />
    <div class="login-card">
      <div class="card-inner">
        <div class="brand-icon">
          <div class="icon-ring" />
          <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="8" stroke-width="2" stroke="currentColor" />
            <rect x="10" y="12" width="12" height="4" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="10" y="20" width="16" height="4" rx="1" fill="currentColor" opacity="0.4" />
            <rect x="10" y="28" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
            <circle cx="36" cy="26" r="10" fill="currentColor" opacity="0.15" />
            <circle cx="36" cy="26" r="4" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
        <h2 class="title">Home Server Panel</h2>
        <p class="subtitle">高性能服务器管理面板</p>

        <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="doLogin" size="large" class="login-form">
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="用户名"
              :prefix-icon="User"
              class="glass-input"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              show-password
              :prefix-icon="Lock"
              class="glass-input"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              native-type="submit"
              :loading="auth.loading"
              class="btn-login"
              size="large"
            >
              <span v-if="!auth.loading">登 录</span>
            </el-button>
          </el-form-item>
        </el-form>

        <Transition name="err-fade">
          <p v-if="error" class="error-msg">{{ error }}</p>
        </Transition>

        <p class="version-tag">v0.8.2-beta</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import type { FormInstance, FormRules } from 'element-plus'

const auth   = useAuthStore()
const router = useRouter()
const error  = ref('')
const formRef = ref<FormInstance>()
const canvasRef = ref<HTMLCanvasElement>()

const form = reactive({ username: 'admin', password: 'admin123' })
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function doLogin() {
  error.value = ''
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const success = await auth.login(form.username, form.password)
  if (success) {
    router.push('/')
  } else {
    error.value = '登录失败，请检查用户名和密码'
  }
}

// === Canvas Particle Animation ===
let animId = 0
let mouseX = -100, mouseY = -100

function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  function resize() {
    canvas!.width = window.innerWidth
    canvas!.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  // Particles
  const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number }[] = []
  const count = 120
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.6 + 0.1
    })
  }

  // Grid lines
  const gridSpacing = 40
  let gridOffset = 0

  function draw() {
    if (!canvas || !ctx) return
    const w = canvas.width, h = canvas.height

    // Background gradient
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    grad.addColorStop(0, '#1a1a2e')
    grad.addColorStop(0.5, '#0f0f1a')
    grad.addColorStop(1, '#050510')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Grid
    gridOffset += 0.15
    ctx.strokeStyle = 'rgba(60, 100, 255, 0.04)'
    ctx.lineWidth = 0.5
    const yOffset = gridOffset % gridSpacing
    for (let x = gridSpacing; x < w; x += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = yOffset; y < h; y += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    // Particles
    particles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0) p.x = w
      if (p.x > w) p.x = 0
      if (p.y < 0) p.y = h
      if (p.y > h) p.y = 0

      // Mouse attraction
      const dx = mouseX - p.x, dy = mouseY - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 150) {
        p.vx += dx * 0.00015
        p.vy += dy * 0.00015
      }
      // Damping
      p.vx *= 0.999
      p.vy *= 0.999

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(80, 140, 255, ${p.alpha})`
      ctx.fill()
    })

    // Lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 100) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(80, 140, 255, ${0.06 * (1 - dist / 100)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }

    animId = requestAnimationFrame(draw)
  }

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX
    mouseY = e.clientY
  })

  // Pause when hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animId)
    } else {
      animId = requestAnimationFrame(draw)
    }
  })

  draw()
}

onMounted(initCanvas)
onUnmounted(() => cancelAnimationFrame(animId))
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.bg-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* Card */
.login-card {
  position: relative;
  z-index: 1;
  width: 400px;
  animation: cardIn 0.8s var(--ease-out) both;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(24px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.card-inner {
  background: rgba(22, 22, 40, 0.85);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 48px 40px 36px;
  text-align: center;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 4px 40px rgba(0, 0, 0, 0.4),
    0 0 80px rgba(80, 140, 255, 0.06);
}

/* Brand Icon */
.brand-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 20px;
  color: #5c9eff;
  animation: iconPulse 0.6s var(--ease-out) 0.1s both;
}
@keyframes iconPulse {
  from { opacity: 0; transform: scale(0.5); }
  to   { opacity: 1; transform: scale(1); }
}
.icon-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(92, 158, 255, 0.25);
  animation: ringSpin 8s linear infinite;
}
@keyframes ringSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #f0f0f5;
  letter-spacing: -0.3px;
  animation: fadeUp 0.5s var(--ease-out) 0.2s both;
}
.subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 6px;
  margin-bottom: 36px;
  animation: fadeUp 0.5s var(--ease-out) 0.3s both;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.login-form {
  animation: fadeUp 0.5s var(--ease-out) 0.4s both;
}

/* Form inputs - glass style */
:deep(.glass-input .el-input__wrapper) {
  background: rgba(255, 255, 255, 0.04) !important;
  border: none !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset !important;
  border-radius: 12px !important;
  transition: all 0.25s var(--ease-out) !important;
}
:deep(.glass-input .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(80, 140, 255, 0.3) inset !important;
  background: rgba(255, 255, 255, 0.06) !important;
}
:deep(.glass-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(80, 140, 255, 0.4) inset,
              0 0 16px rgba(80, 140, 255, 0.1) !important;
  background: rgba(255, 255, 255, 0.08) !important;
}
:deep(.glass-input .el-input__inner) {
  color: #e0e0f0 !important;
}
:deep(.glass-input .el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.25) !important;
}
:deep(.glass-input .el-input__prefix) {
  color: rgba(255, 255, 255, 0.3) !important;
}
:deep(.glass-input .el-input__suffix) {
  color: rgba(255, 255, 255, 0.3) !important;
}

/* Login Button */
.btn-login {
  width: 100%;
  height: 48px;
  border-radius: 12px !important;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border: none !important;
  background: linear-gradient(135deg, #4d7cff, #6366f1) !important;
  box-shadow: 0 4px 20px rgba(77, 124, 255, 0.3) !important;
  transition: all 0.3s var(--ease-out) !important;
}
.btn-login:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px rgba(77, 124, 255, 0.45) !important;
}
.btn-login:active {
  transform: translateY(0);
}

/* Error */
.error-msg {
  color: #ff6b6b;
  font-size: 13px;
  margin-top: 12px;
}
.err-fade-enter-active { transition: all 0.3s var(--ease-out); }
.err-fade-leave-active { transition: all 0.2s var(--ease-out); }
.err-fade-enter-from, .err-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* Version */
.version-tag {
  margin-top: 28px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.15);
  letter-spacing: 0.5px;
}
</style>
