import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Wipes the app's generated directories and returns a writer bound to the
 * app root. Generators must be fully deterministic: same inputs, byte-equal
 * output — file mtimes are the only thing that changes between runs, so
 * `pnpm generate` invalidates fs/transform caches by design (that is what a
 * fresh checkout looks like too).
 */
export function createApp(importMetaUrl, dirs = ['src', 'tests']) {
  const root = dirname(fileURLToPath(importMetaUrl))
  for (const d of dirs)
    rmSync(join(root, d), { recursive: true, force: true })
  let files = 0
  return {
    root,
    write(rel, content) {
      const file = join(root, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
      files++
    },
    report(appName, note) {
      console.log(`generated ${appName}: ${files} files${note ? ` (${note})` : ''}`)
    },
  }
}

/**
 * A realistic TypeScript module body: interfaces, a generic result type,
 * module-level state, a couple of exported functions and a constant.
 * Gives every module genuine parse/transform/evaluate mass (~20 lines)
 * without being dead code — tests call these through the import graph.
 */
export function tsModule(name, i, extra = '') {
  return `${extra}
export interface ${name}Opts { id: number, tag?: string, nested?: { flag: boolean, values: readonly number[] } }
export type ${name}Result<T> = { ok: true, value: T } | { ok: false, error: string }
const registry = new Map<string, number>()
export function ${name}Register(key: string, value: number): void {
  registry.set(key, value)
}
export function ${name}Compute(opts: ${name}Opts): ${name}Result<number> {
  const base = opts.id * ${i + 1}
  const bonus = opts.nested?.values.reduce((a, b) => a + b, 0) ?? 0
  if (base < 0)
    return { ok: false, error: 'negative' }
  return { ok: true, value: base + bonus + (registry.get(opts.tag ?? '') ?? 0) }
}
export function ${name}Format(r: ${name}Result<number>): string {
  return r.ok ? \`ok:\${r.value.toString(16)}\` : \`err:\${r.error}\`
}
export const ${name}Default: ${name}Opts = { id: ${i}, nested: { flag: true, values: [1, 2, 3] } }
`
}
