<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('settings.title') }}</h2>
        <p class="sub">{{ $t('settings.basic') }}</p>
      </div>
      <el-button type="danger" @click="confirmRestart" :icon="RefreshRight" plain>{{ $t('settings.restartService') }}</el-button>
    </div>

    <div class="card">
      <h3>Cloud Credentials</h3>
      <el-form :model="form" label-width="140px">
        <el-form-item label="Alibaba AK ID">
          <el-input v-model="form.aliKeyId" :placeholder="form._hasAliKey ? 'leave empty = no change' : 'takes effect on save'" />
          <el-tag v-if="form._hasAliKey" type="success" size="small" style="margin-left:8px">Configured</el-tag>
        </el-form-item>
        <el-form-item label="Alibaba AK Secret"><el-input v-model="form.aliKeySecret" type="password" show-password :placeholder="form._hasAliKey ? 'leave empty = no change' : 'takes effect on save'" /></el-form-item>
        <el-form-item label="Tencent Secret ID">
          <el-input v-model="form.tencentSecretId" :placeholder="form._hasTencentKey ? 'leave empty = no change' : 'takes effect on save'" />
          <el-tag v-if="form._hasTencentKey" type="success" size="small" style="margin-left:8px">Configured</el-tag>
        </el-form-item>
        <el-form-item label="Tencent Secret Key"><el-input v-model="form.tencentSecretKey" type="password" show-password :placeholder="form._hasTencentKey ? 'leave empty = no change' : 'takes effect on save'" /></el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3>{{ $t('settings.notification') }}</h3>
      <el-form :model="form" label-width="140px">
        <el-form-item label="PushPlus Token"><el-input v-model="form.pushplusToken" :placeholder="$t('settings.pushplusToken')" /></el-form-item>
        <el-form-item label="ACME Email"><el-input v-model="form.acmeEmail" placeholder="admin@example.com" /></el-form-item>
        <el-form-item label="DNS Provider"><el-input v-model="form.acmeDns" placeholder="alidns" /></el-form-item>
        <el-form-item :label="$t('ssl.expiry')"><el-input-number v-model="form.certExpireDays" :min="1" :max="90" /> {{ $t('ssl.days') }}</el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3>Modules</h3>
      <el-form label-width="80px">
        <el-form-item v-for="m in modules" :key="m.key" :label="m.name">
          <el-tag :type="m.enabled ? 'success' : 'info'">{{ m.enabled ? 'Enabled' : 'Disabled' }}</el-tag>
          <span class="hint-mod">{{ m.key }}</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="card save-bar">
      <el-button type="primary" @click="doSave" :loading="saving" :icon="Check">{{ $t('common.save') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Check, RefreshRight } from '@element-plus/icons-vue'
import api from '../api'

const { t } = useI18n()
const saving = ref(false)
const form = reactive<any>({
  aliKeyId: '',
  aliKeySecret: '',
  tencentSecretId: '',
  tencentSecretKey: '',
  pushplusToken: '',
  acmeEmail: '',
  acmeDns: '',
  certExpireDays: 30,
  _hasAliKey: false,
  _hasTencentKey: false
})
const modules = ref<any[]>([])

async function load() {
  try {
    const res = await api.get('/system/config') as any
    if (res.success) {
      const d = res.data
      form.aliKeyId = ''
      form.aliKeySecret = ''
      form.tencentSecretId = ''
      form.tencentSecretKey = ''
      form.pushplusToken = d.pushplusToken || ''
      form.acmeEmail = d.acmeEmail || ''
      form.acmeDns = d.acmeDnsProvider || ''
      form.certExpireDays = d.certExpireDays || 30
      form._hasAliKey = !!d.aliKeyId
      form._hasTencentKey = !!d.tencentSecretId
      const mods = d.modules || {}
      modules.value = Object.entries(mods).map(([k, v]) => ({ key: k, name: k.toUpperCase(), enabled: v }))
    }
  } catch { ElMessage.error(t('common.error')) }
}

async function doSave() {
  saving.value = true
  try {
    const payload: any = { certExpireDays: form.certExpireDays }
    if (form.aliKeyId) { payload.aliKeyId = form.aliKeyId; payload.aliKeySecret = form.aliKeySecret }
    if (form.tencentSecretId) { payload.tencentSecretId = form.tencentSecretId; payload.tencentSecretKey = form.tencentSecretKey }
    if (form.pushplusToken) payload.pushplusToken = form.pushplusToken
    if (form.acmeEmail) payload.acmeEmail = form.acmeEmail
    if (form.acmeDns) payload.acmeDns = form.acmeDns

    const res = await api.post('/system/config', payload) as any
    if (res.success) ElMessage.success(t('settings.saveSuccess'))
    else ElMessage.error(res.message || t('common.error'))
  } catch { ElMessage.error(t('common.error')) }
  finally { saving.value = false }
}

async function confirmRestart() {
  await ElMessageBox.confirm(t('settings.restartConfirm'), t('settings.restartService'), { type: 'warning' })
  ElMessage.info(t('settings.restartSuccess'))
  try { await api.post('/system/restart') } catch { /* unreachable after restart */ }
}

onMounted(load)
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.card h3 { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
.save-bar { display: flex; justify-content: flex-end; }
.hint-mod { margin-left: 12px; font-size: 12px; color: var(--text-tertiary); font-family: var(--font-mono); }
</style>
