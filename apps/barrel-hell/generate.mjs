// barrel-hell — the barrel-file pathology in isolation.
//
// Every test imports a couple of symbols from the root barrel, which
// re-exports 16 domain barrels of 50 modules each. Each test file therefore
// pulls the entire 800-module graph to use ~3 functions. This is the classic
// accidental cost in codebases with `import { x } from '~/lib'` conventions,
// and the shape where per-file isolation multiplies graph cost the hardest:
// isolate:true re-imports 800 modules per test file, isolate:false pays once
// per worker. Modules themselves are shallow (no deep chains) so the effect
// measured here is graph *width* through barrels, nothing else.
//
// No dependencies, no DOM, plain TS.
import { createApp, tsModule } from '../../tools/generator/helpers.mjs'

const DOMAINS = 16
const PER_DOMAIN = 50
const TESTS = 20

const app = createApp(import.meta.url)

for (let d = 0; d < DOMAINS; d++) {
  for (let i = 0; i < PER_DOMAIN; i++) {
    // shallow pairing: odd modules import their even sibling, plus one
    // cross-domain edge every 10th module to keep domains interconnected
    const imports = []
    if (i % 2 === 1)
      imports.push(`import { d${d}m${i - 1}Compute } from './m${i - 1}'`)
    if (i % 10 === 0 && d > 0)
      imports.push(`import { d${d - 1}m${i}Format, d${d - 1}m${i}Compute } from '../d${d - 1}/m${i}'`)
    const extra = imports.length > 0
      ? `
export function d${d}m${i}Linked(): string {
  ${i % 2 === 1 ? `const sibling = d${d}m${i - 1}Compute({ id: ${i} })` : 'const sibling = { ok: true as const, value: 0 }'}
  ${i % 10 === 0 && d > 0 ? `const cross = d${d - 1}m${i}Format(d${d - 1}m${i}Compute({ id: ${d} }))` : `const cross = 'none'`}
  return (sibling.ok ? 'ok' : 'err') + ':' + cross
}`
      : ''
    app.write(`src/domains/d${d}/m${i}.ts`, `${imports.join('\n')}${imports.length ? '\n' : ''}${tsModule(`d${d}m${i}`, i, extra)}`)
  }
  app.write(
    `src/domains/d${d}/index.ts`,
    `${Array.from({ length: PER_DOMAIN }, (_, i) => `export * from './m${i}'`).join('\n')}\n`,
  )
}

app.write(
  'src/index.ts',
  `${Array.from({ length: DOMAINS }, (_, d) => `export * from './domains/d${d}'`).join('\n')}\n`,
)

for (let t = 0; t < TESTS; t++) {
  const d = t % DOMAINS
  const m = (t * 7) % PER_DOMAIN
  const m2 = (t * 7 + 13) % PER_DOMAIN
  app.write(`tests/t${t}.test.ts`, `import { describe, expect, it } from 'vitest'
import { d${d}m${m}Compute, d${d}m${m}Default, d${(d + 3) % DOMAINS}m${m2}Format, d${(d + 3) % DOMAINS}m${m2}Compute } from '../src'

describe('t${t}', () => {
  it('uses a handful of symbols from the 800-module barrel', () => {
    const result = d${d}m${m}Compute(d${d}m${m}Default)
    expect(result.ok).toBe(true)
  })
  it('formats across domains', () => {
    expect(d${(d + 3) % DOMAINS}m${m2}Format(d${(d + 3) % DOMAINS}m${m2}Compute({ id: ${t + 1} }))).toMatch(/^ok:/)
  })
})
`)
}

app.report('barrel-hell', `${DOMAINS * PER_DOMAIN + DOMAINS + 1} src modules, ${TESTS} test files, every test pulls the full graph`)
