// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DG_SOURCE_NOTICE } from '../domain/dangerous-goods/lithium'
import type { CiplSeed } from '../domain/dangerous-goods/cipl-seed'
import { newConsignment, type DgConsignment } from '../domain/dangerous-goods/types'
import { EMPTY_PROFILE } from '../domain/draft'
import type { DgConsignmentRecord } from '../store/local-store'
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
  packageCount: { value: 1, label: '1 carton' },
  incomplete: null,
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
function Harness({ cipl, records = [] }: { cipl: CiplSeed | null; records?: DgConsignmentRecord[] }) {
  const [consignment, setConsignment] = useState<DgConsignment>(newConsignment)
  const [links, setLinks] = useState<Record<string, string>>({})
  return (
    <DangerousGoodsPanel
      profile={EMPTY_PROFILE}
      bridge={null}
      records={records}
      consignment={consignment}
      onConsignmentChange={setConsignment}
      onPrepared={() => {}}
      cipl={cipl}
      ciplLinks={links}
      onCiplLinks={(next) => setLinks((prev) => ({ ...prev, ...next }))}
    />
  )
}

let container: HTMLDivElement | null = null
let root: Root | null = null

const mount = async (cipl: CiplSeed | null, records: DgConsignmentRecord[] = []) => {
  container = document.createElement('div')
  document.body.append(container)
  const r = createRoot(container)
  root = r
  await act(async () => r.render(<Harness cipl={cipl} records={records} />))
}
afterEach(async () => {
  const r = root
  if (r) await act(async () => r.unmount())
  container?.remove()
  root = null
  container = null
})

const view = () => {
  if (!container) throw new Error('nothing mounted')
  return container
}
const button = (text: string | RegExp) =>
  [...view().querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
  )
const controls = <T extends HTMLElement>(label: string): T[] =>
  [...view().querySelectorAll('label')]
    .filter((l) => l.textContent === label)
    .map((l) => view().ownerDocument.getElementById(l.htmlFor) as T)
const control = <T extends HTMLElement>(label: string): T => {
  const [element] = controls<T>(label)
  if (!element) throw new Error(`no field labelled ${label}`)
  return element
}
const click = async (b: HTMLButtonElement | undefined) => {
  if (!b) throw new Error('no such button')
  await act(async () => b.click())
}
const choose = async (label: string, value: string) => {
  const select = control<HTMLSelectElement>(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const type = async (label: string, value: string) => {
  const input = control<HTMLInputElement>(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('filling the consignment from the CIPL', () => {
  const container = { get textContent() { return view().textContent } }

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
    expect(view().querySelector('[role="status"]')?.textContent).toMatch(/Set the consignee.*Added 1 battery entry/)
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
    // The carton is one package only once the package count says so.
    expect(button('Use CIPL figure (12 PCS)')).toBeUndefined()
    expect(view().textContent).toContain('No CIPL figure: offered once Identical packages is 1')
    await click(button('Use CIPL figure (1 carton)'))
    // And only once the article level says these are batteries, not devices.
    expect(button('Use CIPL figure (12 PCS)')).toBeUndefined()
    expect(view().textContent).toContain('No CIPL figure: answer the article level first')
    await choose('Article level', 'battery-pack')
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
    await click(button('Use CIPL figure (1 carton)'))
    await choose('Article level', 'battery-pack')
    expect(container.textContent).toContain('No CIPL figure: The CIPL’s weights do not reconcile.')
    expect(button(/2\.124 kg/)).toBeUndefined()
    expect(button('Use CIPL figure (12 PCS)')).toBeDefined()
  })

  it('offers the package count on the package its entries went into, on a click', async () => {
    await mount(SEED)
    expect(button('Use CIPL figure (1 carton)')).toBeUndefined()
    await click(button('Fill from the CIPL'))
    expect(control<HTMLInputElement>('Identical packages').value).toBe('')
    await click(button('Use CIPL figure (1 carton)'))
    expect(control<HTMLInputElement>('Identical packages').value).toBe('1')
    expect(view().textContent).toContain('Matches the CIPL (1 carton).')
  })

  it('stops offering the carton as a per-package figure once two packages are typed', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await choose('Article level', 'battery-pack')
    await type('Identical packages', '2')
    expect(button(/Use CIPL figure \((12 PCS|2\.124 kg)\)/)).toBeUndefined()
    expect(view().textContent).toContain('No CIPL figure: offered once Identical packages is 1')
  })

  it('adds no entries and offers nothing from a CIPL whose lines were not all accounted for', async () => {
    await mount({ ...SEED, incomplete: 'Standard Shipping could not show every line of the CIPL was read.' })
    expect(view().textContent).not.toContain('Use CIPL figure')
    // The seed itself carries the refusal into the notes; see cipl-seed.test.ts.
  })

  it('offers nothing for an entry added from a different CIPL', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    const other: CiplSeed = { ...SEED, source: { fileName: 'other.pdf', invoiceNumber: 'S0000099' } }
    const r = root!
    await act(async () => r.render(<Harness cipl={other} />))
    expect(button(/Use CIPL figure \((12 PCS|2\.124 kg)\)/)).toBeUndefined()
    expect(button('Use CIPL figure (1 carton)')).toBeUndefined()
  })

  it('offers no package count once there is a second package description', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await click(button('Add package'))
    expect(button('Use CIPL figure (1 carton)')).toBeUndefined()
    expect(view().textContent).toContain('No CIPL figure: the consignment has more than one package description')
  })

  it('states no "no declaration" or passenger verdict on goods nobody has described', async () => {
    await mount(null)
    expect(view().textContent).not.toContain('No declaration is required for a Section II consignment')
    expect(view().textContent).not.toContain('Every package in this consignment is prepared to Section II')
    expect(view().textContent).not.toContain('remain permitted on passenger aircraft')
    expect(view().textContent).toContain('Whether a declaration is required is known once every battery type and package is described.')
  })

  it('offers neither figure once the entry is equipment', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await click(button('Use CIPL figure (1 carton)'))
    await choose('Article level', 'equipment')
    // The entry's two figures; the package count still holds, one carton being one package.
    expect(button(/Use CIPL figure \((12 PCS|2\.124 kg)\)/)).toBeUndefined()
    expect(container.textContent).toContain('the CIPL counts and weighs the equipment')
  })
})

describe('a battery type nobody has described yet', () => {
  it('shows no classification and no verdict until it is described', async () => {
    await mount(null)
    expect(view().textContent).toContain('classification incomplete')
    expect(view().textContent).not.toContain('passenger permitted')
    expect(view().textContent).not.toContain('Section II — no declaration')
    // The classification line's shape; the panel's help text names UN numbers on its own.
    expect(view().textContent).not.toMatch(/Class 9 · PI/)
    expect(view().textContent).toContain('Not classified: answer chemistry, cell or battery, shipping configuration')
    for (const label of ['Chemistry', 'Cell or battery', 'Shipping configuration', 'Article level', 'Condition']) {
      expect(control<HTMLSelectElement>(label).value, label).toBe('')
    }
  })

  it('asks for the energy figure the chosen chemistry is rated in', async () => {
    await mount(null)
    expect(view().textContent).toContain('Choose the chemistry to enter the watt-hours or lithium content.')
    expect(controls('Watt-hours per cell/battery')).toHaveLength(0)
    expect(controls('Lithium content per cell/battery (g)')).toHaveLength(0)

    await choose('Chemistry', 'lithium-metal')
    expect(controls('Lithium content per cell/battery (g)')).toHaveLength(1)
    expect(controls('Watt-hours per cell/battery')).toHaveLength(0)
  })

  it('classifies once all five are answered', async () => {
    await mount(null)
    await choose('Chemistry', 'lithium-metal')
    await choose('Cell or battery', 'battery')
    await choose('Shipping configuration', 'standalone')
    await choose('Article level', 'battery-pack')
    expect(view().textContent).toMatch(/Not classified: answer condition\./)
    await choose('Condition', 'sound')
    expect(view().textContent).toMatch(/UN3090\s*Lithium metal batteries\s*· Class 9 · PI 968/)
    expect(view().textContent).not.toContain('Not classified')
    expect(view().textContent).not.toContain('classification incomplete')
  })

  it('leaves an entry the CIPL added unclassified too', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    expect(view().textContent).toContain('Not classified: answer chemistry')
    expect(view().textContent).not.toMatch(/Class 9 · PI/)
  })

  it('still lists a record saved before entries could be unanswered', async () => {
    // The old shape: every classification input filled, as emptyEntry used to fill them.
    const old: DgConsignmentRecord = {
      id: 'AWB-1@2026-10-01T00:00:00.000Z',
      preparedAt: '2026-10-01T00:00:00.000Z',
      retainUntil: '2028-10-01',
      airWaybillNumber: 'AWB-1',
      shippersReference: '',
      consigneeName: 'Example Consignee B.V.',
      airportOfDeparture: 'San Francisco',
      airportOfDestination: 'Amsterdam',
      aircraft: 'cargo-aircraft-only',
      declarationRequired: true,
      unNumbers: ['UN3090'],
      packingInstructions: ['968 IB'],
      packages: 1,
      netWeightKg: 2.124,
      consignment: {
        ...newConsignment(),
        packages: [
          {
            ...newConsignment().packages[0],
            entries: [
              {
                ...newConsignment().packages[0].entries[0],
                spec: { chemistry: 'lithium-metal', form: 'battery', configuration: 'standalone', wattHours: null, lithiumContentG: 0.9 },
                articleLevel: 'battery-pack',
                condition: 'sound',
              },
            ],
          },
        ],
      },
      checks: [],
    }
    await mount(null, [old])
    expect(view().textContent).toContain('AWB-1')
    expect(view().textContent).toContain('PI 968 IB')
  })
})

describe('a package nobody has described yet', () => {
  it('starts with no packaging, no count and co-packing unanswered', async () => {
    await mount(null)
    expect(control<HTMLInputElement>('Packaging').value).toBe('')
    expect(control<HTMLInputElement>('Identical packages').value).toBe('')
    expect(control<HTMLSelectElement>('Also holds prohibited dangerous goods').value).toBe('')
    expect(view().textContent).toContain('packages not counted')
  })

  it('is complete only once the box is described as well as the batteries', async () => {
    await mount(null)
    await choose('Chemistry', 'lithium-metal')
    await choose('Cell or battery', 'battery')
    await choose('Shipping configuration', 'standalone')
    await choose('Article level', 'battery-pack')
    await choose('Condition', 'sound')
    expect(view().textContent).toContain('packages incomplete')

    await type('Identical packages', '1')
    expect(view().textContent).not.toContain('packages not counted')
    await type('Packaging', 'Fibreboard box')
    expect(view().textContent).toContain('packages incomplete')
    await choose('Also holds prohibited dangerous goods', 'no')
    expect(view().textContent).not.toContain('packages incomplete')
    expect(view().textContent).not.toContain('classification incomplete')
  })
})

describe('a package in an overpack nobody has counted', () => {
  it('reads "packages not counted", not "0 packages"', async () => {
    await mount(null)
    await type('Identical packages', '1')
    expect(view().textContent).not.toContain('packages not counted')
    await click(button('Add overpack'))
    await choose('Overpack', [...control<HTMLSelectElement>('Overpack').options].find((o) => o.value)!.value)
    expect(view().textContent).toContain('packages not counted')
    expect(view().textContent).not.toMatch(/\b0 packages ·/)
  })
})
