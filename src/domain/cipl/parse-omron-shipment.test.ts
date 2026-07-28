import { describe, expect, it, beforeAll } from 'vitest'
import { parseCipl, detectCiplFormat, extractTextPages } from '.'
import { hasFixtures, readFixture } from '../../test/fixtures'
import type { ParsedCipl, SourceLine } from '../types'

/**
 * The "OMRON SHIPMENT#" layout. Expected values are read off the source PDFs; the SLI
 * mapping they feed is asserted in reconcile-shipment.test.ts.
 */

const parsed: Record<string, ParsedCipl> = {}

beforeAll(async () => {
  parsed['278515'] = await parseCipl('278515_CIPL.pdf', readFixture('278515'))
  parsed['278514'] = await parseCipl('278514_CIPL.pdf', readFixture('278514'))
}, 60_000)

const invoiceLines = (p: ParsedCipl): SourceLine[] => p.lines.filter((l) => l.documentKind === 'INVOICE')

// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('format detection', () => {
  it('routes each layout to its own parser', async () => {
    expect(parsed['278515'].format).toBe('omron-shipment')
    expect(parsed['278514'].format).toBe('omron-shipment')

    const fcTp1 = await parseCipl('G78495IQ', readFixture('G78495IQ'))
    expect(fcTp1.format).toBe('omron-fc-tp1')
  })

  it('rejects a document that matches no known layout', async () => {
    // The blank Nippon SLI is a valid PDF but is not a CIPL.
    const { readFileSync } = await import('node:fs')
    const blank = new Uint8Array(readFileSync('public/templates/nippon-express-sli.pdf'))
    await expect(parseCipl('nippon-express-sli.pdf', blank)).rejects.toThrow(/does not match any CIPL layout/)
  })

  it('declares that this format states no weights', () => {
    expect(parsed['278515'].providesWeights).toBe(false)
    expect(parsed['278515'].warnings.join(' ')).toMatch(/prints no weights/)
  })
})

describe.skipIf(!hasFixtures())('278515 — six lines, mixed origins, one ECCN', () => {
  it('reads the header', () => {
    const h = parsed['278515'].headers.FC
    expect(h.invoiceNumber).toBe('278515')
    expect(h.invoiceDate).toBe('07/22/26')
    expect(h.documentCurrency).toBe('USD')
    expect(h.vesselAgent).toBe('NIPPON AIR FREIGHT')
    expect(h.freightTerms).toBe('COLLECT')
    expect(h.totalValue).toBeCloseTo(11532.24, 2)
    expect(h.totalQuantity).toBe(9)
    // No weights, no discharge port, no Incoterm anywhere in this layout.
    expect(h.totalNetWeightKg).toBeNull()
    expect(h.dischargePort).toBeNull()
    expect(h.incoterm).toBeNull()
  })

  it('separates Sold To from Ship To', () => {
    const h = parsed['278515'].headers.FC
    expect(h.soldTo.name).toBe('Omron Corporation')
    expect(h.soldTo.lines).toContain('KYOTO 600-8530')
    expect(h.consignedTo.name).toBe('Omron Corporation')
    expect(h.consignedTo.lines).toContain('1 Minamishosakai Sho')
    expect(h.consignedTo.lines).toContain('Kyoto 615-0803')
    // Header labels from the right-hand column must not leak into the address.
    expect(h.consignedTo.lines.join(' ')).not.toMatch(/Ship Date|Mode of Transport/)
  })

  it('reads all six invoice lines', () => {
    const lines = invoiceLines(parsed['278515'])
    expect(lines).toHaveLength(6)
    expect(lines.reduce((s, l) => s + l.quantity, 0)).toBe(9)
    expect(lines.reduce((s, l) => s + (l.extendedValue ?? 0), 0)).toBeCloseTo(11532.24, 2)

    const [first] = lines
    expect(first.orderNumber).toBe('13383820')
    expect(first.partNumber).toBe('29600-000F')
    expect(first.description).toBe('SYSTEM,6AXIS,ECS-ECAT,TOPLEVEL')
    expect(first.classification).toBe('8537.10.9090')
    expect(first.countryOfOrigin).toBe('Netherlands')
    expect(first.quantity).toBe(1)
    expect(first.uom).toBe('EA')
    expect(first.unitValue).toBeCloseTo(3468.49, 2)
    expect(first.extendedValue).toBeCloseTo(3468.49, 2)
  })

  it('reads the per-line ECCN this format carries', () => {
    const lines = invoiceLines(parsed['278515'])
    const pendant = lines.find((l) => l.partNumber === '10046-010')!
    expect(pendant.classification).toBe('8479.90.9640')
    // The CIPL states an ECCN for this line; the SLI filed for it says EAR99.
    expect(pendant.eccn).toBe('5A992.C')
    expect(pendant.countryOfOrigin).toBe('Austria')

    // Every other line has none, and must not inherit one.
    expect(lines.filter((l) => l.eccn).length).toBe(1)
  })

  it('collects every sales order for the shipment-reference box', () => {
    expect(parsed['278515'].headers.FC.orderNumbers).toEqual([
      '13383820',
      '13385729',
      '13385732',
      '13385751',
      '13386005',
      '13386025',
    ])
  })

  it('reads the master packing list as well as the invoice', () => {
    const packing = parsed['278515'].lines.filter((l) => l.documentKind === 'PACKING_LIST')
    expect(packing).toHaveLength(6)
    // The packing list has no weight columns at all.
    expect(packing.every((l) => l.netWeightKg === undefined)).toBe(true)
  })

  it('discards the barcode font glyphs that share the data columns', () => {
    for (const line of parsed['278515'].lines) {
      const text = [line.partNumber, line.description, line.countryOfOrigin, line.classification].join(' ')
      expect(text, line.id).not.toMatch(/[^\x20-\x7E]/)
    }
  })
})

describe.skipIf(!hasFixtures())('278514 — single line, dual currency', () => {
  it('takes the USD price, not the foreign one printed beneath it', () => {
    const lines = invoiceLines(parsed['278514'])
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line.orderNumber).toBe('13393035')
    expect(line.partNumber).toBe('13960-102D')
    expect(line.classification).toBe('8504.40.4000')
    expect(line.countryOfOrigin).toBe('United States')
    expect(line.quantity).toBe(2)
    // USD 625.68 / 1,251.37 — not BRL 3,202.00 / 6,404.00.
    expect(line.unitValue).toBeCloseTo(625.68, 2)
    expect(line.extendedValue).toBeCloseTo(1251.37, 2)
  })

  it('reads the USD total, not the foreign net value', () => {
    const h = parsed['278514'].headers.FC
    expect(h.documentCurrency).toBe('USD')
    expect(h.totalValue).toBeCloseTo(1251.37, 2)
    expect(h.vesselAgent).toBe('CEVA Logistics')
  })

  it('keeps the country stated in the address block', () => {
    // Unlike 278515, this consignee block does name its country.
    expect(parsed['278514'].headers.FC.consignedTo.lines).toContain('Brazil')
  })
})

describe.skipIf(!hasFixtures())('detectCiplFormat', () => {
  it('is exported for callers that already have extracted pages', async () => {
    const pages = await extractTextPages(readFixture('278514'))
    expect(detectCiplFormat(pages)?.id).toBe('omron-shipment')
  })
})
