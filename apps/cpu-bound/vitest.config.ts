import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

export default defineConfig({
  test: benchTest({
    pool: 'forks',
    environment: 'node',
  }),
})
