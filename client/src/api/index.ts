import axios from 'axios'
import router from '../router'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

// Request interceptor: attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('hsp_token')
  if (token) config.headers['x-auth-token'] = token
  return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('hsp_token')
      router.push('/login')
    }
    return Promise.reject(err)
  }
)

export default api
