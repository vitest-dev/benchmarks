// Runs the option matrix against the generated apps and records wall-clock
// timings.
//
//   node scripts/bench.mjs [--apps a,b] [--matrix quick|default|full]
//                          [--runs N] [--label name] [--vitest /path/vitest.mjs]
//
// Protocol (matches how vitest core perf work is measured):
//   cold cells — every persistent cache (vite transform/deps cache, vitest
//     cache dir, fs module cache) is wiped before every timed rep: what CI
//     without cache restore pays.
//   warm cells — caches wiped once, one untimed priming run, then timed
//     reps: what repeated local runs pay.
//   The node compile cache env vars are cleared so the host shell cannot
//   skew results; what a vitest version enables itself is part of its
//   measurement. Reported per cell: median and min of N reps, plus the
//   parsed `Duration` reporter line of the last rep.
//
// A/B comparisons: run once per version with different --label (use
// --vitest to point at a local build's packages/vitest/vitest.mjs), then
//   node scripts/compare.mjs results/a.json results/b.json
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, platform, arch } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAMES, cellKey, cellsFor } from './matrix.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPS_DIR = join(ROOT, 'apps')

const args = process.argv.slice(2)
function opt(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

const level = opt('matrix', 'default')
const runs = Number(opt('runs', '3'))
const label = opt('label', 'local')
const vitestOverride = opt('vitest', process.env.VITEST_BIN)
const apps = opt('apps', '').split(',').filter(Boolean)
const selected = apps.length > 0 ? apps : APP_NAMES.filter(name => existsSync(join(APPS_DIR, name)))

const CACHE_DIRS = [
  'node_modules/.vite',
  'node_modules/.vitest',
  'node_modules/.vitest-cache',
  'node_modules/.experimental-vitest-cache',
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

function vitestVersion(bin) {
  const result = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
  return (result.stdout + result.stderr).match(/(\d+\.\d+\.\d+\S*)/)?.[1] ?? 'unknown'
}

function fsCacheMode(version) {
  if (process.env.BENCH_FS_CACHE_MODE)
    return process.env.BENCH_FS_CACHE_MODE
  // the option was experimental.fsModuleCache up to and including 4.1.x
  return /^4\.[01]\./.test(version) ? 'experimental' : 'stable'
}

function runOnce(appDir, bin, cell, mode) {
  const env = { ...process.env, CI: 'true', NO_COLOR: '1' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('BENCH_'))
      delete env[key]
  }
  delete env.NODE_COMPILE_CACHE
  delete env.NODE_DISABLE_COMPILE_CACHE
  if (cell.pool === 'browser') {
    env.BENCH_BROWSER = 'true'
  }
  else {
    env.BENCH_POOL = cell.pool
    env.BENCH_ENV = cell.env
    env.BENCH_ISOLATE = String(cell.isolate)
  }
  env.BENCH_FS_CACHE = String(cell.fsCache)
  env.BENCH_FS_CACHE_MODE = mode
  if (cell.workers)
    env.BENCH_MAX_WORKERS = cell.workers
  if (cell.coverage)
    env.BENCH_COVERAGE = cell.coverage

  const start = performance.now()
  const result = spawnSync(process.execPath, [bin, 'run'], { cwd: appDir, encoding: 'utf8', env })
  const wall = performance.now() - start
  if (result.status !== 0) {
    return { ok: false, wall, tail: (result.stdout + '\n' + result.stderr).slice(-1500) }
  }
  const duration = [...result.stdout.matchAll(/Duration\s+([^\n]+)/g)].at(-1)?.[1]?.trim()
  return { ok: true, wall, duration }
}

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length >> 1] : null
}
const fmt = value => (value == null ? '—' : `${(value / 1000).toFixed(2)}s`)

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
  const cells = cellsFor(app, level)
  console.error(`\n${app} — vitest ${version}, ${cells.length} cells × ${runs} reps`)

  for (const cell of cells) {
    const samples = []
    let lastDuration
    let error

    if (cell.state === 'cold') {
      for (let rep = 0; rep < runs; rep++) {
        wipe(appDir)
        const result = runOnce(appDir, bin, cell, mode)
        if (!result.ok) {
          error = result.tail
          break
        }
        samples.push(result.wall)
        lastDuration = result.duration
      }
    }
    else {
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
          lastDuration = result.duration
        }
      }
    }

    const row = {
      app,
      ...cell,
      key: cellKey(cell),
      samples: samples.map(Math.round),
      median: median(samples),
      min: samples.length ? Math.min(...samples) : null,
      duration: lastDuration,
      error,
    }
    results.push(row)
    if (error) {
      failed++
      console.error(`  FAIL ${row.key}\n${error}`)
    }
    else {
      console.error(`  ${row.key}: median ${fmt(row.median)} (min ${fmt(row.min)})`)
    }
  }
}

const meta = {
  label,
  date: new Date().toISOString(),
  node: process.version,
  cpu: `${cpus()[0]?.model} × ${cpus().length}`,
  platform: `${platform()} ${arch()}`,
  matrix: level,
  runs,
  vitest: vitestVersion(resolveBin(join(APPS_DIR, selected[0]))),
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
  lines.push('| pool | env | isolate | fsCache | workers | state | median | min |')
  lines.push('|---|---|---|---|---|---|---:|---:|')
  for (const row of rows) {
    lines.push(`| ${row.pool} | ${row.env} | ${row.isolate} | ${row.fsCache} | ${row.workers ?? '—'} | ${row.state} | ${row.error ? 'FAIL' : fmt(row.median)} | ${fmt(row.min)} |`)
  }
}
console.log(lines.join('\n'))
console.log(`\nwrote ${outFile}`)
console.log(`machine: ${meta.cpu}, node ${meta.node}, vitest ${meta.vitest}`)

if (failed > 0) {
  console.error(`\n${failed} cell(s) failed`)
  process.exit(1)
}
