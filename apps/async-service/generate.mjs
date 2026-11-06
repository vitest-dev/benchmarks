// async-service — a service whose tests await through every layer.
//
// Same shape as node-backend (repos, domain services, tests that exercise
// CRUD flows), but every call is async: a driver that checks out a pooled
// connection, repos built on it, services that validate, write an audit
// row and fan out with Promise.all. Each test awaits thousands of promises,
// so time spent per promise in the runner (async hooks, AsyncLocalStorage,
// promise wrappers) shows up here and not in the sync apps. No dependencies,
// so module loading stays small.
//
// Dimensions stressed: per-promise overhead in the test worker, microtask
// scheduling, worker reuse across medium test files.
import { createApp } from '../../tools/generator/helpers.mjs'

const REPOS = 8
const SERVICES = 12
const TESTS = 16

const app = createApp(import.meta.url)

app.write('src/db/driver.ts', `export interface Connection {
  id: number
  queries: number
}

const pool: Connection[] = Array.from({ length: 4 }, (_, id) => ({ id, queries: 0 }))
let cursor = 0

async function acquire(): Promise<Connection> {
  await null
  return pool[cursor++ % pool.length]
}

async function release(connection: Connection): Promise<void> {
  await null
  connection.queries++
}

export async function query<T>(run: () => T): Promise<T> {
  const connection = await acquire()
  try {
    const result = run()
    await null
    return result
  }
  finally {
    await release(connection)
  }
}

export function totalQueries(): number {
  return pool.reduce((sum, connection) => sum + connection.queries, 0)
}
`)

for (let i = 0; i < REPOS; i++) {
  app.write(`src/db/repo${i}.ts`, `import { query } from './driver'

export interface Repo${i}Entity {
  id: number
  name: string
  amount: number
}
const store = new Map<number, Repo${i}Entity>()
let nextId = 1

export function repo${i}Insert(name: string, amount: number): Promise<Repo${i}Entity> {
  return query(() => {
    const entity: Repo${i}Entity = { id: nextId++, name, amount }
    store.set(entity.id, entity)
    return entity
  })
}
export function repo${i}Find(id: number): Promise<Repo${i}Entity | undefined> {
  return query(() => store.get(id))
}
export function repo${i}List(): Promise<Repo${i}Entity[]> {
  return query(() => [...store.values()])
}
export async function repo${i}Clear(): Promise<void> {
  await query(() => {
    store.clear()
    nextId = 1
  })
}
`)
}

for (let i = 0; i < SERVICES; i++) {
  const primary = (i * 5) % REPOS
  const audit = (i * 5 + 3) % REPOS
  app.write(`src/domain/svc${i}.ts`, `import { repo${primary}Find, repo${primary}Insert, repo${primary}List } from '../db/repo${primary}'
import { repo${audit}Insert, repo${audit}List } from '../db/repo${audit}'

export interface Svc${i}Input {
  name: string
  amount: number
}

async function validate(raw: Svc${i}Input): Promise<Svc${i}Input> {
  await null
  if (!raw.name || !Number.isInteger(raw.amount) || raw.amount < 0)
    throw new Error('invalid svc${i} input')
  return raw
}

export async function svc${i}Create(raw: Svc${i}Input) {
  const input = await validate(raw)
  const entity = await repo${primary}Insert(input.name, input.amount)
  await repo${audit}Insert('audit:' + entity.id, 0)
  return entity
}

export async function svc${i}CreateMany(inputs: Svc${i}Input[]) {
  return Promise.all(inputs.map(input => svc${i}Create(input)))
}

export async function svc${i}Get(id: number) {
  const entity = await repo${primary}Find(id)
  if (!entity)
    throw new Error('svc${i} entity ' + id + ' not found')
  return entity
}

export async function svc${i}Summarize() {
  const [rows, audits] = await Promise.all([repo${primary}List(), repo${audit}List()])
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    audits: audits.length,
  }
}
`)
}

for (let t = 0; t < TESTS; t++) {
  const svc = (t * 5) % SERVICES
  const primary = (svc * 5) % REPOS
  const audit = (svc * 5 + 3) % REPOS
  app.write(`tests/svc${t}.test.ts`, `import { beforeEach, describe, expect, it } from 'vitest'
import { repo${primary}Clear } from '../src/db/repo${primary}'
import { repo${audit}Clear } from '../src/db/repo${audit}'
import { svc${svc}Create, svc${svc}CreateMany, svc${svc}Get, svc${svc}Summarize } from '../src/domain/svc${svc}'

describe('svc${svc} async flows (t${t})', () => {
  beforeEach(async () => {
    await repo${primary}Clear()
    await repo${audit}Clear()
  })

  it('creates entities one at a time', async () => {
    for (let i = 0; i < 8000; i++)
      await svc${svc}Create({ name: 'item-' + i, amount: i })
    const summary = await svc${svc}Summarize()
    expect(summary.count).toBe(8000)
    expect(summary.total).toBe(31996000)
  })

  it('creates entities in parallel batches', async () => {
    for (let batch = 0; batch < 80; batch++)
      await svc${svc}CreateMany(Array.from({ length: 100 }, (_, i) => ({ name: 'b' + batch + '-' + i, amount: 1 })))
    const summary = await svc${svc}Summarize()
    expect(summary.count).toBe(8000)
    expect(summary.total).toBe(8000)
  })

  it('reads back what it wrote', async () => {
    const created = await svc${svc}CreateMany(Array.from({ length: 2000 }, (_, i) => ({ name: 'r' + i, amount: i })))
    for (const entity of created)
      expect((await svc${svc}Get(entity.id)).name).toBe(entity.name)
    await expect(svc${svc}Get(100000)).rejects.toThrow('not found')
    await expect(svc${svc}Create({ name: '', amount: 1 })).rejects.toThrow('invalid')
  })
})
`)
}

app.report('async-service', `${1 + REPOS + SERVICES} src modules, ${TESTS} test files`)
