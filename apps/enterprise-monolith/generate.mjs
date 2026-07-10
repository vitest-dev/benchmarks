// enterprise-monolith — the big-repo CI fixture (~1280 src modules, 150 test
// files) with the messy structure large codebases accumulate:
//
//   - 4 layers (util 400 → core 300 → svc 250 → feat 250) plus a 60-module
//     linear chain as a serial-fetch depth probe
//   - import chains ~12 deep inside the core layer, 5 genuine import cycles
//   - path aliases (@util/@core/@svc) on every svc/feat import
//   - dynamic `await import()` in every 10th feature
//   - JSON imports, a sprinkle of real deps (zod, dayjs)
//   - partial barrels: 10 feature group files, used by a third of the tests
//   - 15 of 150 test files opt into jsdom via `@vitest-environment` pragma
//     (mixed-environment suites fragment worker reuse under isolate:false)
//
// Dimensions stressed: module graph scale (transform + per-file RPC fetch
// waterfall), fs module cache cold/warm, isolate cost at scale, alias
// resolution, mixed environments.
import { createApp, tsModule } from '../../tools/generator/helpers.mjs'

const UTIL = 400
const CORE = 300
const SVC = 250
const FEAT = 250
const CHAIN = 60
const GROUPS = 10
const TESTS = 150
const CYCLES = [20, 70, 120, 170, 220]

const app = createApp(import.meta.url)

for (let i = 0; i < UTIL; i++)
  app.write(`src/util/u${i}.ts`, tsModule(`u${i}`, i))

for (let k = 0; k < GROUPS; k++) {
  app.write(`src/data/cfg${k}.json`, `${JSON.stringify({ name: `cfg${k}`, limit: k * 10 + 5, tags: ['alpha', 'beta'] }, null, 2)}\n`)
}

for (let i = 0; i < CORE; i++) {
  const utils = [(i * 7) % UTIL, (i * 7 + 3) % UTIL, (i * 7 + 5) % UTIL]
  const imports = utils.map(u => `import { u${u}Compute, u${u}Default } from '../util/u${u}'`)
  const chained = i % 12 !== 0
  if (chained)
    imports.push(`import { c${i - 1}All } from './c${i - 1}'`)
  let cycle = ''
  if (CYCLES.includes(i)) {
    imports.push(`import { c${i + 1}Ping } from './c${i + 1}'`)
    cycle = `
export function c${i}Pong(n: number): number {
  return n <= 0 ? 0 : c${i + 1}Ping(n - 1) + 1
}`
  }
  else if (CYCLES.includes(i - 1)) {
    imports.push(`import { c${i - 1}Pong } from './c${i - 1}'`)
    cycle = `
export function c${i}Ping(n: number): number {
  return n <= 0 ? 0 : c${i - 1}Pong(n - 1) + 1
}`
  }
  const extra = `${cycle}
export function c${i}All(): number {
  const results = [${utils.map(u => `u${u}Compute(u${u}Default)`).join(', ')}]
  const upstream = ${chained ? `c${i - 1}All()` : '0'}
  return results.filter(r => r.ok).length + upstream
}`
  app.write(`src/core/c${i}.ts`, `${imports.join('\n')}\n${tsModule(`c${i}`, i, extra)}`)
}

for (let i = 0; i < SVC; i++) {
  const cores = [i % CORE, (i + 9) % CORE, (i + 17) % CORE, (i + 23) % CORE]
  const util = (i * 13) % UTIL
  const imports = [
    ...cores.map(c => `import { c${c}All } from '@core/c${c}'`),
    `import { u${util}Format, u${util}Compute, u${util}Default } from '@util/u${util}'`,
  ]
  let extra = ''
  if (i % 9 === 0) {
    imports.push(`import { z } from 'zod'`)
    extra += `
const s${i}Schema = z.object({ id: z.number(), tag: z.string().optional() })
export function s${i}Parse(id: number): boolean {
  return s${i}Schema.safeParse({ id }).success
}`
  }
  if (i % 11 === 0) {
    imports.push(`import dayjs from 'dayjs'`)
    extra += `
export const s${i}Stamp: string = dayjs('2026-01-01').add(${i % 90}, 'day').format('YYYY-MM-DD')`
  }
  if (i % 25 === 0) {
    imports.push(`import cfg${i / 25} from '../data/cfg${i / 25}.json'`)
    extra += `
export const s${i}Limit: number = cfg${i / 25}.limit`
  }
  extra += `
export function s${i}Run(): string {
  const counts = [${cores.map(c => `c${c}All()`).join(', ')}]
  return counts.join(',') + '|' + u${util}Format(u${util}Compute(u${util}Default))
}`
  app.write(`src/svc/s${i}.ts`, `${imports.join('\n')}\n${tsModule(`s${i}`, i, extra)}`)
}

for (let i = 0; i < FEAT; i++) {
  const svcs = [(i * 3) % SVC, (i * 3 + 11) % SVC]
  const imports = svcs.map(s => `import { s${s}Run } from '@svc/s${s}'`)
  let extra = `
export function f${i}Render(): string {
  return [${svcs.map(s => `s${s}Run()`).join(', ')}].join('|')
}`
  if (i % 10 === 0) {
    const lazy = (i * 3 + 7) % SVC
    extra += `
export async function f${i}Lazy(): Promise<string> {
  const mod = await import('@svc/s${lazy}')
  return mod.s${lazy}Run()
}`
  }
  app.write(`src/feat/f${i}.ts`, `${imports.join('\n')}\n${tsModule(`f${i}`, i, extra)}`)
}

const perGroup = FEAT / GROUPS
for (let g = 0; g < GROUPS; g++) {
  const members = Array.from({ length: perGroup }, (_, k) => g * perGroup + k)
  app.write(
    `src/feat/group-${g}.ts`,
    `${members.map(m => `export * from './f${m}'`).join('\n')}\n`,
  )
}

for (let i = 0; i < CHAIN; i++) {
  const next = i < CHAIN - 1 ? `import { d${i + 1}Depth } from './d${i + 1}'\n` : ''
  const value = i < CHAIN - 1 ? `d${i + 1}Depth() + 1` : '0'
  app.write(`src/chain/d${i}.ts`, `${next}export function d${i}Depth(): number {
  return ${value}
}
${tsModule(`d${i}`, i)}`)
}

for (let t = 0; t < TESTS; t++) {
  const feats = [(t * 3) % FEAT, (t * 3 + 11) % FEAT, (t * 3 + 23) % FEAT]
  const viaBarrel = t % 3 === 0
  const dom = t % 10 === 7
  const imports = feats.map((f, idx) => viaBarrel && idx === 0
    ? `import { f${f}Render } from '../src/feat/group-${Math.floor(f / perGroup)}'`
    : `import { f${f}Render } from '../src/feat/f${f}'`)

  const extraTests = []
  if (t % 20 === 0) {
    imports.push(`import { d0Depth } from '../src/chain/d0'`)
    extraTests.push(`  it('resolves the deep chain', () => {
    expect(d0Depth()).toBe(${CHAIN - 1})
  })`)
  }
  if (t % 20 === 10) {
    const cycle = CYCLES[(t / 20 - 0.5) % CYCLES.length | 0]
    imports.push(`import { c${cycle}Pong } from '../src/core/c${cycle}'`)
    extraTests.push(`  it('survives the import cycle', () => {
    expect(c${cycle}Pong(4)).toBe(4)
  })`)
  }
  if (t % 10 === 3) {
    const lazyFeat = feats[0] - (feats[0] % 10)
    imports.push(`import { f${lazyFeat}Lazy } from '../src/feat/f${lazyFeat}'`)
    extraTests.push(`  it('loads services lazily', async () => {
    await expect(f${lazyFeat}Lazy()).resolves.toContain('|')
  })`)
  }
  if (dom) {
    extraTests.push(`  it('touches the DOM', () => {
    const el = document.createElement('div')
    el.textContent = f${feats[0]}Render()
    document.body.appendChild(el)
    expect(document.body.textContent).toContain('|')
  })`)
  }

  app.write(`tests/t${t}.test.ts`, `${dom ? '// @vitest-environment jsdom\n' : ''}import { describe, expect, it } from 'vitest'
${imports.join('\n')}

describe('t${t}', () => {
  it('renders features', () => {
${feats.map(f => `    expect(f${f}Render()).toContain('|')`).join('\n')}
  })
${extraTests.join('\n')}
})
`)
}

app.report('enterprise-monolith', `${UTIL + CORE + SVC + FEAT + CHAIN + GROUPS} src modules + ${GROUPS} json, ${TESTS} test files (15 jsdom via pragma)`)
