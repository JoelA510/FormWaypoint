/**
 * The unit each commodity row is filed in.
 *
 * Several Schedule B numbers are reported in kilograms while every invoice in this trade
 * counts pieces, and a piece count filed against one of them is a reporting error that
 * nothing else on the form gives any sign of. These build a real document and reconcile it
 * against the shipped Census dataset, because the whole question is what that dataset says
 * about a code the parser read.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCipl } from '../cipl'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { reconcile } from '.'
import type { ParsedCipl, SLILine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/** Reported in NO. */
const BY_COUNT = '8544.42.0000'
/** Reported in KG — the case this exists for. */
const BY_WEIGHT = '9031.90.0000'

let scheduleB: ScheduleBIndex

beforeAll(() => {
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
})

/** One shipment line, classified however the test needs, with a stated weight. */
async function shipment(classification: string, over: Record<string, unknown> = {}): Promise<ParsedCipl> {
  const spec = simpleShipment()
  const bytes = await buildSyntheticCipl({
    ...spec,
    lines: [{ ...spec.lines[0], classification, quantity: 12, netWeightKg: 4.263, grossWeightKg: 4.5, ...over }],
  })
  return parseCipl('synthetic.pdf', bytes)
}

const row = (lines: SLILine[], code: string) => lines.find((l) => l.scheduleB === code)!

describe('the unit a commodity row is filed in', () => {
  it('files the invoice count for a code reported by the piece', async () => {
    const { sliLines } = reconcile(await shipment(BY_COUNT), scheduleB, CONTROLLED)
    const line = row(sliLines, BY_COUNT)
    expect(line.reportingUom).toBe('NO')
    expect(line.reportingQuantity).toBe(12)
    expect(line.reportingBasis).toBe('source')
    // The document's own figures are never overwritten — they are what the reconciliation
    // proves the totals against.
    expect(line.quantity).toBe(12)
    expect(line.sourceUom).toBe('PCS')
  })

  it('files the net weight for a code reported by weight', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    expect(line.reportingUom).toBe('KG')
    expect(line.reportingQuantity).toBe(4.263)
    expect(line.reportingBasis).toBe('net-weight')
    // Still 12 pieces on the invoice, and the row still says so.
    expect(line.quantity).toBe(12)
  })

  it('passes the unit check once the row files the required unit', async () => {
    // The warning this replaces fired on every one of these shipments and there was nothing
    // anyone could do about it from inside the app.
    const { checks } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(true)
    expect(uom.detail).toMatch(/net weight/)
  })

  it('warns, and keeps the printed figure, when the required unit cannot be stated', async () => {
    // No weight anywhere on the document, so there is no kilogram figure to file. The row
    // keeps what was printed rather than acquiring an invented one.
    const parsed = await shipment(BY_WEIGHT, { netWeightKg: undefined, grossWeightKg: undefined })
    const { sliLines, checks } = reconcile(parsed, scheduleB, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    expect(line.reportingUom).toBe('NO')
    expect(line.reportingQuantity).toBe(12)

    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(false)
    expect(uom.severity).toBe('warning')
    expect(uom.expected).toBe('KG')
    expect(uom.actual).toBe('NO')
  })

  it('publishes every unit the code accepts, so the choice can be offered', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    expect(row(sliLines, BY_WEIGHT).scheduleBUnits).toEqual(['KG'])
    expect(row(sliLines, BY_WEIGHT).scheduleBUnit).toBe('KG')
  })

  it('lets a chosen unit override the default, keyed by commodity number', async () => {
    const parsed = await shipment(BY_COUNT)
    const { sliLines } = reconcile(parsed, scheduleB, {
      ...CONTROLLED,
      reportingUnits: { '8544420000': 'KG' },
    })
    const line = row(sliLines, BY_COUNT)
    expect(line.reportingUom).toBe('KG')
    expect(line.reportingQuantity).toBe(4.263)
    expect(line.reportingBasis).toBe('net-weight')
  })

  it('ignores a chosen unit the shipment cannot state', async () => {
    // Choosing kilograms for goods with no weight is an empty box, not a choice.
    const parsed = await shipment(BY_COUNT, { netWeightKg: undefined, grossWeightKg: undefined })
    const { sliLines } = reconcile(parsed, scheduleB, {
      ...CONTROLLED,
      reportingUnits: { '8544420000': 'KG' },
    })
    expect(row(sliLines, BY_COUNT).reportingUom).toBe('NO')
    expect(row(sliLines, BY_COUNT).reportingQuantity).toBe(12)
  })

  it('falls back to the document when the dataset is not loaded at all', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), null, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    expect(line.scheduleBUnits).toEqual([])
    expect(line.reportingUom).toBe('NO')
    expect(line.reportingQuantity).toBe(12)
  })
})
