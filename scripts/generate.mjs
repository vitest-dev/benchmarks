// Regenerates the sources of every app (or the ones passed as arguments).
//   node scripts/generate.mjs [app ...]
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APPS_DIR = join(ROOT, 'apps')

const requested = process.argv.slice(2)
const apps = requested.length > 0
  ? requested
  : readdirSync(APPS_DIR).filter(name => existsSync(join(APPS_DIR, name, 'generate.mjs'))).sort()

for (const app of apps) {
  const generator = join(APPS_DIR, app, 'generate.mjs')
  if (!existsSync(generator)) {
    console.error(`unknown app: ${app}`)
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [generator], { stdio: 'inherit' })
  if (result.status !== 0)
    process.exit(result.status ?? 1)
}
