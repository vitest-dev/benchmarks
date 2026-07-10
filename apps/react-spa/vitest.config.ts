import { defineConfig } from 'vitest/config'
import { benchBrowser, benchTest } from '../../tools/config/bench-config.js'

export default defineConfig(async () => ({
  esbuild: { jsx: 'automatic' },
  test: {
    ...benchTest({
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    }),
    ...await benchBrowser(() => import('@vitest/browser-playwright')),
  },
}))
