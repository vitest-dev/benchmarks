import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: benchTest({
    pool: 'forks',
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  }),
})
