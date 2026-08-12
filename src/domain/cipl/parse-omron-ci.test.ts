/**
 * Coverage for the Omron Commercial Invoice form (00004-00202), in both shapes the parser
 * accepts: the workbook grid, a real .xlsx round-trip through the project's own writer and
 * reader, and a PDF drawn to the printed template's geometry.
 */
import { describe, expect, it } from 'vitest'
import { parseCipl, parseCiplFile } from '.'
import { isOmronCiWorkbook, isPartyTitle, parseOmronCiWorkbook } from './parse-omron-ci'
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
    expect(header.totalNetWeightKg).toBeCloseTo(3.2, 3)
    expect(header.totalGrossWeightKg).toBeCloseTo(4.1, 3)
    expect(header.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(header.consignedTo.lines).toEqual(['1 Harbour Way', 'Singapore 018989', 'Singapore'])
  })

  it('does not put the form’s SHIP DATE into the field that means a sailing date', () => {
    // `onOrAboutDate` is the later sailing date on the vendor layouts, and box 2 of the SLI
    // deliberately takes the invoice date instead. Filling it from a box that means
    // something else would move the date of exportation on those layouts too, through the
    // one line in `buildDraft` that reads it.
    const grid = omronCiGrid(simpleOmronCi())
    const row = grid.find((r) => r[5] === 'SHIP DATE:')!
    row[7] = '08/14/2026'
    const header = parseOmronCiWorkbook('ci.xlsx', grid).headers.FC
    expect(header.onOrAboutDate).toBeNull()
    expect(header.invoiceDate).toBe('08/10/2026')
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
    for (const id of ['total-quantity', 'total-value', 'weights-present', 'line-coverage', 'header-readable', 'line-quantities']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
    expect(result.checks.find((c) => c.id === 'export-control')).toMatchObject({ passed: true })
    expect(result.canGenerate).toBe(true)
  })

  it('converts an Excel date serial into the date the cell displayed', () => {
    const grid = omronCiGrid(simpleOmronCi())
    const row = grid.find((r) => r[1] === 'INVOICE #:')!
    row[7] = '46244' // what readXlsx returns for a date-formatted 08/10/2026
    const header = parseOmronCiWorkbook('ci.xlsx', grid).headers.FC
    expect(header.invoiceDate).toBe('08/10/2026')
  })

  it('truncates a datetime serial to its calendar day instead of rounding past noon', () => {
    const grid = omronCiGrid(simpleOmronCi())
    const row = grid.find((r) => r[1] === 'INVOICE #:')!
    row[7] = '46244.75' // 08/10/2026 6:00 PM, as a cell filled from =NOW() stores it
    expect(parseOmronCiWorkbook('ci.xlsx', grid).headers.FC.invoiceDate).toBe('08/10/2026')
  })

  it('does not flag a stated EAR99, but flags a stated controlled ECCN', () => {
    const result = reconcile(parseGrid(), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    const check = result.checks.find((c) => c.id === 'eccn-from-document')
    expect(check).toBeDefined()
    // The 5A992.c line is reported; the EAR99 line is not.
    expect(check!.detail).toContain('5A992.c')
    expect(check!.detail).not.toContain('EAR99,')
    expect(check!.refs).toHaveLength(1)
  })

  it('flags a stated EAR99 that downgrades a controlled blanket ECCN', () => {
    const result = reconcile(parseGrid(), null, {
      eccn: '5A992.c',
      sme: null,
      license: null,
      unitWeightsByPart: UNIT_WEIGHTS,
    })
    const check = result.checks.find((c) => c.id === 'eccn-from-document')
    // The EAR99 line now changes what would be filed, so it is the one reported;
    // the 5A992.c line matches the blanket and is unremarkable.
    expect(check).toBeDefined()
    expect(check!.detail).toContain('EAR99')
    expect(check!.refs).toHaveLength(1)
  })

  it('resyncs when a collapsed empty compliance row shifts the block stride', () => {
    const spec = simpleOmronCi()
    const grid = omronCiGrid(spec)
    // Drop the empty compliance row of unused line 3, as a writer that omits blank
    // rows would. Line blocks after the gap must still pair top and bottom correctly.
    const line3Top = grid.findIndex((row) => row[1] === '3')
    grid.splice(line3Top + 1, 1)
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[1]).toMatchObject({ partNumber: '20000-0002', countryOfOrigin: 'JP' })
  })

  it('reads past a blank row inside the commodity table instead of stopping at it', () => {
    // The workbook reader honours each row's own index and pads an omitted row with a blank
    // one, so a gap the writer left is a gap the reader sees. Read as the end of the table,
    // it dropped every line below it without a word.
    const grid = omronCiGrid(simpleOmronCi())
    const secondTop = grid.findIndex((row) => row[2] === '20000-0002')
    grid.splice(secondTop, 0, [])
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[1]).toMatchObject({ partNumber: '20000-0002', countryOfOrigin: 'JP' })
  })

  it('finds the compliance heading row when a blank row is padded in above it', () => {
    // Same cause, one row higher: assuming the two heading rows are adjacent left the sheet
    // claimed as the form while no line at all was read from it.
    const grid = omronCiGrid(simpleOmronCi())
    const head = grid.findIndex((row) => row.includes('PART #'))
    grid.splice(head + 1, 0, [])
    expect(isOmronCiWorkbook(grid)).toBe(true)
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({ partNumber: '10000-0001', eccn: 'EAR99' })
  })

  it('accepts a title-cased revision of the form, as the printed PDF path already does', () => {
    // Every other label on this form is matched uppercased. Matched exactly, a workbook
    // whose headings were re-typed in title case was refused as "not the Commercial Invoice
    // form" while its own printed PDF parsed cleanly.
    const grid = omronCiGrid(simpleOmronCi()).map((row) =>
      row.map((cell) =>
        ['LN', 'PART #', 'DESCRIPTION OF GOODS', 'QTY', 'UOM', 'UNIT PRICE', 'AMOUNT',
         'COO', 'HTS / SCHEDULE B', 'ECCN / EAR99', 'LICENSE / NLR', 'SME (Y/N)'].includes(cell)
          ? cell.toLowerCase()
          : cell,
      ),
    )
    expect(isOmronCiWorkbook(grid)).toBe(true)
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({ partNumber: '10000-0001', countryOfOrigin: 'US', eccn: 'EAR99' })
  })

  it('does not mistake the header grid’s SHIPPER and CONSIGNEE labels for the address band', () => {
    // `SHIPPER EIN / TAX ID:` and `CONSIGNEE EORI / USCI / VAT:` share a row of the header
    // grid, and between them they satisfy the band's own test. The band is located first
    // only because it is printed first; the two are told apart by the label list, not by
    // the order of the rows.
    expect(isPartyTitle('SHIPPER (SHIP FROM / EXPORTER)', 'SHIPPER')).toBe(true)
    expect(isPartyTitle('CONSIGNEE (SHIP TO)', 'CONSIGNEE')).toBe(true)
    expect(isPartyTitle('BILL TO / SOLD TO (IF DIFFERENT)', 'BILL TO')).toBe(true)
    expect(isPartyTitle('SHIPPER EIN / TAX ID:', 'SHIPPER')).toBe(false)
    expect(isPartyTitle('CONSIGNEE EORI / USCI / VAT:', 'CONSIGNEE')).toBe(false)
  })

  it('says so when the LN column is missing rather than reading no lines in silence', () => {
    // The table is walked by its LN column, so a revision that renames or drops that
    // heading ends the table before its first block. Zero lines and no warning is
    // indistinguishable from a blank form.
    const grid = omronCiGrid(simpleOmronCi())
    const head = grid.find((row) => row.includes('LN'))!
    head[head.indexOf('LN')] = 'LINE'
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(0)
    expect(parsed.warnings.some((w) => w.includes('LN'))).toBe(true)
  })

  it('names the saved per-part table, not a packing list this form cannot have', () => {
    // The form is invoice-only. Told "no packing-list match", the operator is sent looking
    // for a document the shipment does not have, and not told about the table that would
    // actually fix it.
    const result = reconcile(parseGrid(), null, { ...BLANK_CONTROLS })
    const weights = result.checks.find((c) => c.id === 'weights-present')!
    expect(weights).toMatchObject({ severity: 'blocking', passed: false })
    expect(weights.detail).toContain('per-part table')
    expect(weights.detail).not.toContain('packing-list match')
  })

  it('blocks a line whose quantity could not be read instead of filing zero', () => {
    const spec = simpleOmronCi()
    const grid = omronCiGrid(spec)
    const firstTop = grid.findIndex((row) => row[2] === '10000-0001')
    grid[firstTop][7] = '' // blank QTY on a real part
    grid[firstTop][10] = ''
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    const result = reconcile(parsed, null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    expect(result.checks.find((c) => c.id === 'line-quantities')).toMatchObject({ passed: false, severity: 'blocking' })
    expect(result.canGenerate).toBe(false)
  })

  it('cross-checks supplied per-part weights against the net total typed on the form', () => {
    const agreeing = reconcile(parseGrid(), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    expect(agreeing.checks.find((c) => c.id === 'total-weight')).toMatchObject({ passed: true, severity: 'warning' })

    const stale = reconcile(parseGrid(), null, {
      ...BLANK_CONTROLS,
      unitWeightsByPart: { '10000-0001': 5, '20000-0002': 5 },
    })
    expect(stale.checks.find((c) => c.id === 'total-weight')).toMatchObject({ passed: false, severity: 'warning' })
    // A disagreement between two supplied figures warns; it does not block.
    expect(stale.canGenerate).toBe(true)
  })

  it('warns when a stated licence downgrades an entered licence number', () => {
    const result = reconcile(parseGrid(), null, {
      eccn: null,
      sme: null,
      license: 'D123456',
      unitWeightsByPart: UNIT_WEIGHTS,
    })
    const check = result.checks.find((c) => c.id === 'license-from-document')
    expect(check).toMatchObject({ passed: false, severity: 'warning' })
    expect(check!.detail).toContain('NLR')
  })

  it('groups case variants of one classification into one row', () => {
    const spec = simpleOmronCi()
    // Same goods, same codes — one line's ECCN typed lowercase.
    spec.lines[1] = { ...spec.lines[0], eccn: 'ear99' }
    const result = reconcile(parseGrid(spec), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
    expect(result.sliLines).toHaveLength(1)
    expect(result.sliLines[0].quantity).toBe(8)
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
    await expect(parseCiplFile('other.xlsx', bytes)).rejects.toThrow(/Commercial Invoice/)
  })

  it('finds the form behind a cover sheet, even one that cites the doc number', async () => {
    const bytes = buildXlsx([
      { name: 'Cover', rows: [['Revision History'], ['00004-00202 Rev C — proposal']] },
      { name: 'INV', rows: omronCiGrid(simpleOmronCi()) },
    ])
    const parsed = await parseCiplFile('ci.xlsx', bytes)
    expect(parsed.format).toBe('omron-ci')
    expect(parsed.lines).toHaveLength(2)
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

  it('routes a compliance row correctly even when part and description are blank', async () => {
    const spec = simpleOmronCi()
    spec.lines[0] = { ...spec.lines[0], partNumber: '', description: '' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    // The blank-part line still carries its compliance values in the right columns —
    // COO must not surface as a part number.
    const line = parsed.lines.find((l) => l.classification === '8544.42.0000')
    expect(line).toBeDefined()
    expect(line!.partNumber).toBe('')
    expect(line!.countryOfOrigin).toBe('US')
    expect(line!.eccn).toBe('EAR99')
  })

  it('keeps a wrapped description out of the compliance columns', async () => {
    const spec = simpleOmronCi()
    spec.lines[0] = { ...spec.lines[0], descriptionTail: 'with mounting bracket' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.lines[0].description).toBe('Robot cable assembly with mounting bracket')
    expect(parsed.lines[0].classification).toBe('8544.42.0000')
    expect(parsed.lines[0].countryOfOrigin).toBe('US')
  })

  it('reads a wrapped description down the page, not across it', async () => {
    // Both behaviours at once — wrapped to a second printed line *and* split into word
    // items. Reassembled by x alone the two lines interleave, and the scrambled string is
    // what gets filed as the commodity description.
    const spec = simpleOmronCi()
    spec.lines[0] = {
      ...spec.lines[0],
      description: 'Robot cable assembly,',
      descriptionTail: '5 m shielded',
      splitDescription: true,
    }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.lines[0].description).toBe('Robot cable assembly, 5 m shielded')
  })

  it('keeps a description word that overflows past the quantity border out of the numeric columns', async () => {
    const spec = simpleOmronCi()
    spec.lines[0] = { ...spec.lines[0], descriptionOverflow: 'kit' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.lines[0].quantity).toBe(4)
    expect(parsed.lines[0].uom).toBe('EA')
    expect(parsed.lines[0].description).toBe('Robot cable assembly kit')
  })

  it('does not read a numeric country of origin as the start of another line', async () => {
    // The workbook resync looks for a block whose compliance row was collapsed away by
    // recognising a line number in that row's first cell. On this path the first cell is
    // the country of origin, so a numeric country code fired it — throwing away the line's
    // whole export-control row and filing the compliance row again as goods.
    const spec = simpleOmronCi()
    spec.lines[0] = { ...spec.lines[0], coo: '840' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({
      partNumber: '10000-0001',
      countryOfOrigin: '840',
      classification: '8544.42.0000',
      eccn: 'EAR99',
    })
  })

  it('reads a header value whole when the extractor splits it into several items', async () => {
    const spec = { ...simpleOmronCi(), splitValues: true }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.headers.FC.incoterm).toBe('DAP Singapore')
    expect(parsed.headers.FC.vesselAgent).toBe('Nippon Express')
    expect(parsed.headers.FC.invoiceNumber).toBe('CI-2026-0001')
  })

  it('does not mistake a wrapped description for a blank compliance row', async () => {
    const spec = simpleOmronCi()
    spec.lines[0] = {
      ...spec.lines[0],
      descriptionTail: 'with mounting bracket',
      coo: '', hts: '', eccn: '', license: '', sme: '',
    }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    // The tail is the block's lowest baseline here, but it hangs just under the LN
    // centre where a real compliance row never sits — it must stay in the description.
    expect(parsed.lines[0].description).toBe('Robot cable assembly with mounting bracket')
    expect(parsed.lines[0].classification).toBe('')
    expect(parsed.lines[0].countryOfOrigin).toBe('')
  })

  it('keeps a line whose description mentions NO CHARGE', async () => {
    const spec = simpleOmronCi()
    spec.lines[0] = { ...spec.lines[0], description: 'Warranty replacement - NO CHARGE' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0].description).toBe('Warranty replacement - NO CHARGE')
  })

  it('refuses a multi-page print instead of merging its pages into garbage', async () => {
    const doc = await (await import('pdf-lib')).PDFDocument.load(await buildOmronCiPdf(simpleOmronCi()))
    const copy = await (await import('pdf-lib')).PDFDocument.load(await buildOmronCiPdf(simpleOmronCi()))
    const [page] = await doc.copyPages(copy, [0])
    doc.addPage(page)
    await expect(parseCipl('ci.pdf', (await doc.save()).buffer as ArrayBuffer)).rejects.toThrow(/single page/)
  })
})

describe('the last block, when its compliance row was collapsed away', () => {
  const eight = () => ({
    ...simpleOmronCi(),
    lines: Array.from({ length: 8 }, (_, i) => ({
      partNumber: `P-${i + 1}`,
      description: `Part ${i + 1}`,
      coo: 'US',
      hts: '8544.42.0000',
      eccn: 'EAR99',
      license: 'NLR',
      sme: 'N',
      quantity: 1,
      uom: 'EA',
      unitPrice: 10,
    })),
  })

  it('does not read the totals band as the last line’s compliance row', () => {
    const grid = omronCiGrid(eight())
    const lastTop = grid.findIndex((r) => r[2] === 'P-8')
    // With every form line used, the row after the last block is the totals band.
    grid.splice(lastTop + 1, 1)
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(8)
    const last = parsed.lines[7]
    expect(last.partNumber).toBe('P-8')
    // Blank because the row is genuinely absent — never picked up off the totals band.
    expect(last.countryOfOrigin).toBe('')
    expect(last.classification).toBe('')
    // And the subtotal is still read, so the value check still has something to prove against.
    expect(parsed.headers.FC.totalValue).toBeCloseTo(80, 2)
  })

  it('reads a totals band that carries text in the compliance columns as totals, not goods', () => {
    const grid = omronCiGrid(eight())
    const lastTop = grid.findIndex((r) => r[2] === 'P-8')
    grid.splice(lastTop + 1, 1)
    // A future revision of the form putting anything in those cells must not have it filed
    // as a country of origin.
    const totals = grid.findIndex((r) => r.some((c) => c === 'SUBTOTAL'))
    grid[totals][2] = 'CN'
    grid[totals][3] = '9999.99.9999'
    const last = parseOmronCiWorkbook('ci.xlsx', grid).lines[7]
    expect(last.countryOfOrigin).toBe('')
    expect(last.classification).toBe('')
  })
})

describe('a printed table whose headings could not all be located', () => {
  it('reports the missing table instead of inventing lines from an uncalibrated grid', async () => {
    const spec = simpleOmronCi()
    const pdf = await buildOmronCiPdf({ ...spec, splitHeadings: true })
    const parsed = await parseCipl('ci.pdf', pdf)
    // No line is better than a line whose SME landed in the licence column.
    expect(parsed.lines).toHaveLength(0)
    expect(parsed.warnings.some((w) => w.includes('commodity table headings'))).toBe(true)
  })

  it('withholds only the table — the header, parties and totals still read', async () => {
    const spec = {
      ...simpleOmronCi(),
      splitHeadings: true,
      consigneeName: 'Example Consignee Pte. Ltd.',
      consigneeLines: [] as string[],
      billToName: 'Buyer GmbH',
      billToLines: ['9 Payer Street'],
    }
    const header = (await parseCipl('ci.pdf', await buildOmronCiPdf(spec))).headers.FC
    expect(header.invoiceNumber).toBe('CI-2026-0001')
    expect(header.totalValue).toBeCloseTo(190, 2)
    // The party band is still mapped by column, so a blank consignee address does not
    // absorb the bill-to's street.
    expect(header.consignedTo).toMatchObject({ name: 'Example Consignee Pte. Ltd.', lines: [] })
    expect(header.soldTo.name).toBe('Buyer GmbH')
  })

  it('still reads the table when only the description heading was split', async () => {
    // That heading positions nothing — part and description are separated by the border
    // between the COO and HTS columns — so refusing the table would be a false negative.
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf({ ...simpleOmronCi(), splitDescriptionHeading: true }))
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({
      partNumber: '10000-0001',
      description: 'Robot cable assembly',
      countryOfOrigin: 'US',
      sme: 'N',
      quantity: 4,
    })
  })
})
