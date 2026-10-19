// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DG_SOURCE_NOTICE } from '../domain/dangerous-goods/lithium'
import type { CiplSeed } from '../domain/dangerous-goods/cipl-seed'
import { newConsignment, type DgConsignment } from '../domain/dangerous-goods/types'
import { EMPTY_PROFILE } from '../domain/draft'
import { DangerousGoodsPanel, DeclarationPanel } from './dangerous-goods'

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

const SEED: CiplSeed = {
  source: { fileName: 'synthetic.pdf', invoiceNumber: 'S0000042' },
  consignee: { name: 'Example Consignee B.V.', addressLines: ['1 Example Street', 'Netherlands'] },
  shippersReference: 'S0000042',
  routeHint: { shippedFrom: 'San Francisco', dischargePort: 'Amsterdam, Netherlands' },
  cartons: 1,
  parts: [
    {
      partNumber: '20000-0001',
      description: '20000-0001 BACKUP BATTERY PACK',
      count: { value: 12, label: '12 PCS' },
      netWeightKg: { value: 2.124, label: '2.124 kg' },
    },
  ],
}

/** The panel with its consignment and links held the way `App` holds them. */
function Harness({ cipl }: { cipl: CiplSeed | null }) {
  const [consignment, setConsignment] = useState<DgConsignment>(newConsignment)
  const [links, setLinks] = useState<Record<string, string>>({})
  return (
    <DangerousGoodsPanel
      profile={EMPTY_PROFILE}
      bridge={null}
      records={[]}
      consignment={consignment}
      onConsignmentChange={setConsignment}
      onPrepared={() => {}}
      cipl={cipl}
      ciplLinks={links}
      onCiplLinks={(next) => setLinks((prev) => ({ ...prev, ...next }))}
    />
  )
}

describe('filling the consignment from the CIPL', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async (cipl: CiplSeed | null) => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<Harness cipl={cipl} />))
  }
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const button = (text: string | RegExp) =>
    [...container.querySelectorAll('button')].find((b) =>
      typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
    )
  const control = <T extends HTMLElement>(label: string): T => {
    const element = [...container.querySelectorAll('label')].find((l) => l.textContent === label)
    if (!element) throw new Error(`no field labelled ${label}`)
    return container.ownerDocument.getElementById(element.htmlFor) as T
  }
  const click = async (b: HTMLButtonElement | undefined) => {
    if (!b) throw new Error('no such button')
    await act(async () => b.click())
  }

  it('shows nothing about a CIPL when none is loaded', async () => {
    await mount(null)
    expect(container.textContent).not.toContain('From the CIPL')
    expect(button('Fill from the CIPL')).toBeUndefined()
    expect(button(/Use CIPL figure/)).toBeUndefined()
  })

  it('fills the consignee and reference on request, and says what it did', async () => {
    await mount(SEED)
    expect(container.textContent).toContain('synthetic.pdf, invoice S0000042')
    expect(control<HTMLInputElement>('Consignee name').value).toBe('')

    await click(button('Fill from the CIPL'))
    expect(control<HTMLInputElement>('Consignee name').value).toBe('Example Consignee B.V.')
    expect(control<HTMLInputElement>("Shipper's reference").value).toBe('S0000042')
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/Set the consignee.*Added 1 battery entry/)
  })

  it('shows the CIPL’s route beside the airport fields without filling them', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    expect(control<HTMLInputElement>('Airport of departure').value).toBe('')
    expect(control<HTMLInputElement>('Airport of destination').value).toBe('')
    expect(container.textContent).toContain('The CIPL’s shipped from: San Francisco.')
    expect(container.textContent).toContain('The CIPL’s discharge port: Amsterdam, Netherlands.')
  })

  it('puts a figure in its field only on that field’s own click', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    const count = () => control<HTMLInputElement>('How many per package').value
    const weight = () => control<HTMLInputElement>('Net battery weight per package (kg)').value
    expect(count()).toBe('')
    expect(weight()).toBe('')

    await click(button('Use CIPL figure (12 PCS)'))
    expect(count()).toBe('12')
    expect(weight()).toBe('')
    expect(container.textContent).toContain('Matches the CIPL (12 PCS).')

    await click(button('Use CIPL figure (2.124 kg)'))
    expect(weight()).toBe('2.124')
  })

  it('says why a figure is not offered, and offers no button for it', async () => {
    await mount({
      ...SEED,
      parts: [{ ...SEED.parts[0], netWeightKg: { value: null, why: 'The CIPL’s weights do not reconcile.' } }],
    })
    await click(button('Fill from the CIPL'))
    expect(container.textContent).toContain('No CIPL figure: The CIPL’s weights do not reconcile.')
    expect(button(/2\.124 kg/)).toBeUndefined()
    expect(button('Use CIPL figure (12 PCS)')).toBeDefined()
  })

  it('offers neither figure once the entry is equipment', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    const level = control<HTMLSelectElement>('Article level')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(level, 'equipment')
      level.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(button(/Use CIPL figure/)).toBeUndefined()
    expect(container.textContent).toContain('the CIPL counts and weighs the equipment')
  })
})
