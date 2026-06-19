<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">🖥</div>
      <h2>Home Server Panel</h2>
      <p class="sub">登录以管理您的服务器</p>
      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="doLogin" size="large">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="auth.loading" class="btn-login">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import type { FormInstance, FormRules } from 'element-plus'

const auth   = useAuthStore()
const router = useRouter()
const error  = ref('')
const formRef = ref<FormInstance>()

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
    error.value = '用户名或密码错误'
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
}
.login-card {
  width: 380px;
  padding: 48px 40px;
  background: var(--bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.brand { font-size: 40px; margin-bottom: 12px; }
h2 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
.sub { color: var(--text-tertiary); font-size: 13px; margin-bottom: 32px; }
.btn-login { width: 100%; border-radius: var(--radius-md); }
.error { color: var(--accent-red); font-size: 13px; margin-top: 12px; }
</style>
