<template>
  <div class="install-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>
    <div class="install-container">
      <div class="card">
        <!-- Brand -->
        <div class="brand">
          <div class="brand-icon">🖥️</div>
          <h1>{{ $t('install.welcome') }}</h1>
          <p>{{ $t('install.subtitle') }}</p>
        </div>

        <!-- Steps -->
        <div class="steps">
          <div :class="['step-dot', { active: step === 0, done: step > 0 }]"></div>
          <div :class="['step-dot', { active: step === 1, done: step > 1 }]"></div>
          <div :class="['step-dot', { active: step === 2, done: step > 2 }]"></div>
        </div>

        <!-- Step 0: DB Mode -->
        <div v-if="step === 0">
          <div class="alert alert-info">{{ $t('install.dbModeHint') }}</div>
          <div class="db-modes">
            <div :class="['db-mode-card', { selected: dbMode === 'local' }]" @click="dbMode = 'local'">
              <div class="db-mode-icon">📁</div>
              <div class="db-mode-title">SQLite</div>
              <div class="db-mode-desc">{{ $t('install.sqliteDesc') }}</div>
            </div>
            <div :class="['db-mode-card', { selected: dbMode === 'mysql' }]" @click="dbMode = 'mysql'">
              <div class="db-mode-icon">🐬</div>
              <div class="db-mode-title">MySQL</div>
              <div class="db-mode-desc">{{ $t('install.mysqlDesc') }}</div>
            </div>
          </div>
          <button class="btn btn-primary" style="margin-top:12px" @click="nextStep">{{ $t('install.next') }}</button>
        </div>

        <!-- Step 1: MySQL Config -->
        <div v-if="step === 1 && !dbExists" :class="{ 'fade-in': true }">
          <div class="alert alert-info">{{ $t('install.mysqlConfigHint') }}</div>
          <div class="form-row-3">
            <div class="form-group">
              <label class="form-label">{{ $t('install.dbHost') }}</label>
              <input class="form-input" v-model="mysql.host" placeholder="192.168.100.110" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('install.dbPort') }}</label>
              <input class="form-input" v-model="mysql.port" placeholder="3306" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('install.dbName') }}</label>
              <input class="form-input" v-model="mysql.database" placeholder="home_server_panel" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('install.dbUser') }}</label>
              <input class="form-input" v-model="mysql.user" placeholder="root" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('install.dbPassword') }}</label>
              <div class="pwd-wrapper">
                <input class="form-input" :type="showMysqlPwd ? 'text' : 'password'" v-model="mysql.password" placeholder="********" />
                <button class="pwd-toggle" @click="showMysqlPwd = !showMysqlPwd">{{ showMysqlPwd ? '🙈' : '👁' }}</button>
              </div>
            </div>
          </div>
          <div :class="['test-result', testResultClass]" v-if="testResult">{{ testResult }}</div>
          <div class="btn-group">
            <button class="btn btn-secondary" @click="prevStep">{{ $t('install.prev') }}</button>
            <button class="btn btn-secondary" @click="testConnection" :disabled="testing">{{ testing ? $t('install.testing') : $t('install.testConn') }}</button>
            <button class="btn btn-primary" @click="nextStep">{{ $t('install.next') }}</button>
          </div>
        </div>

        <!-- Step 1b: DB already exists -->
        <div v-if="step === 1 && dbExists">
          <div style="text-align:center;padding:12px 0">
            <div style="font-size:40px;margin-bottom:12px">✅</div>
            <div style="font-size:16px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">{{ $t('install.dbHasData') }}</div>
            <p style="color:var(--text-secondary);font-size:13px;margin-bottom:6px">{{ $t('install.dbHasDataDesc', { db: mysql.database }) }}</p>
            <p style="color:var(--brand-hover);font-size:13px;margin-bottom:20px">{{ $t('install.dbHasDataHint') }}</p>
            <button class="btn btn-primary" @click="goToLogin" style="width:100%">{{ $t('install.goToLogin') }}</button>
            <button class="btn btn-secondary" @click="resetInstall" style="width:100%;margin-top:8px">{{ $t('install.reset') }}</button>
          </div>
        </div>

        <!-- Step 2: Admin Account -->
        <div v-if="step === 2">
          <div class="alert alert-info">{{ $t('install.adminHint') }}</div>
          <div class="form-group">
            <label class="form-label">{{ $t('install.adminUser') }}</label>
            <input class="form-input" v-model="admin.username" placeholder="admin" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('install.adminPass') }}</label>
            <div class="pwd-wrapper">
              <input class="form-input" :type="showAdminPwd ? 'text' : 'password'" v-model="admin.password" :placeholder="$t('install.adminPassHint')" />
              <button class="pwd-toggle" @click="showAdminPwd = !showAdminPwd">{{ showAdminPwd ? '🙈' : '👁' }}</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('install.adminPass2') }}</label>
            <input class="form-input" type="password" v-model="admin.password2" :placeholder="$t('install.adminPass2Hint')" />
          </div>
          <div class="test-result error" v-if="installError">{{ installError }}</div>
          <div class="btn-group">
            <button class="btn btn-secondary" @click="prevStep">{{ $t('install.prev') }}</button>
            <button class="btn btn-primary" @click="doInstall" :disabled="installing">
              {{ installing ? $t('install.installing') : $t('install.finish') }}
            </button>
          </div>
        </div>

        <!-- Step 3: Success -->
        <div v-if="step === 3">
          <div class="success-icon">✅</div>
          <div class="success-title">{{ $t('install.success') }}</div>
          <div class="success-desc">{{ $t('install.successDesc') }}</div>
          <div class="config-preview">
            <template v-if="dbMode === 'mysql'">
              <div><span class="key">DB_HOST</span>=<span class="val">{{ mysql.host }}</span></div>
              <div><span class="key">DB_PORT</span>=<span class="val">{{ mysql.port }}</span></div>
              <div><span class="key">DB_USER</span>=<span class="val">{{ mysql.user }}</span></div>
              <div><span class="key">DB_NAME</span>=<span class="val">{{ mysql.database }}</span></div>
            </template>
            <div><span class="key">DB_MODE</span>=<span class="val">{{ dbMode }}</span></div>
            <div><span class="key">ADMIN</span>=<span class="val">{{ admin.username }}</span></div>
          </div>
          <button class="btn btn-primary" @click="goToPanel">{{ $t('install.enter') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import axios from 'axios'

const router = useRouter()
const { t } = useI18n()
const bgCanvas = ref<HTMLCanvasElement>()

// ── Wizard state ──
const step = ref(0)
const dbMode = ref('local')
const dbExists = ref(false)
const testResult = ref('')
const testResultClass = ref('')
const testing = ref(false)
const installing = ref(false)
const installError = ref('')
const showMysqlPwd = ref(false)
const showAdminPwd = ref(false)

const mysql = reactive({ host: '192.168.100.110', port: '3306', database: 'home_server_panel', user: 'root', password: '' })
const admin = reactive({ username: 'admin', password: '', password2: '' })

// ── API helper (no auth, before install) ──
const api = axios.create({ baseURL: '/api' })

// ── Check if already installed ──
onMounted(async () => {
  try {
    const { data } = await api.get('/setup/status')
    if (data.success && data.data?.installed) {
      const token = localStorage.getItem('hsp_token')
      if (token) {
        try {
          const authRes = await api.get('/auth/status', { headers: { 'x-auth-token': token } })
          if (authRes.data.authenticated) { router.replace('/'); return }
        } catch {}
      }
      router.replace('/login')
    }
  } catch { /* server not running yet — proceed to install */ }

  startCanvas()
})

// ── Canvas animation (gold particle network, same as install.html) ──
let animId = 0
let particles: { x: number; y: number; vx: number; vy: number; r: number }[] = []

function startCanvas() {
  const canvas = bgCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  let w = 0, h = 0

  function resize() {
    w = canvas!.width = window.innerWidth
    h = canvas!.height = window.innerHeight
  }
  window.addEventListener('resize', resize)
  resize()

  const count = Math.min(60, Math.floor(w * h / 15000))
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 0.5,
    })
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(184,134,11,0.06)'
    ctx.lineWidth = 0.5
    const spacing = 50
    for (let x = spacing; x < w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = spacing; y < h; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy
      if (p.x < 0 || p.x > w) p.vx *= -1
      if (p.y < 0 || p.y > h) p.vy *= -1
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(184,134,11,0.2)'; ctx.fill()
    })
    particles.forEach((a, i) => {
      particles.slice(i + 1).forEach(b => {
        const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(184,134,11,${0.05 * (1 - dist / 120)})`; ctx.stroke()
        }
      })
    })
    animId = requestAnimationFrame(draw)
  }
  draw()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(animId) } else { draw() }
  })
}

onUnmounted(() => cancelAnimationFrame(animId))

// ── Wizard logic ──
function nextStep() {
  if (dbMode.value === 'local' && step.value === 0) { step.value = 2; return }
  if (dbMode.value === 'mysql' && step.value === 1 && !dbExists.value) {
    if (testResultClass.value !== 'success') {
      testResult.value = t('install.testConnFirst')
      testResultClass.value = 'error'
      return
    }
  }
  step.value++
}

function prevStep() {
  if (dbMode.value === 'local' && step.value === 2) { step.value = 0; return }
  step.value--
}

function resetInstall() {
  dbExists.value = false
  testResult.value = ''
  testResultClass.value = ''
}

async function testConnection() {
  const { host, port, user, password, database } = mysql
  if (!host || !user) {
    testResult.value = '❌ ' + t('install.fillHostUser')
    testResultClass.value = 'error'
    return
  }
  testing.value = true
  testResult.value = t('install.connecting')
  testResultClass.value = ''
  try {
    const { data } = await api.post('/setup/test-db', { host, port: parseInt(port) || 3306, user, password, database })
    if (data.success) {
      if (data.hasTables) {
        dbExists.value = true
      } else if (data.dbExists) {
        testResult.value = `✅ ${t('install.connOkDbExists', { db: database })}`
        testResultClass.value = 'success'
      } else {
        testResult.value = `✅ ${t('install.connOk', { db: database })}`
        testResultClass.value = 'success'
      }
    } else {
      testResult.value = '❌ ' + (data.message || t('common.error'))
      testResultClass.value = 'error'
    }
  } catch {
    testResult.value = '❌ ' + t('install.connFailed')
    testResultClass.value = 'error'
  } finally { testing.value = false }
}

async function doInstall() {
  const { username, password, password2 } = admin
  if (!username) { installError.value = '❌ ' + t('install.emptyUser'); return }
  if (password.length < 6) { installError.value = '❌ ' + t('install.passMin'); return }
  if (password !== password2) { installError.value = '❌ ' + t('install.passMismatch'); return }
  installing.value = true
  installError.value = ''
  const payload: any = { dbMode: dbMode.value, adminUser: username, adminPass: password }
  if (dbMode.value === 'mysql') {
    Object.assign(payload, {
      dbHost: mysql.host,
      dbPort: parseInt(mysql.port) || 3306,
      dbUser: mysql.user,
      dbPass: mysql.password,
      dbName: mysql.database,
    })
  }
  try {
    const { data } = await api.post('/setup/install', payload)
    if (data.success) { step.value = 3 } else { installError.value = '❌ ' + (data.message || t('common.error')) }
  } catch { installError.value = '❌ ' + t('install.installFailed') }
  finally { installing.value = false }
}

async function goToPanel() {
  try {
    const { data } = await api.post('/auth/login', { username: admin.username, password: admin.password })
    if (data.success && data.data?.token) {
      localStorage.setItem('hsp_token', data.data.token)
      localStorage.setItem('hsp_username', data.data.username || admin.username)
      localStorage.setItem('hsp_role', data.data.role || 'admin')
      router.replace('/')
      return
    }
  } catch {}
  router.replace('/login')
}

function goToLogin() { router.replace('/login') }
</script>

<style scoped>
.install-page { position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--bg-primary); }
.bg-canvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.install-container { position: relative; z-index: 1; width: 100%; max-width: 480px; }
.card { background: var(--bg-card, #fff); border: 1px solid var(--border-color); border-radius: 12px; padding: 40px 36px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); }

.brand { text-align: center; margin-bottom: 8px; }
.brand-icon { font-size: 48px; margin-bottom: 8px; }
.brand h1 { font-size: 22px; font-weight: 700; background: linear-gradient(135deg, #daa520, #b8860b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.brand p { color: var(--text-tertiary, #6b7280); font-size: 13px; margin-top: 6px; }

.steps { display: flex; justify-content: center; gap: 8px; margin: 24px 0 28px; }
.step-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-color); transition: all 0.3s; }
.step-dot.active { background: #b8860b; box-shadow: 0 0 8px #b8860b; }
.step-dot.done { background: #10b981; }

.fade-in { animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.form-group { margin-bottom: 18px; }
.form-label { display: block; font-size: 13px; font-weight: 500; color: var(--text-tertiary); margin-bottom: 6px; }
.form-input { width: 100%; padding: 10px 14px; background: var(--bg-tertiary, #f1f3f5); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); font-size: 14px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.form-input:focus { border-color: #b8860b; box-shadow: 0 0 0 3px rgba(184,134,11,0.15); }
.form-input::placeholder { color: #9ca3af; }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-row-3 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }

.pwd-wrapper { position: relative; }
.pwd-wrapper .form-input { padding-right: 40px; }
.pwd-toggle { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 16px; padding: 4px; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.btn-primary { background: linear-gradient(135deg, #daa520, #b8860b); color: white; width: 100%; }
.btn-primary:hover:not(:disabled) { box-shadow: 0 0 20px rgba(184,134,11,0.3); transform: translateY(-1px); }
.btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); }
.btn-secondary:hover { background: #475569; color: white; }

.btn-group { display: flex; gap: 10px; margin-top: 24px; }
.btn-group .btn { flex: 1; }

.db-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0; }
.db-mode-card { padding: 20px 16px; background: var(--bg-tertiary); border: 2px solid var(--border-color); border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s; }
.db-mode-card:hover { border-color: #b8860b; }
.db-mode-card.selected { border-color: #b8860b; background: rgba(184,134,11,0.08); box-shadow: 0 0 12px rgba(184,134,11,0.15); }
.db-mode-icon { font-size: 32px; margin-bottom: 8px; }
.db-mode-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.db-mode-desc { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }

.alert { padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 16px; }
.alert-info { background: rgba(184,134,11,0.1); border: 1px solid rgba(184,134,11,0.2); color: #daa520; }

.test-result { padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-top: 8px; }
.test-result.success { background: rgba(34,197,94,0.1); color: #10b981; border: 1px solid rgba(34,197,94,0.2); }
.test-result.error { background: rgba(196,30,58,0.1); color: var(--accent-red, #c41e3a); border: 1px solid rgba(196,30,58,0.2); }

.success-icon { font-size: 64px; text-align: center; margin-bottom: 16px; }
.success-title { text-align: center; font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
.success-desc { text-align: center; color: var(--text-tertiary); font-size: 13px; margin-bottom: 24px; }
.config-preview { background: var(--bg-tertiary); border-radius: 8px; padding: 14px; font-family: Menlo, Monaco, monospace; font-size: 12px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 20px; max-height: 200px; overflow-y: auto; }
.config-preview .key { color: #daa520; }
.config-preview .val { color: #10b981; }

@media (max-width: 500px) {
  .card { padding: 28px 20px; }
  .form-row, .form-row-3, .db-modes { grid-template-columns: 1fr; }
}
</style>
