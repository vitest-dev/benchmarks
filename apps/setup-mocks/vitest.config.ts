import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  test: benchTest({
    environment: 'node',
    setupFiles: Array.from({ length: 6 }, (_, s) => `./tests/setup/setup${s}.ts`),
  }),
})
