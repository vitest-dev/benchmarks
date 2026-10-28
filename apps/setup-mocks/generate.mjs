// setup-mocks — a large non-isolated suite whose setup files mock modules.
//
// The shape of the 6,600-file suite reported in vitest-dev/vitest#11752:
// `isolate: false`, a wide shared module graph, many test files, and a
// handful of setup files that register `vi.mock` calls for every test file. A
// reused worker re-runs the setup files before each of its files, so whatever
// the runtime does per file or per run request (resolving setup files and
// their mock paths, asking the main process for warm module snapshots, ...)
// is paid hundreds of times per worker, and every round trip to the main
// process queues behind the other workers' calls. No other app has mocking
// setup files, so none of them can see this cost.
//
//   - core: a binary tree of CORE modules; every test file evaluates all of
//     it through the root, like a monorepo's shared packages
//   - features: one module per test file that no other test file imports,
//     so every file also loads something new to its worker
//   - services: SETUPS modules, each mocked by one setup file; tests assert
//     the mocked values so the mocks are load-bearing
//
// Modelled on https://github.com/vjeux/vitest-warm-rpc-repro, scaled down
// so the app stays affordable in the default matrix.
import { createApp, tsModule } from '../../tools/generator/helpers.mjs'

const CORE = 1500
const SETUPS = 6
const TESTS = 800

const app = createApp(import.meta.url)

for (let i = 0; i < CORE; i++) {
  const children = [2 * i + 1, 2 * i + 2].filter(c => c < CORE)
  const imports = children.map(c => `import { m${c}Walk } from './m${c}'`).join('\n')
  const walk = `
export function m${i}Walk(): number {
  return 1${children.map(c => ` + m${c}Walk()`).join('')}
}`
  app.write(`src/core/m${i}.ts`, `${imports}${imports ? '\n' : ''}${tsModule(`m${i}`, i, walk)}`)
}

for (let s = 0; s < SETUPS; s++) {
  app.write(`src/services/s${s}.ts`, `export function s${s}Fetch(): string {
  return 'real-s${s}'
}
`)
  app.write(`tests/setup/setup${s}.ts`, `import { vi } from 'vitest'

vi.mock('../../src/services/s${s}', () => ({
  s${s}Fetch: () => 'mocked-s${s}',
}))
`)
}

for (let t = 0; t < TESTS; t++) {
  // each feature leans on a different deep node of the shared tree
  const node = CORE - 1 - (t % (CORE >> 1))
  app.write(`src/features/f${t}.ts`, `import { m${node}Compute, m${node}Default, m${node}Format } from '../core/m${node}'

export function f${t}Run(): string {
  return m${node}Format(m${node}Compute({ ...m${node}Default, id: ${t} }))
}
`)

  const s = t % SETUPS
  app.write(`tests/t${t}.test.ts`, `import { describe, expect, it } from 'vitest'
import { m0Walk } from '../src/core/m0'
import { f${t}Run } from '../src/features/f${t}'
import { s${s}Fetch } from '../src/services/s${s}'

describe('t${t}', () => {
  it('evaluates the shared tree', () => {
    expect(m0Walk()).toBe(${CORE})
  })

  it('runs its own feature', () => {
    expect(f${t}Run()).toMatch(/^ok:/)
  })

  it('sees the mock from the setup file', () => {
    expect(s${s}Fetch()).toBe('mocked-s${s}')
  })
})
`)
}

app.report('setup-mocks', `${CORE} core modules, ${TESTS} test files, ${SETUPS} mocking setup files`)
