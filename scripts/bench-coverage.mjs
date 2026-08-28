// Measures coverage on the fastest row of every app: the row without
// coverage, then the same row with the v8 and the istanbul provider.
//
//   node scripts/bench-coverage.mjs [--apps a,b] [--runs N] [--label name]
//                                   [--vitest /path/vitest.mjs]
//
// Every cell is warm: caches wiped once, one untimed priming run, then N
// timed reps. Recorded per rep:
//   wall      whole-process wall clock of `vitest run`
//   duration  the reporter `Duration` line (test time only; it does not
//             include the coverage post-processing)
//   generate  the `Generate coverage total time` line that the provider
//             prints with DEBUG=vitest:coverage: converting the raw
//             coverage into istanbul maps, before the reports are written
//
// A/B comparisons: run once per version with different --label (link a
// local build into the workspace, see README), then
//   node scripts/render-coverage.mjs results/a.json results/b.json
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAMES, cellKey, coverageCellsFor } from './matrix.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPS_DIR = join(ROOT, 'apps')

const args = process.argv.slice(2)
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

const runs = Number(opt('runs', '3'))
const label = opt('label', 'coverage-local')
const vitestOverride = opt('vitest', process.env.VITEST_BIN)
const apps = opt('apps', '').split(',').filter(Boolean)
const selected = apps.length > 0 ? apps : APP_NAMES.filter(name => existsSync(join(APPS_DIR, name)))

const CACHE_DIRS = [
  'node_modules/.vite',
  'node_modules/.vitest',
  'node_modules/.vitest-cache',
  'node_modules/.experimental-vitest-cache',
  'coverage',
]

function wipe(appDir) {
  for (const dir of CACHE_DIRS) {
    rmSync(join(appDir, dir), { recursive: true, force: true })
    rmSync(join(ROOT, dir), { recursive: true, force: true })
  }
}

function resolveBin(appDir) {
  const bin = vitestOverride ?? join(appDir, 'node_modules/vitest/vitest.mjs')
  if (!existsSync(bin)) {
    console.error(`vitest binary not found at ${bin} — run pnpm install first`)
    process.exit(1)
  }
  return bin
}

// apps that don't list the providers get them the way vitest does: resolved
// from the vitest package itself
function packageVersion(appDir, name) {
  const script = `const { dirname } = require('node:path'); const paths = [${JSON.stringify(appDir)}, dirname(require.resolve('vitest/package.json', { paths: [${JSON.stringify(appDir)}] }))]; console.log(require(require.resolve(${JSON.stringify(`${name}/package.json`)}, { paths })).version)`
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  return result.stdout.trim() || 'unknown'
}

// ast-v8-to-istanbul is a dependency of @vitest/coverage-v8; its version is
// part of the v8 measurement, so it is recorded next to the vitest version
function astV8ToIstanbulVersion(appDir) {
  // the package hides package.json behind `exports`, so walk up from its entry
  const script = `const { dirname, join } = require('node:path'); const paths = [${JSON.stringify(appDir)}, dirname(require.resolve('vitest/package.json', { paths: [${JSON.stringify(appDir)}] }))]; const provider = dirname(require.resolve('@vitest/coverage-v8/package.json', { paths })); let dir = dirname(require.resolve('ast-v8-to-istanbul', { paths: [provider] })); while (!require('node:fs').existsSync(join(dir, 'package.json'))) dir = dirname(dir); console.log(require(join(dir, 'package.json')).version)`
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  return result.stdout.trim() || 'unknown'
}

function vitestVersion(bin) {
  const result = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
  return (result.stdout + result.stderr).match(/(\d+\.\d+\.\d+\S*)/)?.[1] ?? 'unknown'
}

function fsCacheMode(version) {
  if (process.env.BENCH_FS_CACHE_MODE)
    return process.env.BENCH_FS_CACHE_MODE
  return /^4\.[01]\./.test(version) ? 'experimental' : 'stable'
}

function runOnce(appDir, bin, cell, mode) {
  const env = { ...process.env, CI: 'true', NO_COLOR: '1', DEBUG: 'vitest:coverage' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('BENCH_'))
      delete env[key]
  }
  delete env.NODE_COMPILE_CACHE
  delete env.NODE_DISABLE_COMPILE_CACHE
  env.BENCH_POOL = cell.pool
  env.BENCH_ENV = cell.env
  env.BENCH_ISOLATE = String(cell.isolate)
  env.BENCH_FS_CACHE = String(cell.fsCache)
  env.BENCH_FS_CACHE_MODE = mode
  if (cell.workers)
    env.BENCH_MAX_WORKERS = cell.workers
  if (cell.coverage && cell.coverage !== 'none')
    env.BENCH_COVERAGE = cell.coverage

  const start = performance.now()
  const result = spawnSync(process.execPath, [bin, 'run'], { cwd: appDir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
  const wall = performance.now() - start
  const output = result.stdout + '\n' + result.stderr
  if (result.status !== 0)
    return { ok: false, wall, tail: output.slice(-1500) }

  const duration = [...result.stdout.matchAll(/Duration\s+([^\n]+)/g)].at(-1)?.[1]?.trim()
  const generate = [...output.matchAll(/Generate coverage total time\s+(\d+)\s*ms/g)].at(-1)?.[1]
  return { ok: true, wall, duration, generate: generate == null ? null : Number(generate) }
}

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length >> 1] : null
}
const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)
const ms = value => (value == null ? '—' : `${value}ms`)

const results = []
let failed = 0

for (const app of selected) {
  const appDir = join(APPS_DIR, app)
  if (!existsSync(join(appDir, 'src'))) {
    const generated = spawnSync(process.execPath, [join(appDir, 'generate.mjs')], { stdio: 'inherit' })
    if (generated.status !== 0)
      process.exit(1)
  }
  const bin = resolveBin(appDir)
  const version = vitestVersion(bin)
  const mode = fsCacheMode(version)
  const cells = coverageCellsFor(app)
  console.error(`\n${app} — vitest ${version}, coverage-v8 ${packageVersion(appDir, '@vitest/coverage-v8')}, ast-v8-to-istanbul ${astV8ToIstanbulVersion(appDir)}, ${cells.length} cells × ${runs} reps`)

  for (const cell of cells) {
    const samples = []
    const generates = []
    let lastDuration
    let error

    wipe(appDir)
    const prime = runOnce(appDir, bin, cell, mode)
    if (!prime.ok) {
      error = prime.tail
    }
    else {
      for (let rep = 0; rep < runs; rep++) {
        const result = runOnce(appDir, bin, cell, mode)
        if (!result.ok) {
          error = result.tail
          break
        }
        samples.push(result.wall)
        if (result.generate != null)
          generates.push(result.generate)
        lastDuration = result.duration
      }
    }

    const row = {
      app,
      ...cell,
      key: cellKey(cell),
      samples: samples.map(Math.round),
      median: median(samples),
      min: samples.length ? Math.min(...samples) : null,
      generateSamples: generates,
      generate: median(generates),
      duration: lastDuration,
      error,
    }
    results.push(row)
    if (error) {
      failed++
      console.error(`  FAIL ${row.key}\n${error}`)
    }
    else {
      const extra = row.generate == null ? '' : `, generate ${ms(row.generate)}`
      console.error(`  ${row.key}: median ${fmt(row.median)} (min ${fmt(row.min)}${extra})`)
    }
  }
}

const firstApp = join(APPS_DIR, selected[0])
const meta = {
  label,
  date: new Date().toISOString(),
  node: process.version,
  cpu: `${cpus()[0]?.model} × ${cpus().length}`,
  platform: `${platform()} ${arch()}`,
  matrix: 'coverage',
  runs,
  vitest: vitestVersion(resolveBin(firstApp)),
  coverageV8: packageVersion(firstApp, '@vitest/coverage-v8'),
  coverageIstanbul: packageVersion(firstApp, '@vitest/coverage-istanbul'),
  astV8ToIstanbul: astV8ToIstanbulVersion(firstApp),
}

mkdirSync(join(ROOT, 'results'), { recursive: true })
const outFile = join(ROOT, 'results', `${label}.json`)
writeFileSync(outFile, JSON.stringify({ meta, results }, null, 2))

const lines = []
for (const app of selected) {
  const rows = results.filter(row => row.app === app)
  if (rows.length === 0)
    continue
  lines.push(`\n### ${app}\n`)
  lines.push('| pool | env | isolate | fsCache | workers | coverage | median | min | generate |')
  lines.push('|---|---|---|---|---|---|---:|---:|---:|')
  for (const row of rows)
    lines.push(`| ${row.pool} | ${row.env} | ${row.isolate} | ${row.fsCache} | ${row.workers ?? '—'} | ${row.coverage} | ${row.error ? 'FAIL' : fmt(row.median)} | ${fmt(row.min)} | ${ms(row.generate)} |`)
}
console.log(lines.join('\n'))
console.log(`\nwrote ${outFile}`)
console.log(`machine: ${meta.cpu}, node ${meta.node}, vitest ${meta.vitest}, coverage-v8 ${meta.coverageV8} (ast-v8-to-istanbul ${meta.astV8ToIstanbul}), coverage-istanbul ${meta.coverageIstanbul}`)

if (failed > 0) {
  console.error(`\n${failed} cell(s) failed`)
  process.exit(1)
}
