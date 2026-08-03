import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  test: {
    ...benchTest({
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    }),
    // pinned so recycling pressure is deterministic instead of scaling with
    // the host's RAM — see generate.mjs
    vmMemoryLimit: '512MB',
  },
})
