/**
 * Merges BENCH_* environment variables (set by scripts/bench.mjs) over the
 * app's own defaults, so one committed vitest.config.ts serves every matrix
 * cell without depending on CLI flags that drift across Vitest versions.
 *
 * Recognized variables:
 *   BENCH_POOL             forks | threads | vmThreads | vmForks
 *   BENCH_ENV              node | jsdom | happy-dom
 *   BENCH_ISOLATE          true | false
 *   BENCH_FILE_PARALLELISM true | false
 *   BENCH_MAX_WORKERS      number or percentage string ('50%')
 *   BENCH_FS_CACHE         true | false (always set explicitly by the runner —
 *                          the default flipped across Vitest versions)
 *   BENCH_FS_CACHE_MODE    stable (top-level `fsModuleCache`, Vitest > 4.1) |
 *                          experimental (`experimental.fsModuleCache`, <= 4.1)
 *   BENCH_COVERAGE         v8 | istanbul
 */
export function benchTest(defaults = {}) {
  const e = process.env
  const test = { ...defaults }
  const bool = v => !['false', '0'].includes(v)

  if (e.BENCH_POOL)
    test.pool = e.BENCH_POOL
  if (e.BENCH_ENV)
    test.environment = e.BENCH_ENV
  if (e.BENCH_ISOLATE)
    test.isolate = bool(e.BENCH_ISOLATE)
  if (e.BENCH_FILE_PARALLELISM)
    test.fileParallelism = bool(e.BENCH_FILE_PARALLELISM)
  if (e.BENCH_MAX_WORKERS) {
    test.maxWorkers = e.BENCH_MAX_WORKERS.endsWith('%')
      ? e.BENCH_MAX_WORKERS
      : Number(e.BENCH_MAX_WORKERS)
  }
  if (e.BENCH_FS_CACHE) {
    const enabled = bool(e.BENCH_FS_CACHE)
    if (e.BENCH_FS_CACHE_MODE === 'experimental')
      test.experimental = { ...test.experimental, fsModuleCache: enabled }
    else
      test.fsModuleCache = enabled
  }
  if (e.BENCH_COVERAGE)
    test.coverage = { enabled: true, provider: e.BENCH_COVERAGE }

  return test
}
