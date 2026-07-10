import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { benchBrowser, benchTest } from '../../tools/config/bench-config.js'

export default defineConfig(async () => ({
  plugins: [vue()],
  test: {
    ...benchTest({
      environment: 'jsdom',
    }),
    ...await benchBrowser(() => import('@vitest/browser-playwright')),
  },
}))
