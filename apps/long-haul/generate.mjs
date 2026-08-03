// long-haul — the worker-lifetime endurance fixture.
//
// Every other app in this suite finishes before a worker has lived long
// enough for worker-lifetime behavior to matter. This one pushes 80 jsdom
// test files through 2 workers, so each worker serves 40 files in one
// process and everything a worker amortizes or accumulates gets 40 chances
// to show up:
//
//   - amortization: node pools re-create the environment and re-import the
//     externalized dependencies for every file; vm pool workers pay once and
//     reuse compiled scripts across contexts. Short fixtures understate this
//     advantage; here it decides the result.
//   - recycling: every file's world holds a ~15MB module-level dataset, and
//     the committed config pins `vmMemoryLimit` to 512MB, so vm workers are
//     recycled several times per run on any machine. No other app enters the
//     recycle path at all; a regression that makes recycling expensive (it
//     tears an isolate down in-process on vmThreads) lands here.
//
// Wall clock cannot see world *retention* at this scale — the worker reports
// lazy heap numbers and V8 collects when it pleases — so leak regressions
// are the job of vitest's own reachability tests, not this fixture. What
// this fixture answers is: which pool should a large DOM suite use, once
// workers live long enough for the answer to change.
import { createApp } from '../../tools/generator/helpers.mjs'

const FEATURES = 80
const ROWS = 60_000
const RENDERED_ROWS = 600

const app = createApp(import.meta.url)

app.write('src/shared/format.ts', `export function formatScore(score: number): string {
  return score >= 900 ? \`\${score} (top)\` : String(score)
}

export function formatKey(key: string, bucket: number): string {
  return \`\${key}/\${bucket.toString(16)}\`
}
`)

for (let i = 0; i < FEATURES; i++) {
  app.write(`src/feature${i}/data.ts`, `export interface Row {
  id: number
  key: string
  score: number
  active: boolean
  tags: string[]
  meta: { weight: number, bucket: number }
}

// module-level state: alive for as long as this file's world is reachable
export const rows: Row[] = Array.from({ length: ${ROWS} }, (_, k) => ({
  id: k,
  key: \`k\${(k * 31 + ${i}) % 9973}\`,
  score: (k * 7 + ${i}) % 1000,
  active: k % 3 === 0,
  tags: [\`t\${k % 11}\`, \`t\${(k + ${i}) % 13}\`],
  meta: { weight: (k % 97) / 97, bucket: k % 16 },
}))
`)

  app.write(`src/feature${i}/logic.ts`, `import type { Row } from './data'
import { rows } from './data'

export function topScores(limit: number): Row[] {
  return [...rows].sort((a, b) => b.score - a.score).slice(0, limit)
}

export function countByBucket(): Map<number, number> {
  const counts = new Map<number, number>()
  for (const row of rows)
    counts.set(row.meta.bucket, (counts.get(row.meta.bucket) ?? 0) + 1)
  return counts
}

export function activeWithTag(tag: string): number {
  let total = 0
  for (const row of rows) {
    if (row.active && row.tags.includes(tag))
      total++
  }
  return total
}
`)

  app.write(`src/feature${i}/view.ts`, `import { formatKey, formatScore } from '../shared/format'
import { rows } from './data'

export function renderTable(target: HTMLElement): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'feature${i}'
  const body = document.createElement('tbody')
  for (const row of rows.slice(0, ${RENDERED_ROWS})) {
    const tr = document.createElement('tr')
    tr.className = row.active ? 'row active' : 'row'
    tr.dataset.id = String(row.id)
    const key = document.createElement('td')
    key.textContent = formatKey(row.key, row.meta.bucket)
    const score = document.createElement('td')
    score.textContent = formatScore(row.score)
    tr.append(key, score)
    body.append(tr)
  }
  table.append(body)
  target.append(table)
  return table
}

export function toggleRows(table: HTMLTableElement): number {
  let toggled = 0
  for (const tr of table.querySelectorAll('tr.row')) {
    tr.classList.toggle('selected')
    toggled++
  }
  return toggled
}
`)

  app.write(`tests/feature${i}.test.ts`, `import { screen } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'
import { rows } from '../src/feature${i}/data'
import { activeWithTag, countByBucket, topScores } from '../src/feature${i}/logic'
import { renderTable, toggleRows } from '../src/feature${i}/view'

describe('feature${i}', () => {
  it('holds the full dataset', () => {
    expect(rows).toHaveLength(${ROWS})
    expect(rows[${ROWS} - 1].id).toBe(${ROWS} - 1)
  })

  it('aggregates over every row', () => {
    const counts = countByBucket()
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(${ROWS})
    expect(topScores(5)[0].score).toBeGreaterThanOrEqual(topScores(5)[4].score)
    expect(activeWithTag('t1')).toBeGreaterThan(0)
  })

  it('renders the table', () => {
    const table = renderTable(document.body)
    expect(table.querySelectorAll('tr.row')).toHaveLength(${RENDERED_ROWS})
    expect(screen.getAllByText(/\\(top\\)$/).length).toBeGreaterThan(0)
  })

  it('toggles every rendered row', () => {
    const table = renderTable(document.body)
    expect(toggleRows(table)).toBe(${RENDERED_ROWS})
    expect(table.querySelectorAll('tr.selected')).toHaveLength(${RENDERED_ROWS})
  })
})
`)
}

app.write('tests/setup.ts', `import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})
`)

app.report('long-haul', `${FEATURES} features, ${ROWS} rows each`)
