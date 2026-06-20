<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('settings.title') }}</h2>
        <p class="sub">{{ $t('settings.basic') }}</p>
      </div>
      <el-button type="danger" @click="confirmRestart" :icon="RefreshRight" plain>{{ $t('settings.restartService') }}</el-button>
    </div>

    <!-- 云服务凭据 → 显示脱敏值，移除标签 -->
    <div class="card">
      <h3>{{ $t('settings.cloudCredentials') }}</h3>
      <el-form :model="form" label-width="170px">
        <el-form-item :label="$t('settings.aliAkId')">
          <el-input v-model="form.aliKeyId" placeholder="输入新的 AccessKey ID" clearable />
        </el-form-item>
        <el-form-item :label="$t('settings.aliAkSecret')">
          <el-input v-model="form.aliKeySecret" type="password" show-password placeholder="输入新的 AccessKey Secret" />
        </el-form-item>
        <el-form-item :label="$t('settings.tencentSecretId')">
          <el-input v-model="form.tencentSecretId" placeholder="输入新的 Secret ID" clearable />
        </el-form-item>
        <el-form-item :label="$t('settings.tencentSecretKey')">
          <el-input v-model="form.tencentSecretKey" type="password" show-password placeholder="输入新的 Secret Key" />
        </el-form-item>
      </el-form>
    </div>

    <!-- 通知推送 → 增加测试按钮 -->
    <div class="card">
      <h3>{{ $t('settings.notification') }}</h3>
      <el-form :model="form" label-width="140px">
        <el-form-item label="PushPlus Token">
          <div style="display:flex;gap:8px;width:100%">
            <el-input v-model="form.pushplusToken" placeholder="PushPlus Token" style="flex:1" />
            <el-button @click="testPush" :loading="testing" :icon="Message">{{ testing ? '测试中' : '测试推送' }}</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="$t('settings.acmeEmail')"><el-input v-model="form.acmeEmail" placeholder="admin@example.com" /></el-form-item>
        <el-form-item :label="$t('settings.dnsProvider')">
          <el-select v-model="form.acmeDns" filterable placeholder="选择 DNS 服务商" style="width:100%">
            <el-option-group label="国内">
              <el-option label="阿里云 DNS (alidns)" value="alidns" />
              <el-option label="腾讯云 DNSPod (dns_dp)" value="dns_dp" />
              <el-option label="华为云 DNS (dns_huaweicloud)" value="dns_huaweicloud" />
              <el-option label="百度云 DNS (dns_baidu)" value="dns_baidu" />
            </el-option-group>
            <el-option-group label="国际">
              <el-option label="Cloudflare (dns_cf)" value="dns_cf" />
              <el-option label="HE.net DNS (dns_he)" value="dns_he" />
              <el-option label="GoDaddy (dns_gd)" value="dns_gd" />
              <el-option label="Namecheap (dns_namecheap)" value="dns_namecheap" />
              <el-option label="AWS Route53 (dns_aws)" value="dns_aws" />
              <el-option label="Google Cloud DNS (dns_gcloud)" value="dns_gcloud" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('ssl.expiry')"><el-input-number v-model="form.certExpireDays" :min="1" :max="90" /> {{ $t('ssl.days') }}</el-form-item>
      </el-form>
    </div>

    <div class="card save-bar">
      <el-button type="primary" @click="doSave" :loading="saving" :icon="Check">{{ $t('common.save') }}</el-button>
    </div>

    <!-- 关于 -->
    <div class="card about-card">
      <div class="about-content">
        <Logo size="xl" :show-text="false" class="about-logo" />
        <div class="about-info">
          <h3 class="about-title">{{ $t('about.title') }}</h3>
          <p class="about-desc">{{ $t('about.description') }}</p>
          <div class="about-meta">
            <span class="about-item"><span class="about-label">{{ $t('about.version') }}</span><el-tag size="small" effect="plain" round>{{ version }}</el-tag></span>
            <span class="about-item"><span class="about-label">{{ $t('about.author') }}</span><strong>{{ author }}</strong></span>
          </div>
          <p class="about-tech">{{ $t('about.techStack') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Check, RefreshRight, Message } from '@element-plus/icons-vue'
import api from '../api'
import Logo from '../components/Logo.vue'

declare const __APP_VERSION__: string
declare const __APP_AUTHOR__: string
const version = __APP_VERSION__
const author = __APP_AUTHOR__

const { t } = useI18n()
const saving = ref(false)
const testing = ref(false)

const form = reactive<any>({
  aliKeyId: '',
  aliKeySecret: '',
  tencentSecretId: '',
  tencentSecretKey: '',
  pushplusToken: '',
  acmeEmail: '',
  acmeDns: '',
  certExpireDays: 30
})

async function load() {
  try {
    const res = await api.get('/system/config') as any
    if (res.success) {
      const d = res.data
      // API 已返回脱敏值(如 AKIDxxxx**** / ****)，直接展示在输入框中
      form.aliKeyId = d.aliKeyId || ''
      form.aliKeySecret = d.aliKeySecret || ''
      form.tencentSecretId = d.tencentSecretId || ''
      form.tencentSecretKey = d.tencentSecretKey || ''
      form.pushplusToken = d.pushplusToken === '已配置' ? '••••••••••' : d.pushplusToken || ''
      form.acmeEmail = d.acmeEmail || ''
      form.acmeDns = d.acmeDnsProvider || ''
      form.certExpireDays = d.certExpireDays || 30
    }
  } catch { ElMessage.error(t('common.error')) }
}

async function testPush() {
  testing.value = true
  try {
    const res = await api.post('/notify/test') as any
    if (res.success) ElMessage.success(res.message || '推送测试成功')
    else ElMessage.warning(res.message || '推送测试失败')
  } catch (e: any) {
    ElMessage.error(e?.message || '推送测试失败')
  } finally {
    testing.value = false
  }
}

async function doSave() {
  saving.value = true
  try {
    const payload: any = { certExpireDays: form.certExpireDays }
    // 仅当有输入内容时才发送（空 = 不修改）
    if (form.aliKeyId && form.aliKeyId !== '••••••••' && !form.aliKeyId.endsWith('****')) payload.aliKeyId = form.aliKeyId
    if (form.aliKeySecret && form.aliKeySecret !== '••••••••' && form.aliKeySecret !== '****') payload.aliKeySecret = form.aliKeySecret
    if (form.tencentSecretId && !form.tencentSecretId.endsWith('****')) payload.tencentSecretId = form.tencentSecretId
    if (form.tencentSecretKey && form.tencentSecretKey !== '••••••••' && form.tencentSecretKey !== '****') payload.tencentSecretKey = form.tencentSecretKey
    if (form.pushplusToken && form.pushplusToken !== '••••••••••') payload.pushplusToken = form.pushplusToken
    if (form.acmeEmail) payload.acmeEmail = form.acmeEmail
    if (form.acmeDns) payload.acmeDns = form.acmeDns

    const res = await api.post('/system/config', payload) as any
    if (res.success) { ElMessage.success(t('settings.saveSuccess')); await load() }
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
/* 防止云服务凭据标签换行 */
.card :deep(.el-form-item__label) { white-space: nowrap; }

/* ── 关于卡片 ── */
.about-card { padding: 28px 32px; }
.about-content { display: flex; gap: 24px; align-items: flex-start; }
.about-logo { flex-shrink: 0; }
.about-info { flex: 1; min-width: 0; }
.about-title { font-size: 16px; font-weight: 700; margin: 0 0 10px; color: var(--text-primary); }
.about-desc { font-size: 13px; line-height: 1.8; color: var(--text-secondary); margin: 0 0 16px; }
.about-meta { display: flex; gap: 24px; align-items: center; margin-bottom: 12px; }
.about-item { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
.about-label { color: var(--text-tertiary); }
.about-tech { font-size: 12px; color: var(--text-tertiary); margin: 0; }
</style>
