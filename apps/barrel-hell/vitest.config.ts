import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  test: benchTest({
    environment: 'node',
  }),
})
