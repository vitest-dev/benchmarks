// node-backend — a typical API service (express + zod + pino + dayjs +
// lodash) tested integration-style.
//
// Real backend suites look different from library suites: fewer test files,
// each importing a slice of the service (repos + domain services + wiring)
// and doing meaningful work per test — validating hundreds of payloads,
// exercising CRUD flows — instead of one function per file. Module count is
// moderate (~43), dependencies are the CJS-leaning server stack.
//
// Dimensions stressed: mixed framework-vs-test time (tests do real work but
// imports still matter), CJS interop, worker reuse across medium test files.
import { createApp } from '../../tools/generator/helpers.mjs'

const REPOS = 12
const SERVICES = 18
const ROUTES = 10
const TESTS = 16

const app = createApp(import.meta.url)

app.write('src/config.ts', `import { z } from 'zod'

const schema = z.object({
  serviceName: z.string(),
  port: z.coerce.number().default(3000),
  flags: z.record(z.string(), z.boolean()).default({}),
})
export type Config = z.infer<typeof schema>
export const config: Config = schema.parse({
  serviceName: 'bench-backend',
  port: '8080',
  flags: { audit: true, tracing: false },
})
`)

app.write('src/logger.ts', `import pino from 'pino'
import { config } from './config'

export const logger = pino({ level: 'silent', name: config.serviceName })
`)

for (let i = 0; i < REPOS; i++) {
  app.write(`src/db/repo${i}.ts`, `import dayjs from 'dayjs'

export interface Repo${i}Entity {
  id: number
  name: string
  amount: number
  createdAt: string
}
const store = new Map<number, Repo${i}Entity>()
let nextId = 1

export function repo${i}Insert(name: string, amount: number): Repo${i}Entity {
  const entity: Repo${i}Entity = {
    id: nextId++,
    name,
    amount,
    createdAt: dayjs('2026-01-01').add(nextId, 'hour').toISOString(),
  }
  store.set(entity.id, entity)
  return entity
}
export function repo${i}Find(id: number): Repo${i}Entity | undefined {
  return store.get(id)
}
export function repo${i}List(): Repo${i}Entity[] {
  return [...store.values()]
}
export function repo${i}Clear(): void {
  store.clear()
  nextId = 1
}
`)
}

for (let i = 0; i < SERVICES; i++) {
  const primary = (i * 5) % REPOS
  const secondary = (i * 5 + 3) % REPOS
  app.write(`src/domain/svc${i}.ts`, `import dayjs from 'dayjs'
import _ from 'lodash'
import { z } from 'zod'
import { repo${primary}Insert, repo${primary}List } from '../db/repo${primary}'
import { repo${secondary}List } from '../db/repo${secondary}'
import { logger } from '../logger'

export const svc${i}Input = z.object({
  name: z.string().min(1),
  amount: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
})
export type Svc${i}Input = z.infer<typeof svc${i}Input>

export function svc${i}Create(raw: unknown) {
  const input = svc${i}Input.parse(raw)
  logger.debug({ name: input.name }, 'svc${i} create')
  return repo${primary}Insert(input.name, input.amount)
}
export function svc${i}Summarize() {
  const rows = [...repo${primary}List(), ...repo${secondary}List()]
  const byMonth = _.groupBy(rows, row => dayjs(row.createdAt).format('YYYY-MM'))
  return {
    count: rows.length,
    total: _.sumBy(rows, row => row.amount),
    months: Object.keys(byMonth).length,
    top: _.take(_.orderBy(rows, ['amount'], ['desc']), 3).map(row => row.name),
  }
}
`)
}

for (let i = 0; i < ROUTES; i++) {
  const svc = (i * 2) % SERVICES
  app.write(`src/routes/route${i}.ts`, `import express from 'express'
import { svc${svc}Create, svc${svc}Summarize } from '../domain/svc${svc}'

export const route${i} = express.Router()
route${i}.post('/v${i}/items', (req, res) => {
  res.status(201).json(svc${svc}Create(req.body))
})
route${i}.get('/v${i}/summary', (_req, res) => {
  res.json(svc${svc}Summarize())
})
`)
}

app.write('src/app.ts', `import express from 'express'
import { config } from './config'
import { logger } from './logger'
${Array.from({ length: ROUTES }, (_, i) => `import { route${i} } from './routes/route${i}'`).join('\n')}

export function createApp() {
  const app = express()
  app.use(express.json())
${Array.from({ length: ROUTES }, (_, i) => `  app.use('/api', route${i})`).join('\n')}
  app.get('/health', (_req, res) => {
    logger.debug('health check')
    res.json({ ok: true, service: config.serviceName })
  })
  return app
}
`)

for (let t = 0; t < TESTS - 2; t++) {
  const svc = (t * 3) % SERVICES
  const primary = (svc * 5) % REPOS
  const secondary = (svc * 5 + 3) % REPOS
  app.write(`tests/svc${t}.test.ts`, `import { beforeEach, describe, expect, it } from 'vitest'
import { repo${primary}Clear, repo${primary}List } from '../src/db/repo${primary}'
import { repo${secondary}Clear } from '../src/db/repo${secondary}'
import { svc${svc}Create, svc${svc}Input, svc${svc}Summarize } from '../src/domain/svc${svc}'

describe('svc${svc} integration (t${t})', () => {
  beforeEach(() => {
    repo${primary}Clear()
    repo${secondary}Clear()
  })

  it('creates and lists entities through the domain layer', () => {
    for (let i = 0; i < 150; i++)
      svc${svc}Create({ name: 'item-' + i, amount: i, tags: ['bulk'] })
    expect(repo${primary}List()).toHaveLength(150)
    const summary = svc${svc}Summarize()
    expect(summary.count).toBe(150)
    expect(summary.total).toBe(11175)
    expect(summary.top).toHaveLength(3)
  })

  it('validates payloads with zod', () => {
    expect(() => svc${svc}Create({ name: '', amount: -1 })).toThrow()
    for (let i = 0; i < 300; i++)
      expect(svc${svc}Input.safeParse({ name: 'n' + i, amount: i % 50 }).success).toBe(true)
    expect(svc${svc}Input.safeParse({ name: 'x', amount: 1.5 }).success).toBe(false)
  })

  it('summarizes an empty store', () => {
    expect(svc${svc}Summarize()).toEqual({ count: 0, total: 0, months: 0, top: [] })
  })
})
`)
}

app.write('tests/app.test.ts', `import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

describe('application wiring', () => {
  it('creates an express app with the full route surface', () => {
    const app = createApp()
    expect(typeof app.listen).toBe('function')
    expect(typeof app.use).toBe('function')
  })
})
`)

app.write('tests/config.test.ts', `import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { logger } from '../src/logger'

describe('service config', () => {
  it('coerces and defaults values', () => {
    expect(config.port).toBe(8080)
    expect(config.flags.audit).toBe(true)
  })
  it('exposes a silent logger', () => {
    expect(logger.level).toBe('silent')
  })
})
`)

app.report('node-backend', `${2 + REPOS + SERVICES + ROUTES + 1} src modules, ${TESTS} test files`)
