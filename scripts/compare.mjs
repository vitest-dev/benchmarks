// Compares two bench result files cell by cell.
//   node scripts/compare.mjs results/main.json results/branch.json
import { readFileSync } from 'node:fs'

const [aPath, bPath] = process.argv.slice(2)
if (!aPath || !bPath) {
  console.error('usage: node scripts/compare.mjs <a.json> <b.json>')
  process.exit(1)
}

const a = JSON.parse(readFileSync(aPath, 'utf8'))
const b = JSON.parse(readFileSync(bPath, 'utf8'))

const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)
function delta(before, after) {
  if (before == null || after == null)
    return '—'
  const pct = ((after - before) / before) * 100
  return Math.abs(pct) < 1.5 ? '~0' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`
}

const bByKey = new Map(b.results.map(row => [`${row.app} ${row.key}`, row]))
const apps = [...new Set(a.results.map(row => row.app))]

console.log(`comparing ${a.meta.label} (vitest ${a.meta.vitest}) → ${b.meta.label} (vitest ${b.meta.vitest})`)
for (const app of apps) {
  const rows = a.results.filter(row => row.app === app)
  console.log(`\n### ${app}\n`)
  console.log(`| pool | env | isolate | fsCache | workers | state | ${a.meta.label} | ${b.meta.label} | Δ |`)
  console.log('|---|---|---|---|---|---|---:|---:|---:|')
  for (const row of rows) {
    const other = bByKey.get(`${row.app} ${row.key}`)
    console.log(`| ${row.pool} | ${row.env} | ${row.isolate} | ${row.fsCache} | ${row.workers ?? '—'} | ${row.state} | ${fmt(row.median)} | ${fmt(other?.median)} | ${delta(row.median, other?.median)} |`)
  }
}
