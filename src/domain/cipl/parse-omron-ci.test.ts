/**
 * Coverage for the Omron Commercial Invoice form (00004-00202), in both shapes the parser
 * accepts: the workbook grid, a real .xlsx round-trip through the project's own writer and
 * reader, and a PDF drawn to the printed template's geometry.
 */
import { describe, expect, it } from 'vitest'
import { parseCipl, parseCiplFile } from '.'
import { isOmronCiWorkbook, isPartyTitle, parseOmronCiPages, parseOmronCiWorkbook, titlesPartyBlock } from './parse-omron-ci'
import { reconcile, resolveDestinationCountry } from '../reconcile'
import { buildDraft, defaultShipmentSettings, type CompanyProfile } from '../draft'
import { getAdapter } from '../../carriers/registry'
import { buildXlsx } from '../../lib/xlsx'
import {
  buildOmronCiPdf,
  buildOmronCiPdfPages,
  omronCiGrid,
  omronCiGrids,
  omronCiPageSpecs,
  simpleOmronCi,
  subtotalOf,
  type OmronCiSpec,
} from '../../test/synthetic/omron-ci'
import type { ParsedCipl, Reconciliation } from '../types'

const BLANK_CONTROLS = { eccn: null, sme: null, license: null }
const UNIT_WEIGHTS = { '10000-0001': 0.5, '20000-0002': 0.4 }

const parseGrid = (spec = simpleOmronCi()): ParsedCipl => parseOmronCiWorkbook('ci.xlsx', omronCiGrid(spec))
/** The pages of one invoice, read the way a multi-sheet workbook or a multi-page print is. */
const parsePages = (specs: OmronCiSpec[]): ParsedCipl => parseOmronCiPages('ci.xlsx', omronCiGrids(specs))

const CEVA = getAdapter('ceva')
const PROFILE: CompanyProfile = {
  usppiName: 'Example Exporter, Inc.',
  usppiAddressLines: ['1 Example Way'],
  usppiZip: '94588',
  usppiEin: '00-0000000',
  contactName: 'A Person',
  contactPhone: '000-000-0000',
  pointOfOrigin: 'CA',
  signerName: 'A Person',
  signerTitle: 'Logistics',
  signerEmail: 'a.person@example.com',
  signerPhone: '000-000-0000',
  signerInitials: 'AP',
}
const reconcileGrid = (spec = simpleOmronCi()): Reconciliation =>
  reconcile(parseGrid(spec), null, { ...BLANK_CONTROLS, unitWeightsByPart: UNIT_WEIGHTS })
const defaultSettings = () => defaultShipmentSettings(CEVA)

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

  it('reads the form’s SHIP DATE, and files box 2 from it rather than the invoice date', () => {
    // The form has a box for the date the goods ship, and that is the date of exportation.
    // `onOrAboutDate` stays null: on the vendor layouts it means a later *sailing estimate*,
    // which is deliberately not filed, and this form states no such thing.
    const header = parseGrid({ ...simpleOmronCi(), shipDate: '08/14/2026' }).headers.FC
    expect(header.shipDate).toBe('08/14/2026')
    expect(header.onOrAboutDate).toBeNull()
    expect(header.invoiceDate).toBe('08/10/2026')

    const draft = buildDraft(reconcileGrid({ ...simpleOmronCi(), shipDate: '08/14/2026' }), PROFILE, defaultSettings(), CEVA)
    expect(draft.dateOfExportation).toBe('08/14/2026')
  })

  it('falls back to the invoice date when the form states no ship date', () => {
    const draft = buildDraft(reconcileGrid(simpleOmronCi()), PROFILE, defaultSettings(), CEVA)
    expect(draft.dateOfExportation).toBe('08/10/2026')
  })

  it('converts the ship date from the serial Excel stores it as', () => {
    const grid = omronCiGrid(simpleOmronCi())
    grid.find((r) => r[5] === 'SHIP DATE:')![7] = '46282'
    expect(parseOmronCiWorkbook('ci.xlsx', grid).headers.FC.shipDate).toBe('09/17/2026')
  })

  it('keeps a struck-through box out of the commodity lines as well as the header', () => {
    // The purchase order reaching the lines is the one reaching the header — a `-` filed
    // as an order number against goods is the same defect wherever it lands.
    const parsed = parseGrid({ ...simpleOmronCi(), purchaseOrder: '-' })
    expect(parsed.lines.map((l) => l.orderNumber)).toEqual(['', ''])
  })

  it('takes a box from the page that fills it in when another page struck it through', () => {
    const [first, second] = omronCiPageSpecs({ ...simpleOmronCi(), purchaseOrder: '-' }, 1)
    const parsed = parsePages([first, { ...second, purchaseOrder: '4501234567' }])
    expect(parsed.headers.FC.orderNumbers).toEqual(['4501234567'])
  })

  it('reads a struck-through box as empty rather than filing the dash it holds', () => {
    // The form is filled in by hand and its unused boxes are struck through. Read
    // literally, that dash becomes the invoice number in the output filename and the
    // consignee's purchase order on the SLI.
    const header = parseGrid({ ...simpleOmronCi(), invoiceNumber: '-', invoiceDate: '-', purchaseOrder: 'N/A' }).headers.FC
    expect(header.invoiceNumber).toBe('')
    expect(header.invoiceDate).toBe('')
    expect(header.orderNumbers).toEqual([])
  })

  it('resolves the country of ultimate destination out of the consignee’s postal line', () => {
    // The form has no discharge port, and prints the country at the end of a line that is
    // otherwise a postal address. Neither the county nor the postcode may be filed as it.
    const header = parseGrid({
      ...simpleOmronCi(),
      consigneeLines: ['STR. ANGHEL I. SALIGNY NR. 40', 'ORADEA, 410085, BIHOR, ROMANIA', 'Cristian B: +40 741 403 987'],
    }).headers.FC
    expect(header.consignedTo.country).toBe('Romania')
    expect(resolveDestinationCountry(header)).toBe('Romania')
  })

  it('leaves the destination country unresolved rather than reading a state as a country', () => {
    // `CA` is Canada in the ISO list and California on an address. A two-letter segment is
    // never accepted, and an address naming no country resolves to nothing at all.
    const header = parseGrid({ ...simpleOmronCi(), consigneeLines: ['1 Example Way', 'Pleasanton, CA'] }).headers.FC
    expect(header.consignedTo.country).toBeNull()
    expect(resolveDestinationCountry(header)).toBeNull()
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

  it('reads the subtotal from the AMOUNT column, not the rightmost number on the row', () => {
    // The totals band shares its rows with `# OF PIECES`, `NET WT (KG)` and `GROSS WT (KG)`.
    // Taking the rightmost number handed one of those to the blocking total-value check,
    // which then reconciled the shipment against a piece count.
    const grid = omronCiGrid(simpleOmronCi())
    const row = grid.find((r) => r.some((c) => c.trim().toUpperCase() === 'SUBTOTAL'))!
    row.push('2') // a stray value printed further right than the amount
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.headers.FC.totalValue).toBeCloseTo(190, 2)
  })

  it('says so when the commodity table ends before its totals band', () => {
    // A blank LN cell mid-table stopped the read and returned a short list that looks
    // complete. The lines below it are simply gone, and nothing said so.
    const grid = omronCiGrid(simpleOmronCi())
    const secondTop = grid.findIndex((row) => row[2] === '20000-0002')
    grid[secondTop][1] = ''
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.warnings.some((w) => w.includes('ended before its totals band'))).toBe(true)
  })

  it('reads past a long run of blank line slots', () => {
    // A template whose unused slots are wholly blank leaves a gap longer than any count a
    // rule could pick. Ending the table on a run of them dropped every line below the gap
    // on one form and cried truncation on every ordinary import of another.
    const grid = omronCiGrid(simpleOmronCi())
    const secondTop = grid.findIndex((row) => row[2] === '20000-0002')
    grid.splice(secondTop, 0, [], [], [], [], [], [])
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.warnings.some((w) => w.includes('ended before its totals band'))).toBe(false)
  })

  it('says nothing about a note printed under the table', () => {
    // A row that is neither the totals band nor a commodity — a continuation marker, a
    // no-charge note — ends the table just as properly. Warning about it would cry
    // truncation on every clean import of a template that carries one.
    const grid = omronCiGrid(simpleOmronCi())
    const totals = grid.findIndex((row) => row.some((c) => c.trim().toUpperCase() === 'SUBTOTAL'))
    grid.splice(totals, 0, ['', '', '', 'Continued on attached sheet'])
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.warnings.some((w) => w.includes('ended before its totals band'))).toBe(false)
  })

  it('says nothing about the table ending when it ends where it should', () => {
    expect(parseGrid().warnings.some((w) => w.includes('ended before its totals band'))).toBe(false)
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

  it('says so when the address blocks could not be read at all', () => {
    // Nothing downstream demands a consignee — the SLI fills its box with whatever is
    // there, including nothing — so a band that could not be read has to report itself or
    // it reads as a blank form.
    const grid = omronCiGrid(simpleOmronCi())
    const band = grid.findIndex((row) => row.includes('SHIPPER (SHIP FROM / EXPORTER)'))
    grid.splice(band, 1)
    const parsed = parseOmronCiWorkbook('ci.xlsx', grid)
    expect(parsed.headers.FC.consignedTo.name).toBe('')
    expect(parsed.warnings.some((w) => w.includes('could not be read from this document'))).toBe(true)
  })

  it('does not let the header grid answer to the address band’s description', () => {
    // `SHIPPER EIN / TAX ID:` and `CONSIGNEE EORI / USCI / VAT:` share a row of the header
    // grid, and `isPartyTitle` refuses them because each *is* a label — but only while the
    // extractor leaves them whole. Split into words, the first item is the bare word
    // `SHIPPER`, and the grid row satisfies the band's own test. That the real band is
    // printed above it is where the form puts its rows, which is what this guard exists not
    // to rest on.
    const whole = ['SHIPPER EIN / TAX ID:', '', 'CONSIGNEE EORI / USCI / VAT:', '']
    expect(titlesPartyBlock(whole, 'SHIPPER')).toBe(false)
    expect(titlesPartyBlock(whole, 'CONSIGNEE')).toBe(false)

    const split = ['SHIPPER', 'EIN', '/', 'TAX', 'ID:', 'CONSIGNEE', 'EORI', '/', 'USCI', '/', 'VAT:']
    expect(titlesPartyBlock(split, 'SHIPPER')).toBe(false)
    expect(titlesPartyBlock(split, 'CONSIGNEE')).toBe(false)

    // The band itself still reads as the band.
    expect(titlesPartyBlock(['SHIPPER (SHIP FROM / EXPORTER)'], 'SHIPPER')).toBe(true)
    expect(titlesPartyBlock(['CONSIGNEE (SHIP TO)'], 'CONSIGNEE')).toBe(true)
  })

  it('leaves the address blocks empty rather than folding two into one', () => {
    // The band is located on SHIPPER and CONSIGNEE alone, so an extractor that split the
    // BILL TO heading across items still found it — and every bill-to address item then
    // folded into the consignee's cell, putting a wrong address in CONSIGNED TO with
    // nothing said. Three columns or none.
    expect(isPartyTitle('BILL TO / SOLD TO (IF DIFFERENT)', 'BILL TO')).toBe(true)
    expect(isPartyTitle('SOLD TO (IF DIFFERENT)', 'BILL TO')).toBe(false)
  })

  it('keeps an empty consignee from shifting the bill-to into its column', async () => {
    const spec = { ...simpleOmronCi(), consigneeName: '', consigneeLines: [], billToName: 'Billing Party LLC' }
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    expect(parsed.headers.FC.consignedTo.name).toBe('')
    expect(parsed.headers.FC.soldTo.name).toBe('Billing Party LLC')
  })

  it('heals a header label the extractor split, rather than folding it into the value beside it', async () => {
    // `INVOICE DATE:` drawn as two items is two ordinary cells, so it ran on to the end of
    // the invoice number — which goes to the SLI, the keying sheet reference and the output
    // filename — and the date was never found at all.
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf({ ...simpleOmronCi(), splitHeaderLabel: true }))
    expect(parsed.headers.FC.invoiceNumber).toBe('CI-2026-0001')
    expect(parsed.headers.FC.invoiceDate).toBe('08/10/2026')
  })

  it('does not read a column name printed in an address or a value as a heading row', async () => {
    // The heading test ran over the whole header region, so any row carrying a bare column
    // name was dropped entire and in silence: `AMOUNT`, `QTY`, `UOM`, `COO` and `LN` are all
    // ordinary words. Only rows inside the heading band are headings.
    const parsed = await parseCipl(
      'ci.pdf',
      await buildOmronCiPdf({
        ...simpleOmronCi(),
        splitValues: true,
        freightCharges: 'PREPAID AMOUNT AGREED',
        consigneeName: 'Amount Tower Logistics',
        consigneeLines: ['1 Harbour Way', 'Singapore 018989'],
      }),
    )
    // `freightTerms` is normalised to the term itself; the point here is that the row
    // survived at all, which the carrier beside it and the address below it evidence.
    expect(parsed.headers.FC.freightTerms).toBe('PREPAID')
    expect(parsed.headers.FC.vesselAgent).toBe('Nippon Express')
    expect(parsed.headers.FC.consignedTo.name).toBe('Amount Tower Logistics')
    expect(parsed.lines).toHaveLength(2)
  })

  it('does not read an address word as one of the four labels that are ordinary words', async () => {
    // `PAGE`, `DATE`, `SIGNATURE` and `INCOTERMS` are labels on this form and words
    // everywhere else. Split into items, `3000 Page Mill Road` offered `Page` as a label,
    // which ended the address band on the consignee's own street: all three blocks empty,
    // nothing said. The form prints its labels with a colon and no value word carries one.
    const parsed = await parseCipl(
      'ci.pdf',
      await buildOmronCiPdf({
        ...simpleOmronCi(),
        splitValues: true,
        carrier: 'Page Aviation',
        consigneeName: 'Date Palm Freight Pte. Ltd.',
        consigneeLines: ['3000 Page Mill Road', 'Singapore 018989'],
      }),
    )
    expect(parsed.headers.FC.vesselAgent).toBe('Page Aviation')
    expect(parsed.headers.FC.consignedTo.name).toBe('Date Palm Freight Pte. Ltd.')
    expect(parsed.headers.FC.consignedTo.lines).toContain('3000 Page Mill Road')
    // And the labels themselves still read, colon and all.
    expect(parsed.headers.FC.incoterm).toBe('DAP Singapore')
  })

  it('bounds the address band by the commodity table when no label follows it', async () => {
    // The band ran to the first header-grid label below it and collapsed onto itself when
    // there was none, so no row was column-mapped and `readParties` read cells 0, 1 and 2
    // of every remaining row — the synthesized commodity headings among them — as shipper,
    // consignee and bill-to. That a header grid always sits below the addresses is the
    // print order this search is written not to rest on.
    const parsed = await parseCipl(
      'ci.pdf',
      await buildOmronCiPdf({ ...simpleOmronCi(), omitHeaderGrid: true }),
    )
    expect(parsed.headers.FC.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(parsed.headers.FC.consignedTo.lines).toEqual(['1 Harbour Way', 'Singapore 018989', 'Singapore'])
    expect(parsed.headers.FC.consignedTo.lines.join(' ')).not.toContain('PART #')
    // The goods still read; only the header fields are gone with the grid.
    expect(parsed.lines).toHaveLength(2)
  })

  it('does not let a totals cell swallow the header label it is a prefix of', async () => {
    // `FREIGHT` delimits the totals band and is also the first word of `FREIGHT CHARGES:`.
    // Matching the first item that hits anything stopped at the totals cell, so the label
    // was never reassembled: `freightTerms` came back null and a PREPAID invoice would be
    // filed as COLLECT. The longest match wins instead.
    const parsed = await parseCipl(
      'ci.pdf',
      await buildOmronCiPdf({ ...simpleOmronCi(), splitValues: true, splitHeaderLabel: true }),
    )
    expect(parsed.headers.FC.freightTerms).toBe('PREPAID')
    expect(parsed.headers.FC.invoiceNumber).toBe('CI-2026-0001')
    expect(parsed.headers.FC.incoterm).toBe('DAP Singapore')
  })

  it('does not end the address band on a consignee whose name contains a totals word', async () => {
    // The band ends at the first row carrying a header-grid label. Counting a split label
    // there is right; counting the cells that delimit the *totals* band is not — they are
    // ordinary words, and a forwarder named `NIPPON EXPRESS FREIGHT KK`, split into word
    // items, ended the band on its own first line. Every address in the consignment then
    // came back empty.
    const parsed = await parseCipl(
      'ci.pdf',
      await buildOmronCiPdf({
        ...simpleOmronCi(),
        splitValues: true,
        consigneeName: 'NIPPON EXPRESS FREIGHT KK',
        consigneeLines: ['1 Harbour Way', 'Singapore 018989'],
      }),
    )
    expect(parsed.headers.FC.consignedTo.name).toBe('NIPPON EXPRESS FREIGHT KK')
    expect(parsed.headers.FC.consignedTo.lines).toContain('1 Harbour Way')
    expect(parsed.headers.FC.shippedFrom).toContain('Omron')
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

  it('says so when the same page is imported twice, rather than filing its goods twice', async () => {
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdfPages([simpleOmronCi(), simpleOmronCi()]))
    expect(parsed.warnings.some((w) => /same PAGE number/.test(w))).toBe(true)
    // And the grand total each page repeats is what the rows are proved against, so the
    // doubled list does not reconcile.
    expect(parsed.headers.FC.totalValue).toBeCloseTo(190, 2)
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

describe('an invoice longer than one page', () => {
  /** Sixteen lines dealt across two pages of eight, the way the form is actually issued. */
  const twoPages = (overrides: Partial<OmronCiSpec> = {}): OmronCiSpec[] => {
    const base: OmronCiSpec = {
      ...simpleOmronCi(),
      ...overrides,
      lines: Array.from({ length: 16 }, (_, i) => ({
        partNumber: `P-${i + 1}`,
        description: `Part ${i + 1}`,
        coo: i % 2 ? 'US' : 'CN',
        hts: '8544.42.0000',
        eccn: 'EAR99',
        license: 'NLR',
        sme: 'N',
        quantity: 1,
        uom: 'EA',
        unitPrice: 10 + i,
      })),
    }
    return omronCiPageSpecs(base, 8)
  }

  it('reads every page’s lines, numbered and attributed to the page they came from', () => {
    const parsed = parsePages(twoPages())
    expect(parsed.pageCount).toBe(2)
    expect(parsed.lines).toHaveLength(16)
    expect(parsed.lines.map((l) => l.lineNumber)).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)))
    expect(parsed.lines.map((l) => l.page)).toEqual([...Array(8).fill(1), ...Array(8).fill(2)])
    expect(parsed.lines[15]).toMatchObject({ partNumber: 'P-16', countryOfOrigin: 'US' })
  })

  it('gives every line its own id, even when the pages number their lines the same way', () => {
    // Nothing on the form makes line numbers run on across its pages. Two lines sharing an
    // id are one line to everything downstream that joins, groups or overrides by it.
    const pages = twoPages().map((spec) => ({ ...spec, firstLineNumber: 1 }))
    const ids = parsePages(pages).lines.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('totals the whole document, not the page it happened to start on', () => {
    const parsed = parsePages(twoPages())
    const stated = parsed.headers.FC.totalValue
    const rows = parsed.lines.reduce((sum, line) => sum + (line.extendedValue ?? 0), 0)
    expect(stated).toBeCloseTo(rows, 2)
    // 16 lines at 10, 11, … 25 — proved against the arithmetic, not against itself.
    expect(stated).toBeCloseTo(280, 2)
  })

  it('takes the document-level figures from the pages that state them, never their sum', () => {
    // Pieces and weights are printed on every page and describe the shipment once. Summed,
    // a two-page invoice would declare twice the freight it is.
    const header = parsePages(twoPages({ pieces: 2, netWeightKg: 3.2, grossWeightKg: 4.1 })).headers.FC
    expect(header.cartons).toBe(2)
    expect(header.totalNetWeightKg).toBeCloseTo(3.2, 3)
    expect(header.totalGrossWeightKg).toBeCloseTo(4.1, 3)
  })

  it('reconciles a multi-page shipment with nothing to report', () => {
    const parsed = parsePages(twoPages())
    const result = reconcile(parsed, null, {
      ...BLANK_CONTROLS,
      unitWeightsByPart: Object.fromEntries(parsed.lines.map((l) => [l.partNumber, 0.1])),
    })
    expect(result.checks.find((c) => c.id === 'total-value')).toMatchObject({ passed: true })
    expect(parsed.warnings.filter((w) => !w.includes('per-line weights'))).toEqual([])
  })

  it('holds the shipment when a page of it was not imported', () => {
    // The whole point of the two checks. A short commodity list that looks complete is the
    // one failure this reader must not produce, so the page box says it out loud and the
    // document's own grand total makes the blocking check fail.
    const [first] = twoPages()
    const parsed = parsePages([first])
    expect(parsed.warnings.some((w) => /states it is 2 page\(s\), but 1 were read/.test(w))).toBe(true)
    expect(parsed.warnings.some((w) => /page of this invoice is missing/.test(w))).toBe(true)

    const result = reconcile(parsed, null, { ...BLANK_CONTROLS })
    const check = result.checks.find((c) => c.id === 'total-value')!
    expect(check).toMatchObject({ passed: false, severity: 'blocking' })
    expect(check.expected).toBe('280.00')
    expect(check.actual).toBe('108.00')
  })

  it('refuses to read pages of two different invoices as one shipment', () => {
    const [first, second] = twoPages()
    const parsed = parsePages([first, { ...second, invoiceNumber: 'CI-2026-0009' }])
    expect(parsed.warnings.some((w) => /more than one invoice number/.test(w))).toBe(true)
  })

  it('says so when the pages disagree about how many there are', () => {
    const [first, second] = twoPages()
    const parsed = parsePages([first, { ...second, page: { at: 2, of: 3 } }])
    expect(parsed.warnings.some((w) => /do not belong to one document/.test(w))).toBe(true)
  })

  it('names the page a warning came from', () => {
    const [first, second] = twoPages()
    const parsed = parsePages([first, { ...second, omitSubtotal: true }])
    expect(parsed.warnings.some((w) => w.startsWith('Page 2: No subtotal'))).toBe(true)
  })

  it('reads the header from a page that states it when the first page does not', () => {
    const [first, second] = twoPages()
    const stripped = omronCiGrid(first).map((row) => (row.some((c) => c === 'CARRIER / AGENT:') ? [] : row))
    const parsed = parseOmronCiPages('ci.xlsx', [stripped, omronCiGrid(second)])
    expect(parsed.headers.FC.vesselAgent).toBe('Nippon Express')
  })

  it('reads the addresses from a later page when the first page’s band is unreadable', () => {
    const [first, second] = twoPages()
    const blinded = omronCiGrid(first).map((row) =>
      row.some((c) => c.startsWith('SHIPPER (') || c.startsWith('CONSIGNEE (')) ? [] : row,
    )
    const parsed = parseOmronCiPages('ci.xlsx', [blinded, omronCiGrid(second)])
    expect(parsed.headers.FC.consignedTo.name).toBe('Example Consignee Pte. Ltd.')
    expect(parsed.warnings.some((w) => /could not be read/.test(w))).toBe(false)
  })

  it('says the addresses could not be read only when no page could read them', () => {
    const blinded = twoPages().map((spec) =>
      omronCiGrid(spec).map((row) => (row.some((c) => c.startsWith('SHIPPER (') || c.startsWith('CONSIGNEE (')) ? [] : row)),
    )
    const parsed = parseOmronCiPages('ci.xlsx', blinded)
    expect(parsed.warnings.filter((w) => /could not be read/.test(w))).toHaveLength(1)
  })

  it('reads the printed pages of a multi-page PDF the same way', async () => {
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdfPages(twoPages()))
    expect(parsed.pageCount).toBe(2)
    expect(parsed.lines).toHaveLength(16)
    expect(parsed.lines.map((l) => l.page)).toEqual([...Array(8).fill(1), ...Array(8).fill(2)])
    expect(parsed.lines[8]).toMatchObject({ partNumber: 'P-9', description: 'Part 9' })
    expect(parsed.headers.FC.totalValue).toBeCloseTo(280, 2)
    expect(parsed.warnings.filter((w) => !w.includes('per-line weights'))).toEqual([])
  })

  it('reads every page of a multi-sheet workbook through the file entry point', async () => {
    const bytes = buildXlsx(
      twoPages().map((spec, i) => ({ name: `P${i + 1}`, rows: omronCiGrid(spec) })),
    )
    const parsed = await parseCiplFile('ci.xlsx', bytes)
    expect(parsed.pageCount).toBe(2)
    expect(parsed.lines).toHaveLength(16)
    expect(parsed.headers.FC.totalValue).toBeCloseTo(280, 2)
  })

  it('reads the form’s pages past a cover sheet that is not one of them', async () => {
    const bytes = buildXlsx([
      { name: 'Cover', rows: [['Doc. # 00004-00202 Rev. C'], ['Revision history']] },
      ...twoPages().map((spec, i) => ({ name: `P${i + 1}`, rows: omronCiGrid(spec) })),
    ])
    const parsed = await parseCiplFile('ci.xlsx', bytes)
    expect(parsed.pageCount).toBe(2)
    expect(parsed.lines).toHaveLength(16)
  })
})

describe('the totals band', () => {
  it('takes the merchandise total out of the grand total, leaving tax and freight behind', () => {
    // Reconciling the commodity rows against a total that includes tax and freight would
    // fail every invoice carrying either.
    const header = parseGrid({ ...simpleOmronCi(), tax: 12.5, freight: 40 }).headers.FC
    expect(header.totalValue).toBeCloseTo(190, 2)
  })

  it('does the same from a print, where the tax cell sits beside the net weight', async () => {
    // `TAX` prints to the right of `NET WT (KG)`. Read as the rightmost number on its row,
    // an empty tax cell hands back 3.2 kg as an amount of money.
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf({ ...simpleOmronCi(), netWeightKg: 3.2 }))
    expect(parsed.headers.FC.totalValue).toBeCloseTo(190, 2)
    expect(parsed.headers.FC.totalNetWeightKg).toBeCloseTo(3.2, 3)
  })

  it('reports a subtotal that disagrees with the invoice’s own total', () => {
    const parsed = parseGrid({ ...simpleOmronCi(), grandTotal: 250 })
    expect(parsed.warnings.some((w) => /subtotals add to 190.00, but the invoice/.test(w))).toBe(true)
    // The document's statement about itself wins: the rows are proved against it and fail.
    expect(parsed.headers.FC.totalValue).toBeCloseTo(250, 2)
  })

  it('falls back to the page subtotals when no grand total is printed', () => {
    const grid = omronCiGrid(simpleOmronCi())
    grid.find((r) => r.some((c) => c === 'TOTAL (USD)'))![10] = ''
    expect(parseOmronCiWorkbook('ci.xlsx', grid).headers.FC.totalValue).toBeCloseTo(190, 2)
  })
})
