import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',   name: 'login',     component: () => import('../pages/Login.vue') },
    { path: '/install', name: 'install',   component: () => import('../pages/Install.vue') },
    {
      path: '/',
      component: () => import('../layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '',           name: 'dashboard', component: () => import('../pages/Dashboard.vue') },
        { path: 'ddns',       name: 'ddns',      component: () => import('../pages/Ddns.vue') },
        { path: 'ssl',        name: 'ssl',       component: () => import('../pages/Ssl.vue') },
        { path: 'nginx',      name: 'nginx',     component: () => import('../pages/Nginx.vue') },
        { path: 'port',       name: 'port',      component: () => import('../pages/Port.vue') },
        { path: 'pm2',        name: 'pm2',       component: () => import('../pages/Pm2.vue') },
        { path: 'cron',       name: 'cron',      component: () => import('../pages/Cron.vue') },
        { path: 'docker',     name: 'docker',    component: () => import('../pages/Docker.vue') },
        { path: 'ssh',        name: 'ssh',       component: () => import('../pages/Ssh.vue') },
        { path: 'settings',   name: 'settings',  component: () => import('../pages/Settings.vue') },
      ]
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('hsp_token')
  if (to.meta.requiresAuth && !token) return next('/login')
  next()
})

export default router
