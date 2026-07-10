import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  plugins: [vue()],
  test: benchTest({
    environment: 'jsdom',
  }),
})
