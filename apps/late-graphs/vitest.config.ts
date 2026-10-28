import type { TestSpecification } from 'vitest/node'
import { BaseSequencer } from 'vitest/node'
import { defineConfig } from 'vitest/config'
import { benchTest } from '../../tools/config/bench-config.js'

// files run in name order, so every worker starts with a trivial file
class NameOrderSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
  }
}

export default defineConfig({
  test: benchTest({
    environment: 'node',
    maxWorkers: 4,
    sequence: { sequencer: NameOrderSequencer },
  }),
})
