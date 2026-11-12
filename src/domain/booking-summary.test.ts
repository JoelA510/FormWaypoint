/**
 * The booking summary, built through the real pipeline for each layout: parse, reconcile,
 * draft, summary. What differs between layouts is what they state, so that is what is checked.
 */
import { describe, expect, it } from 'vitest'
import { buildBookingSummary } from './booking-summary'
import { parseCipl, parseCiplFile } from './cipl'
import { buildDraft, defaultShipmentSettings, EMPTY_PROFILE, type ShipmentSettings } from './draft'
import { reconcile } from './reconcile'
import { getAdapter } from '../carriers/registry'
import { buildXlsx } from '../lib/xlsx'
import { buildSyntheticCipl, simpleShipment } from '../test/synthetic/cipl'
import { inHouseCiGrid, simpleInHouseCi } from '../test/synthetic/inhouse-ci'
import { buildVendorBPdf, wholeShipment } from '../test/synthetic/vendor-b'
import type { ParsedCipl } from './types'

const adapter = getAdapter('nippon-express')
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const summarise = (parsed: ParsedCipl, settings: Partial<ShipmentSettings> = {}) => {
  const reconciliation = reconcile(parsed, null, CONTROLLED)
  const draft = buildDraft(reconciliation, EMPTY_PROFILE, { ...defaultShipmentSettings(adapter), ...settings }, adapter)
  const text = buildBookingSummary(reconciliation.header, draft)
  const line = (label: string) => text.split('\n').find((l) => l.startsWith(`${label}:`))
  return { text, line, header: reconciliation.header }
}

describe('a layout that prints the package count and gross weight', () => {
  it('states both, with the weight in kilograms and pounds', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const { line, header } = summarise(parsed)
    expect(header.cartons).toBeGreaterThan(0)
    expect(header.totalGrossWeightKg).toBeGreaterThan(0)
    expect(line('Invoice')).toBe(`Invoice: ${header.invoiceNumber}`)
    expect(line('Pieces')).toBe(`Pieces: ${header.cartons}`)
    const kg = header.totalGrossWeightKg as number
    expect(line('Gross weight')).toBe(`Gross weight: ${kg.toFixed(3)} kg (${(kg * 2.2046226218).toFixed(1)} lb)`)
    for (const order of header.orderNumbers) expect(line('Order numbers')).toContain(order)
  })

  it('does not pass the invoice date off as a ship date the document never states', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const reconciliation = reconcile(parsed, null, CONTROLLED)
    const draft = buildDraft(reconciliation, EMPTY_PROFILE, defaultShipmentSettings(adapter), adapter)
    // This layout prints no ship date, and the form's date of exportation falls back to the
    // invoice date. That fallback must not reach a pickup request under the name "Ship date".
    expect(reconciliation.header.shipDate).toBeNull()
    expect(draft.dateOfExportation).toBe(reconciliation.header.invoiceDate)
    const { line } = summarise(parsed)
    expect(line('Ship date')).toBe('Ship date: not stated on the document')
    expect(line('Invoice date')).toBe(`Invoice date: ${reconciliation.header.invoiceDate}`)
  })
})

describe('a layout that prints no weights and no package count', () => {
  it('says so for each, and never works a figure out from something else', async () => {
    const parsed = await parseCipl('synthetic-b.pdf', await buildVendorBPdf(wholeShipment()))
    const { text, line, header } = summarise(parsed)
    expect(header.cartons).toBeNull()
    expect(header.totalGrossWeightKg).toBeNull()
    expect(line('Pieces')).toBe('Pieces: not stated on the document')
    expect(line('Gross weight')).toBe('Gross weight: not stated on the document')
    // The net weight and the quantity exist, and are not offered in their place.
    expect(text).not.toMatch(/Gross weight: \d/)
    expect(text).not.toMatch(/Pieces: \d/)
  })
})

describe('the in-house form', () => {
  const workbook = () => parseCiplFile('ci.xlsx', buildXlsx([{ name: 'INV', rows: inHouseCiGrid(simpleInHouseCi()) }]))

  it('reads the piece count, gross weight, purchase order and destination off the form', async () => {
    const { line } = summarise(await workbook())
    expect(line('Invoice')).toBe('Invoice: CI-2026-0001')
    expect(line('Order numbers')).toBe('Order numbers: 4501234567')
    expect(line('Consignee')).toBe('Consignee: Example Consignee Pte. Ltd.')
    expect(line('Destination')).toBe('Destination: Singapore')
    expect(line('Pieces')).toBe('Pieces: 2')
    expect(line('Gross weight')).toBe('Gross weight: 4.100 kg (9.0 lb)')
  })

  it('gives the ship date where the form has a box for exactly that', async () => {
    const spec = { ...simpleInHouseCi(), shipDate: '08/12/2026' }
    const parsed = await parseCiplFile('ci.xlsx', buildXlsx([{ name: 'INV', rows: inHouseCiGrid(spec) }]))
    const { line } = summarise(parsed)
    expect(line('Ship date')).toBe('Ship date: 08/12/2026')
    expect(line('Invoice date')).toBe('Invoice date: 08/10/2026')
  })

  it('carries what was typed for the forwarder, dimensions included, a line at a time', async () => {
    const { text } = summarise(await workbook(), { piecesAndDimensions: '1 Pallet\r\n52 x 48 x 50 in\n\n' })
    expect(text).toContain('Pieces and dimensions, as entered:\n  1 Pallet\n  52 x 48 x 50 in')
    expect(text.endsWith('52 x 48 x 50 in')).toBe(true)
  })

  it('says what has not been entered, and leaves no blank value behind a label', async () => {
    const { text, line } = summarise(await workbook(), { piecesAndDimensions: '   ', shipmentReference: '' })
    expect(line('Shipment reference')).toBe('Shipment reference: not entered')
    expect(line('Pieces and dimensions')).toBe('Pieces and dimensions: not entered')
    for (const l of text.split('\n')) expect(l).not.toMatch(/:\s*$/)
  })

  it('names the carrier the shipment is keyed into, not the adapter its draft was built on', async () => {
    const parsed = await workbook()
    const reconciliation = reconcile(parsed, null, CONTROLLED)
    const draft = buildDraft(reconciliation, EMPTY_PROFILE, defaultShipmentSettings(adapter), adapter)
    expect(buildBookingSummary(reconciliation.header, draft)).toContain(`Carrier: ${draft.forwardingAgent}`)
    const keyed = buildBookingSummary(reconciliation.header, draft, 'FedEx')
    expect(keyed).toContain('Carrier: FedEx')
    expect(keyed).not.toContain(draft.forwardingAgent)
  })

  it('uses the reference and the named place the person entered', async () => {
    const { line } = summarise(await workbook(), { shipmentReference: 'SO-0000042', incoterm: 'FOB', namedPlace: 'SFO' })
    expect(line('Shipment reference')).toBe('Shipment reference: SO-0000042')
    expect(line('Incoterm')).toBe('Incoterm: FOB SFO')
  })
})

describe('figures that are present but unusable', () => {
  it('treats a zero or unreadable gross weight or piece count as not stated', async () => {
    const parsed = await parseCiplFile('ci.xlsx', buildXlsx([{ name: 'INV', rows: inHouseCiGrid(simpleInHouseCi()) }]))
    const reconciliation = reconcile(parsed, null, CONTROLLED)
    const draft = buildDraft(reconciliation, EMPTY_PROFILE, defaultShipmentSettings(adapter), adapter)
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const text = buildBookingSummary({ ...reconciliation.header, cartons: bad, totalGrossWeightKg: bad }, draft)
      expect(text).toContain('Pieces: not stated on the document')
      expect(text).toContain('Gross weight: not stated on the document')
    }
  })
})
