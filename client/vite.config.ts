import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { readFileSync } from 'fs'

function readVersion(): string {
  try {
    const rootPkg = JSON.parse(readFileSync('../package.json', 'utf-8'))
    return rootPkg.version || '0.0.0'
  } catch { return '0.0.0' }
}

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/uploads': 'http://localhost:3456',
      '/ws': { target: 'ws://localhost:3456', ws: true },
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  define: {
    __APP_VERSION__: JSON.stringify(readVersion()),
    __APP_AUTHOR__: JSON.stringify('陈子疯'),
  },
  css: {
    preprocessorOptions: {
      scss: { additionalData: '' }
    }
  }
})
