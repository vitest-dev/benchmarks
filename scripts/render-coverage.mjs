// Renders coverage bench result files as one markdown table: one row per
// app (its `best` configuration), the wall clock of `vitest run` without
// coverage, with the v8 provider and with the istanbul provider. Several
// files render side by side, one column per vitest version, with the change
// against the first file next to every later version.
//   node scripts/render-coverage.mjs results/a.json [more.json ...]
import { readFileSync } from 'node:fs'
import { COVERAGE_PROVIDERS } from './matrix.mjs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/render-coverage.mjs <results.json> [more.json ...]')
  process.exit(1)
}

const versions = files.map((file) => {
  const { meta, results } = JSON.parse(readFileSync(file, 'utf8'))
  return { label: meta.vitest, results }
})
const apps = [...new Set(versions.flatMap(version => version.results.map(row => row.app)))]

const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)
const delta = (before, after) => {
  if (before == null || after == null)
    return '—'
  const pct = ((after - before) / before) * 100
  return Math.abs(pct) < 1.5 ? '~0' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`
}

const LABELS = { none: 'no coverage', v8: 'coverage-v8', istanbul: 'coverage-istanbul' }
const many = versions.length > 1
const head = ['app']
const align = ['---']
for (const provider of COVERAGE_PROVIDERS) {
  versions.forEach((version, index) => {
    head.push(many ? `${version.label} ${LABELS[provider]}` : LABELS[provider])
    align.push('---:')
    if (index > 0) {
      head.push('Δ')
      align.push('---:')
    }
  })
}
console.log(`| ${head.join(' | ')} |`)
console.log(`| ${align.join(' | ')} |`)

for (const app of apps) {
  const cells = [app]
  for (const provider of COVERAGE_PROVIDERS) {
    const rows = versions.map(version => version.results.find(row => row.app === app && row.coverage === provider))
    const value = row => (row && !row.error ? row.median : null)
    rows.forEach((row, index) => {
      cells.push(row?.error ? 'FAIL' : fmt(value(row)))
      if (index > 0)
        cells.push(delta(value(rows[0]), value(row)))
    })
  }
  console.log(`| ${cells.join(' | ')} |`)
}
