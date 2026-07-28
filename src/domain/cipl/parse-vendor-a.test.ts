import { describe, expect, it, beforeAll } from 'vitest'
import { parseCipl } from './parse-vendor-a'
import { hasFixtures, readFixture } from '../../test/fixtures'
import type { ParsedCipl, SourceLine } from '../types'

/**
 * Every expectation here was read off the source PDFs by hand. They are the contract: if a
 * change to the parser breaks one, the parser is wrong, not the fixture.
 */

const parsed: Record<string, ParsedCipl> = {}

beforeAll(async () => {
  // Every suite in this file is gated on the shipment documents, but this hook is not
  // gated by them skipping. Without the guard, adding one test that needs no fixture
  // would fail the whole file wherever the documents are absent.
  if (!hasFixtures()) return
  parsed.vendorA1 = await parseCipl('vendorA1_CIPL.pdf', readFixture('vendorA1'))
  parsed.vendorA2 = await parseCipl('vendorA2_CIPL.pdf', readFixture('vendorA2'))
  parsed.vendorA3 = await parseCipl('vendorA3_CIPL.pdf', readFixture('vendorA3'))
}, 60_000)

const fcInvoice = (p: ParsedCipl): SourceLine[] =>
  p.lines.filter((l) => l.documentSet === 'FC' && l.documentKind === 'INVOICE')
const fcPacking = (p: ParsedCipl): SourceLine[] =>
  p.lines.filter((l) => l.documentSet === 'FC' && l.documentKind === 'PACKING_LIST')

// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('document set detection', () => {
  it('finds both FC and TP1 in every fixture', () => {
    for (const name of Object.keys(parsed)) {
      expect(parsed[name].availableSets, name).toEqual(['FC', 'TP1'])
    }
  })

  it('keeps FC and TP1 lines separate rather than merging them', () => {
    const p = parsed.vendorA1
    expect(fcInvoice(p)).toHaveLength(3)
    expect(p.lines.filter((l) => l.documentSet === 'TP1' && l.documentKind === 'INVOICE')).toHaveLength(3)
  })
})

describe.skipIf(!hasFixtures())('vendorA1 — Nippon Express, 3 pieces, two duplicate cable lines', () => {
  it('reads the invoice header', () => {
    const h = parsed.vendorA1.headers.FC
    expect(h.invoiceNumber).toBe('vendorA1')
    expect(h.invoiceDate).toBe('July 20, 2026')
    // The later ship date must stay distinct from the invoice date — the SLI uses the
    // invoice date for box 2, and conflating them would put the wrong date on the form.
    expect(h.onOrAboutDate).toBe('July 25, 2026')
    expect(h.vesselAgent).toBe('Nippon Express')
    expect(h.dischargePort).toBe('Bangalore, India')
    expect(h.tradeTerms).toBe('FOB Origin - Collect')
    expect(h.incoterm).toBe('FOB')
    expect(h.freightTerms).toBe('COLLECT')
    expect(h.cartons).toBe(1)
    expect(h.documentCurrency).toBe('USD')
    expect(h.totalQuantity).toBe(3)
    expect(h.totalValue).toBeCloseTo(1113.14, 3)
    expect(h.totalNetWeightKg).toBeCloseTo(2.468, 3)
    expect(h.totalGrossWeightKg).toBeCloseTo(2.715, 3)
  })

  it('distinguishes SOLD TO from CONSIGNED TO', () => {
    const h = parsed.vendorA1.headers.FC
    expect(h.consignedTo.name).toBe('vendor Automation Pvt. Ltd. - Edi')
    expect(h.consignedTo.lines).toContain('Bangalore, KARNATAKA 562123')
    expect(h.notifyTo).toBe('SAME AS BUYER')
  })

  it('collects every order number', () => {
    expect(parsed.vendorA1.headers.FC.orderNumbers).toEqual([
      '00299378OP0080',
      '00300015OP0080',
      '00296253OP0080',
    ])
  })

  it('reads all three invoice lines with values', () => {
    const lines = fcInvoice(parsed.vendorA1)
    expect(lines).toHaveLength(3)

    const [cable1, cable2, motor] = lines

    expect(cable1.orderNumber).toBe('00299378OP0080')
    expect(cable1.sequence).toBe('4')
    expect(cable1.lineNumber).toBe('0001')
    expect(cable1.itemId).toBe('5S1835710')
    expect(cable1.countryOfOrigin).toBe('China')
    expect(cable1.classification).toBe('8544.42.0000')
    expect(cable1.partNumber).toBe('04465-000')
    expect(cable1.model).toBe('R6A 7833D')
    expect(cable1.description).toBe('CA, HDDB26 MALE/SOLDER TIN, 5M')
    expect(cable1.commodityGroup).toBe('Electrical Conductors')
    expect(cable1.quantity).toBe(1)
    expect(cable1.uom).toBe('PCS')
    expect(cable1.currency).toBe('USD')
    expect(cable1.unitValue).toBeCloseTo(72.179, 3)
    expect(cable1.extendedValue).toBeCloseTo(72.18, 3)

    // Same part number, different order — must stay two distinct lines.
    expect(cable2.orderNumber).toBe('00300015OP0080')
    expect(cable2.itemId).toBe('5S1842326')
    expect(cable2.partNumber).toBe('04465-000')
    expect(cable2.extendedValue).toBeCloseTo(72.95, 3)

    expect(motor.orderNumber).toBe('00296253OP0080')
    expect(motor.countryOfOrigin).toBe('Japan')
    expect(motor.classification).toBe('8501.51.3040')
    expect(motor.partNumber).toBe('19102-000F')
    expect(motor.description).toBe('ASSY, J3 MOTOR, I4H')
    expect(motor.commodityGroup).toBe('Power Supply')
    expect(motor.extendedValue).toBeCloseTo(968.01, 3)
  })

  it('reads per-line packing weights from inside the parentheses, not the running totals', () => {
    const lines = fcPacking(parsed.vendorA1)
    expect(lines).toHaveLength(3)
    // The first packing line shares its row with the section running total (2.468 / 2.715).
    // Reading that instead of the parenthesised figure is the classic failure here.
    expect(lines[0].netWeightKg).toBeCloseTo(0.544, 3)
    expect(lines[0].grossWeightKg).toBeCloseTo(0.598, 3)
    expect(lines[1].netWeightKg).toBeCloseTo(0.544, 3)
    expect(lines[2].netWeightKg).toBeCloseTo(1.38, 3)
    expect(lines[2].grossWeightKg).toBeCloseTo(1.518, 3)

    const netTotal = lines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    expect(netTotal).toBeCloseTo(2.468, 3)
  })

  it('prices TP1 in the destination currency, not USD', () => {
    const h = parsed.vendorA1.headers.TP1
    expect(h.documentCurrency).toBe('INR')
    expect(h.totalValue).toBeCloseTo(105536, 2)
  })
})

describe.skipIf(!hasFixtures())('vendorA2 — single line, consignee differs from buyer', () => {
  it('uses CONSIGNED TO for the receiving party', () => {
    const h = parsed.vendorA2.headers.FC
    expect(h.soldTo.name).toBe('vendor Corporation')
    expect(h.consignedTo.name).toBe('vendor Industrial Automation Ch')
    expect(h.dischargePort).toBe('Shanghai, China')
  })

  it('reads the single invoice line', () => {
    const lines = fcInvoice(parsed.vendorA2)
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line.orderNumber).toBe('200OI026027141')
    expect(line.itemId).toBe('2R0644500')
    expect(line.countryOfOrigin).toBe('Malaysia')
    expect(line.classification).toBe('8544.42.0000')
    expect(line.partNumber).toBe('40649-0100')
    expect(line.quantity).toBe(1)
    expect(line.extendedValue).toBeCloseTo(51.6, 3)
  })

  it('reads the packing weights and measurement', () => {
    const h = parsed.vendorA2.headers.FC
    expect(h.totalNetWeightKg).toBeCloseTo(1.27, 3)
    expect(h.totalGrossWeightKg).toBeCloseTo(1.397, 3)
    expect(h.totalMeasurementM3).toBeCloseTo(1.0, 3)
  })
})

describe.skipIf(!hasFixtures())('vendorA3 — CEVA, 11 lines over 8 orders across page breaks', () => {
  it('reads every line across both detail pages', () => {
    const lines = fcInvoice(parsed.vendorA3)
    expect(lines).toHaveLength(11)
    expect(lines.reduce((s, l) => s + l.quantity, 0)).toBe(97)
    expect(lines.reduce((s, l) => s + (l.extendedValue ?? 0), 0)).toBeCloseTo(129999.1, 2)
  })

  it('keeps the four repeated 4208669164 sequences apart', () => {
    const repeated = fcInvoice(parsed.vendorA3).filter((l) => l.orderNumber === '4208669164')
    expect(repeated).toHaveLength(4)
    expect(repeated.map((l) => l.sequence)).toEqual(['1', '2', '3', '4'])
    // Distinct lot ids prove these are four physical lines, not one read four times.
    expect(new Set(repeated.map((l) => l.itemId)).size).toBe(4)
  })

  it('recovers the two order numbers the header P/O field truncates', () => {
    const header = parsed.vendorA3.headers.FC
    expect(header.orderNumbers).toHaveLength(8)
    expect(header.orderNumbers).toContain('4208669164')
    expect(header.orderNumbers).toContain('4208669854')
    expect(parsed.vendorA3.warnings.join(' ')).toMatch(/header P\/O field lists 6/)
  })

  it('reads mixed countries of origin, which drive the D/F indicator', () => {
    const lines = fcInvoice(parsed.vendorA3)
    const byOrigin = new Set(lines.map((l) => l.countryOfOrigin))
    expect(byOrigin).toEqual(new Set(['Japan', 'United States']))
  })

  it('reads packing weights totalling the document total', () => {
    const lines = fcPacking(parsed.vendorA3)
    expect(lines).toHaveLength(11)
    const net = lines.reduce((s, l) => s + (l.netWeightKg ?? 0), 0)
    expect(net).toBeCloseTo(138.841, 2)
    expect(parsed.vendorA3.headers.FC.totalNetWeightKg).toBeCloseTo(138.841, 3)
    expect(parsed.vendorA3.headers.FC.totalGrossWeightKg).toBeCloseTo(171.911, 3)
  })

  it('prices TP1 in EUR', () => {
    expect(parsed.vendorA3.headers.TP1.documentCurrency).toBe('EUR')
    expect(parsed.vendorA3.headers.TP1.totalValue).toBeCloseTo(82126.18, 2)
  })
})
