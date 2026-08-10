/**
 * Coverage for the Omron Commercial Invoice form (00004-00202), in both shapes the parser
 * accepts: the workbook grid, a real .xlsx round-trip through the project's own writer and
 * reader, and a PDF drawn to the printed template's geometry.
 */
import { describe, expect, it } from 'vitest'
import { parseCipl, parseCiplFile } from '.'
import { isOmronCiWorkbook, parseOmronCiWorkbook } from './parse-omron-ci'
import { reconcile } from '../reconcile'
import { buildXlsx } from '../../lib/xlsx'
import { buildOmronCiPdf, omronCiGrid, simpleOmronCi, subtotalOf } from '../../test/synthetic/omron-ci'
import type { ParsedCipl } from '../types'

const BLANK_CONTROLS = { eccn: null, sme: null, license: null }
const UNIT_WEIGHTS = { '10000-0001': 0.5, '20000-0002': 0.4 }

const parseGrid = (spec = simpleOmronCi()): ParsedCipl => parseOmronCiWorkbook('ci.xlsx', omronCiGrid(spec))

describe('the workbook grid', () => {
  it('is recognised by its document number', () => {
    expect(isOmronCiWorkbook(omronCiGrid(simpleOmronCi()))).toBe(true)
    expect(isOmronCiWorkbook([['PART', 'QTY'], ['A', '1']])).toBe(false)
  })

  it('reads the header', () => {
    const header = parseGrid().headers.FC
    expect(header.invoiceNumber).toBe('CI-2026-0001')
    expect(header.invoiceDate).toBe('08/10/2026')
    expect(header.orderNumbers).toEqual(['4501234567'])
    expect(header.incoterm).toBe('DAP Singapore')
    expect(header.freightTerms).toBe('PREPAID')
    expect(header.vesselAgent).toBe('Nippon Express')
    expect(header.documentCurrency).toBe('USD')
    expect(header.cartons).toBe(2)
    expect(header.totalNetWeightKg).toBeCloseTo(3.4, 3)
    expect(header.totalGrossWeightKg).toBeCloseTo(4.1, 3)
    expect(header.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(header.consignedTo.lines).toEqual(['1 Harbour Way', 'Singapore 018989', 'Singapore'])
  })

  it('reconciles values against the subtotal, not the tax-and-freight total', () => {
    const header = parseGrid().headers.FC
    expect(header.totalValue).toBeCloseTo(190, 2)
    expect(header.totalQuantity).toBe(7)
  })

  it('reads each line with its full export-control triplet', () => {
    const parsed = parseGrid()
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({
      partNumber: '10000-0001',
      description: 'Robot cable assembly',
      countryOfOrigin: 'US',
      classification: '8544.42.0000',
      eccn: 'EAR99',
      license: 'NLR',
      sme: 'N',
      quantity: 4,
      uom: 'EA',
      currency: 'USD',
    })
    expect(parsed.lines[0].extendedValue).toBeCloseTo(40, 2)
    expect(parsed.lines[1].eccn).toBe('5A992.c')
  })

  it('skips unused form lines instead of reading them as goods', () => {
    const parsed = parseGrid()
    expect(parsed.lines.map((l) => l.lineNumber)).toEqual(['1', '2'])
  })

  it('uses the bill-to block as sold-to only when it is filled in', () => {
    expect(parseGrid().headers.FC.soldTo.name).toBe('Example Consignee Pte. Ltd.')
    const billed = parseGrid({ ...simpleOmronCi(), billToName: 'Billing Party LLC', billToLines: ['PO Box 9'] })
    expect(billed.headers.FC.soldTo.name).toBe('Billing Party LLC')
  })

  it('warns and zeroes the total when the workbook has no cached subtotal', () => {
    const parsed = parseGrid({ ...simpleOmronCi(), omitSubtotal: true })
    expect(parsed.headers.FC.totalValue).toBe(0)
    expect(parsed.warnings.some((w) => w.includes('subtotal'))).toBe(true)
  })

  it('computes a line amount when the cell carries no cached result', () => {
    const spec = simpleOmronCi()
    const grid = omronCiGrid(spec)
    // Blank the first line's AMOUNT cell, as a formula with no cached value reads.
    const firstTop = grid.findIndex((row) => row[2] === '10000-0001')
    grid[firstTop][10] = ''
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines[0].extendedValue).toBeCloseTo(40, 2)
  })

  it('reconciles, with per-line export control satisfying the triplet check', () => {
    const result = reconcile(parseGrid(), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    for (const id of ['total-quantity', 'total-value', 'weights-present', 'line-coverage', 'header-readable']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
    expect(result.checks.find((c) => c.id === 'export-control')).toMatchObject({ passed: true })
    expect(result.canGenerate).toBe(true)
  })

  it('keeps lines with different export control in separate rows', () => {
    const result = reconcile(parseGrid(), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    expect(result.sliLines).toHaveLength(2)
    const eccns = result.sliLines.map((l) => l.eccn).sort()
    expect(eccns).toEqual(['5A992.c', 'EAR99'])
    for (const line of result.sliLines) {
      expect(line.license).toBe('NLR')
      expect(line.sme).toBe('N')
    }
  })
})

describe('the .xlsx round trip', () => {
  it('parses the workbook through the file entry point', async () => {
    const bytes = buildXlsx([{ name: 'INV', rows: omronCiGrid(simpleOmronCi()) }])
    const parsed = await parseCiplFile('ci.xlsx', bytes)
    expect(parsed.format).toBe('omron-ci')
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.headers.FC.totalValue).toBeCloseTo(subtotalOf(simpleOmronCi()), 2)
  })

  it('refuses a workbook that is not the form', async () => {
    const bytes = buildXlsx([{ name: 'Sheet1', rows: [['Part', 'Qty'], ['A', '1']] }])
    await expect(parseCiplFile('other.xlsx', bytes)).rejects.toThrow(/not the Commercial Invoice form/)
  })
})

describe('the printed PDF', () => {
  it('is detected and parsed to the same shipment as the workbook', async () => {
    const spec = simpleOmronCi()
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.format).toBe('omron-ci')

    const header = parsed.headers.FC
    expect(header.invoiceNumber).toBe('CI-2026-0001')
    expect(header.orderNumbers).toEqual(['4501234567'])
    expect(header.incoterm).toBe('DAP Singapore')
    expect(header.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(header.totalValue).toBeCloseTo(190, 2)

    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({
      partNumber: '10000-0001',
      description: 'Robot cable assembly',
      countryOfOrigin: 'US',
      classification: '8544.42.0000',
      eccn: 'EAR99',
      license: 'NLR',
      sme: 'N',
      quantity: 4,
    })
    expect(parsed.lines[1].extendedValue).toBeCloseTo(150, 2)
  })

  it('keeps an empty consignee from shifting the bill-to into its column', async () => {
    const spec = { ...simpleOmronCi(), consigneeName: '', consigneeLines: [], billToName: 'Billing Party LLC' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.headers.FC.consignedTo.name).toBe('')
    expect(parsed.headers.FC.soldTo.name).toBe('Billing Party LLC')
  })

  it('goes through the file entry point by content sniffing', async () => {
    const parsed = await parseCiplFile('ci.pdf', await buildOmronCiPdf(simpleOmronCi()))
    expect(parsed.format).toBe('omron-ci')
  })
})
