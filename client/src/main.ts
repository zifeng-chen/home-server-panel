import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import en from 'element-plus/dist/locale/en.mjs'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './styles/variables.css'

// 初始化深色模式
const theme = localStorage.getItem('hsp_theme')
if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark')
}

const app = createApp(App)
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp)
}
app.use(createPinia())
app.use(router)
app.use(i18n)

// Element Plus locale：跟随 i18n 语言切换
const lang = localStorage.getItem('hsp_lang') || 'zh-CN'
app.use(ElementPlus, { locale: lang === 'en-US' ? en : zhCn })

app.mount('#app')
