// deps-heavy — app code is thin glue over many real npm packages.
//
// 30 small first-party modules, each importing 2-3 published packages that
// cover the shapes that matter for module handling:
//   CJS monolith (lodash), ESM many-file graph (lodash-es, date-fns, rxjs),
//   CJS small w/ plugins (dayjs), single big ESM (zod), CJS many-file
//   (semver), dual packages (yaml, uuid), pure-ESM (nanoid).
//
// In node pools externalized packages are native imports — cheap after the
// first evaluation per worker, re-paid per fork with isolate:true. In vm
// pools every external is re-evaluated per fresh context, which makes this
// the fixture where vmThreads/vmForks diverge hardest from threads/forks.
// First-party graph is intentionally tiny so package handling is the only
// dimension being measured.
import { createApp } from '../../tools/generator/helpers.mjs'

const GLUE = 30
const TESTS = 25

const app = createApp(import.meta.url)

const patterns = [
  i => `import dayjs from 'dayjs'
import _ from 'lodash'

export function glue${i}Buckets(values: number[]): Record<string, number[]> {
  return _.groupBy(values, v => (v % 3).toString())
}
export function glue${i}Stamp(offset: number): string {
  return dayjs('2026-01-15').add(offset, 'day').format('YYYY-MM-DD')
}
`,
  i => `import { chunk, uniq } from 'lodash-es'
import { z } from 'zod'

const schema${i} = z.object({ id: z.number(), tags: z.array(z.string()) })
export function glue${i}Validate(id: number): boolean {
  return schema${i}.safeParse({ id, tags: ['a', 'b'] }).success
}
export function glue${i}Windows(values: number[]): number[][] {
  return chunk(uniq(values), 4)
}
`,
  i => `import { addDays, differenceInCalendarDays, format } from 'date-fns'
import semver from 'semver'

export function glue${i}Window(days: number): string {
  return format(addDays(new Date(2026, 0, 1), days), 'yyyy-MM-dd')
}
export function glue${i}Distance(days: number): number {
  return differenceInCalendarDays(addDays(new Date(2026, 0, 1), days), new Date(2026, 0, 1))
}
export function glue${i}Compatible(version: string): boolean {
  return semver.satisfies(version, '>=4.0.0 <5.0.0')
}
`,
  i => `import { firstValueFrom, map, of, toArray } from 'rxjs'
import { v4, validate } from 'uuid'

export function glue${i}Ids(count: number): string[] {
  return Array.from({ length: count }, () => v4())
}
export function glue${i}Valid(count: number): boolean {
  return glue${i}Ids(count).every(id => validate(id))
}
export function glue${i}Doubled(values: number[]): Promise<number[]> {
  return firstValueFrom(of(...values).pipe(map(v => v * 2), toArray()))
}
`,
  i => `import { nanoid } from 'nanoid'
import YAML from 'yaml'

export function glue${i}Roundtrip(input: Record<string, unknown>): Record<string, unknown> {
  return YAML.parse(YAML.stringify(input)) as Record<string, unknown>
}
export function glue${i}Token(size: number): string {
  return nanoid(size)
}
`,
  i => `import dayjs from 'dayjs'
import { sortBy } from 'lodash-es'
import { z } from 'zod'

const event${i} = z.object({ at: z.string(), level: z.number() })
export function glue${i}Order(levels: number[]): number[] {
  const events = levels.map((level, index) =>
    event${i}.parse({ at: dayjs('2026-02-01').add(index, 'hour').toISOString(), level }))
  return sortBy(events, e => e.level).map(e => e.level)
}
`,
]

for (let i = 0; i < GLUE; i++)
  app.write(`src/glue${i}.ts`, patterns[i % patterns.length](i))

function useGlue(i) {
  switch (i % patterns.length) {
    case 0: return {
      import: `import { glue${i}Buckets, glue${i}Stamp } from '../src/glue${i}'`,
      assert: `expect(glue${i}Stamp(3)).toBe('2026-01-18')
    expect(Object.keys(glue${i}Buckets([1, 2, 3, 4, 5, 6]))).toHaveLength(3)`,
    }
    case 1: return {
      import: `import { glue${i}Validate, glue${i}Windows } from '../src/glue${i}'`,
      assert: `expect(glue${i}Validate(7)).toBe(true)
    expect(glue${i}Windows([1, 1, 2, 3, 4, 5])).toHaveLength(2)`,
    }
    case 2: return {
      import: `import { glue${i}Compatible, glue${i}Distance, glue${i}Window } from '../src/glue${i}'`,
      assert: `expect(glue${i}Window(30)).toBe('2026-01-31')
    expect(glue${i}Distance(10)).toBe(10)
    expect(glue${i}Compatible('4.2.1')).toBe(true)`,
    }
    case 3: return {
      import: `import { glue${i}Doubled, glue${i}Valid } from '../src/glue${i}'`,
      assert: `expect(glue${i}Valid(5)).toBe(true)
    await expect(glue${i}Doubled([1, 2, 3])).resolves.toEqual([2, 4, 6])`,
    }
    case 4: return {
      import: `import { glue${i}Roundtrip, glue${i}Token } from '../src/glue${i}'`,
      assert: `expect(glue${i}Roundtrip({ name: 'bench', flag: true })).toEqual({ name: 'bench', flag: true })
    expect(glue${i}Token(12)).toHaveLength(12)`,
    }
    default: return {
      import: `import { glue${i}Order } from '../src/glue${i}'`,
      assert: `expect(glue${i}Order([3, 1, 2])).toEqual([1, 2, 3])`,
    }
  }
}

for (let t = 0; t < TESTS; t++) {
  const glues = [(t * 3) % GLUE, (t * 3 + 1) % GLUE, (t * 3 + 2) % GLUE].map(useGlue)
  app.write(`tests/t${t}.test.ts`, `import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
${glues.map(g => g.import).join('\n')}

describe('t${t}', () => {
  it('exercises glue modules', async () => {
    ${glues.map(g => g.assert).join('\n    ')}
  })
  it('uses packages directly', () => {
    expect(dayjs('2026-03-01').add(1, 'day').format('YYYY-MM-DD')).toBe('2026-03-02')
    expect(z.number().safeParse(${t}).success).toBe(true)
  })
})
`)
}

app.report('deps-heavy', `${GLUE} glue modules over 10 npm packages, ${TESTS} test files`)
