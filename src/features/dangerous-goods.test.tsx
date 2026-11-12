// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DG_RULES_LAPSED_NOTICE, DG_RULES_SOURCE, DG_SOURCE_NOTICE } from '../domain/dangerous-goods/lithium'
import type { CiplSeed } from '../domain/dangerous-goods/cipl-seed'
import { consignment as consignmentOf, entry, pkg } from '../domain/dangerous-goods/test-support'
import type { DesktopBridge } from '../desktop'
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

  const generatePanel = async (onDate: string) => {
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
      onDate,
    } as unknown as Parameters<typeof DeclarationPanel>[0]
    await act(async () => root.render(<DeclarationPanel {...props} />))
    return {
      container,
      downloads: () => [...container.querySelectorAll('button')].filter((b) => /Download/.test(b.textContent ?? '')),
      boxes: () => [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
      close: async () => {
        await act(async () => root.unmount())
        container.remove()
      },
    }
  }

  it('asks for nothing more than the one acknowledgement while no later DGR is in force', async () => {
    const panel = await generatePanel('2026-12-31')
    expect(panel.container.textContent).not.toContain(DG_RULES_LAPSED_NOTICE)
    expect(panel.boxes()).toHaveLength(1)
    await panel.close()
  })

  it('says a later DGR is in force, and generates nothing until that is acknowledged as well', async () => {
    const panel = await generatePanel('2027-01-01')
    expect(panel.container.querySelector('[role="alert"]')?.textContent).toContain(DG_RULES_LAPSED_NOTICE)
    expect(panel.boxes()).toHaveLength(2)

    // The everyday acknowledgement alone is not enough once the figures are superseded.
    await act(async () => panel.boxes()[0].click())
    expect(panel.downloads().every((b) => b.disabled)).toBe(true)
    await act(async () => panel.boxes()[1].click())
    expect(panel.downloads().every((b) => !b.disabled)).toBe(true)
    await panel.close()
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
function Harness({
  cipl,
  records = [],
  initial = newConsignment,
  bridge = null,
  onPrepared = () => {},
}: {
  cipl: CiplSeed | null
  records?: DgConsignmentRecord[]
  initial?: () => DgConsignment
  bridge?: DesktopBridge | null
  onPrepared?: (record: DgConsignmentRecord) => void
}) {
  const [consignment, setConsignment] = useState<DgConsignment>(initial)
  const [links, setLinks] = useState<Record<string, string>>({})
  // Fed back like `App.handleDgPrepared` does, the later write winning on a shared id, so the
  // panel sees its own earlier record when deciding whether a download is the same preparation.
  const [kept, setKept] = useState<DgConsignmentRecord[]>(records)
  return (
    <DangerousGoodsPanel
      profile={EMPTY_PROFILE}
      bridge={bridge}
      records={kept}
      consignment={consignment}
      onConsignmentChange={setConsignment}
      onPrepared={(record) => {
        setKept((prev) => [...prev.filter((r) => r.id !== record.id), record])
        onPrepared(record)
      }}
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
    await choose('Shipping configuration', 'standalone')
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
    await choose('Shipping configuration', 'standalone')
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
    await choose('Shipping configuration', 'standalone')
    await type('Identical packages', '2')
    expect(button(/Use CIPL figure \((12 PCS|2\.124 kg)\)/)).toBeUndefined()
    expect(view().textContent).toContain('No CIPL figure: offered once Identical packages is 1')
  })

  it('adds no entries and offers nothing from a CIPL whose lines were not all accounted for', async () => {
    const why = 'Standard Shipping could not show every line of the CIPL was read.'
    await mount({ ...SEED, incomplete: why, packageCount: { value: null, why } })
    await click(button('Fill from the CIPL'))
    expect(view().querySelector('[role="status"]')?.textContent).toContain(`Added no battery entries: ${why}`)
    expect(view().textContent).not.toContain('Use CIPL figure')
    expect(view().textContent).not.toContain('Not classified: answer chemistry, cell or battery, shipping configuration, article level, condition. ')
  })

  it('offers no figure for a battery type with equipment, and takes back one already copied', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await click(button('Use CIPL figure (1 carton)'))
    await choose('Article level', 'battery-pack')
    await choose('Shipping configuration', 'standalone')
    await click(button('Use CIPL figure (2.124 kg)'))
    await choose('Shipping configuration', 'contained-in-equipment')
    expect(control<HTMLInputElement>('Net battery weight per package (kg)').value).toBe('')
    expect(button(/Use CIPL figure \((12 PCS|2\.124 kg)\)/)).toBeUndefined()
    expect(view().textContent).toContain('with equipment the CIPL may count and weigh the devices')
  })

  it('takes back the carton figures when the package count stops being one', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await click(button('Use CIPL figure (1 carton)'))
    await choose('Article level', 'battery-pack')
    await choose('Shipping configuration', 'standalone')
    await click(button('Use CIPL figure (12 PCS)'))
    await click(button('Use CIPL figure (2.124 kg)'))
    await type('Identical packages', '2')
    expect(control<HTMLInputElement>('How many per package').value).toBe('')
    expect(control<HTMLInputElement>('Net battery weight per package (kg)').value).toBe('')
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

  it('takes back the CIPL figures when the entry becomes equipment, and keeps typed ones', async () => {
    await mount(SEED)
    await click(button('Fill from the CIPL'))
    await click(button('Use CIPL figure (1 carton)'))
    await choose('Article level', 'battery-pack')
    await choose('Shipping configuration', 'standalone')
    await click(button('Use CIPL figure (12 PCS)'))
    await type('Net battery weight per package (kg)', '1.5')
    await choose('Article level', 'equipment')
    expect(control<HTMLInputElement>('How many per package').value).toBe('')
    expect(control<HTMLInputElement>('Net battery weight per package (kg)').value).toBe('1.5')
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
    await choose('Shipping configuration', 'standalone')
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

  // The old shape: every classification input filled, as emptyEntry used to fill them, and no
  // rules stamp.
  const savedBefore = (): DgConsignmentRecord => {
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
    return old
  }

  it('still lists a record saved before entries could be unanswered', async () => {
    await mount(null, [savedBefore()])
    expect(view().textContent).toContain('AWB-1')
    expect(view().textContent).toContain('PI 968 IB')
    // Written before the rules source was dated: no stamp, and the list claims nothing for it.
    expect(view().textContent).not.toContain('rules superseded')
  })

  it('marks a record prepared after a later DGR took effect, beside one that was not', async () => {
    const stamp = { materials: 'Course materials rev. A', supersededOn: '2027-01-01' }
    const current: DgConsignmentRecord = {
      ...savedBefore(),
      id: 'AWB-2@2026-12-30T00:00:00.000Z',
      airWaybillNumber: 'AWB-2',
      rulesSource: { ...stamp, lapsedWhenPrepared: false },
    }
    const lapsed: DgConsignmentRecord = {
      ...savedBefore(),
      id: 'AWB-3@2027-01-04T00:00:00.000Z',
      airWaybillNumber: 'AWB-3',
      rulesSource: { ...stamp, lapsedWhenPrepared: true },
    }
    await mount(null, [current, lapsed])
    const rows = [...view().querySelectorAll('tr')].map((r) => r.textContent ?? '')
    expect(rows.find((r) => r.includes('AWB-2'))).not.toContain('rules superseded')
    expect(rows.find((r) => r.includes('AWB-3'))).toContain('rules superseded 2027-01-01')
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
    await choose('Shipping configuration', 'standalone')
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

describe('the retention record of a prepared consignment', () => {
  afterEach(() => vi.useRealTimers())

  // The two-package consignment `assess.test.ts` proves passes every blocking check.
  const ready = () =>
    consignmentOf([
      pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })]),
      pkg('p2', [
        entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1.5 }, { netWeightKgPerPackage: 1.5, wattHourMarkedOnCase: false }),
      ]),
    ])

  /** Downloads the checklist the way the operator does, and returns what was written and kept. */
  const prepareOn = async (now: Date) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const written: string[] = []
    const kept: DgConsignmentRecord[] = []
    const bridge = {
      saveOutput: async (name: string, bytes: Uint8Array) => {
        written.push(new TextDecoder().decode(bytes))
        return `C:\\out\\${name}`
      },
      openOutput: async () => {},
    } as unknown as DesktopBridge

    container = document.createElement('div')
    document.body.append(container)
    const r = createRoot(container)
    root = r
    await act(async () =>
      r.render(<Harness cipl={null} initial={ready} bridge={bridge} onPrepared={(record) => kept.push(record)} />),
    )
    for (const box of view().querySelectorAll<HTMLInputElement>('[role="note"] input, [role="alert"] input')) {
      await act(async () => box.click())
    }
    await click(button('Download the package checklist'))
    return { written, kept }
  }

  it('says which figures it was prepared under, and that no later DGR was in force', async () => {
    const { written, kept } = await prepareOn(new Date(2026, 11, 31, 15, 0))
    expect(written).toHaveLength(1)
    expect(written[0]).not.toContain(DG_RULES_LAPSED_NOTICE)
    expect(kept).toHaveLength(1)
    expect(kept[0].rulesSource).toEqual({
      materials: DG_RULES_SOURCE.materials,
      supersededOn: '2027-01-01',
      lapsedWhenPrepared: false,
    })
    expect(kept[0].checks.find((c) => c.id === 'dg.rules-current')?.passed).toBe(true)
  })

  it('generates nothing on a screen acknowledged before the day and left open across it', async () => {
    const { written, kept } = await prepareOn(new Date(2026, 11, 31, 23, 50))
    expect(written).toHaveLength(1)

    // Midnight passes with the screen open and its one acknowledgement still ticked.
    vi.setSystemTime(new Date(2027, 0, 1, 0, 10))
    await click(button('Download the package checklist'))
    expect(written).toHaveLength(1)
    expect(kept).toHaveLength(1)
    expect(view().querySelector('[role="alert"]')?.textContent).toContain(DG_RULES_LAPSED_NOTICE)
    expect(button('Download the package checklist')?.disabled).toBe(true)

    await act(async () => view().querySelector<HTMLInputElement>('[role="alert"] input')!.click())
    await click(button('Download the package checklist'))
    expect(written).toHaveLength(2)
    expect(written[1]).toContain(DG_RULES_LAPSED_NOTICE)
    expect(written[1]).toContain('**warning** — Rules not superseded by a later DGR')
    expect(kept.at(-1)?.rulesSource?.lapsedWhenPrepared).toBe(true)
    expect(kept.at(-1)?.checks.find((c) => c.id === 'dg.rules-current')?.passed).toBe(false)
    // Twenty minutes apart, the same consignment, and still two preparations: the later one
    // must not land on the earlier record and restamp it.
    expect(kept.at(-1)?.id).not.toBe(kept[0].id)
    expect(kept[0].rulesSource?.lapsedWhenPrepared).toBe(false)
    const rows = [...view().querySelectorAll('tr')].map((r) => r.textContent ?? '')
    expect(rows.filter((r) => r.includes('rules superseded 2027-01-01'))).toHaveLength(1)
  })

  it('stamps the record with the date on the artifact when delivery runs past midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 50))
    const written: string[] = []
    const kept: DgConsignmentRecord[] = []
    const bridge = {
      saveOutput: async (name: string, bytes: Uint8Array) => {
        written.push(new TextDecoder().decode(bytes))
        return `C:\\out\\${name}`
      },
      // The file is written on the 31st; opening it returns on the 1st.
      openOutput: async () => {
        vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 5))
      },
    } as unknown as DesktopBridge
    container = document.createElement('div')
    document.body.append(container)
    const r = createRoot(container)
    root = r
    await act(async () =>
      r.render(<Harness cipl={null} initial={ready} bridge={bridge} onPrepared={(record) => kept.push(record)} />),
    )
    await act(async () => view().querySelector<HTMLInputElement>('[role="note"] input')!.click())
    await click(button('Download the package checklist'))

    expect(written[0]).toContain('Prepared 2026-12-31')
    expect(written[0]).not.toContain(DG_RULES_LAPSED_NOTICE)
    expect(kept).toHaveLength(1)
    expect(kept[0].preparedAt.startsWith(new Date(2026, 11, 31, 23, 59, 50).toISOString().slice(0, 19))).toBe(true)
    expect(kept[0].rulesSource?.lapsedWhenPrepared).toBe(false)
    expect(kept[0].checks.find((c) => c.id === 'dg.rules-current')?.passed).toBe(true)
  })

  it('still treats two downloads minutes apart as one preparation when nothing changed between them', async () => {
    const { written, kept } = await prepareOn(new Date(2026, 11, 30, 10, 0))
    vi.setSystemTime(new Date(2026, 11, 30, 10, 5))
    await click(button('Download the package checklist'))
    expect(written).toHaveLength(2)
    expect(kept.map((r) => r.id)).toEqual([kept[0].id, kept[0].id])
  })

  it('records the lapse on a consignment prepared the day a later DGR takes effect', async () => {
    const { written, kept } = await prepareOn(new Date(2027, 0, 1, 9, 0))
    expect(written[0]).toContain(DG_RULES_LAPSED_NOTICE)
    expect(kept[0].rulesSource?.lapsedWhenPrepared).toBe(true)
    expect(kept[0].checks.find((c) => c.id === 'dg.rules-current')?.passed).toBe(false)
  })
})
