# vitest benchmarks

> The apps, generators, and bench runner in this repository were generated with [Claude Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) and reviewed by the Vitest team. The results below were measured by hand on the hardware stated in each section.

Generated reference apps for measuring Vitest performance. Each app stands for one kind of project: a tiny utility package, a library, barrel-file graphs, DOM component suites, a dependency-heavy service, a 1300-module monolith, and a long-running DOM suite. The bench runner measures the options that change run time on each of them: `pool`, `environment` (jsdom, happy-dom, and headless Chromium via browser mode), `isolate`, `fsModuleCache`, `maxWorkers`, and cold vs warm caches.

## Usage

```sh
pnpm install
pnpm --dir apps/react-spa exec playwright install chromium   # for the browser cells
pnpm generate      # writes apps/*/src and apps/*/tests (gitignored, deterministic)

pnpm bench                                  # default matrix, every app, 3 reps per cell
pnpm bench --apps react-spa,barrel-hell --runs 5
pnpm bench --matrix quick --runs 1          # one representative cell per app

# A/B a local vitest build against the pinned release
pnpm bench --label main                     # 1. measure the pinned release first
# 2. link the local build (see below), then
pnpm bench --label branch
pnpm compare results/main.json results/branch.json
```

### Benchmarking a local vitest build

Link the local build into the workspace instead of pointing `--vitest` at its binary. Dependencies such as `@testing-library/jest-dom/vitest` import `vitest` themselves, and Node resolves that import to the pinned install. With `--vitest` alone the tests use one `expect` and the matchers register on another, so every jsdom cell fails with `Invalid Chai property`. The browser cells also need the matching `@vitest/browser-playwright`.

Add overrides to `pnpm-workspace.yaml` (do not commit them):

```yaml
overrides:
  vitest: link:/path/to/vitest/packages/vitest
  "@vitest/browser-playwright": link:/path/to/vitest/packages/browser-playwright
  "@vitest/coverage-v8": link:/path/to/vitest/packages/coverage-v8
  "@vitest/coverage-istanbul": link:/path/to/vitest/packages/coverage-istanbul
```

Then reinstall and add the link at the workspace root. Packages inside `node_modules/.pnpm` resolve `vitest` from there:

```sh
pnpm install
ln -sfn /path/to/vitest/packages/vitest node_modules/vitest
pnpm bench --label branch                   # picks up the linked build, prints its version
```

Run `pnpm build` in the vitest repository before measuring, because the link points at `dist/`. The linked build resolves `vite` from the vitest repository, not from the pin in this workspace, so check that both versions match before comparing Vite-sensitive cells. To return to the pinned release, remove the overrides and the symlink and run `pnpm install` again.

### `bench` options

| option | values | default |
|---|---|---|
| `--apps` | comma-separated app names | all apps |
| `--matrix` | `quick` (1-2 cells per app), `default` (curated cells below), `full` (whole cross product, use with `--apps`) | `default` |
| `--runs` | timed reps per cell, median reported | `3` |
| `--label` | name of the result file, `results/<label>.json` | `local` |
| `--vitest` | path to a `vitest.mjs` binary (or `VITEST_BIN` env); only changes the binary, see [Benchmarking a local vitest build](#benchmarking-a-local-vitest-build) | the pinned install |
| `BENCH_FS_CACHE_MODE` | `stable` \| `experimental`, where the fs-cache option lives; auto-detected from the vitest version | auto |

`cold` cells wipe every persistent cache (Vite deps and transform caches, vitest cache dirs, fs module cache) before each timed rep. This is what a fresh CI run pays. `warm` cells wipe once, run once untimed to prime the caches, then measure. This is what repeated local runs pay. The host's `NODE_COMPILE_CACHE` is cleared in both cases; whatever a vitest version enables itself is part of its measurement.

### Running a single cell by hand

Every app is a normal standalone Vitest project. The committed configs read `BENCH_*` variables (see [tools/config/bench-config.js](tools/config/bench-config.js)), so any cell can be reproduced with plain `vitest run`:

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
| `BENCH_BROWSER` | `true`, headless Chromium via playwright (react-spa, vue-spa, design-system) |

## Results: vitest 4.1.10 vs 5.0.0-rc.2

Apple M4 (10 cores), node v24.13.0. Whole-process wall clock of `vitest run`, median of 3 reps, both versions measured on the same machine in one session. 4.1.10 is the pinned install on vite 8.1.4. 5.0.0-rc.2 is a local build with vitest-dev/vitest#11078, linked as described above; it resolves vite 8.0.11 from the vitest repository. To regenerate: `pnpm bench --label vitest-4.1.10`, then `pnpm bench --label vitest-5.0` with the linked build, then `node scripts/render-results.mjs results/vitest-4.1.10.json results/vitest-5.0.json`.

### micro-utils

The median open source package: 8 modules, 5 test files, no dependencies. Startup overhead is everything here. The jsdom and happy-dom rows show what a DOM environment costs a node-only suite.

| pool | env | isolate | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | node | true | 0.27s | 0.25s | −5% | 0.27s | 0.25s | −6% |
| forks | node | false | 0.26s | 0.25s | −5% | 0.26s | 0.26s | −3% |
| threads | node | true | 0.25s | 0.24s | −6% | 0.25s | 0.24s | −6% |
| threads | node | false | 0.25s | 0.24s | −6% | 0.25s | 0.24s | −4% |
| vmThreads | node | true | 0.39s | 0.37s | −3% | 0.28s | 0.27s | −3% |
| vmThreads | node | false | 0.39s | 0.39s | ~0 | 0.28s | 0.28s | ~0 |
| vmForks | node | true | 0.38s | 0.38s | ~0 | 0.29s | 0.28s | −3% |
| vmForks | node | false | 0.38s | 0.38s | ~0 | 0.30s | 0.28s | −4% |
| forks | jsdom | true | — | — | — | 0.63s | 0.58s | −8% |
| forks | happy-dom | true | — | — | — | 0.41s | 0.39s | −6% |

### node-library

A mid-size library: 127 modules in 3 layers and 40 test files. Each test file imports the modules it tests directly, so the per-file graphs overlap little.

| pool | env | isolate | fsModuleCache | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | node | true | false | 0.88s | 0.80s | −9% | 0.86s | 0.75s | −13% |
| forks | node | true | true | 0.89s | 0.77s | −13% | 0.78s | 0.65s | −17% |
| forks | node | false | false | 0.46s | 0.43s | −7% | 0.45s | 0.42s | −8% |
| forks | node | false | true | 0.46s | 0.43s | −8% | 0.33s | 0.31s | −7% |
| threads | node | true | false | 0.74s | 0.64s | −13% | 0.74s | 0.65s | −13% |
| threads | node | true | true | 0.78s | 0.67s | −14% | 0.68s | 0.55s | −20% |
| threads | node | false | false | 0.39s | 0.37s | −4% | 0.39s | 0.38s | −3% |
| threads | node | false | true | 0.42s | 0.40s | −6% | 0.30s | 0.28s | −6% |
| forks | jsdom | true | false | — | — | — | 3.40s | 3.14s | −8% |

### node-backend

An API service on express 5, zod, pino, dayjs, and lodash. 16 integration-style test files with real work per test: hundreds of validations and CRUD flows over in-memory repositories.

| pool | isolate | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| forks | true | 0.64s | 0.59s | −8% | 0.64s | 0.59s | −8% |
| forks | false | — | — | — | 0.47s | 0.55s | +18% |
| threads | true | — | — | — | 0.56s | 0.58s | +4% |
| threads | false | — | — | — | 0.44s | 0.42s | −4% |
| vmThreads | true | — | — | — | 0.51s | 0.47s | −8% |
| vmThreads | false | — | — | — | 0.51s | 0.47s | −9% |
| vmForks | true | — | — | — | 0.55s | 0.51s | −8% |
| vmForks | false | — | — | — | 0.55s | 0.50s | −8% |

### deps-heavy

Thin code over 10 real packages that cover the module shapes that matter: CJS monoliths (lodash, semver), many-file ESM graphs (lodash-es, date-fns, rxjs), one big ESM file (zod), and dual packages (yaml, uuid). Node pools load externals once per worker; vm pools evaluate them again in each context.

| pool | isolate | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| forks | true | 2.11s | 2.05s | −2% | 2.20s | 2.10s | −5% |
| forks | false | — | — | — | 1.24s | 1.23s | ~0 |
| threads | true | — | — | — | 2.07s | 1.99s | −4% |
| threads | false | — | — | — | 1.22s | 1.18s | −3% |
| vmThreads | true | 1.55s | 0.72s | −54% | 1.59s | 0.70s | −56% |
| vmThreads | false | — | — | — | 1.57s | 0.69s | −56% |
| vmForks | true | — | — | — | 1.65s | 0.73s | −55% |
| vmForks | false | — | — | — | 1.65s | 0.75s | −55% |

### react-spa

A React SPA tested with Testing Library: 92 ts/tsx modules in 6 features, CSS and CSS modules, hooks, a mocked API layer, and a jest-dom setup file. Runs in jsdom, happy-dom, and real Chromium.

| pool | env | isolate | fsModuleCache | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | jsdom | true | false | 3.10s | 3.16s | +2% | 3.08s | 3.12s | ~0 |
| forks | jsdom | false | false | — | — | — | 1.10s | 1.12s | +2% |
| forks | happy-dom | true | false | — | — | — | 1.94s | 1.97s | ~0 |
| forks | happy-dom | false | false | — | — | — | 0.77s | 0.77s | ~0 |
| threads | jsdom | true | false | — | — | — | 2.83s | 2.75s | −3% |
| threads | jsdom | false | false | — | — | — | 1.03s | 1.01s | ~0 |
| threads | happy-dom | true | false | — | — | — | 1.76s | 1.66s | −6% |
| threads | happy-dom | false | false | — | — | — | 0.71s | 0.70s | −2% |
| vmThreads | jsdom | true | false | — | — | — | 1.25s | 1.07s | −15% |
| vmThreads | jsdom | false | false | — | — | — | 1.27s | 1.10s | −13% |
| vmThreads | happy-dom | true | false | — | — | — | 0.98s | 0.87s | −12% |
| vmThreads | happy-dom | false | false | — | — | — | 0.97s | 0.85s | −12% |
| forks | jsdom | true | true | 3.07s | 3.12s | +2% | 3.00s | 3.09s | +3% |
| browser | chromium | true | false | 2.43s | 2.06s | −15% | 2.40s | 2.01s | −16% |

### vue-spa

37 single-file components plus composables, tested with @vue/test-utils. SFC compilation through @vitejs/plugin-vue makes this the expensive-transform app.

| pool | env | isolate | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | jsdom | true | 2.13s | 2.08s | −2% | 2.13s | 2.05s | −4% |
| forks | jsdom | false | — | — | — | 1.08s | 1.07s | ~0 |
| forks | happy-dom | true | — | — | — | 1.29s | 1.27s | −2% |
| forks | happy-dom | false | — | — | — | 0.71s | 0.75s | +5% |
| threads | jsdom | true | — | — | — | 1.96s | 1.97s | ~0 |
| threads | jsdom | false | — | — | — | 1.00s | 1.03s | +3% |
| threads | happy-dom | true | — | — | — | 1.19s | 1.16s | −2% |
| threads | happy-dom | false | — | — | — | 0.70s | 0.69s | ~0 |
| browser | chromium | true | 2.03s | 1.60s | −21% | 1.94s | 1.58s | −18% |

### design-system

80 components with per-component CSS. Every one of the 80 test files imports from the root barrel, so each file pays for the whole library plus a DOM environment.

| pool | env | isolate | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | jsdom | true | 8.11s | 8.30s | +2% | 8.11s | 8.31s | +2% |
| forks | jsdom | false | — | — | — | 1.29s | 1.32s | +2% |
| forks | happy-dom | true | — | — | — | 5.22s | 5.15s | ~0 |
| forks | happy-dom | false | — | — | — | 0.96s | 0.98s | +3% |
| vmThreads | jsdom | true | — | — | — | 2.09s | 1.72s | −18% |
| vmThreads | jsdom | false | — | — | — | 2.09s | 1.70s | −19% |
| vmThreads | happy-dom | true | — | — | — | 1.81s | 1.47s | −19% |
| vmThreads | happy-dom | false | — | — | — | 1.80s | 1.46s | −19% |
| browser | chromium | true | 5.14s | 4.79s | −7% | 5.10s | 4.65s | −9% |

### barrel-hell

The same barrel problem without DOM or JSX: 817 modules behind nested barrels and 20 test files that use about 3 symbols each. Every file evaluates the full graph.

| pool | isolate | fsModuleCache | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | true | false | 1.90s | 1.74s | −8% | 1.92s | 1.70s | −11% |
| forks | true | true | 2.06s | 1.72s | −16% | 1.33s | 1.08s | −18% |
| forks | false | false | 1.39s | 1.36s | −2% | 1.35s | 1.36s | ~0 |
| forks | false | true | 1.43s | 1.40s | −2% | 0.76s | 0.71s | −7% |
| threads | true | false | 1.26s | 1.27s | ~0 | 1.25s | 1.25s | ~0 |
| threads | true | true | 1.64s | 1.42s | −13% | 1.05s | 0.91s | −13% |
| threads | false | false | 0.92s | 0.93s | ~0 | 0.91s | 0.93s | +3% |
| threads | false | true | 1.18s | 1.15s | −2% | 0.63s | 0.58s | −8% |

### enterprise-monolith

A large monorepo: about 1280 modules with 12-deep import chains, import cycles, path aliases, dynamic imports, JSON imports, and 150 test files. 15 of them use a jsdom pragma, so mixed environments limit worker reuse.

| pool | isolate | fsModuleCache | maxWorkers | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | true | false | default | 7.37s | 5.92s | −20% | 7.24s | 5.83s | −19% |
| forks | true | true | default | 7.32s | 5.99s | −18% | 6.36s | 5.16s | −19% |
| forks | false | false | default | 2.73s | 2.77s | +2% | 3.24s | 3.10s | −4% |
| forks | false | true | default | 2.85s | 2.85s | ~0 | 2.26s | 2.22s | −2% |
| threads | true | false | default | 5.36s | 5.25s | −2% | 5.32s | 5.15s | −3% |
| threads | true | true | default | 5.90s | 5.18s | −12% | 5.02s | 4.43s | −12% |
| threads | false | false | default | 2.12s | 2.16s | +2% | 2.49s | 2.42s | −3% |
| threads | false | true | default | 2.48s | 2.45s | ~0 | 1.90s | 1.98s | +5% |
| forks | false | false | 50% | — | — | — | 3.36s | 3.17s | −6% |

### long-haul

A long-running DOM suite: 80 jsdom test files through 2 workers, each file holding a 15MB module-level dataset and rendering tables over it. Node pools rebuild the environment and import the external dependencies again for each of a worker's 40 files. vm pool workers pay once, reuse compiled scripts across contexts, and get recycled by the pinned 512MB `vmMemoryLimit` several times per run. This is the app where the vm pools win by a wide margin. Memory retention across files is out of scope here.

| pool | env | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| forks | jsdom | — | — | — | 18.88s | 18.24s | −3% |
| threads | jsdom | — | — | — | 17.28s | 16.72s | −3% |
| vmThreads | jsdom | — | — | — | 5.82s | 5.13s | −12% |
| vmForks | jsdom | 6.02s | 5.15s | −15% | 6.03s | 5.13s | −15% |
| forks | happy-dom | — | — | — | 11.38s | 10.89s | −4% |
| vmForks | happy-dom | — | — | — | 5.43s | 4.06s | −25% |

### cpu-bound

30 test files that burn real CPU (hashing, sieving, matrix multiplication) on an 8-module graph. The tests dominate, so only scheduling (`maxWorkers`, pool choice) changes anything.

| pool | isolate | maxWorkers | 4.1.10 cold | 5.0.0-rc.2 cold | Δ | 4.1.10 warm | 5.0.0-rc.2 warm | Δ |
|---|---|---|---:|---:|---:|---:|---:|---:|
| forks | true | 25% | — | — | — | 1.55s | 1.43s | −8% |
| forks | true | 50% | — | — | — | 1.18s | 1.08s | −9% |
| forks | true | 100% | — | — | — | 0.94s | 0.88s | −7% |
| threads | true | 25% | — | — | — | 1.45s | 1.33s | −9% |
| threads | true | 50% | — | — | — | 1.09s | 1.01s | −8% |
| threads | true | 100% | — | — | — | 0.91s | 0.83s | −8% |
| forks | false | 100% | — | — | — | 0.66s | 0.63s | −4% |

## Design

- Generators are deterministic: no randomness, the structure comes from modular arithmetic. `pnpm generate` produces byte-identical sources, so a generator diff is a reviewable change to an app's shape.
- Every dependency is pinned exactly and the lockfile is committed. The vitest, vite, jsdom, happy-dom, and playwright pins are part of the measurement. Bump them on purpose, in their own commit.
- Tests assert real behavior computed through the import graph, so a vitest correctness regression fails the bench instead of timing broken runs.
- CI (`smoke.yml`) only checks that every app generates and passes under the pinned vitest. Shared runners are too noisy for timing; use quiet dedicated hardware and `compare.mjs` for A/B decisions.
