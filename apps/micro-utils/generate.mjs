// micro-utils — the most common real-world Vitest project.
//
// OSS surveys of Vitest usage put the *median* project at ~4 test files;
// ~70% have 15 or fewer. This app models that majority: a tiny pure-TS
// utility package with a handful of focused test files, no dependencies,
// no DOM. Startup overhead (CLI boot, worker spawn, config load) dominates
// here — test and transform time are negligible by construction.
//
// Shape: 8 src modules (~2-level import graph, one small barrel), 5 test
// files, one of which uses fake timers (debounce/throttle).
import { createApp } from '../../tools/generator/helpers.mjs'

const app = createApp(import.meta.url)

app.write('src/types.ts', `export interface Dict<T> { [key: string]: T }
export type Comparator<T> = (a: T, b: T) => number
export type Predicate<T> = (value: T, index: number) => boolean
export interface Range { min: number, max: number }
`)

app.write('src/strings.ts', `export function capitalize(input: string): string {
  return input.length === 0 ? input : input[0].toUpperCase() + input.slice(1)
}
export function camelCase(input: string): string {
  return input
    .split(/[-_\\s]+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word.toLowerCase())))
    .join('')
}
export function truncate(input: string, length: number, suffix = '...'): string {
  if (input.length <= length)
    return input
  return input.slice(0, Math.max(0, length - suffix.length)) + suffix
}
export function words(input: string): string[] {
  return input.split(/\\s+/).filter(Boolean)
}
`)

app.write('src/numbers.ts', `import type { Range } from './types'

export function clamp(value: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, value))
}
export function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}
export function mean(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : sum(values) / values.length
}
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
`)

app.write('src/arrays.ts', `import type { Predicate } from './types'
import { sum } from './numbers'

export function chunk<T>(input: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < input.length; i += size)
    out.push(input.slice(i, i + size))
  return out
}
export function uniq<T>(input: readonly T[]): T[] {
  return [...new Set(input)]
}
export function partition<T>(input: readonly T[], predicate: Predicate<T>): [T[], T[]] {
  const pass: T[] = []
  const fail: T[] = []
  input.forEach((value, index) => (predicate(value, index) ? pass : fail).push(value))
  return [pass, fail]
}
export function total(input: readonly number[][]): number {
  return sum(input.map(row => sum(row)))
}
`)

app.write('src/objects.ts', `import type { Dict } from './types'

export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj)
      out[key] = obj[key]
  }
  return out
}
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const out = { ...obj }
  for (const key of keys)
    delete out[key]
  return out as Omit<T, K>
}
export function invert(obj: Dict<string>): Dict<string> {
  const out: Dict<string> = {}
  for (const [key, value] of Object.entries(obj))
    out[value] = key
  return out
}
`)

app.write('src/async.ts', `export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args) => {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}
`)

app.write('src/validate.ts', `import { words } from './strings'

export function isEmail(input: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(input)
}
export function isSlug(input: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input)
}
export function isSentence(input: string): boolean {
  return words(input).length > 1 && /[.!?]$/.test(input)
}
`)

app.write('src/index.ts', `export * from './arrays'
export * from './async'
export * from './numbers'
export * from './objects'
export * from './strings'
export * from './types'
export * from './validate'
`)

app.write('tests/strings.test.ts', `import { describe, expect, it } from 'vitest'
import { camelCase, capitalize, truncate, words } from '../src/strings'

describe('strings', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('vitest')).toBe('Vitest')
    expect(capitalize('')).toBe('')
  })
  it('camel-cases separated words', () => {
    expect(camelCase('foo-bar_baz qux')).toBe('fooBarBazQux')
  })
  it('truncates long strings with a suffix', () => {
    expect(truncate('benchmarking', 8)).toBe('bench...')
    expect(truncate('short', 8)).toBe('short')
  })
  it('splits into words', () => {
    expect(words('  a  b  c ')).toEqual(['a', 'b', 'c'])
  })
})
`)

app.write('tests/numbers.test.ts', `import { describe, expect, it } from 'vitest'
import { chunk, partition, total, uniq } from '../src/arrays'
import { clamp, mean, roundTo, sum } from '../src/numbers'

describe('numbers', () => {
  it('clamps into range', () => {
    expect(clamp(15, { min: 0, max: 10 })).toBe(10)
    expect(clamp(-3, { min: 0, max: 10 })).toBe(0)
  })
  it('sums and averages', () => {
    expect(sum([1, 2, 3, 4])).toBe(10)
    expect(mean([2, 4, 6])).toBe(4)
  })
  it('rounds to digits', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14)
  })
})

describe('arrays', () => {
  it('chunks evenly', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('dedupes', () => {
    expect(uniq([1, 1, 2, 3, 3])).toEqual([1, 2, 3])
  })
  it('partitions by predicate', () => {
    expect(partition([1, 2, 3, 4], v => v % 2 === 0)).toEqual([[2, 4], [1, 3]])
  })
  it('totals a matrix', () => {
    expect(total([[1, 2], [3, 4]])).toBe(10)
  })
})
`)

app.write('tests/objects.test.ts', `import { describe, expect, it } from 'vitest'
import { invert, omit, pick } from '../src/objects'

describe('objects', () => {
  const subject = { a: 1, b: 2, c: 3 }
  it('picks keys', () => {
    expect(pick(subject, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })
  it('omits keys', () => {
    expect(omit(subject, ['b'])).toEqual({ a: 1, c: 3 })
  })
  it('inverts string records', () => {
    expect(invert({ x: 'one', y: 'two' })).toEqual({ one: 'x', two: 'y' })
  })
})
`)

app.write('tests/async.test.ts', `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, sleep } from '../src/async'

describe('async utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounce collapses rapid calls', () => {
    const calls: number[] = []
    const push = debounce((n: number) => calls.push(n), 50)
    push(1)
    push(2)
    push(3)
    vi.advanceTimersByTime(49)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual([3])
  })

  it('sleep resolves after the timeout', async () => {
    let done = false
    const pending = sleep(100).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(99)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(done).toBe(true)
  })
})
`)

app.write('tests/index.test.ts', `import { describe, expect, it } from 'vitest'
import { camelCase, chunk, clamp, isEmail, isSlug, pick } from '../src'

describe('public api', () => {
  it('re-exports every module', () => {
    expect(camelCase('public api')).toBe('publicApi')
    expect(chunk([1, 2, 3], 2)).toHaveLength(2)
    expect(clamp(5, { min: 0, max: 3 })).toBe(3)
    expect(pick({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 })
  })
  it('validates formats', () => {
    expect(isEmail('team@vitest.dev')).toBe(true)
    expect(isSlug('bench-apps')).toBe(true)
    expect(isSlug('Not A Slug')).toBe(false)
  })
})
`)

app.report('micro-utils', '8 src modules, 5 test files')
