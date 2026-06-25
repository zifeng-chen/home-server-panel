import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export const useAuthStore = defineStore('auth', () => {
  const token   = ref(localStorage.getItem('hsp_token') || '')
  const user    = ref<{ username: string; role: string } | null>(
    localStorage.getItem('hsp_role')
      ? { username: localStorage.getItem('hsp_username') || '', role: localStorage.getItem('hsp_role')! }
      : null
  )
  const loading = ref(false)

  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.post('/auth/login', { username, password }) as any
      if (res.success) {
        token.value = res.data.token
        localStorage.setItem('hsp_token', res.data.token)
        user.value = { username: res.data.username || username, role: res.data.role || 'user' }
        localStorage.setItem('hsp_username', user.value.username)
        localStorage.setItem('hsp_role', user.value.role)
        return true
      }
      return false
    } finally { loading.value = false }
  }

  async function check() {
    try {
      const res = await api.get('/users/me') as any
      if (res.success && res.data) {
        user.value = { username: res.data.username, role: res.data.role || 'user' }
        localStorage.setItem('hsp_username', user.value.username)
        localStorage.setItem('hsp_role', user.value.role)
      }
    } catch { /* ignore */ }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('hsp_token')
    localStorage.removeItem('hsp_username')
    localStorage.removeItem('hsp_role')
  }

  return { token, user, loading, isAdmin, login, check, logout }
})
