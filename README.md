# vitest benchmarks

Generated reference apps for measuring Vitest performance. Each app models a real category of project — tiny utility packages, libraries, barrel-file graphs, DOM component suites, dependency-heavy services, a 1300-module monolith, a long-haul DOM suite that ages its workers — and the bench runner measures the options that move run time against each of them: `pool`, `environment` (jsdom, happy-dom and headless Chromium via browser mode), `isolate`, `fsModuleCache`, `maxWorkers`, cold vs warm caches.

## Usage

```sh
pnpm install
pnpm --dir apps/react-spa exec playwright install chromium   # for the browser cells
pnpm generate      # writes apps/*/src and apps/*/tests (gitignored, deterministic)

pnpm bench                                  # default matrix, every app, 3 reps per cell
pnpm bench --apps react-spa,barrel-hell --runs 5
pnpm bench --matrix quick --runs 1          # one representative cell per app

# A/B a local vitest build against the pinned release
pnpm bench --label main
pnpm bench --label branch --vitest /path/to/vitest/packages/vitest/vitest.mjs
pnpm compare results/main.json results/branch.json
```

### `bench` options

| option | values | default |
|---|---|---|
| `--apps` | comma-separated app names | all apps |
| `--matrix` | `quick` (1-2 cells per app), `default` (curated cells below), `full` (whole cross product — use with `--apps`) | `default` |
| `--runs` | timed reps per cell, median reported | `3` |
| `--label` | name of the result file, `results/<label>.json` | `local` |
| `--vitest` | path to a `vitest.mjs` binary (or `VITEST_BIN` env) | the pinned install |
| `BENCH_FS_CACHE_MODE` | `stable` \| `experimental` — where the fs-cache option lives; auto-detected from the vitest version | auto |

`cold` cells wipe every persistent cache (Vite deps/transform caches, vitest cache dirs, fs module cache) before each timed rep — what fresh CI pays. `warm` cells wipe once, prime with an untimed run, then measure — what repeated local runs pay. The host's `NODE_COMPILE_CACHE` is cleared either way; whatever a vitest version enables itself is part of its measurement.

### Running a single cell by hand

Every app is a normal standalone Vitest project. The committed configs read `BENCH_*` variables (see [tools/config/bench-config.js](tools/config/bench-config.js)), so any cell reproduces with plain `vitest run`:

```sh
cd apps/design-system
BENCH_POOL=vmThreads BENCH_ENV=happy-dom BENCH_ISOLATE=false pnpm test
BENCH_BROWSER=true pnpm test                # headless Chromium
```

| variable | values |
|---|---|
| `BENCH_POOL` | `forks`, `threads`, `vmThreads`, `vmForks` |
| `BENCH_ENV` | `node`, `jsdom`, `happy-dom` |
| `BENCH_ISOLATE` | `true`, `false` |
| `BENCH_FS_CACHE` | `true`, `false` (with `BENCH_FS_CACHE_MODE=experimental` on vitest ≤ 4.1) |
| `BENCH_MAX_WORKERS` | a number or a percentage like `50%` |
| `BENCH_FILE_PARALLELISM` | `true`, `false` |
| `BENCH_COVERAGE` | `v8`, `istanbul` |
| `BENCH_BROWSER` | `true` — headless Chromium via playwright (react-spa, vue-spa, design-system) |

## Results — vitest 4.1.10

Apple M4 (10 cores), node v24.13.0, vite 8.1.4. Whole-process wall clock of `vitest run`, median of 3 reps. Regenerate with `pnpm bench --label vitest-4.1.10 && node scripts/render-results.mjs results/vitest-4.1.10.json`.

### micro-utils

The median OSS package — surveys of Vitest usage put the median project at ~4 test files. 8 modules, 5 test files, no dependencies: startup overhead is everything, and the jsdom/happy-dom rows show what an inherited DOM environment costs a node-only suite.

| pool | env | isolate | cold | warm |
|---|---|---|---:|---:|
| forks | node | true | 0.27s | 0.26s |
| forks | node | false | 0.27s | 0.28s |
| threads | node | true | 0.28s | 0.26s |
| threads | node | false | 0.26s | 0.26s |
| vmThreads | node | true | 0.38s | 0.33s |
| vmThreads | node | false | 0.40s | 0.34s |
| vmForks | node | true | 0.39s | 0.32s |
| vmForks | node | false | 0.40s | 0.32s |
| forks | jsdom | true | — | 0.60s |
| forks | happy-dom | true | — | 0.41s |

### node-library

A mid-size published library: 127 modules in 3 layers, 40 test files that import the modules they test directly, so the per-file subgraphs are largely disjoint.

| pool | env | isolate | fsModuleCache | cold | warm |
|---|---|---|---|---:|---:|
| forks | node | true | false | 0.94s | 0.94s |
| forks | node | true | true | 0.97s | 0.81s |
| forks | node | false | false | 0.47s | 0.48s |
| forks | node | false | true | 0.48s | 0.35s |
| threads | node | true | false | 0.79s | 0.80s |
| threads | node | true | true | 0.88s | 0.76s |
| threads | node | false | false | 0.41s | 0.41s |
| threads | node | false | true | 0.49s | 0.35s |
| forks | jsdom | true | false | — | 3.57s |

### node-backend

An express 5 + zod + pino + dayjs + lodash API service with 16 integration-style test files that do real work per test (hundreds of validations, CRUD flows over in-memory repos).

| pool | isolate | cold | warm |
|---|---|---:|---:|
| forks | true | 0.68s | 0.73s |
| forks | false | — | 0.51s |
| threads | true | — | 0.65s |
| threads | false | — | 0.47s |
| vmThreads | true | — | 0.57s |
| vmThreads | false | — | 0.54s |
| vmForks | true | — | 0.56s |
| vmForks | false | — | 0.55s |

### deps-heavy

Thin glue over 10 real packages covering the shapes that matter for module handling: CJS monoliths (lodash, semver), many-file ESM graphs (lodash-es, date-fns, rxjs), single big ESM (zod), dual packages (yaml, uuid). Node pools pay externals once per worker; vm pools re-evaluate them per context.

| pool | isolate | cold | warm |
|---|---|---:|---:|
| forks | true | 2.22s | 2.23s |
| forks | false | — | 1.24s |
| threads | true | — | 2.16s |
| threads | false | — | 1.28s |
| vmThreads | true | 1.58s | 1.75s |
| vmThreads | false | — | 1.77s |
| vmForks | true | — | 1.64s |
| vmForks | false | — | 1.71s |

### react-spa

A product SPA tested with Testing Library: 92 ts/tsx modules across 6 features, CSS and CSS modules, hooks, a `vi.mock`ed api layer and a jest-dom setup file — run in jsdom, happy-dom and real Chromium.

| pool | env | isolate | fsModuleCache | cold | warm |
|---|---|---|---|---:|---:|
| forks | jsdom | true | false | 3.23s | 3.29s |
| forks | jsdom | false | false | — | 1.04s |
| forks | happy-dom | true | false | — | 1.85s |
| forks | happy-dom | false | false | — | 0.74s |
| threads | jsdom | true | false | — | 2.82s |
| threads | jsdom | false | false | — | 1.10s |
| threads | happy-dom | true | false | — | 1.86s |
| threads | happy-dom | false | false | — | 0.75s |
| vmThreads | jsdom | true | false | — | 1.36s |
| vmThreads | jsdom | false | false | — | 1.37s |
| vmThreads | happy-dom | true | false | — | 1.03s |
| vmThreads | happy-dom | false | false | — | 1.05s |
| forks | jsdom | true | true | 3.21s | 3.57s |
| browser | chromium | true | false | 2.67s | 2.48s |

### vue-spa

37 single-file components plus composables, tested with @vue/test-utils. The SFC compilation through @vitejs/plugin-vue makes this the expensive-transform fixture.

| pool | env | isolate | cold | warm |
|---|---|---|---:|---:|
| forks | jsdom | true | 2.24s | 2.21s |
| forks | jsdom | false | — | 1.07s |
| forks | happy-dom | true | — | 1.25s |
| forks | happy-dom | false | — | 0.72s |
| threads | jsdom | true | — | 1.97s |
| threads | jsdom | false | — | 1.02s |
| threads | happy-dom | true | — | 1.28s |
| threads | happy-dom | false | — | 0.75s |
| browser | chromium | true | 2.11s | 2.00s |

### design-system

80 components with per-component CSS, and every one of the 80 test files imports from the root barrel — each file pays the whole library plus a DOM environment. The classic component-library trap.

| pool | env | isolate | cold | warm |
|---|---|---|---:|---:|
| forks | jsdom | true | 8.21s | 8.37s |
| forks | jsdom | false | — | 1.35s |
| forks | happy-dom | true | — | 5.44s |
| forks | happy-dom | false | — | 1.03s |
| vmThreads | jsdom | true | — | 2.27s |
| vmThreads | jsdom | false | — | 2.24s |
| vmThreads | happy-dom | true | — | 1.88s |
| vmThreads | happy-dom | false | — | 1.88s |
| browser | chromium | true | 5.39s | 5.33s |

### barrel-hell

The same barrel pathology without DOM or JSX: 817 modules behind nested barrels, 20 test files using ~3 symbols each, so every file evaluates the full graph.

| pool | isolate | fsModuleCache | cold | warm |
|---|---|---|---:|---:|
| forks | true | false | 1.98s | 1.98s |
| forks | true | true | 2.09s | 1.36s |
| forks | false | false | 1.42s | 1.37s |
| forks | false | true | 1.45s | 0.77s |
| threads | true | false | 1.26s | 1.27s |
| threads | true | true | 1.65s | 1.08s |
| threads | false | false | 0.91s | 0.91s |
| threads | false | true | 1.18s | 0.64s |

### enterprise-monolith

Big-repo CI: ~1280 modules with 12-deep import chains, import cycles, path aliases, dynamic imports, JSON imports, and 15 jsdom-pragma files among the 150 test files (mixed environments fragment worker reuse).

| pool | isolate | fsModuleCache | maxWorkers | cold | warm |
|---|---|---|---|---:|---:|
| forks | true | false | default | 8.09s | 7.55s |
| forks | true | true | default | 8.95s | 6.87s |
| forks | false | false | default | 2.77s | 3.22s |
| forks | false | true | default | 2.91s | 2.50s |
| threads | true | false | default | 5.91s | 5.96s |
| threads | true | true | default | 6.42s | 5.04s |
| threads | false | false | default | 2.12s | 2.41s |
| threads | false | true | default | 2.44s | 2.11s |
| forks | false | false | 50% | — | 3.26s |

### long-haul

The worker-lifetime endurance fixture: 80 jsdom test files through 2 workers, every file holding a ~15MB module-level dataset and rendering tables over it. Node pools rebuild the environment and re-import the externalized dependencies for each of a worker's 40 files; vm pool workers pay once, reuse compiled scripts across contexts, and get recycled several times per run by the pinned 512MB `vmMemoryLimit` — the recycle path no other app enters. Short fixtures understate the vm pools; this is the fixture where they win by a wide margin. (World *retention* is deliberately out of scope: workers report lazy heap numbers, so leak regressions are covered by Vitest's own reachability tests, not wall clock.)

| pool | env | isolate | workers | cold | warm |
|---|---|---|---|---:|---:|
| forks | jsdom | true | 2 | — | 19.24s |
| threads | jsdom | true | 2 | — | 17.32s |
| vmThreads | jsdom | true | 2 | — | 5.89s |
| vmForks | jsdom | true | 2 | 6.04s | 6.08s |
| forks | happy-dom | true | 2 | — | 12.13s |
| vmForks | happy-dom | true | 2 | — | 5.67s |

### cpu-bound

30 test files that burn real CPU (hashing, sieving, matrix multiplication) on an 8-module graph. The tests themselves dominate, so only scheduling — `maxWorkers`, pool choice — changes anything.

| pool | isolate | maxWorkers | cold | warm |
|---|---|---|---:|---:|
| forks | true | 25% | — | 1.51s |
| forks | true | 50% | — | 1.11s |
| forks | true | 100% | — | 0.94s |
| threads | true | 25% | — | 1.39s |
| threads | true | 50% | — | 1.04s |
| threads | true | 100% | — | 0.87s |
| forks | false | 100% | — | 0.66s |

## Design

- Generators are deterministic — no randomness, structure comes from modular arithmetic — so `pnpm generate` always produces byte-identical sources and a generator diff is a reviewable change to a fixture's shape.
- Every dependency is pinned exactly and the lockfile is committed; the vitest/vite/jsdom/happy-dom/playwright pins are part of the measurement — bump them deliberately, in their own commit.
- Tests assert real behavior computed through the import graph, so a vitest correctness regression fails the bench instead of silently timing broken runs.
- CI (`smoke.yml`) only checks that every app generates and passes under the pinned vitest; shared runners are too noisy for timing — use quiet dedicated hardware and `compare.mjs` for A/B decisions.
