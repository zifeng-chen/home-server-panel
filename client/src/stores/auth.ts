import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useAuthStore = defineStore('auth', () => {
  const token   = ref(localStorage.getItem('hsp_token') || '')
  const user    = ref<{ username: string } | null>(null)
  const loading = ref(false)

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.post('/auth/login', { username, password }) as any
      if (res.success) {
        token.value = res.data.token
        localStorage.setItem('hsp_token', res.data.token)
        user.value = { username: res.data.username || username }
        return true
      }
      return false
    } finally { loading.value = false }
  }

  async function check() {
    try {
      const res = await api.get('/auth/status') as any
      if (res.success) user.value = { username: res.data.username }
    } catch { /* ignore */ }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('hsp_token')
  }

  return { token, user, loading, login, check, logout }
})
