// enterprise-monolith-xl — enterprise-monolith's graph with 800 test files
// instead of 150, all in the node environment.
//
// The same ~1280-module graph, so the difference is how many files each
// worker runs over it: about 70 per worker on 12 cores. The original's jsdom
// files are left out because a worker can't be reused across environments,
// which would replace workers every few files.
// Under isolate:false, anything a reused worker pays per file over a large
// shared graph (such as a warm-module snapshot of the file's graph) grows with
// that count, which the smaller app keeps too low to see.
import { generate } from '../enterprise-monolith/generate.mjs'

// `--shared=N` adds an N-module tree that every test file walks, the part of
// the graph a reused worker already has when its next file starts
const shared = Number(process.argv.find(a => a.startsWith('--shared='))?.slice('--shared='.length) ?? 0)

generate(import.meta.url, { name: 'enterprise-monolith-xl', tests: 800, jsdom: false, shared })
