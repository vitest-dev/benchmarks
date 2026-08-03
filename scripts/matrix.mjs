// Defines which matrix cells run for each app.
//
// A cell is { pool, env, isolate, fsCache, state, workers? }:
//   pool     forks | threads | vmThreads | vmForks | browser
//            (browser = headless Chromium via playwright; node-pool
//            dimensions don't apply to it)
//   env      node | jsdom | happy-dom | chromium
//   isolate  boolean
//   fsCache  boolean (fs module cache)
//   state    cold (all persistent caches wiped before every rep)
//            | warm (one untimed priming run, caches kept between reps)
//   workers  optional maxWorkers value ('50%', '100%', ...)
//
// Levels:
//   quick   — one representative cell per app (CI smoke: does the suite pass)
//   default — curated cells covering the dimensions the app was built to
//             measure; skips combinations that add runtime but no signal
//   full    — full cross product of everything the app supports (use with
//             --apps, the complete run is large)

const POOLS = ['forks', 'threads', 'vmThreads', 'vmForks']
const t = true
const f = false

const APPS = {
  'micro-utils': {
    envs: ['node', 'jsdom', 'happy-dom'],
    primary: 'node',
    dims: { pool: POOLS, env: ['node'], isolate: [t, f], fsCache: [f], state: ['cold', 'warm'] },
    // the most common real-world waste: a tiny node-only suite running under
    // an inherited DOM environment
    extra: [
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: f, state: 'warm' },
      { pool: 'forks', env: 'happy-dom', isolate: t, fsCache: f, state: 'warm' },
    ],
  },
  'node-library': {
    envs: ['node', 'jsdom', 'happy-dom'],
    primary: 'node',
    dims: { pool: ['forks', 'threads'], env: ['node'], isolate: [t, f], fsCache: [f, t], state: ['cold', 'warm'] },
    extra: [
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: f, state: 'warm' },
    ],
  },
  'node-backend': {
    envs: ['node'],
    primary: 'node',
    dims: { pool: POOLS, env: ['node'], isolate: [t, f], fsCache: [f], state: ['warm'] },
    extra: [
      { pool: 'forks', env: 'node', isolate: t, fsCache: f, state: 'cold' },
    ],
  },
  'deps-heavy': {
    envs: ['node'],
    primary: 'node',
    dims: { pool: POOLS, env: ['node'], isolate: [t, f], fsCache: [f], state: ['warm'] },
    extra: [
      { pool: 'forks', env: 'node', isolate: t, fsCache: f, state: 'cold' },
      { pool: 'vmThreads', env: 'node', isolate: t, fsCache: f, state: 'cold' },
    ],
  },
  'react-spa': {
    envs: ['jsdom', 'happy-dom'],
    primary: 'jsdom',
    browser: true,
    dims: { pool: ['forks', 'threads', 'vmThreads'], env: ['jsdom', 'happy-dom'], isolate: [t, f], fsCache: [f], state: ['warm'] },
    extra: [
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: f, state: 'cold' },
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: t, state: 'cold' },
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: t, state: 'warm' },
    ],
  },
  'vue-spa': {
    envs: ['jsdom', 'happy-dom'],
    primary: 'jsdom',
    browser: true,
    dims: { pool: ['forks', 'threads'], env: ['jsdom', 'happy-dom'], isolate: [t, f], fsCache: [f], state: ['warm'] },
    extra: [
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: f, state: 'cold' },
    ],
  },
  'design-system': {
    envs: ['jsdom', 'happy-dom'],
    primary: 'jsdom',
    browser: true,
    dims: { pool: ['forks', 'vmThreads'], env: ['jsdom', 'happy-dom'], isolate: [t, f], fsCache: [f], state: ['warm'] },
    extra: [
      { pool: 'forks', env: 'jsdom', isolate: t, fsCache: f, state: 'cold' },
    ],
  },
  'barrel-hell': {
    envs: ['node'],
    primary: 'node',
    dims: { pool: ['forks', 'threads'], env: ['node'], isolate: [t, f], fsCache: [f, t], state: ['cold', 'warm'] },
  },
  'enterprise-monolith': {
    envs: ['node'],
    primary: 'node',
    dims: { pool: ['forks', 'threads'], env: ['node'], isolate: [t, f], fsCache: [f, t], state: ['cold', 'warm'] },
    extra: [
      { pool: 'forks', env: 'node', isolate: f, fsCache: f, state: 'warm', workers: '50%' },
    ],
  },
  'long-haul': {
    envs: ['jsdom', 'happy-dom'],
    primary: 'jsdom',
    workers: ['2'],
    // 2 workers x 40 heavy files each: long enough worker lifetimes for
    // retention, memory-limit recycling and aging to show up in wall time
    dims: { pool: POOLS, env: ['jsdom'], isolate: [t], fsCache: [f], state: ['warm'], workers: ['2'] },
    extra: [
      { pool: 'vmForks', env: 'jsdom', isolate: t, fsCache: f, state: 'cold', workers: '2' },
      { pool: 'forks', env: 'happy-dom', isolate: t, fsCache: f, state: 'warm', workers: '2' },
      { pool: 'vmForks', env: 'happy-dom', isolate: t, fsCache: f, state: 'warm', workers: '2' },
    ],
  },
  'cpu-bound': {
    envs: ['node'],
    primary: 'node',
    workers: ['25%', '50%', '100%'],
    dims: { pool: ['forks', 'threads'], env: ['node'], isolate: [t], fsCache: [f], state: ['warm'], workers: ['25%', '50%', '100%'] },
    extra: [
      { pool: 'forks', env: 'node', isolate: f, fsCache: f, state: 'warm', workers: '100%' },
    ],
  },
}

export const APP_NAMES = Object.keys(APPS)

function cross(dims) {
  const cells = [{}]
  const result = Object.entries(dims).reduce((acc, [key, values]) => {
    const next = []
    for (const cell of acc) {
      for (const value of values)
        next.push({ ...cell, [key]: value })
    }
    return next
  }, cells)
  return result
}

function browserCells(spec, states) {
  if (!spec.browser)
    return []
  return states.map(state => ({ pool: 'browser', env: 'chromium', isolate: true, fsCache: false, state }))
}

export function cellsFor(app, level) {
  const spec = APPS[app]
  if (!spec)
    throw new Error(`no matrix defined for app "${app}"`)

  if (level === 'quick') {
    return [
      { pool: 'forks', env: spec.primary, isolate: true, fsCache: false, state: 'warm' },
      ...browserCells(spec, ['warm']),
    ]
  }
  if (level === 'full') {
    return [
      ...cross({
        pool: POOLS,
        env: spec.envs,
        isolate: [true, false],
        fsCache: [false, true],
        state: ['cold', 'warm'],
        ...(spec.workers ? { workers: spec.workers } : {}),
      }),
      ...browserCells(spec, ['cold', 'warm']),
    ]
  }
  return [...cross(spec.dims), ...(spec.extra ?? []), ...browserCells(spec, ['cold', 'warm'])]
}

export function cellKey(cell) {
  return [
    cell.pool,
    cell.env,
    `isolate:${cell.isolate}`,
    `fsCache:${cell.fsCache}`,
    cell.workers ? `workers:${cell.workers}` : 'workers:default',
    cell.state,
  ].join(' ')
}
