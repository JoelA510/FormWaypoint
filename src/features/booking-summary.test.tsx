// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SliDraft } from '../carriers/types'
import { buildBookingSummary } from '../domain/booking-summary'
import type { ShipmentHeader } from '../domain/types'
import { BookingSummaryPanel } from './booking-summary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const header = {
  invoiceNumber: 'CI-2026-0001',
  invoiceDate: '08/10/2026',
  shipDate: null,
  orderNumbers: ['4501234567'],
  purchaseOrders: [],
  vesselAgent: 'Nippon Express',
  cartons: 2,
  totalGrossWeightKg: 4.1,
} as unknown as ShipmentHeader

const draft = (over: Partial<SliDraft> = {}) =>
  ({
    shipmentReference: 'SO-0000042',
    ultimateConsignee: { name: 'Example Consignee Pte. Ltd.', addressLines: [] },
    destinationCountry: 'Singapore',
    forwardingAgent: 'Nippon Express USA, Inc.',
    mode: 'AIR',
    incoterm: 'DAP',
    namedPlace: 'Singapore',
    dateOfExportation: '08/10/2026',
    piecesAndDimensions: '1 Pallet\r52 x 48 x 50 in',
    ...over,
  }) as SliDraft

let container: HTMLDivElement | null = null
let root: Root | null = null
afterEach(async () => {
  const r = root
  if (r) await act(async () => r.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

const render = async (d: SliDraft) => {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  const r = root as Root
  await act(async () => r.render(<BookingSummaryPanel header={header} draft={d} />))
}
const box = () => container!.querySelector('textarea') as HTMLTextAreaElement
const copyButton = () => [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Copy the summary') as HTMLButtonElement
const status = () => container!.querySelector('[role="status"]')?.textContent ?? ''
const stubClipboard = (writeText: ((text: string) => Promise<void>) | undefined) =>
  vi.stubGlobal('navigator', { ...navigator, clipboard: writeText ? { writeText } : undefined })

describe('the booking summary on the screen', () => {
  it('shows the summary in a labelled, read-only box that can be selected', async () => {
    await render(draft())
    expect(box().value).toBe(buildBookingSummary(header, draft()))
    expect(box().readOnly).toBe(true)
    expect(container!.querySelector(`label[for="${box().id}"]`)?.textContent).toBe('Booking summary text')
  })

  it('copies exactly the text shown, to the clipboard and nowhere else', async () => {
    const writeText = vi.fn(async () => {})
    const fetchSpy = vi.fn()
    stubClipboard(writeText)
    vi.stubGlobal('fetch', fetchSpy)
    await render(draft())
    await act(async () => copyButton().click())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(box().value)
    expect(status()).toBe('Copied.')
    // Project rule 3: nothing leaves the machine.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says how to copy by hand when the clipboard is missing or refuses', async () => {
    stubClipboard(undefined)
    await render(draft())
    await act(async () => copyButton().click())
    expect(status()).toBe('The clipboard was not available. Select the text above and copy it.')

    stubClipboard(async () => {
      throw new Error('denied')
    })
    await act(async () => copyButton().click())
    expect(status()).toContain('Select the text above and copy it.')
  })

  it('stops saying "Copied" once the summary is no longer the one that was copied', async () => {
    stubClipboard(async () => {})
    await render(draft())
    await act(async () => copyButton().click())
    expect(status()).toBe('Copied.')
    await render(draft({ shipmentReference: 'SO-0000043' }))
    expect(box().value).toContain('SO-0000043')
    expect(status()).toBe('')
  })
})
