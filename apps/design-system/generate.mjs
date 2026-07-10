// design-system — a component library where every test imports from the
// root barrel (the MUI/Chakra-style trap).
//
// 80 components in 10 categories, each with its own CSS file, all re-exported
// from src/index.ts. Every one of the 80 test files does
// `import { CompN } from '../src'`, so each file pulls all 80 components and
// their CSS to test one of them. Combined with a DOM environment per file,
// this is the worst honest case for isolate:true — and the fixture where the
// doctor's environment hint and isolate hint should both fire loudly.
//
// Compare with barrel-hell (same barrel pathology, no DOM, no JSX) to
// separate graph width cost from environment cost.
import { createApp } from '../../tools/generator/helpers.mjs'

const CATEGORIES = 10
const PER_CATEGORY = 8
const TOTAL = CATEGORIES * PER_CATEGORY

const app = createApp(import.meta.url)

for (let i = 0; i < TOTAL; i++) {
  const cat = Math.floor(i / PER_CATEGORY)
  const nested = i % 4 === 1
  app.write(`src/cat${cat}/Comp${i}.tsx`, `import { useState } from 'react'
import './comp${i}.css'
${nested ? `import { Comp${i - 1} } from './Comp${i - 1}'\n` : ''}
export interface Comp${i}Props { label: string, disabled?: boolean }
export function Comp${i}({ label, disabled }: Comp${i}Props) {
  const [active, setActive] = useState(false)
  return (
    <span className="wrap${i}">
      <button
        type="button"
        className={active ? 'comp${i} active' : 'comp${i}'}
        disabled={disabled}
        onClick={() => setActive(!active)}
      >
        {label}
      </button>
${nested ? `      <Comp${i - 1} label={label + '-nested'} />\n` : ''}    </span>
  )
}
`)
  app.write(`src/cat${cat}/comp${i}.css`, `.comp${i} {
  display: inline-flex;
  padding: ${(i % 6) + 2}px;
}
.comp${i}.active {
  outline: 1px solid currentcolor;
}
`)
}

app.write(
  'src/index.ts',
  `${Array.from({ length: TOTAL }, (_, i) => `export * from './cat${Math.floor(i / PER_CATEGORY)}/Comp${i}'`).join('\n')}\n`,
)

app.write('tests/setup.ts', `import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => cleanup())
`)

for (let i = 0; i < TOTAL; i++) {
  app.write(`tests/comp${i}.test.tsx`, `import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Comp${i} } from '../src'

describe('Comp${i}', () => {
  it('renders the label', () => {
    render(<Comp${i} label="ds-${i}" />)
    expect(screen.getByText('ds-${i}')).toBeInTheDocument()
  })
  it('activates on click', () => {
    render(<Comp${i} label="toggle-${i}" />)
    const el = screen.getByText('toggle-${i}')
    fireEvent.click(el)
    expect(el.className).toContain('active')
  })
  it('respects disabled', () => {
    render(<Comp${i} label="off-${i}" disabled />)
    expect(screen.getByText('off-${i}')).toBeDisabled()
  })
})
`)
}

app.report('design-system', `${TOTAL} components + css + root barrel, ${TOTAL} test files, each pulling the full library`)
