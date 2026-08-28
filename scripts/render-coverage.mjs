// Renders coverage bench result files as per-app markdown tables: one row
// per coverage provider on the app's fastest configuration. Several files
// render side by side, one column group per vitest version, with the change
// against the first file next to every later version.
//   node scripts/render-coverage.mjs results/a.json [more.json ...]
//
// Columns per version:
//   wall      whole-process wall clock of `vitest run` (median)
//   overhead  wall minus the wall of the `none` row: what coverage adds
//   generate  the provider's own `Generate coverage total time` (median),
//             the raw-coverage to istanbul-map conversion
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/render-coverage.mjs <results.json> [more.json ...]')
  process.exit(1)
}

const versions = files.map((file) => {
  const { meta, results } = JSON.parse(readFileSync(file, 'utf8'))
  return { meta, label: meta.vitest, results }
})
const apps = [...new Set(versions.flatMap(version => version.results.map(row => row.app)))]

const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)
const ms = value => (value == null ? '—' : `${Math.round(value)}ms`)
const delta = (before, after) => {
  if (before == null || after == null)
    return '—'
  if (before === 0)
    return after === 0 ? '~0' : '—'
  const pct = ((after - before) / before) * 100
  return Math.abs(pct) < 1.5 ? '~0' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`
}

const describe = row => [
  `pool ${row.pool}`,
  `env ${row.env}`,
  `isolate ${row.isolate}`,
  `fsModuleCache ${row.fsCache}`,
  ...(row.workers ? [`maxWorkers ${row.workers}`] : []),
].join(', ')

for (const app of apps) {
  const byVersion = versions.map(version => version.results.filter(row => row.app === app))
  const sample = byVersion.flat()[0]
  console.log(`### ${app}\n`)
  console.log(`${describe(sample)}, warm.\n`)

  const many = versions.length > 1
  const head = ['coverage']
  const align = ['---']
  for (const metric of ['wall', 'overhead', 'generate']) {
    versions.forEach((version, index) => {
      head.push(many ? `${version.label} ${metric}` : metric)
      align.push('---:')
      if (index > 0) {
        head.push('Δ')
        align.push('---:')
      }
    })
  }
  console.log(`| ${head.join(' | ')} |`)
  console.log(`| ${align.join(' | ')} |`)

  const providers = [...new Set(byVersion.flat().map(row => row.coverage))]
  for (const provider of providers) {
    const rows = byVersion.map(rows => rows.find(row => row.coverage === provider))
    const bases = byVersion.map(rows => rows.find(row => row.coverage === 'none'))
    const value = (row, base, metric) => {
      if (!row || row.error)
        return null
      if (metric === 'wall')
        return row.median
      if (metric === 'overhead')
        return provider === 'none' || !base || base.error ? null : row.median - base.median
      return row.generate
    }
    const cells = [provider]
    for (const metric of ['wall', 'overhead', 'generate']) {
      const format = metric === 'generate' ? ms : fmt
      rows.forEach((row, index) => {
        const current = value(row, bases[index], metric)
        cells.push(row?.error ? 'FAIL' : format(current))
        if (index > 0)
          cells.push(delta(value(rows[0], bases[0], metric), current))
      })
    }
    console.log(`| ${cells.join(' | ')} |`)
  }
  console.log('')
}
