// late-graphs — reused workers whose later files need modules other workers
// already loaded.
//
// A non-isolated suite where every worker's first test file is trivial, and
// the files after it import large graphs that a file on some other worker
// loaded earlier. Whatever a worker learns from its first run request (a
// warm-module snapshot, for example) says nothing about the modules its later
// files need, so anything decided once per worker instead of once per file
// shows up here as one round trip per module.
//
//   - trivial: TRIVIAL files that sort first (the config sorts files by
//     name and fixes maxWorkers to TRIVIAL), one per worker
//   - chains: CHAINS chains of CHAIN modules; a chain is discovered one
//     import at a time, like a deep dependency
//   - heavy: HEAVY files, file h importing chain h % CHAINS, so the second
//     half reuses the chains the first half loaded
import { createApp, tsModule } from '../../tools/generator/helpers.mjs'

const TRIVIAL = 4
const CHAINS = 12
const HEAVY = 24
// `--chain=L` sets the chain length, which is how many round trips a later
// file pays when nothing tells its worker about the chain in advance
const CHAIN = Number(process.argv.find(a => a.startsWith('--chain='))?.slice('--chain='.length) ?? 250)

const app = createApp(import.meta.url)

for (let t = 0; t < TRIVIAL; t++) {
  app.write(`tests/a-trivial-${t}.test.ts`, `import { expect, it } from 'vitest'

it('is trivial', () => {
  expect(${t}).toBe(${t})
})
`)
}

for (let c = 0; c < CHAINS; c++) {
  for (let i = 0; i < CHAIN; i++) {
    const next = i + 1 < CHAIN
      ? `import { c${c}m${i + 1}Walk } from './m${i + 1}'\n`
      : ''
    const walk = `
export function c${c}m${i}Walk(): number {
  return 1${i + 1 < CHAIN ? ` + c${c}m${i + 1}Walk()` : ''}
}`
    app.write(`src/c${c}/m${i}.ts`, `${next}${tsModule(`c${c}m${i}`, i, walk)}`)
  }
}

for (let h = 0; h < HEAVY; h++) {
  const c = h % CHAINS
  app.write(`tests/b-heavy-${String(h).padStart(2, '0')}.test.ts`, `import { expect, it } from 'vitest'
import { c${c}m0Walk } from '../src/c${c}/m0'

it('walks chain ${c}', () => {
  expect(c${c}m0Walk()).toBe(${CHAIN})
})
`)
}

app.report('late-graphs', `${TRIVIAL} trivial files first, ${HEAVY} heavy files sharing ${CHAINS} chains of ${CHAIN} modules`)
