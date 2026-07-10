// react-spa — a typical product single-page app tested with Testing Library.
//
// 6 features, each with an api layer, hooks, leaf components and a page that
// composes them; a shared UI kit; plain CSS and CSS modules; a setup file
// registering jest-dom matchers and cleanup (paid once per file under
// isolate:true); a few tests that vi.mock the feature api (module-mock
// hoisting + mocker cost).
//
// Dimensions stressed: DOM environment creation per file (jsdom vs
// happy-dom is the headline comparison here), JSX transform, CSS handling,
// setup-file cost multiplied by isolation, react/react-dom as a large
// externalized dependency evaluated per worker (and per context in vm
// pools).
import { createApp } from '../../tools/generator/helpers.mjs'

const FEATURES = 6
const COMPS = 8
const SHARED_UI = 10
const SHARED_UTILS = 8

const app = createApp(import.meta.url)

app.write('src/env.d.ts', `declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
declare module '*.css' {}
`)

for (let u = 0; u < SHARED_UTILS; u++) {
  app.write(`src/shared/utils/util${u}.ts`, `export function util${u}Label(prefix: string, value: number): string {
  return prefix + '-' + (value * ${u + 3}).toString(36)
}
export function util${u}Score(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v * ${u + 1}, 0)
}
`)
}

const uiNames = ['Button', 'Card', 'Input', 'Badge', 'Alert', 'Spinner', 'Avatar', 'Tooltip', 'Tag', 'Divider']
for (let u = 0; u < SHARED_UI; u++) {
  const name = uiNames[u]
  const hasCss = u < 4
  app.write(`src/shared/ui/${name}.tsx`, `${hasCss ? `import './${name.toLowerCase()}.css'\n` : ''}import { util${u % SHARED_UTILS}Label } from '../utils/util${u % SHARED_UTILS}'

export interface ${name}Props { label: string, onClick?: () => void }
export function ${name}({ label, onClick }: ${name}Props) {
  return (
    <button type="button" className="${name.toLowerCase()}" data-kind={util${u % SHARED_UTILS}Label('${name.toLowerCase()}', ${u})} onClick={onClick}>
      {label}
    </button>
  )
}
`)
  if (hasCss) {
    app.write(`src/shared/ui/${name.toLowerCase()}.css`, `.${name.toLowerCase()} {
  display: inline-flex;
  padding: ${4 + u}px ${8 + u}px;
  border-radius: 4px;
}
`)
  }
}

for (let f = 0; f < FEATURES; f++) {
  const dir = `src/features/feature-${f}`

  app.write(`${dir}/api.ts`, `export interface Feature${f}Item {
  id: number
  label: string
  score: number
}
export async function fetchFeature${f}Items(count: number): Promise<Feature${f}Item[]> {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    label: 'feature-${f}-item-' + i,
    score: (i * 7 + ${f}) % 100,
  }))
}
`)

  app.write(`${dir}/hooks.ts`, `import { useCallback, useState } from 'react'
import type { Feature${f}Item } from './api'
import { fetchFeature${f}Items } from './api'

export function useFeature${f}Items() {
  const [items, setItems] = useState<Feature${f}Item[]>([])
  const load = useCallback(async (count: number) => {
    setItems(await fetchFeature${f}Items(count))
  }, [])
  return { items, load }
}
`)

  for (let c = 0; c < COMPS; c++) {
    const cssModule = c % 2 === 1
    const util = (f * COMPS + c) % SHARED_UTILS
    const ui = uiNames[(f + c) % SHARED_UI]
    app.write(`${dir}/Comp${c}.tsx`, `import { useState } from 'react'
${cssModule ? `import styles from './comp${c}.module.css'` : `import './comp${c}.css'`}
import { ${ui} } from '../../shared/ui/${ui}'
import { util${util}Score } from '../../shared/utils/util${util}'

export interface Feature${f}Comp${c}Props { label: string }
export function Feature${f}Comp${c}({ label }: Feature${f}Comp${c}Props) {
  const [count, setCount] = useState(0)
  return (
    <div className=${cssModule ? '{styles.box}' : `"f${f}-comp${c}"`} data-score={util${util}Score([1, 2, ${c}])}>
      <span>{label + ':' + count}</span>
      <${ui} label={'inc-' + label} onClick={() => setCount(count + 1)} />
    </div>
  )
}
`)
    app.write(
      `${dir}/comp${c}${cssModule ? '.module' : ''}.css`,
      cssModule
        ? `.box {\n  display: grid;\n  gap: ${c + 2}px;\n}\n`
        : `.f${f}-comp${c} {\n  display: flex;\n  gap: ${c + 2}px;\n}\n`,
    )
  }

  app.write(`${dir}/Page.tsx`, `import { useFeature${f}Items } from './hooks'
${Array.from({ length: 4 }, (_, c) => `import { Feature${f}Comp${c} } from './Comp${c}'`).join('\n')}

export function Feature${f}Page() {
  const { items, load } = useFeature${f}Items()
  return (
    <section>
      <h1>feature-${f}</h1>
      <button type="button" onClick={() => { void load(5) }}>load-feature-${f}</button>
      <ul>
        {items.map(item => <li key={item.id}>{item.label}</li>)}
      </ul>
${Array.from({ length: 4 }, (_, c) => `      <Feature${f}Comp${c} label="p${f}-${c}" />`).join('\n')}
    </section>
  )
}
`)

  app.write(`${dir}/index.ts`, `export * from './api'
export * from './hooks'
${Array.from({ length: COMPS }, (_, c) => `export * from './Comp${c}'`).join('\n')}
export * from './Page'
`)
}

app.write('src/app.css', `main {\n  margin: 0 auto;\n  max-width: 960px;\n}\n`)
app.write('src/App.tsx', `import './app.css'
${Array.from({ length: FEATURES }, (_, f) => `import { Feature${f}Page } from './features/feature-${f}'`).join('\n')}

export function App() {
  return (
    <main>
${Array.from({ length: FEATURES }, (_, f) => `      <Feature${f}Page />`).join('\n')}
    </main>
  )
}
`)

app.write('tests/setup.ts', `import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => cleanup())
`)

// 6 page tests with a mocked api module
for (let f = 0; f < FEATURES; f++) {
  app.write(`tests/page-${f}.test.tsx`, `import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Feature${f}Page } from '../src/features/feature-${f}/Page'

vi.mock('../src/features/feature-${f}/api', () => ({
  fetchFeature${f}Items: async (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: i, label: 'mocked-${f}-' + i, score: i })),
}))

describe('Feature${f}Page', () => {
  it('renders composed components', () => {
    render(<Feature${f}Page />)
    expect(screen.getByText('feature-${f}')).toBeInTheDocument()
    expect(screen.getByText('p${f}-0:0')).toBeInTheDocument()
  })
  it('loads items through the mocked api', async () => {
    render(<Feature${f}Page />)
    fireEvent.click(screen.getByText('load-feature-${f}'))
    expect(await screen.findByText('mocked-${f}-2')).toBeInTheDocument()
  })
})
`)
}

// 18 leaf component tests (3 per feature)
for (let f = 0; f < FEATURES; f++) {
  for (const c of [1, 3, 5]) {
    const ui = uiNames[(f + c) % SHARED_UI]
    app.write(`tests/comp-${f}-${c}.test.tsx`, `import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Feature${f}Comp${c} } from '../src/features/feature-${f}/Comp${c}'

describe('Feature${f}Comp${c}', () => {
  it('renders the initial count', () => {
    render(<Feature${f}Comp${c} label="x${f}${c}" />)
    expect(screen.getByText('x${f}${c}:0')).toBeInTheDocument()
  })
  it('increments through the shared ${ui}', () => {
    render(<Feature${f}Comp${c} label="y${f}${c}" />)
    fireEvent.click(screen.getByText('inc-y${f}${c}'))
    expect(screen.getByText('y${f}${c}:1')).toBeInTheDocument()
  })
})
`)
  }
}

// 6 shared ui kit tests
for (let u = 0; u < 6; u++) {
  const name = uiNames[u]
  app.write(`tests/ui-${name.toLowerCase()}.test.tsx`, `import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ${name} } from '../src/shared/ui/${name}'

describe('${name}', () => {
  it('renders and reacts to clicks', () => {
    let clicks = 0
    render(<${name} label="ui-${u}" onClick={() => clicks++} />)
    const el = screen.getByText('ui-${u}')
    expect(el).toBeInTheDocument()
    fireEvent.click(el)
    expect(clicks).toBe(1)
  })
})
`)
}

app.report('react-spa', `${FEATURES * (COMPS + 4) + SHARED_UI + SHARED_UTILS + 2} ts/tsx modules + css, 30 test files + setup`)
