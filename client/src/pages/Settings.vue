<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>{{ $t('settings.title') }}</h2>
        <p class="sub">{{ $t('settings.basic') }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="doSave" :loading="saving" :icon="Check">{{ $t('common.save') }}</el-button>
        <el-button type="danger" @click="confirmRestart" :icon="RefreshRight" plain>{{ $t('settings.restartService') }}</el-button>
      </div>
    </div>

    <!-- 云服务凭据 -->
    <div class="card">
      <h3>{{ $t('settings.cloudCredentials') }}</h3>
      <el-form :model="form" label-width="170px">
        <el-form-item :label="$t('settings.aliAkId')">
          <el-input v-model="form.aliKeyId" :placeholder="$t('settings.takesEffectHint')" clearable />
        </el-form-item>
        <el-form-item :label="$t('settings.aliAkSecret')">
          <el-input v-model="form.aliKeySecret" type="password" show-password :placeholder="$t('settings.takesEffectHint')" />
        </el-form-item>
        <el-form-item :label="$t('settings.tencentSecretId')">
          <el-input v-model="form.tencentSecretId" :placeholder="$t('settings.takesEffectHint')" clearable />
        </el-form-item>
        <el-form-item :label="$t('settings.tencentSecretKey')">
          <el-input v-model="form.tencentSecretKey" type="password" show-password :placeholder="$t('settings.takesEffectHint')" />
        </el-form-item>
      </el-form>
    </div>

    <!-- SSL/证书设置 → ACME 邮件、DNS 服务商、到期预警 -->
    <div class="card">
      <h3>{{ $t('settings.sslSettings') }}</h3>
      <p class="card-desc">{{ $t('settings.sslSettingsDesc') }}</p>
      <el-form :model="form" label-width="140px">
        <el-form-item :label="$t('settings.acmeEmail')">
          <el-input v-model="form.acmeEmail" placeholder="admin@example.com" />
        </el-form-item>
        <el-form-item :label="$t('settings.dnsProvider')">
          <el-select v-model="form.acmeDns" filterable :placeholder="$t('settings.dnsProvider')" style="width:100%">
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
        <el-form-item :label="$t('ssl.expiry')">
          <el-input-number v-model="form.certExpireDays" :min="1" :max="90" /> {{ $t('ssl.days') }}
        </el-form-item>
      </el-form>
    </div>

    <!-- 通知推送 -->
    <div class="card">
      <h3>{{ $t('settings.notification') }}</h3>
      <el-form :model="form" label-width="140px">
        <el-form-item :label="$t('settings.pushplusToken')">
          <div style="display:flex;gap:8px;width:100%">
            <el-input v-model="form.pushplusToken" :placeholder="$t('settings.pushplusToken')" style="flex:1" />
            <el-button @click="testPush" :loading="testing" :icon="Message">{{ testing ? $t('common.loading') : $t('common.submit') }}</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="$t('settings.pushplusTitle')">
          <el-input v-model="form.pushplusTitle" :placeholder="$t('settings.pushplusTitleHint')" />
        </el-form-item>
        <el-form-item :label="$t('settings.pushplusChannel')">
          <el-select v-model="form.pushplusChannel" style="width:100%">
            <el-option label="微信" value="wechat" />
            <el-option label="企业微信" value="wxwork" />
            <el-option label="钉钉" value="dingtalk" />
            <el-option label="飞书" value="feishu" />
            <el-option label="邮件" value="mail" />
            <el-option label="短信" value="sms" />
          </el-select>
        </el-form-item>
      </el-form>
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
  pushplusTitle: '',
  pushplusChannel: 'wechat',
  acmeEmail: '',
  acmeDns: '',
  certExpireDays: 30
})

async function load() {
  try {
    const res = await api.get('/system/config') as any
    if (res.success) {
      const d = res.data
      form.aliKeyId = d.aliKeyId || ''
      form.aliKeySecret = d.aliKeySecret || ''
      form.tencentSecretId = d.tencentSecretId || ''
      form.tencentSecretKey = d.tencentSecretKey || ''
      form.pushplusToken = d.pushplusToken === t('settings.configured') ? '••••••••••' : d.pushplusToken || ''
      form.pushplusTitle = d.pushplusTitle || ''
      form.pushplusChannel = d.pushplusChannel || 'wechat'
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
    if (res.success) ElMessage.success(res.message || t('common.success'))
    else ElMessage.warning(res.message || t('common.error'))
  } catch (e: any) {
    ElMessage.error(e?.message || t('common.error'))
  } finally {
    testing.value = false
  }
}

async function doSave() {
  saving.value = true
  try {
    const payload: any = { certExpireDays: form.certExpireDays }
    if (form.aliKeyId && form.aliKeyId !== '••••••••' && !form.aliKeyId.endsWith('****')) payload.aliKeyId = form.aliKeyId
    if (form.aliKeySecret && form.aliKeySecret !== '••••••••' && form.aliKeySecret !== '****') payload.aliKeySecret = form.aliKeySecret
    if (form.tencentSecretId && !form.tencentSecretId.endsWith('****')) payload.tencentSecretId = form.tencentSecretId
    if (form.tencentSecretKey && form.tencentSecretKey !== '••••••••' && form.tencentSecretKey !== '****') payload.tencentSecretKey = form.tencentSecretKey
    if (form.pushplusToken && form.pushplusToken !== '••••••••••') payload.pushplusToken = form.pushplusToken
    if (form.pushplusTitle) payload.pushplusTitle = form.pushplusTitle
    if (form.pushplusChannel) payload.pushplusChannel = form.pushplusChannel
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
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.page-header h2 { font-size: 20px; font-weight: 600; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-top: 4px; }
.card { background: var(--bg-elevated); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.card h3 { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
.card-desc { font-size: 12px; color: var(--text-tertiary); margin: -10px 0 16px; line-height: 1.6; }
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

/* ── Mobile ── */
@media (max-width: 768px) {
  .card :deep(.el-form-item) { display: block; margin-bottom: 16px; }
  .card :deep(.el-form-item__label) { width: auto !important; text-align: left; padding-bottom: 4px; }
  .card :deep(.el-form-item__content) { margin-left: 0 !important; }
}
@media (max-width: 480px) {
  .header-actions { width: 100%; }
  .header-actions .el-button { flex: 1; }
  .about-content { flex-direction: column; align-items: center; text-align: center; }
  .about-meta { flex-direction: column; gap: 8px; }
  .card { padding: 16px; }
}
</style>
