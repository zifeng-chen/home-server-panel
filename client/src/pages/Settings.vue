<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>系统设置</h2>
        <p class="sub">配置服务参数与云凭证</p>
      </div>
      <el-button type="danger" @click="confirmRestart" :icon="RefreshRight" plain>重启服务</el-button>
    </div>

    <div class="card">
      <h3>云服务凭证</h3>
      <el-form :model="form" label-width="120px">
        <el-form-item label="阿里云 AK ID">
          <el-input v-model="form.aliKeyId" :placeholder="form._hasAliKey ? '留空则不修改' : '保存后生效'" />
          <el-tag v-if="form._hasAliKey" type="success" size="small" style="margin-left:8px">已配置</el-tag>
        </el-form-item>
        <el-form-item label="阿里云 AK Secret"><el-input v-model="form.aliKeySecret" type="password" show-password :placeholder="form._hasAliKey ? '留空则不修改' : '保存后生效'" /></el-form-item>
        <el-form-item label="腾讯云 Secret ID">
          <el-input v-model="form.tencentSecretId" :placeholder="form._hasTencentKey ? '留空则不修改' : '保存后生效'" />
          <el-tag v-if="form._hasTencentKey" type="success" size="small" style="margin-left:8px">已配置</el-tag>
        </el-form-item>
        <el-form-item label="腾讯云 Secret Key"><el-input v-model="form.tencentSecretKey" type="password" show-password :placeholder="form._hasTencentKey ? '留空则不修改' : '保存后生效'" /></el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3>通知与证书</h3>
      <el-form :model="form" label-width="120px">
        <el-form-item label="PushPlus Token"><el-input v-model="form.pushplusToken" placeholder="微信推送通知" /></el-form-item>
        <el-form-item label="ACME 邮箱"><el-input v-model="form.acmeEmail" placeholder="admin@example.com" /></el-form-item>
        <el-form-item label="DNS 服务商"><el-input v-model="form.acmeDns" placeholder="alidns" /></el-form-item>
        <el-form-item label="证书到期预警"><el-input-number v-model="form.certExpireDays" :min="1" :max="90" /> 天</el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3>功能模块</h3>
      <el-form label-width="80px">
        <el-form-item v-for="m in modules" :key="m.key" :label="m.name">
          <el-tag :type="m.enabled ? 'success' : 'info'">{{ m.enabled ? '已启用' : '未启用' }}</el-tag>
          <span class="hint-mod">{{ m.key }}</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="card save-bar">
      <el-button type="primary" @click="doSave" :loading="saving" :icon="Check">保存设置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, RefreshRight } from '@element-plus/icons-vue'
import api from '../api'

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
      // 解析模块
      const mods = d.modules || {}
      modules.value = Object.entries(mods).map(([k, v]) => ({ key: k, name: k.toUpperCase(), enabled: v }))
    }
  } catch { ElMessage.error('加载配置失败') }
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
    if (res.success) ElMessage.success('配置已保存')
    else ElMessage.error(res.message || '保存失败')
  } catch { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function confirmRestart() {
  await ElMessageBox.confirm('确定要重启服务吗？终端连接会中断。', '确认重启', { type: 'warning' })
  ElMessage.info('正在重启服务...')
  // 调用重启 API
  try { await api.post('/system/restart') } catch { /* 重启后 API 不可达 */ }
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
