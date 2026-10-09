// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { DG_SOURCE_NOTICE } from '../domain/dangerous-goods/lithium'
import { DeclarationPanel } from './dangerous-goods'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('generating dangerous goods paperwork', () => {
  it('says the rules are unverified, and generates nothing until that is acknowledged', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const props = {
      declaration: { lines: [], pages: [], notes: [] },
      assessment: { canGenerate: true, declarationRequired: true },
      busy: false,
      error: null,
      warnings: [],
      saved: null,
      bridge: null,
      onGenerate: () => {},
      onChecklist: () => {},
    } as unknown as Parameters<typeof DeclarationPanel>[0]
    await act(async () => root.render(<DeclarationPanel {...props} />))

    expect(container.querySelector('[role="note"]')?.textContent).toContain(DG_SOURCE_NOTICE)
    const buttons = () => [...container.querySelectorAll('button')].filter((b) => /Download/.test(b.textContent ?? ''))
    expect(buttons()).toHaveLength(2)
    expect(buttons().every((b) => b.disabled)).toBe(true)

    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => box.click())
    expect(buttons().every((b) => !b.disabled)).toBe(true)

    await act(async () => root.unmount())
    container.remove()
  })
})
