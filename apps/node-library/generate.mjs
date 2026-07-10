// node-library — a mid-size published TypeScript library (think a utility or
// SDK package: internal helpers, a core layer, public modules grouped into
// feature entry points).
//
// Shape: 120 src modules in 3 layers (internal 40 → core 50 → modules 30),
// mild chains (depth ~10 inside the core layer), per-feature barrels and a
// root barrel. 40 test files that mostly import the specific module they
// test directly (how library repos actually write tests → largely disjoint
// subgraphs, mild sharing through internals), a few integration tests going
// through the root barrel, and a few fake-timer tests.
//
// Dimensions stressed: per-file worker lifecycle vs graph sharing
// (isolate true/false), fs module cache on a medium graph, pool choice.
// No dependencies, no DOM — jsdom/happy-dom cells on this app measure the
// pure cost of a cargo-culted DOM environment on node-only code.
import { createApp, tsModule } from '../../tools/generator/helpers.mjs'

const INTERNAL = 40
const CORE = 50
const MODULES = 30
const FEATURES = 6
const TESTS = 40

const app = createApp(import.meta.url)

for (let i = 0; i < INTERNAL; i++)
  app.write(`src/internal/h${i}.ts`, tsModule(`h${i}`, i))

for (let i = 0; i < CORE; i++) {
  const helpers = [(i * 7) % INTERNAL, (i * 7 + 3) % INTERNAL]
  const imports = helpers.map(h => `import { h${h}Compute, h${h}Default } from '../internal/h${h}'`)
  // chain inside each decade of core modules → max import depth ~10
  const prev = i % 10 !== 0 ? `import { c${i - 1}All } from './c${i - 1}'\n` : ''
  const extra = `
export function c${i}All(): number {
  const results = [${helpers.map(h => `h${h}Compute(h${h}Default)`).join(', ')}]
  ${i % 10 !== 0 ? `const upstream = c${i - 1}All()` : 'const upstream = 0'}
  return results.filter(r => r.ok).length + upstream
}`
  app.write(`src/core/c${i}.ts`, `${imports.join('\n')}\n${prev}${tsModule(`c${i}`, i, extra)}`)
}

for (let i = 0; i < MODULES; i++) {
  const cores = [(i * 3) % CORE, (i * 3 + 7) % CORE]
  const helper = (i * 11) % INTERNAL
  const imports = [
    ...cores.map(c => `import { c${c}All } from '../core/c${c}'`),
    `import { h${helper}Format, h${helper}Compute, h${helper}Default } from '../internal/h${helper}'`,
  ]
  const timer = i % 5 === 0
    ? `
export function a${i}Defer(callback: (value: string) => void, ms: number): void {
  setTimeout(() => callback(a${i}Run()), ms)
}`
    : ''
  const extra = `
export function a${i}Run(): string {
  const counts = [${cores.map(c => `c${c}All()`).join(', ')}]
  return counts.join(',') + '|' + h${helper}Format(h${helper}Compute(h${helper}Default))
}${timer}`
  app.write(`src/modules/a${i}.ts`, `${imports.join('\n')}\n${tsModule(`a${i}`, i, extra)}`)
}

const perFeature = MODULES / FEATURES
for (let f = 0; f < FEATURES; f++) {
  const members = Array.from({ length: perFeature }, (_, k) => f * perFeature + k)
  app.write(
    `src/features/feature-${f}.ts`,
    `${members.map(m => `export * from '../modules/a${m}'`).join('\n')}\n`,
  )
}
app.write(
  'src/index.ts',
  `${Array.from({ length: FEATURES }, (_, f) => `export * from './features/feature-${f}'`).join('\n')}\n`,
)

for (let t = 0; t < TESTS; t++) {
  const mod = t % MODULES
  const core = (t * 13) % CORE
  const internal = (t * 17) % INTERNAL

  if (t % 8 === 0) {
    // integration test through the root barrel (pulls the whole library)
    app.write(`tests/t${t}.test.ts`, `import { describe, expect, it } from 'vitest'
import { a${mod}Run, a${(mod + 5) % MODULES}Run, a${(mod + 11) % MODULES}Compute } from '../src'

describe('integration t${t}', () => {
  it('composes public modules', () => {
    expect(a${mod}Run()).toContain('|')
    expect(a${(mod + 5) % MODULES}Run()).toContain(',')
  })
  it('computes through the barrel', () => {
    const result = a${(mod + 11) % MODULES}Compute({ id: ${t + 1} })
    expect(result.ok).toBe(true)
  })
})
`)
    continue
  }

  const timers = t % 5 === 0 && mod % 5 === 0
  app.write(`tests/t${t}.test.ts`, `import { ${timers ? 'afterEach, beforeEach, ' : ''}describe, expect, it${timers ? ', vi' : ''} } from 'vitest'
import { a${mod}Compute, a${mod}Default, a${mod}Register, a${mod}Run${timers ? `, a${mod}Defer` : ''} } from '../src/modules/a${mod}'
import { c${core}All } from '../src/core/c${core}'
import { h${internal}Format, h${internal}Compute } from '../src/internal/h${internal}'

describe('a${mod} (t${t})', () => {
  it('computes with defaults', () => {
    const result = a${mod}Compute(a${mod}Default)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value).toBeGreaterThanOrEqual(0)
  })
  it('registry affects tagged computation', () => {
    a${mod}Register('t${t}', ${t + 100})
    const tagged = a${mod}Compute({ id: 1, tag: 't${t}' })
    const plain = a${mod}Compute({ id: 1 })
    expect(tagged.ok && plain.ok && tagged.value - plain.value).toBe(${t + 100})
  })
  it('runs the core chain', () => {
    expect(a${mod}Run().length).toBeGreaterThan(2)
    expect(c${core}All()).toBeGreaterThanOrEqual(0)
    expect(h${internal}Format(h${internal}Compute({ id: 2 }))).toMatch(/^ok:/)
  })${timers
    ? `
  describe('deferred', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())
    it('defers through setTimeout', () => {
      const seen: string[] = []
      a${mod}Defer(value => seen.push(value), 250)
      vi.advanceTimersByTime(249)
      expect(seen).toHaveLength(0)
      vi.advanceTimersByTime(1)
      expect(seen).toHaveLength(1)
    })
  })`
    : ''}
})
`)
}

app.report('node-library', `${INTERNAL + CORE + MODULES + FEATURES + 1} src modules, ${TESTS} test files`)
