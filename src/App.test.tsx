// @vitest-environment jsdom
/**
 * The application shell, driven the way a person drives it: a workbook is uploaded, the screen
 * is read, a button is pressed, another workbook is uploaded.
 *
 * The store is replaced with one held in memory (nothing in the test environment provides
 * IndexedDB) and the Schedule B dataset is read off disk where the app would fetch it. The
 * parser, the reconciliation, the draft and every screen are the real ones.
 */
import fs from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildXlsx } from './lib/xlsx'
import { inHouseCiGrid, simpleInHouseCi, type InHouseCiSpec } from './test/synthetic/inhouse-ci'
import type { ConsigneeRecord, LocalStore } from './store/local-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const consignees = new Map<string, ConsigneeRecord>()

vi.mock('./store/local-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store/local-store')>()
  const none = async () => []
  const nothing = async () => {}
  const store: Partial<LocalStore> = {
    getProfile: async () => null,
    saveProfile: nothing,
    getKeyingOptions: async () => null,
    saveKeyingOptions: nothing,
    getConsignee: async (name) => consignees.get(name) ?? null,
    saveConsignee: nothing,
    listConsignees: none,
    listOverrides: none,
    listPartOverrides: none,
    listItems: none,
    listShipments: none,
    listDgConsignments: none,
  }
  return { ...actual, localStore: store as LocalStore }
})

const { App } = await import('./App')

const SCHEDULE_B = fs.readFileSync(path.resolve(import.meta.dirname, '../public/data/schedule-b.json'), 'utf8')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  consignees.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(SCHEDULE_B, { status: 200, headers: { 'content-type': 'application/json' } })),
  )
})
afterEach(async () => {
  const r = root
  if (r) await act(async () => r.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

const settle = async () => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 5)))
}
const mount = async () => {
  container = document.createElement('div')
  document.body.append(container)
  const r = createRoot(container)
  root = r
  await act(async () => r.render(<App />))
  await settle()
}
const upload = async (name: string, spec: InHouseCiSpec) => {
  const bytes = buildXlsx([{ name: 'INV', rows: inHouseCiGrid(spec) }])
  const file = new File([bytes as BlobPart], name)
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  const input = container!.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await settle()
}
/** The list at the top of the shipment's manual fields. */
const unconfirmedNote = () =>
  [...container!.querySelectorAll('[role="note"]')].find((n) =>
    /nobody has chosen them for this shipment/.test(n.textContent ?? ''),
  )
const text = () => container!.textContent ?? ''

describe('declared values nobody chose, through the application', () => {
  it('names the starting values on a first shipment, in the fields and in the checks, until confirmed', async () => {
    await mount()
    await upload('first.xlsx', simpleInHouseCi())

    expect(unconfirmedNote()?.textContent).toContain('Consignee type "Reseller": the starting value, not chosen for this shipment')
    // The same finding reaches the checks list, which is what the history record is built from.
    const inChecks = 'Routed export "No": the starting value, not chosen for this shipment. Each is filed as shown.'
    expect(text()).toContain('Declared values chosen for this shipment')
    expect(text()).toContain(inChecks)

    // Choosing a value is confirming it: that one leaves both lists, and the others stay.
    const consigneeType = [...container!.querySelectorAll('label')]
      .filter((l) => l.textContent === 'Ultimate consignee type')
      .map((l) => document.getElementById(l.htmlFor) as HTMLSelectElement)[0]
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(consigneeType, 'GOVERNMENT_ENTITY')
      consigneeType.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(text()).not.toContain('Consignee type "')
    expect(unconfirmedNote()?.querySelectorAll('li')).toHaveLength(3)
    expect(text()).toContain(inChecks)

    const confirm = [...unconfirmedNote()!.querySelectorAll('button')].find((b) => /right for this shipment/.test(b.textContent ?? ''))!
    await act(async () => confirm.click())
    expect(unconfirmedNote()).toBeUndefined()
    expect(text()).not.toContain(inChecks)
    expect(text()).not.toContain('the starting value, not chosen for this shipment')
  })

  it('asks again for the next document: a confirmation is not carried from one shipment to another', async () => {
    await mount()
    await upload('first.xlsx', simpleInHouseCi())
    const confirm = [...unconfirmedNote()!.querySelectorAll('button')].find((b) => /right for this shipment/.test(b.textContent ?? ''))!
    await act(async () => confirm.click())
    expect(unconfirmedNote()).toBeUndefined()

    // The way a person moves on to the next document.
    const startOver = [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Start over')!
    await act(async () => startOver.click())
    await settle()
    await upload('second.xlsx', { ...simpleInHouseCi(), invoiceNumber: 'CI-2026-0002' })
    expect(text()).toContain('CI-2026-0002')
    expect(unconfirmedNote()?.textContent).toContain('the starting value, not chosen for this shipment')
  })

  it('marks what was carried from a saved consignee, with its date, and reports a destination the document contradicts', async () => {
    const spec = simpleInHouseCi()
    consignees.set(spec.consigneeName, {
      name: spec.consigneeName,
      consigneeId: 'SG000000000X',
      consigneeType: 'DIRECT_CONSUMER',
      partiesRelated: false,
      destinationCountry: 'Malaysia',
      lastUsed: '2026-09-03T10:00:00.000Z',
    })
    await mount()
    await upload('first.xlsx', spec)

    const note = unconfirmedNote()?.textContent ?? ''
    const carried = "carried from this consignee's shipment of 2026-09-03"
    expect(note).toContain(`Consignee ID "SG000000000X": ${carried}`)
    expect(note).toContain(`Consignee type "Direct consumer": ${carried}`)
    expect(note).toContain(`Country of destination "Malaysia": ${carried}`)
    // The document's own consignee block says Singapore.
    expect(text()).toContain('Carried destination agrees with the document')
    expect(text()).toContain('this document gives "Singapore"')
  })

  it('offers the booking facts as text, and names the carrier the shipment is keyed into', async () => {
    await mount()
    await upload('first.xlsx', simpleInHouseCi())
    const summary = () =>
      [...container!.querySelectorAll('textarea')].find((t) => t.readOnly && t.value.startsWith('Invoice: '))?.value ?? ''
    expect(summary()).toContain('Invoice: CI-2026-0001')
    expect(summary()).toContain('Destination: Singapore')
    expect(summary()).toContain('Pieces: 2')
    expect(summary()).toContain('Gross weight: 4.100 kg (9.0 lb)')
    expect(summary()).toContain('Carrier: Nippon Express')

    const carrier = container!.querySelector<HTMLSelectElement>('select[aria-label="Carrier"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(carrier, 'fedex')
      carrier.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()
    expect(summary()).toContain('Carrier: FedEx')
    expect(summary()).not.toContain('Nippon')
  })
})
