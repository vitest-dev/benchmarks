import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  resolve: {
    alias: {
      '@util': fileURLToPath(new URL('./src/util', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@svc': fileURLToPath(new URL('./src/svc', import.meta.url)),
    },
  },
  test: benchTest({
    pool: 'forks',
    environment: 'node',
  }),
})
