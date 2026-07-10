// Renders bench result files as the per-app markdown tables used in the
// README: one row per configuration, cold and warm as columns, dimension
// columns that never vary within an app dropped.
//   node scripts/render-results.mjs results/vitest-4.1.10.json [more.json ...]
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/render-results.mjs <results.json> [more.json ...]')
  process.exit(1)
}

const results = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).results)
const apps = [...new Set(results.map(row => row.app))]

const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)

for (const app of apps) {
  const rows = results.filter(row => row.app === app)

  // one line per configuration, cold/warm merged into columns
  const merged = new Map()
  for (const row of rows) {
    const key = [row.pool, row.env, row.isolate, row.fsCache, row.workers ?? ''].join('|')
    const entry = merged.get(key) ?? { pool: row.pool, env: row.env, isolate: row.isolate, fsCache: row.fsCache, workers: row.workers }
    entry[row.state] = row.error ? 'FAIL' : fmt(row.median)
    merged.set(key, entry)
  }
  const entries = [...merged.values()]

  const dimensions = [
    { name: 'pool', get: entry => entry.pool },
    { name: 'env', get: entry => entry.env },
    { name: 'isolate', get: entry => String(entry.isolate) },
    { name: 'fsModuleCache', get: entry => String(entry.fsCache) },
    { name: 'maxWorkers', get: entry => entry.workers ?? 'default' },
  ].filter(dimension => new Set(entries.map(dimension.get)).size > 1 || dimension.name === 'pool')

  console.log(`### ${app}\n`)
  console.log(`| ${dimensions.map(d => d.name).join(' | ')} | cold | warm |`)
  console.log(`|${dimensions.map(() => '---').join('|')}|---:|---:|`)
  for (const entry of entries) {
    console.log(`| ${dimensions.map(d => d.get(entry)).join(' | ')} | ${entry.cold ?? '—'} | ${entry.warm ?? '—'} |`)
  }
  console.log()
}
