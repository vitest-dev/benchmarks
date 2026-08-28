// Renders bench result files as the per-app markdown tables used in the
// README: one row per configuration, cold and warm as columns, dimension
// columns that never vary within an app dropped. Several files render side
// by side, one cold/warm column pair per vitest version, with the change
// against the first file next to every later version.
//   node scripts/render-results.mjs results/vitest-4.1.10.json [more.json ...]
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/render-results.mjs <results.json> [more.json ...]')
  process.exit(1)
}

const versions = files.map((file) => {
  const { meta, results } = JSON.parse(readFileSync(file, 'utf8'))
  return { label: meta.vitest, results }
})
const apps = [...new Set(versions.flatMap(version => version.results.map(row => row.app)))]

const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)
const delta = (before, after) => {
  if (before == null || after == null) {
    return '—'
  }
  const pct = ((after - before) / before) * 100
  return Math.abs(pct) < 1.5 ? '~0' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`
}
const states = ['cold', 'warm']
const column = (version, state) => (versions.length > 1 ? `${version.label} ${state}` : state)
// every later version gets a delta column against the first one
const deltaColumn = (version, state) => `${column(version, state)} Δ`

for (const app of apps) {
  // one line per configuration, cold/warm of every version merged into columns
  const merged = new Map()
  for (const version of versions) {
    for (const row of version.results.filter(row => row.app === app)) {
      const key = [row.pool, row.env, row.isolate, row.fsCache, row.workers ?? ''].join('|')
      const entry = merged.get(key) ?? { pool: row.pool, env: row.env, isolate: row.isolate, fsCache: row.fsCache, workers: row.workers }
      entry[column(version, row.state)] = row.error ? 'FAIL' : fmt(row.median)
      if (version !== versions[0] && !row.error) {
        const base = versions[0].results.find(other => other.app === app && other.key === row.key)
        entry[deltaColumn(version, row.state)] = delta(base?.error ? null : base?.median, row.median)
      }
      merged.set(key, entry)
    }
  }
  const entries = [...merged.values()]

  const dimensions = [
    { name: 'pool', get: entry => entry.pool },
    { name: 'env', get: entry => entry.env },
    { name: 'isolate', get: entry => String(entry.isolate) },
    { name: 'fsModuleCache', get: entry => String(entry.fsCache) },
    { name: 'maxWorkers', get: entry => entry.workers ?? 'default' },
  ].filter(dimension => new Set(entries.map(dimension.get)).size > 1 || dimension.name === 'pool')

  const columns = states.flatMap(state => versions.flatMap((version, index) =>
    index === 0
      ? [{ key: column(version, state), header: column(version, state) }]
      : [{ key: column(version, state), header: column(version, state) }, { key: deltaColumn(version, state), header: 'Δ' }],
  ))

  console.log(`### ${app}\n`)
  console.log(`| ${dimensions.map(d => d.name).join(' | ')} | ${columns.map(c => c.header).join(' | ')} |`)
  console.log(`|${dimensions.map(() => '---').join('|')}|${columns.map(() => '---:').join('|')}|`)
  for (const entry of entries) {
    console.log(`| ${dimensions.map(d => d.get(entry)).join(' | ')} | ${columns.map(c => entry[c.key] ?? '—').join(' | ')} |`)
  }
  console.log()
}
