// cpu-bound — a suite whose time is spent in the tests themselves.
//
// Tiny module graph (8 modules, no barrels, no deps, no DOM), 30 test files
// that each burn real CPU (hashing, sieving, matrix multiplication, sorting).
// Framework overhead is negligible by construction, which makes this the
// scheduling fixture: maxWorkers percentages and pool choice matter here,
// isolate and caches should not. It is also the false-positive guard for
// `vitest doctor` / performance hints — nothing should be recommended for
// this suite, because no config change can speed up the tests' own work.
//
// All workloads are deterministic (LCG-seeded); iteration counts target
// roughly 30-80ms per test on a laptop-class machine.
import { createApp } from '../../tools/generator/helpers.mjs'

const TESTS = 30

const app = createApp(import.meta.url)

app.write('src/lcg.ts', `export function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xFFFFFFFF
  }
}
export function fill(seed: number, length: number): number[] {
  const next = lcg(seed)
  return Array.from({ length }, () => Math.floor(next() * 1e9))
}
`)

app.write('src/fnv.ts', `export function fnv1a(input: string): number {
  let hash = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}
export function hashRounds(seed: string, rounds: number): number {
  let value = seed
  let acc = 0
  for (let i = 0; i < rounds; i++) {
    acc = fnv1a(value + i.toString(36))
    value = acc.toString(16)
  }
  return acc
}
`)

app.write('src/primes.ts', `export function sieve(limit: number): number {
  const composite = new Uint8Array(limit + 1)
  let count = 0
  for (let i = 2; i <= limit; i++) {
    if (composite[i] === 0) {
      count++
      for (let j = i * 2; j <= limit; j += i)
        composite[j] = 1
    }
  }
  return count
}
`)

app.write('src/matrix.ts', `import { lcg } from './lcg'

export function matmulChecksum(size: number, reps: number, seed: number): number {
  const next = lcg(seed)
  const a = Float64Array.from({ length: size * size }, () => next())
  const b = Float64Array.from({ length: size * size }, () => next())
  const out = new Float64Array(size * size)
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let acc = 0
        for (let k = 0; k < size; k++)
          acc += a[i * size + k] * b[k * size + j]
        out[i * size + j] = acc
      }
    }
  }
  let checksum = 0
  for (let i = 0; i < out.length; i++)
    checksum += out[i]
  return checksum
}
`)

app.write('src/sorting.ts', `import { fill } from './lcg'

export function sortChecksum(seed: number, length: number): { first: number, last: number, sorted: boolean } {
  const values = fill(seed, length)
  values.sort((a, b) => a - b)
  let sorted = true
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > values[i])
      sorted = false
  }
  return { first: values[0], last: values[values.length - 1], sorted }
}
`)

app.write('src/stats.ts', `import { fill } from './lcg'

export function distribution(seed: number, length: number, buckets: number): number[] {
  const values = fill(seed, length)
  const out = Array.from({ length: buckets }, () => 0)
  for (const value of values)
    out[value % buckets]++
  return out
}
`)

app.write('src/text.ts', `import { fnv1a } from './fnv'
import { lcg } from './lcg'

export function synthesize(seed: number, words: number): string {
  const next = lcg(seed)
  const parts: string[] = []
  for (let i = 0; i < words; i++)
    parts.push(Math.floor(next() * 1e9).toString(36))
  return parts.join(' ')
}
export function digest(seed: number, words: number): number {
  return fnv1a(synthesize(seed, words))
}
`)

app.write('src/pipeline.ts', `import { hashRounds } from './fnv'
import { matmulChecksum } from './matrix'
import { sieve } from './primes'
import { sortChecksum } from './sorting'

export function pipeline(seed: number): { primes: number, hash: number, matrix: number, sorted: boolean } {
  return {
    primes: sieve(200000),
    hash: hashRounds('pipeline-' + seed, 2000),
    matrix: matmulChecksum(48, 2, seed),
    sorted: sortChecksum(seed, 50000).sorted,
  }
}
`)

for (let t = 0; t < TESTS; t++) {
  app.write(`tests/t${t}.test.ts`, `import { describe, expect, it } from 'vitest'
import { hashRounds } from '../src/fnv'
import { matmulChecksum } from '../src/matrix'
import { pipeline } from '../src/pipeline'
import { sieve } from '../src/primes'
import { sortChecksum } from '../src/sorting'
import { distribution } from '../src/stats'
import { digest } from '../src/text'

describe('workload t${t}', () => {
  it('sieves primes', () => {
    expect(sieve(1000000)).toBe(78498)
    expect(sieve(100000)).toBe(9592)
  })
  it('hashes and multiplies deterministically', () => {
    expect(hashRounds('t${t}', 20000)).toBe(hashRounds('t${t}', 20000))
    const checksum = matmulChecksum(64, 3, ${t + 1})
    expect(checksum).toBeGreaterThan(0)
    expect(checksum).toBe(matmulChecksum(64, 3, ${t + 1}))
  })
  it('sorts and aggregates', () => {
    const result = sortChecksum(${t * 31 + 7}, 200000)
    expect(result.sorted).toBe(true)
    expect(result.first).toBeLessThanOrEqual(result.last)
    const buckets = distribution(${t * 31 + 7}, 100000, 16)
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(100000)
    expect(digest(${t + 1}, 5000)).toBe(digest(${t + 1}, 5000))
    expect(pipeline(${t}).sorted).toBe(true)
  })
})
`)
}

app.report('cpu-bound', `8 src modules, ${TESTS} test files, ~150ms of real work per file`)
