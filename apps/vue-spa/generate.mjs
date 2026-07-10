// vue-spa — a Vue 3 product app tested with @vue/test-utils.
//
// The distinguishing dimension is the transform pipeline: .vue single-file
// components go through @vitejs/plugin-vue (template compilation + scoped
// styles), which is meaningfully more expensive per module than esbuild's
// TS/JSX transform and exercises the plugin path of the transform pipeline.
// Everything else is kept comparable to react-spa (features, leaf components
// composed into panels, composables, DOM environment per file).
//
// 4 features x (8 widgets + panel + 2 composables) + a shared store + App.
import { createApp } from '../../tools/generator/helpers.mjs'

const FEATURES = 4
const WIDGETS = 8

const app = createApp(import.meta.url)

app.write('src/shims-vue.d.ts', `declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
`)

app.write('src/store.ts', `import { reactive } from 'vue'

export const store = reactive({
  visits: 0,
  labels: [] as string[],
})
export function recordVisit(label: string): void {
  store.visits++
  store.labels.push(label)
}
`)

for (let f = 0; f < FEATURES; f++) {
  const dir = `src/features/feature-${f}`

  app.write(`${dir}/useFeature${f}.ts`, `import { computed, ref } from 'vue'

export function useFeature${f}() {
  const values = ref<number[]>([])
  const total = computed(() => values.value.reduce((a, b) => a + b, 0))
  function add(value: number): void {
    values.value.push(value)
  }
  return { total, add, values }
}
`)

  app.write(`${dir}/useFeature${f}Format.ts`, `import { computed, type Ref } from 'vue'

export function useFeature${f}Format(total: Ref<number>) {
  return computed(() => 'f${f}:' + total.value.toString(10))
}
`)

  for (let w = 0; w < WIDGETS; w++) {
    app.write(`${dir}/Widget${w}.vue`, `<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ title: string }>()
const count = ref(0)
const label = computed(() => props.title + ':' + count.value)
</script>

<template>
  <div class="widget-${f}-${w}">
    <span>{{ label }}</span>
    <button type="button" @click="count++">
      inc-${f}-${w}
    </button>
  </div>
</template>

<style scoped>
.widget-${f}-${w} {
  display: flex;
  gap: ${(w % 4) + 2}px;
}
</style>
`)
  }

  app.write(`${dir}/Panel.vue`, `<script setup lang="ts">
import { recordVisit } from '../../store'
import { useFeature${f} } from './useFeature${f}'
import { useFeature${f}Format } from './useFeature${f}Format'
${Array.from({ length: 4 }, (_, w) => `import Widget${w} from './Widget${w}.vue'`).join('\n')}

const { total, add } = useFeature${f}()
const formatted = useFeature${f}Format(total)
recordVisit('feature-${f}')
</script>

<template>
  <section class="panel-${f}">
    <h2>{{ formatted }}</h2>
    <button type="button" @click="add(5)">
      add-${f}
    </button>
${Array.from({ length: 4 }, (_, w) => `    <Widget${w} title="w${f}${w}" />`).join('\n')}
  </section>
</template>
`)
}

app.write('src/App.vue', `<script setup lang="ts">
${Array.from({ length: FEATURES }, (_, f) => `import Panel${f} from './features/feature-${f}/Panel.vue'`).join('\n')}
</script>

<template>
  <main>
${Array.from({ length: FEATURES }, (_, f) => `    <Panel${f} />`).join('\n')}
  </main>
</template>
`)

// 12 widget tests (3 per feature)
for (let f = 0; f < FEATURES; f++) {
  for (const w of [0, 3, 6]) {
    app.write(`tests/widget-${f}-${w}.test.ts`, `import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Widget${w} from '../src/features/feature-${f}/Widget${w}.vue'

describe('feature-${f} Widget${w}', () => {
  it('renders and increments', async () => {
    const wrapper = mount(Widget${w}, { props: { title: 'hi${f}${w}' } })
    expect(wrapper.text()).toContain('hi${f}${w}:0')
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('hi${f}${w}:1')
  })
})
`)
  }
}

// 4 panel tests
for (let f = 0; f < FEATURES; f++) {
  app.write(`tests/panel-${f}.test.ts`, `import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Panel from '../src/features/feature-${f}/Panel.vue'
import { store } from '../src/store'

describe('feature-${f} Panel', () => {
  it('composes widgets and tracks totals', async () => {
    const before = store.visits
    const wrapper = mount(Panel)
    expect(store.visits).toBe(before + 1)
    expect(wrapper.text()).toContain('f${f}:0')
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('f${f}:5')
    expect(wrapper.findAll('.widget-${f}-0')).toHaveLength(1)
  })
})
`)
}

// 4 composable tests
for (let f = 0; f < FEATURES; f++) {
  app.write(`tests/use-feature-${f}.test.ts`, `import { describe, expect, it } from 'vitest'
import { useFeature${f} } from '../src/features/feature-${f}/useFeature${f}'
import { useFeature${f}Format } from '../src/features/feature-${f}/useFeature${f}Format'

describe('useFeature${f}', () => {
  it('accumulates and formats totals', () => {
    const { total, add } = useFeature${f}()
    add(2)
    add(3)
    expect(total.value).toBe(5)
    expect(useFeature${f}Format(total).value).toBe('f${f}:5')
  })
})
`)
}

app.report('vue-spa', `${FEATURES * (WIDGETS + 3) + 3} modules (${FEATURES * (WIDGETS + 1) + 1} SFCs), 20 test files`)
