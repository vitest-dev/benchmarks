# vitest benchmarks

Reference applications for measuring Vitest performance. Every fixture is a
deterministic, generated model of a real category of JavaScript/TypeScript
project, and the bench runner measures the option matrix that actually moves
run time (`pool`, `environment`, `isolate`, `fsModuleCache`, `maxWorkers`,
cold vs warm caches) against each of them.

The suite has two consumers:

- **Perf work on vitest itself** — A/B a branch against a released version
  over shapes that are known to bottleneck differently, instead of over one
  ad-hoc fixture.
- **`vitest doctor` / performance hints** — each app documents which
  diagnostic should (and should not) fire for it, so the fixtures double as
  acceptance tests for the recommendations.

## What determines how long a Vitest run takes

The apps are chosen to cover this dimension space, isolating one dimension
per fixture where possible. Profiling of Vitest internals consistently
attributes run time to:

1. **Worker lifecycle × file count** — `isolate: true` pays a worker start
   (spawn + runtime bundle import + environment setup) per *test file*,
   `isolate: false` per *worker*. Roughly 200–500ms/file for forks vs
   5–50ms/file reused (more with a DOM).
2. **Environment creation** — a fresh jsdom is ~500ms per worker (mostly its
   require graph), happy-dom ~200ms. Multiplied by files under isolation.
   vm pools share one environment bundle per worker but build a fresh
   context per file.
3. **Module graph size and shape per test file** — every first-party module
   is transformed once (cached in the server) but *fetched and evaluated*
   per isolated file: a serial RPC waterfall where graph **depth** costs
   latency and **width** costs volume.
4. **Graph sharing across files** — disjoint per-file subgraphs (library
   style) vs every file pulling the same graph (barrel style) decides how
   much `isolate: false` and caches can help.
5. **Barrel files** — importing 3 symbols through a root barrel evaluates
   the whole library. The single biggest accidental multiplier of (3).
6. **External dependencies** — packages in `node_modules` are externalized:
   native imports in node pools (paid once per worker/fork), but
   re-evaluated per fresh context in vm pools. CJS/ESM interop shapes vary.
7. **Transform cost** — esbuild TS/JSX is cheap; plugin pipelines (Vue SFC)
   are not. Only matters cold — transforms are cached warm (and on disk
   with `fsModuleCache`).
8. **The tests themselves** — CPU-bound suites are scheduling-bound
   (`maxWorkers`), and no config change can speed up the tests' own work.
9. **Caches** — Vite transform/deps caches, the fs module cache, and node's
   compile cache split every measurement into *cold* (fresh CI) and *warm*
   (repeated local runs).
10. **Setup files** — re-imported per isolated file.
11. **Mixed per-file environments** — `@vitest-environment` pragmas fragment
    worker reuse.

## The apps

| app | models | shape | isolates / composes |
|---|---|---|---|
| [micro-utils](apps/micro-utils) | the *median* OSS package (surveys: ~4 test files, 71% ≤ 15) | 8 modules, 5 test files, no deps | pure startup overhead; the baseline every "win" must not regress |
| [node-library](apps/node-library) | mid-size published library | 127 modules, 3 layers, 40 test files importing mostly-direct | worker lifecycle vs graph sharing on realistic disjoint subgraphs; fs cache on a medium graph |
| [node-backend](apps/node-backend) | API service (express 5, zod, pino, dayjs, lodash) | 43 modules, 16 integration-style files doing real work per test | mixed framework/test time, CJS-heavy interop |
| [deps-heavy](apps/deps-heavy) | thin glue over many npm packages | 30 modules over 10 real deps (CJS monolith, ESM graphs, dual) | externalization: per-fork native import cost vs per-context re-evaluation in vm pools |
| [react-spa](apps/react-spa) | product SPA with Testing Library | 92 ts/tsx + CSS/CSS-modules, hooks, `vi.mock`ed api, setup file | DOM env per file (jsdom vs happy-dom headline), JSX, setup-file × isolation, mocker |
| [vue-spa](apps/vue-spa) | Vue 3 app with @vue/test-utils | 37 SFCs + composables, 20 test files | plugin transform pipeline (SFC compile) — the expensive-transform fixture |
| [design-system](apps/design-system) | component library (the MUI-style trap) | 80 components + CSS, root barrel, 80 test files each importing from `../src` | worst honest case: full graph × DOM env × per-file isolation |
| [barrel-hell](apps/barrel-hell) | barrel pathology without DOM/JSX | 817 modules behind nested barrels, 20 test files using ~3 symbols each | graph *width* through barrels, nothing else (compare with design-system to subtract the DOM) |
| [enterprise-monolith](apps/enterprise-monolith) | big-repo CI | ~1280 modules, chains 12 deep, 5 import cycles, aliases, dynamic imports, JSON, 150 test files, 15 jsdom pragmas | graph scale (transform + fetch waterfall), fs cache cold/warm, mixed environments |
| [cpu-bound](apps/cpu-bound) | suites whose tests do the work | 8 modules, 30 files × ~150ms real CPU | scheduling only: `maxWorkers`, pool spawn — and the false-positive guard: nothing should be recommended here |

Baseline (Apple M4, node 24, vitest 4.1.10, `forks`/`isolate: true`/warm):
micro-utils 0.28s · node-library 0.89s · node-backend 0.64s · deps-heavy
2.24s · react-spa 3.10s · vue-spa 2.07s · design-system 8.41s · barrel-hell
2.06s · enterprise-monolith 7.76s · cpu-bound 1.02s.

## Usage

```sh
pnpm install
pnpm generate            # writes apps/*/src and apps/*/tests (gitignored)

pnpm bench               # default matrix, all apps, 3 reps per cell
pnpm bench --apps react-spa,design-system --runs 5
pnpm bench --matrix quick --runs 1        # 1 representative cell per app (CI smoke)
pnpm bench --matrix full --apps barrel-hell   # full cross product, use with --apps

# A/B a local build against the pinned release
pnpm bench --label main
pnpm bench --label branch --vitest /path/to/vitest/packages/vitest/vitest.mjs
pnpm compare results/main.json results/branch.json
```

Each app is also a normal standalone Vitest project — `cd apps/react-spa &&
pnpm test` works, and the committed `vitest.config.ts` files read `BENCH_*`
environment variables (see [tools/config/bench-config.js](tools/config/bench-config.js))
so any cell can be reproduced by hand:

```sh
cd apps/design-system
BENCH_POOL=vmThreads BENCH_ENV=happy-dom BENCH_ISOLATE=false pnpm test
```

## Measurement protocol

- **cold** — all persistent caches (`node_modules/.vite`, vitest cache dirs,
  fs module cache) are wiped before *every* timed rep: CI without cache
  restore.
- **warm** — caches wiped once, one untimed priming run, then timed reps:
  repeated local runs.
- `NODE_COMPILE_CACHE`/`NODE_DISABLE_COMPILE_CACHE` are cleared from the
  host environment; whatever a Vitest version enables itself is part of its
  measurement.
- Timed quantity is whole-process wall clock of `vitest run` (what a user
  feels), reported as median + min of N reps; the reporter's `Duration`
  breakdown line is recorded alongside for attribution.
- `fsModuleCache` cells always set the option explicitly (its default moved
  across versions), using `experimental.fsModuleCache` on ≤ 4.1.x and the
  top-level option on newer versions (override with `BENCH_FS_CACHE_MODE`).

## Expected `vitest doctor` / hint behavior

The fixtures encode what the doctor and the performance hints should say:

| app (config) | expected |
|---|---|
| design-system, react-spa (jsdom, forks, isolate:true) | environment hint fires (env dominates tracked time); doctor should measure `vmThreads`/`isolate: false`/happy-dom-class wins |
| barrel-hell, enterprise-monolith (isolate:true, cold) | import/transform dominates → isolate hint and fs-cache-style recommendations are the win |
| micro-utils | total run is small — hints must stay below their absolute-saving threshold (no noise on tiny suites) |
| cpu-bound | `tests` dominates the breakdown — **no** hint should fire; any recommendation here is a false positive |
| micro-utils / node-library under jsdom | the cargo-cult cell: node-only code in a DOM environment (3.5× on node-library) — a future "your tests never touch the DOM" hint |
| deps-heavy (vm pools) | vm context re-evaluation of externals dominates — recommendations should *not* push vm pools here |

## Design rules

- **Generated, not vendored.** Suites this size don't belong in git; a
  ~200-line generator per app documents its shape precisely and regenerates
  byte-identical output (`pnpm generate`). Generators are plain node scripts
  with no dependencies and **no randomness** — structure comes from modular
  arithmetic, so a diff of a generator is a reviewable change to the
  fixture's shape.
- **Pinned everything.** Dependency versions are exact, `packageManager` is
  set, and the lockfile is committed. The vitest/vite pins are part of the
  measurement — bump them deliberately, in their own commit.
- **Tests assert real behavior** (values computed through the import graph),
  so a vitest correctness regression fails the bench instead of silently
  measuring broken runs. Assertions avoid snapshots deliberately: snapshot
  files would make the first run differ from later ones.
- **Non-goals**: browser mode (needs its own fixture set with provider ×
  headless dimensions), watch-mode rerun latency, reporter formatting cost.
  Structural gaps worth adding later: a `projects:` monorepo fixture
  (per-project overhead), a coverage-focused matrix (`BENCH_COVERAGE=v8|istanbul`
  is already plumbed through), typecheck runs.

## CI

`.github/workflows/smoke.yml` runs `--matrix quick --runs 1` on every push:
each app must generate and pass under the pinned Vitest. Timing output in CI
is informational only — shared runners are too noisy for regression gating;
use dedicated hardware and `compare.mjs` for real A/B decisions.
