import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

const saved = localStorage.getItem('hsp_lang') || 'zh-CN'

export default createI18n({
  legacy: false,
  locale: saved,
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})
