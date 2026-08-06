/**
 * Parser coverage that runs anywhere, on documents drawn rather than borrowed.
 *
 * The suites keyed to real shipments are the final word on this format, but they only run
 * where those documents happen to be. These run in CI, and they cover the shapes that
 * actually broke: a block split by a page break, weights printed divided, a heading
 * stranded at the foot of a page, and the consignee address sitting where a heading goes.
 */
import { describe, expect, it } from 'vitest'
import { parseCipl } from '.'
import { reconcile } from '../reconcile'
import { buildSyntheticCipl, simpleShipment, type SyntheticLine } from '../../test/synthetic/cipl'
import type { ParsedCipl } from '../types'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const parse = async (spec = simpleShipment()): Promise<ParsedCipl> =>
  parseCipl('synthetic.pdf', await buildSyntheticCipl(spec))

const fc = (parsed: ParsedCipl, kind: 'INVOICE' | 'PACKING_LIST') =>
  parsed.lines.filter((l) => l.documentSet === 'FC' && l.documentKind === kind)

const byOrder = (parsed: ParsedCipl, kind: 'INVOICE' | 'PACKING_LIST', order: string) =>
  fc(parsed, kind).find((l) => l.orderNumber === order)!

describe('an ordinary shipment', () => {
  it('reads the header', async () => {
    const parsed = await parse()
    const header = parsed.headers.FC
    expect(header.invoiceNumber).toBe('S0000001')
    expect(header.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(header.vesselAgent).toBe('Nippon Express')
    expect(header.totalQuantity).toBe(7)
    expect(header.totalValue).toBeCloseTo(190, 2)
    expect(header.totalNetWeightKg).toBeCloseTo(3.4, 3)
    expect(header.cartons).toBe(2)
  })

  it('reads every line from both document kinds', async () => {
    const parsed = await parse()
    expect(fc(parsed, 'INVOICE')).toHaveLength(3)
    expect(fc(parsed, 'PACKING_LIST')).toHaveLength(3)
  })

  it('reads a line field by field', async () => {
    const line = byOrder(await parse(), 'INVOICE', '00000001OP0010')
    expect(line).toMatchObject({
      partNumber: '10000-0001',
      classification: '8544.42.0000',
      countryOfOrigin: 'Japan',
      quantity: 4,
      commodityGroup: 'Electrical Conductors',
    })
    expect(line.extendedValue).toBeCloseTo(40, 2)
  })

  it('joins invoice lines to their packing weights and reconciles', async () => {
    const result = reconcile(await parse(), null, CONTROLLED)
    for (const id of ['total-quantity', 'total-value', 'total-weight', 'weights-present', 'line-coverage']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
  })

  it('excludes the TP1 set when one is present', async () => {
    const parsed = await parse(simpleShipment({ includeTp1: true }))
    expect(parsed.availableSets).toEqual(['FC', 'TP1'])
    const result = reconcile(parsed, null, CONTROLLED)
    expect(result.selectedSet).toBe('FC')
    // Both sets describe the same goods; counting both would double the shipment.
    expect(result.checks.find((c) => c.id === 'single-document-set')).toMatchObject({ passed: true })
    expect(result.checks.find((c) => c.id === 'total-quantity')).toMatchObject({ passed: true })
  })
})

describe('a line block split by a page break', () => {
  // Two lines per page puts the third block at the foot, so it finishes on the next page.
  const split = () => simpleShipment({ linesPerPage: 2 })

  it('reads the split line whole', async () => {
    const parsed = await parse(split())
    expect(fc(parsed, 'PACKING_LIST')).toHaveLength(3)
    const line = byOrder(parsed, 'PACKING_LIST', '00000003OP0010')
    expect(line.quantity).toBe(1)
    expect(line.countryOfOrigin).toBe('United States')
    expect(line.netWeightKg).toBeCloseTo(1.7, 3)
  })

  it('still reconciles, because nothing was dropped', async () => {
    const result = reconcile(await parse(split()), null, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'total-weight')).toMatchObject({ passed: true })
    expect(result.checks.find((c) => c.id === 'weights-present')).toMatchObject({ passed: true })
  })

  it('reports no incomplete line', async () => {
    const parsed = await parse(split())
    expect(parsed.warnings.filter((w) => /incomplete/i.test(w))).toEqual([])
  })
})

describe('weights printed divided', () => {
  const divided = () => {
    const spec = simpleShipment()
    spec.lines[0].weightDivisor = 6
    return spec
  }

  it('multiplies the figures back up to the whole line', async () => {
    const line = byOrder(await parse(divided()), 'PACKING_LIST', '00000001OP0010')
    expect(line.weightDivisor).toBe(6)
    // 1.2 / 6 prints as .200, which multiplies back exactly here.
    expect(line.netWeightKg).toBeCloseTo(1.2, 2)
  })

  it('reconciles against the document total', async () => {
    const result = reconcile(await parse(divided()), null, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'total-weight')).toMatchObject({ passed: true })
  })

  it('leaves an undivided line alone', async () => {
    const line = byOrder(await parse(divided()), 'PACKING_LIST', '00000002OP0010')
    expect(line.weightDivisor).toBeUndefined()
  })

  it('still fails when a line is genuinely missing', async () => {
    const parsed = await parse(divided())
    const short: ParsedCipl = { ...parsed, lines: parsed.lines.filter((l) => l.orderNumber !== '00000002OP0010') }
    expect(reconcile(short, null, CONTROLLED).checks.find((c) => c.id === 'total-weight')).toMatchObject({
      passed: false,
    })
  })
})

describe('commodity headings', () => {
  it('never reads the consignee city as a heading', async () => {
    // The address block sits directly above the first block on every detail page, and its
    // last line is a single word in the same shape as a heading.
    const parsed = await parse()
    const groups = new Set(fc(parsed, 'INVOICE').map((l) => l.commodityGroup))
    expect(groups).not.toContain('Singapore')
    expect(groups).toEqual(new Set(['Electrical Conductors', 'Optical instruments']))
  })

  it('carries a heading stranded at the foot of a page onto the next', async () => {
    // Two lines per page leaves the third line's heading on the previous page.
    const parsed = await parse(simpleShipment({ linesPerPage: 2 }))
    expect(byOrder(parsed, 'INVOICE', '00000003OP0010').commodityGroup).toBe('Optical instruments')
    expect([...fc(parsed, 'INVOICE')].every((l) => l.commodityGroup)).toBe(true)
  })
})

describe('the header’s P/O field against the line items', () => {
  it('says so when the header names an order no line item accounts for', async () => {
    // Truncation only ever loses order numbers *from* the header, so this direction is not
    // truncation — it is the shape of lines that failed to parse. The line items still win,
    // because an order with no line behind it cannot be filed against anything, but the
    // shortfall is the one thing nobody should have to spot by reading the PDF alongside.
    const base = simpleShipment()
    const orders = [...new Set(base.lines.map((l) => l.order))]
    const parsed = await parse(simpleShipment({ headerOrders: [...orders, '00000099OP0010'] }))

    expect(parsed.headers.FC.orderNumbers).toEqual(orders)
    expect(parsed.warnings.some((w) => w.includes('00000099OP0010'))).toBe(true)
  })

  it('stays quiet when the header and the line items agree', async () => {
    const parsed = await parse()
    expect(parsed.warnings.some((w) => /no line item references/.test(w))).toBe(false)
  })
})

describe('many lines over many pages', () => {
  const many = () => {
    const base = simpleShipment()
    const lines: SyntheticLine[] = Array.from({ length: 11 }, (_, i) => ({
      ...base.lines[0],
      order: `0000${String(i + 10).padStart(4, '0')}OP0010`,
      itemId: `1AA0000${String(i + 10)}`,
      partNumber: `10000-00${String(i + 10)}`,
      quantity: i + 1,
      unitPrice: 10 + i,
      netWeightKg: round3(0.25 * (i + 1)),
      grossWeightKg: round3(0.275 * (i + 1)),
      commodityGroup: i % 3 === 0 ? 'Electrical Conductors' : 'Optical instruments',
    }))
    return simpleShipment({ lines, linesPerPage: 4 })
  }

  it('reads every line across the page breaks and reconciles', async () => {
    const parsed = await parse(many())
    expect(fc(parsed, 'INVOICE')).toHaveLength(11)
    expect(fc(parsed, 'PACKING_LIST')).toHaveLength(11)

    const result = reconcile(parsed, null, CONTROLLED)
    for (const id of ['total-quantity', 'total-value', 'total-weight', 'weights-present', 'line-coverage']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
  })

  it('groups lines sharing a classification and origin into one row', async () => {
    const result = reconcile(await parse(many()), null, CONTROLLED)
    // Every line here is 8544.42.0000 from Japan, so they collapse to a single row.
    expect(result.sliLines).toHaveLength(1)
    expect(result.sliLines[0].quantity).toBe(66)
  })
})

const round3 = (n: number) => Math.round(n * 1000) / 1000
