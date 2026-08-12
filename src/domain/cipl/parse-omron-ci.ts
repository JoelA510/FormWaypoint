/**
 * Parser for the in-house Commercial Invoice form, doc 00004-00202.
 *
 * Unlike the vendor layouts this is not somebody's ERP print — it is the fixed grid this
 * project's own Shipping Authorization workflow produces, filled in by hand. That changes
 * what parsing means in two ways:
 *
 *  1. **The workbook is the primary source.** The form is kept as .xlsx, so the cells can
 *     be read directly instead of reconstructed from PDF geometry. A PDF printed from the
 *     workbook is also accepted, parsed from its text layer the same way the vendor
 *     layouts are.
 *  2. **It states the export-control triplet per line.** Every commodity line carries COO,
 *     HTS/Schedule B, ECCN (or EAR99), license (or NLR) and SME — the values the other
 *     layouts leave to the blanket settings. Stated values are authoritative and flow
 *     through `SourceLine.eccn` / `.license` / `.sme`.
 *
 * Invoice only: there is no packing list, and no per-line weights, so `providesWeights` is
 * false and box 26 comes from the saved per-part table exactly as it does for `vendor-b`.
 *
 * Both readers are label-driven, not coordinate-driven. The form is a controlled document,
 * but anchoring on the printed labels ("INVOICE #:", "PART #", …) means an extra inserted
 * row or a column nudged in a future revision moves nothing.
 */
import type { ParsedCipl, PartyAddress, ShipmentHeader, SourceLine } from '../types'
import type { SheetRows } from '../item-library/read-workbook'
import { roundTo } from '../reconcile/lines'
import { parseNumber, rowText, type TextItem, type TextPage, type TextRow } from './extract-text'

/** The document number printed in the title bar; the strongest possible detector. */
const DOC_NUMBER = '00004-00202'

/**
 * Every label the header grid can carry, uppercased, colon stripped. A cell matching one
 * of these is a label; the cell after it (in the same row) is its value — unless that cell
 * is itself a label, which is what an empty value looks like on this grid.
 */
const HEADER_LABELS = new Set([
  'INVOICE #',
  'INVOICE DATE',
  'PURCHASE ORDER #',
  'SHIP DATE',
  'SHIP REFERENCE',
  'AIR WAYBILL / TRACKING #',
  'CARRIER / AGENT',
  'FREIGHT CHARGES',
  'SERVICE / SHIP METHOD',
  'G/L ACCT. #',
  'CONSIGNEE EORI / USCI / VAT',
  'SHIPPER EIN / TAX ID',
  'INCOTERMS',
  'PAGE',
  '# OF PIECES',
  'NET WT (KG)',
  'GROSS WT (KG)',
  'DIMS / VOLUME',
  'NAME / TITLE',
  'SIGNATURE',
  'DATE',
])

const normalizeLabel = (text: string): string => text.replace(/:\s*$/, '').trim().toUpperCase()
const isLabel = (text: string): boolean => HEADER_LABELS.has(normalizeLabel(text))

/**
 * Whether a cell titles one of the three address blocks, as opposed to a header-grid label
 * that merely begins with the same word.
 *
 * `SHIPPER EIN / TAX ID:` and `CONSIGNEE EORI / USCI / VAT:` sit on one row of the header
 * grid, and between them they satisfy "a cell starting SHIPPER and a cell starting
 * CONSIGNEE" exactly as the address band does. Finding the band first is a property of the
 * present layout, not of the search — put the grid above the addresses and all three
 * blocks would parse empty, with no warning to say why.
 *
 * Exported so that separation can be asserted against the form's real label list rather
 * than left resting on the order the rows happen to be printed in.
 */
export const isPartyTitle = (text: string, block: PartyBlock): boolean =>
  !isLabel(text) && text.trim().toUpperCase().startsWith(block)

/** The three address blocks the band titles, in the order the form prints them. */
const PARTY_BLOCKS = ['SHIPPER', 'CONSIGNEE', 'BILL TO'] as const
type PartyBlock = (typeof PARTY_BLOCKS)[number]

/**
 * The commodity table's columns in printed order: the top row of each two-row block, and
 * the compliance row beneath it. The single source for the heading text — the detector,
 * the workbook column lookups, the PDF anchor calibration and the synthesized canonical
 * heading rows all derive from it, so a renamed column is a one-line change here.
 */
const TOP_COLUMNS = {
  ln: 'LN',
  part: 'PART #',
  description: 'DESCRIPTION OF GOODS',
  qty: 'QTY',
  uom: 'UOM',
  unitPrice: 'UNIT PRICE',
  amount: 'AMOUNT',
} as const
const SUB_COLUMNS = {
  coo: 'COO',
  hts: 'HTS / SCHEDULE B',
  eccn: 'ECCN / EAR99',
  license: 'LICENSE / NLR',
  sme: 'SME (Y/N)',
} as const
const TABLE_HEADINGS = new Set<string>([...Object.values(TOP_COLUMNS), ...Object.values(SUB_COLUMNS)])

/**
 * How far below the top heading row the compliance heading row may sit.
 *
 * It exists because omitted rows are padded rather than closed up: the indices stay true,
 * and a gap the writer left is a gap the reader sees. Small on purpose — past a few rows,
 * what follows is not the other half of the heading.
 */
const MAX_HEADING_GAP = 3

// ---------------------------------------------------------------------------
// Workbook (.xlsx) reader — the primary path
// ---------------------------------------------------------------------------

/**
 * True when this sheet is the 00004-00202 Commercial Invoice grid itself.
 *
 * The doc number alone is not enough: a controlled workbook's cover or revision-history
 * tab cites the same number, and matching it would shadow the real form sheet behind it.
 * The commodity-table headings are what only the form carries.
 */
export function isOmronCiWorkbook(rows: SheetRows): boolean {
  return (
    rows.some((row) => row.some((cell) => cell.includes(DOC_NUMBER))) &&
    rows.some((row) => headingAt(row, TOP_COLUMNS.part) >= 0) &&
    rows.some((row) => headingAt(row, SUB_COLUMNS.coo) >= 0)
  )
}

/**
 * Where a heading sits in a row, or -1.
 *
 * Compared without case or surrounding space, like every other label on this form and like
 * the whole of the PDF path. Matched exactly, a title-cased revision of the workbook was
 * refused as "not the Commercial Invoice form" while its own printed PDF parsed cleanly —
 * two answers about one document, decided by the shift key.
 */
function headingAt(row: string[], heading: string): number {
  return row.findIndex((cell) => cell.trim().toUpperCase() === heading)
}

export function parseOmronCiWorkbook(
  fileName: string,
  rows: SheetRows,
  /**
   * Whether these rows came from a workbook rather than from the reshaped PDF.
   *
   * Two things follow from it. A workbook writer that omits rows with no content collapses
   * an empty compliance row away and shifts every following block, which the PDF path
   * cannot do — it synthesizes exactly one compliance row per block, and looking for a
   * collapsed one there misreads that row's own first cell. And a workbook's cells sit in
   * their real columns, so the totals band can be read from the AMOUNT column; the PDF's
   * rows are rebuilt from drawn text and only the commodity blocks are column-aligned.
   */
  fromWorkbook = true,
): ParsedCipl {
  const warnings: string[] = []

  // Header grid: first value found for each label anywhere on the sheet. The instructions
  // block below the print area repeats no labels, so first occurrence is the form's cell.
  const fields = new Map<string, string>()
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (!row[i] || !isLabel(row[i])) continue
      const key = normalizeLabel(row[i])
      if (fields.has(key)) continue
      const value = valueAfter(row, i)
      if (value) fields.set(key, value)
    }
  }
  const field = (label: string): string => fields.get(label) ?? ''

  const parties = readParties(rows, warnings)
  const lines = readLines(rows, field('PURCHASE ORDER #'), field('INVOICE #'), warnings, fromWorkbook)

  const subtotal = amountOnRow(rows, 'SUBTOTAL', fromWorkbook ? amountColumnIn(rows) : -1)
  if (subtotal == null) {
    warnings.push(
      'No subtotal could be read from this invoice, so the commodity values cannot be proved against the ' +
        'document. If the workbook was generated rather than saved from Excel, its formulas may have no ' +
        'cached results — open it in Excel, save, and import again.',
    )
  }

  const header = buildHeader(field, parties, lines, subtotal)

  warnings.push(
    'This form states no per-line weights. Box 26 must be supplied from the saved per-part weights or entered by hand.',
  )

  return {
    fileName,
    format: 'omron-ci',
    providesWeights: false,
    pageCount: 1,
    availableSets: ['FC'],
    headers: { FC: header },
    lines,
    warnings,
  }
}

/**
 * The value cell for the label at `index`: the next non-empty cell to the right, unless
 * that cell is itself a label — the grid's way of spelling an empty value.
 */
function valueAfter(row: string[], index: number): string {
  for (let i = index + 1; i < row.length; i++) {
    if (!row[i]) continue
    return isLabel(row[i]) ? '' : row[i]
  }
  return ''
}

/**
 * The three address blocks: SHIPPER | CONSIGNEE | BILL TO / SOLD TO.
 *
 * Anchored on the band row that titles them; each block's column is the title's column,
 * and its lines are whatever the following rows hold in that column, until the header grid
 * starts (its first row carries the INVOICE # label).
 */
function readParties(
  rows: SheetRows,
  warnings: string[],
): { shipper: PartyAddress; consignee: PartyAddress; billTo: PartyAddress } {
  const empty = (): PartyAddress => ({ name: '', lines: [], country: null })
  const bandIndex = rows.findIndex(
    (row) => row.some((c) => isPartyTitle(c, 'SHIPPER')) && row.some((c) => isPartyTitle(c, 'CONSIGNEE')),
  )
  // Said out loud. The addresses are the one part of this form nothing downstream demands —
  // the SLI will fill its consignee box with whatever is there, including nothing — so a
  // band that could not be read has to report itself or it reads as a blank form.
  const unreadable = () => {
    warnings.push(
      'The shipper, consignee and bill-to blocks could not be read from this document. Enter the consignee by ' +
        'hand, and check the addresses on the generated form against the invoice before signing.',
    )
    return { shipper: empty(), consignee: empty(), billTo: empty() }
  }
  if (bandIndex === -1) return unreadable()

  const band = rows[bandIndex]
  const columns = {
    shipper: band.findIndex((c) => isPartyTitle(c, 'SHIPPER')),
    consignee: band.findIndex((c) => isPartyTitle(c, 'CONSIGNEE')),
    billTo: band.findIndex((c) => isPartyTitle(c, 'BILL TO')),
  }

  const collected: Record<'shipper' | 'consignee' | 'billTo', string[]> = { shipper: [], consignee: [], billTo: [] }
  for (let r = bandIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.some((c) => isLabel(c))) break
    for (const key of ['shipper', 'consignee', 'billTo'] as const) {
      const column = columns[key]
      const cell = column >= 0 ? (row[column] ?? '').trim() : ''
      if (cell) collected[key].push(cell)
    }
  }

  const toParty = (lines: string[]): PartyAddress => {
    const [name = '', ...rest] = lines
    return { name, lines: rest, country: null }
  }
  // The band was found and still yielded nothing — on the PDF path, a band whose three
  // titles could not all be located, which `partyRow` declines to map rather than guess at.
  if (!collected.shipper.length && !collected.consignee.length && !collected.billTo.length) return unreadable()
  return { shipper: toParty(collected.shipper), consignee: toParty(collected.consignee), billTo: toParty(collected.billTo) }
}

/**
 * The two-row commodity blocks, located and column-mapped from their own headings.
 *
 * A block whose part, description and quantity are all blank is an unused line on the
 * form, not data. A block that is only partly filled is kept — the reconciliation is
 * where an incomplete line gets held, with the person who can fix it looking at it.
 */
function readLines(
  rows: SheetRows,
  purchaseOrder: string,
  invoiceNumber: string,
  warnings: string[],
  fromWorkbook: boolean,
): SourceLine[] {
  const headIndex = rows.findIndex(
    (row) => headingAt(row, TOP_COLUMNS.part) >= 0 && headingAt(row, TOP_COLUMNS.qty) >= 0,
  )
  // Searched for rather than assumed adjacent. The workbook reader honours each row's own
  // `r` index and pads an omitted row with a blank one, so a heading pair that reads as two
  // consecutive rows in Excel can arrive with a gap between them — and assuming `+1` left
  // the sheet claimed as the form while no line at all was read from it.
  let subIndex = -1
  for (let i = headIndex + 1; headIndex !== -1 && i < Math.min(rows.length, headIndex + 1 + MAX_HEADING_GAP); i++) {
    if (headingAt(rows[i], SUB_COLUMNS.coo) >= 0) {
      subIndex = i
      break
    }
  }
  const subRow = subIndex === -1 ? undefined : rows[subIndex]
  if (headIndex === -1 || !subRow) {
    warnings.push('The commodity table headings were not found; no lines were read.')
    return []
  }

  const head = rows[headIndex]
  const sub = subRow
  const columns = {
    ...(Object.fromEntries(
      Object.entries(TOP_COLUMNS).map(([key, heading]) => [key, headingAt(head, heading)]),
    ) as Record<keyof typeof TOP_COLUMNS, number>),
    ...(Object.fromEntries(
      Object.entries(SUB_COLUMNS).map(([key, heading]) => [key, headingAt(sub, heading)]),
    ) as Record<keyof typeof SUB_COLUMNS, number>),
  }

  // The loop below walks the table by its LN column, so without it every row reads as "not
  // a line number" and the table ends before its first block. Said out loud rather than
  // returned as an empty list: no lines and no warning is indistinguishable from a blank
  // form, and this one is a form whose heading row moved.
  if (columns.ln < 0) {
    warnings.push(`The commodity table has no "${TOP_COLUMNS.ln}" column, so no lines could be read.`)
    return []
  }

  const isLineNumber = (cell: string): boolean => {
    const value = parseNumber(cell)
    return value != null && Number.isInteger(value) && value >= 1
  }

  const isBlankRow = (row: string[]): boolean => row.every((c) => !c.trim())

  const lines: SourceLine[] = []
  // The row the table stopped at, where it stopped at one. Left unset where the rows simply
  // ran out, which is not an early end and has nothing to report.
  let endedAt: string[] | undefined
  for (let r = subIndex + 1; r < rows.length; ) {
    const top = rows[r]
    // A row the writer left out entirely. Padding the gap keeps every row's index true,
    // which is what the workbook reader now does — so a blank row can sit *inside* the
    // table, and reading it as the end of the table dropped every line below it without a
    // word. Skipped however many there are: the table ends at its totals band, or at a row
    // that carries something and is not a line, and a count of blank rows was an arbitrary
    // third rule that dropped lines below a long gap on one template and cried truncation
    // on every ordinary import of another.
    if (isBlankRow(top)) {
      r += 1
      continue
    }

    const lineNumber = parseNumber(top[columns.ln] ?? '')
    // The table ends at the first row that carries something and is not a line (the totals
    // band, or the instructions printed below the form).
    if (lineNumber == null || !Number.isInteger(lineNumber) || lineNumber < 1) {
      endedAt = top
      break
    }

    let bottom = rows[r + 1] ?? []
    let stride = 2
    // If the next row starts its own block, or is the totals band, this block's compliance
    // row was collapsed away (a writer that omits rows with no content). Read it as empty
    // and resync, rather than letting the stride mis-pair every following block's
    // export-control cells — or, on the last block, reading the totals band as one.
    //
    // The totals band currently holds nothing in the compliance columns, so reading it
    // yields blanks either way; that is a coincidence of the present layout and not
    // something to rest a customs classification on. A future revision that put anything
    // in those cells would file it as a country of origin.
    //
    // Only where a row can actually be missing. On the PDF path the compliance row's first
    // cell is the country of origin, not an LN — a numeric country code read as a line
    // number there, throwing away the line's whole export-control row and filing the
    // compliance row again as goods of its own.
    if ((fromWorkbook && isLineNumber(bottom[columns.ln] ?? '')) || isTotalsRow(bottom)) {
      bottom = []
      stride = 1
    }

    const cell = (row: string[], column: number): string => (column >= 0 ? (row[column] ?? '').trim() : '')
    const partNumber = cell(top, columns.part)
    const description = cell(top, columns.description)
    const quantity = parseNumber(cell(top, columns.qty))
    if (!partNumber && !description && quantity == null) {
      r += stride
      continue
    }

    const unitValue = parseNumber(cell(top, columns.unitPrice))
    // Prefer the sheet's own cached AMOUNT; fall back to the arithmetic when the cell has
    // no cached result (a workbook written by a tool that does not evaluate formulas).
    const extendedValue =
      parseNumber(cell(top, columns.amount)) ?? (quantity != null && unitValue != null ? roundTo(quantity * unitValue, 2) : undefined)

    const eccn = cell(bottom, columns.eccn)
    const license = cell(bottom, columns.license)
    const sme = cell(bottom, columns.sme)

    lines.push({
      id: ['FC', 'INV', invoiceNumber || 'CI', String(lineNumber), partNumber].join(':'),
      documentSet: 'FC',
      documentKind: 'INVOICE',
      page: 1,
      // The form's PO # is the customer's purchase order — the same thing `vendor-a`
      // prints in this position — so no separate `purchaseOrder` field is needed.
      orderNumber: purchaseOrder,
      sequence: String(lineNumber),
      lineNumber: String(lineNumber),
      itemId: '',
      partNumber,
      model: '',
      description,
      commodityGroup: '',
      countryOfOrigin: cell(bottom, columns.coo),
      classification: cell(bottom, columns.hts),
      ...(eccn ? { eccn } : {}),
      ...(license ? { license } : {}),
      ...(sme ? { sme } : {}),
      quantity: quantity ?? 0,
      uom: cell(top, columns.uom),
      // The form is denominated in US dollars — its total row is printed "TOTAL (USD)".
      currency: 'USD',
      ...(unitValue != null ? { unitValue } : {}),
      ...(extendedValue != null ? { extendedValue } : {}),
    })
    r += stride
  }
  // An early end is reported. The table stops at its totals band; anything else means the
  // rows below the stopping point were not read, and a short commodity list that looks
  // complete is the one failure this reader must not produce silently.
  if (endedAt !== undefined && !isTotalsRow(endedAt)) {
    warnings.push(
      `The commodity table ended before its totals band, after ${lines.length} line(s). Any line printed below ` +
        'that point was not read — check the form against what was imported before generating anything.',
    )
  }

  return lines
}

/**
 * A row of the totals band, recognised by its own printed cells.
 *
 * Shared by the workbook reader and the PDF reshaper so both agree on where the commodity
 * table ends. Matched as whole cells, never as substrings of the row — a commodity
 * described as "Warranty replacement - NO CHARGE" is line data.
 */
function isTotalsRow(row: string[]): boolean {
  return row.some((c) => {
    const cell = normalizeLabel(c)
    return cell === 'SUBTOTAL' || cell === 'TOTAL (USD)'
  })
}

/**
 * The amount on the row carrying `label`.
 *
 * Read from the AMOUNT column where the table's headings gave us one, and only from there.
 * Taking the rightmost number on the row instead worked by luck of the present layout: the
 * totals band shares its rows with `# OF PIECES`, `NET WT (KG)` and `GROSS WT (KG)`, and a
 * shifted template — or simply an empty SUBTOTAL cell — would have handed a piece count or
 * a weight to the blocking total-value check, which would then reconcile the shipment
 * against it instead of failing.
 *
 * Without the column the rightmost number is still the fallback; the caller warns when no
 * subtotal could be read at all, and that is the honest outcome of a table nobody could
 * calibrate.
 */
function amountOnRow(rows: SheetRows, label: string, amountColumn: number): number | null {
  const row = rows.find((r) => r.some((c) => normalizeLabel(c) === label))
  if (!row) return null
  if (amountColumn >= 0) return parseNumber(row[amountColumn] ?? '')
  for (let i = row.length - 1; i >= 0; i--) {
    const value = parseNumber(row[i])
    if (value != null) return value
  }
  return null
}

/** Where the AMOUNT column sits, from the commodity table's own heading row, or -1. */
function amountColumnIn(rows: SheetRows): number {
  const head = rows.find(
    (row) => headingAt(row, TOP_COLUMNS.part) >= 0 && headingAt(row, TOP_COLUMNS.qty) >= 0,
  )
  return head ? headingAt(head, TOP_COLUMNS.amount) : -1
}

function buildHeader(
  field: (label: string) => string,
  parties: { shipper: PartyAddress; consignee: PartyAddress; billTo: PartyAddress },
  lines: SourceLine[],
  subtotal: number | null,
): ShipmentHeader {
  const freight = field('FREIGHT CHARGES').toUpperCase()
  return {
    invoiceNumber: field('INVOICE #'),
    invoiceDate: dateText(field('INVOICE DATE')),
    // Left null, though the form does have a SHIP DATE box.
    //
    // `onOrAboutDate` means the *later sailing* date on the vendor layouts, and box 2 of the
    // SLI deliberately takes the invoice date instead — the filed evidence for all three
    // historical shipments. Filling this field from a box that means something else would
    // change the date of exportation on those layouts too, through the one line in
    // `buildDraft` that reads it. Whether this form's own ship date should date the SLI is
    // a question for the people who file them, and it needs its own field to answer.
    onOrAboutDate: null,
    // BILL TO / SOLD TO is only filled in when it differs from the consignee.
    soldTo: parties.billTo.name ? parties.billTo : parties.consignee,
    consignedTo: parties.consignee,
    notifyTo: null,
    shippedFrom: parties.shipper.name || null,
    dischargePort: null,
    vesselAgent: field('CARRIER / AGENT') || null,
    orderNumbers: field('PURCHASE ORDER #') ? [field('PURCHASE ORDER #')] : [],
    // `orderNumbers` already holds the customer's PO for this layout.
    purchaseOrders: [],
    tradeTerms: null,
    incoterm: field('INCOTERMS') || null,
    freightTerms: freight.includes('COLLECT') ? 'COLLECT' : freight.includes('PREPAID') ? 'PREPAID' : null,
    cartons: parseNumber(field('# OF PIECES')),
    // Fixed by the form itself — the totals row is printed "TOTAL (USD)".
    documentCurrency: 'USD',
    // The form prints no quantity total, so this is the sum of the lines and the
    // total-quantity check is self-referential for this format — the same trade
    // `vendor-b` documents make. The value check against the subtotal is the real one.
    totalQuantity: roundTo(
      lines.reduce((sum, line) => sum + line.quantity, 0),
      3,
    ),
    // The SUBTOTAL is the merchandise total the commodity rows must sum to. The grand
    // TOTAL adds tax and freight, which are not commodity value; reconciling against it
    // would fail every invoice that carries either. Zero when unreadable, so the
    // total-value check fails loudly rather than proving the lines against themselves.
    totalValue: subtotal ?? 0,
    totalNetWeightKg: parseNumber(field('NET WT (KG)')),
    totalGrossWeightKg: parseNumber(field('GROSS WT (KG)')),
    totalMeasurementM3: null,
  }
}

/**
 * A date cell as text, converting an Excel serial where the workbook stored one.
 *
 * Typing `8/10/2026` into the form's date cell makes Excel store the number 46244 with a
 * date format, and `readXlsx` reads the raw value — so without this, importing the very
 * workbook the form ships as would put a five-digit number where the review screen
 * expects a date. The range covers 1990–2100; anything outside it is not plausibly a date
 * on a live shipping document and passes through as the text it is.
 */
function dateText(value: string): string {
  if (!/^\d{5}(\.\d+)?$/.test(value)) return value
  const serial = Number(value)
  if (serial < 32874 || serial > 73415) return value
  // Excel's day 1 is 1900-01-01 with the fictitious 1900-02-29 baked in, so the epoch
  // that makes modern serials come out right is 1899-12-30. The fraction is time-of-day
  // (a cell filled from =NOW() carries one) — truncated, never rounded, or an afternoon
  // timestamp would convert to the next calendar day.
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400_000)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getUTCFullYear()}`
}

// ---------------------------------------------------------------------------
// PDF reader — the same form, printed
// ---------------------------------------------------------------------------

export function isOmronCiPdf(pages: TextPage[]): boolean {
  const first = pages[0]
  if (!first) return false
  const text = first.rows.map(rowText).join(' ')
  return text.includes(DOC_NUMBER)
}

/**
 * Reads the printed form back through the same label-driven logic as the workbook.
 *
 * The one genuinely positional problem is the commodity table: its blocks are two rows
 * tall, and the LN / QTY / UOM / price cells are vertically merged, so they can surface at
 * either row's baseline. Columns are therefore calibrated from the table's own printed
 * headings, exactly as the vendor parsers calibrate from theirs, and each block's cells
 * are assigned by column first and by band (top row vs compliance row) only where two
 * columns share an x position.
 */
export function parseOmronCiPdf(fileName: string, pages: TextPage[]): ParsedCipl {
  // The form is a single page by design (its PAGE box is preprinted "1 of 1"), and the
  // geometry below depends on that: PDF y restarts on every page, so a second page's
  // blocks would collide with the first's by baseline and merge into garbage. A
  // multi-page print is a misprint or a layout this parser does not know — refuse it
  // loudly rather than filing a corrupted table.
  if (pages.length > 1) {
    throw new Error(
      `${fileName} has ${pages.length} pages, but the Commercial Invoice form (00004-00202) is a ` +
        'single page. Re-print it to one page, or import the .xlsx workbook instead.',
    )
  }
  const grid = pagesToGrid(pages)
  return parseOmronCiWorkbook(fileName, grid, false)
}

/**
 * How far a printed value may sit from its column heading's x and still belong to it.
 *
 * Used only for cells whose value is centred like its heading (LN, and the compliance and
 * quantity columns). Left-aligned values against centred headings are resolved with column
 * *boundaries* instead — see `tableRowsToBlocks`.
 */
const CENTRED_TOLERANCE = 25
/** The LN column is ~25pt wide, so its centred digits sit within a few points of the heading. */
const LN_TOLERANCE = 8

/**
 * Rebuilds the printed page into the same row/cell grid the workbook reader consumes.
 *
 * Three regions, three treatments. The label/value rows pass through in reading order,
 * which `valueAfter` already handles. The three-column address band is mapped by x, so an
 * empty consignee cannot shift the bill-to into its place. The commodity table is reshaped
 * into the two-rows-per-block layout `readLines` expects, with cells resolved against the
 * table's own printed headings.
 */
function pagesToGrid(pages: TextPage[]): SheetRows {
  const rows = pages.flatMap((page) => page.rows)
  // The vertically merged headings (LN, QTY, …) print centred between the two heading
  // rows, so their baseline can land on either row or on one of their own. Locate the
  // heading band by its fixed members and calibrate each anchor from whichever row in
  // the band carries it.
  const headIndex = rows.findIndex((row) => hasCell(row, TOP_COLUMNS.part))
  const subIndex = rows.findIndex((row, i) => i > headIndex && hasCell(row, SUB_COLUMNS.coo))

  if (headIndex === -1 || subIndex === -1) {
    // No table headings — hand everything over as plain text rows; the header labels
    // still parse, and readLines reports the missing table.
    return rows.map((row) => row.items.map((item) => item.str))
  }

  const band = rows.slice(Math.max(0, headIndex - 1), subIndex + 1)
  const bandX = (text: string): number => {
    for (const row of band) {
      const x = cellX(row, text)
      if (x !== -Infinity) return x
    }
    return -Infinity
  }
  const anchors = Object.fromEntries(
    [...Object.entries(TOP_COLUMNS), ...Object.entries(SUB_COLUMNS)].map(([key, heading]) => [key, bandX(heading)]),
  ) as Anchors

  // Every anchor that actually places a cell has to have been located before any value can
  // be assigned to a column.
  //
  // A heading the extractor split across items yields no anchor, and an unfound anchor is
  // -Infinity: `quantityBorder` then collapses and every cell on the line looks like it
  // belongs to the numeric columns, while values belonging to the missing column fall to
  // whichever heading is nearest. Both produce a plausible-looking table that is wrong, so
  // the table is handed back unreshaped instead — `readLines` reports the missing headings
  // and no line is invented from a grid nobody could calibrate.
  //
  // `part` and `description` are not among them: those two are separated from each other
  // by the border between the COO and HTS columns beneath, so their own headings never
  // position anything. Demanding them refused a table that parses perfectly well with a
  // split DESCRIPTION OF GOODS heading — the same pdfjs behaviour this guard exists for,
  // turned against a document it should have read.
  const PLACING_ANCHORS = ['ln', 'qty', 'uom', 'unitPrice', 'amount', 'coo', 'hts', 'eccn', 'license', 'sme'] as const
  const tableCalibrated = PLACING_ANCHORS.every((key) => Number.isFinite(anchors[key]))

  // Everything between the table headings and the totals band belongs to line blocks.
  // The band is recognised by its own printed cells as *whole* cells, never as substrings
  // of row text — a commodity described as "Warranty replacement - NO CHARGE" is line
  // data, and truncating the table at it would silently drop every following line.
  let tableEnd = rows.length
  for (let i = subIndex + 1; i < rows.length; i++) {
    if (isTotalsRow(rows[i].items.map((item) => item.str))) {
      tableEnd = i
      break
    }
  }

  const partyBand = rows.findIndex(
    (row) =>
      row.items.some((i) => isPartyTitle(i.str, 'SHIPPER')) &&
      row.items.some((i) => isPartyTitle(i.str, 'CONSIGNEE')),
  )
  let partyEnd = partyBand
  if (partyBand !== -1) {
    partyEnd = rows.findIndex((row, i) => i > partyBand && row.items.some((item) => isLabel(item.str)))
    if (partyEnd === -1) partyEnd = partyBand
  }

  // The heading rows are synthesized in canonical order rather than passed through,
  // because the print can split them across baselines in ways `readLines` should not
  // have to know about. The blocks are emitted in the same canonical order.
  const isHeadingRow = (row: TextRow): boolean => row.items.some((item) => TABLE_HEADINGS.has(item.str.toUpperCase()))

  const grid: SheetRows = []
  for (let i = 0; i < subIndex + 1; i++) {
    if (isHeadingRow(rows[i])) continue
    if (partyBand !== -1 && i > partyBand && i < partyEnd) {
      grid.push(partyRow(rows[i], rows[partyBand]))
    } else if (i === partyBand) {
      // Synthesized, not passed through: the extractor can split a printed title into
      // several items, and `readParties` finds its columns by cell position — a split
      // title would shift every address into the wrong column. `partyRow` above already
      // emits exactly three cells, keyed to the same three titles by x.
      grid.push(['SHIPPER (SHIP FROM)', 'CONSIGNEE (SHIP TO)', 'BILL TO / SOLD TO (IF DIFFERENT)'])
    } else {
      grid.push(coalescedRow(rows[i]))
    }
  }
  // The headings and the blocks are emitted only when every column was located.
  //
  // Withholding just these two — rather than bailing out of the whole reshaping — keeps
  // the header fields, the party band and the totals band readable, while leaving
  // `readLines` with no headings to find, so it reports a commodity table it could not
  // read. Emitting them anyway would hand it a grid calibrated against a column that was
  // never found, and it would fill that column from whatever sat nearest.
  if (!tableCalibrated) {
    for (let i = subIndex + 1; i < rows.length; i++) grid.push(coalescedRow(rows[i]))
    return grid
  }

  grid.push([...Object.values(TOP_COLUMNS)], [...Object.values(SUB_COLUMNS)])
  grid.push(...tableRowsToBlocks(rows.slice(subIndex + 1, tableEnd), anchors))
  for (let i = tableEnd; i < rows.length; i++) grid.push(coalescedRow(rows[i]))
  return grid
}

/** Cells that delimit values on the totals band, matched the way the header labels are. */
const TOTALS_CELLS = new Set(['SUBTOTAL', 'TOTAL (USD)', 'TAX', 'FREIGHT'])

/**
 * A label/value row with pdfjs's item splits healed: consecutive non-label items join
 * into one cell, so a value the extractor emitted as two items ('DAP' + 'Singapore')
 * reads back whole instead of `valueAfter` truncating it at the first item.
 */
function coalescedRow(row: TextRow): string[] {
  const cells: string[] = []
  let pending: string[] = []
  const flush = () => {
    if (pending.length) cells.push(pending.join(' '))
    pending = []
  }
  for (const item of row.items) {
    if (isLabel(item.str) || TOTALS_CELLS.has(normalizeLabel(item.str))) {
      flush()
      cells.push(item.str)
    } else {
      pending.push(item.str)
    }
  }
  flush()
  return cells
}

/**
 * An address row mapped onto the three columns of the party band, so the cells line up
 * with the SHIPPER / CONSIGNEE / BILL TO titles the way the workbook's columns do.
 */
function partyRow(row: TextRow, band: TextRow): string[] {
  const titles = band.items
    .filter((item) => PARTY_BLOCKS.some((block) => isPartyTitle(item.str, block)))
    .sort((a, b) => a.x - b.x)
  // Three columns or none. The band is located on SHIPPER and CONSIGNEE alone, so an
  // extractor that split "BILL TO / SOLD TO (IF DIFFERENT)" across items — leaving no item
  // beginning "BILL TO" — still found it, and every bill-to address item then folded into
  // the consignee's cell: a wrong CONSIGNED TO address on the SLI, with nothing said. An
  // address block that cannot be mapped onto the form's three columns is not mapped at all,
  // and `readParties` reports the empty blocks as it does for any band it cannot read.
  if (titles.length !== PARTY_BLOCKS.length) return []
  const cells = titles.map(() => [] as string[])
  for (const item of row.items) {
    // The rightmost title at or left of the item owns it: titles and values are both
    // left-aligned at their column's edge.
    let owner = 0
    for (let t = 0; t < titles.length; t++) if (item.x >= titles[t].x - 4) owner = t
    cells[owner].push(item.str)
  }
  return cells.map((parts) => parts.join(' ').trim())
}

function hasCell(row: TextRow, text: string): boolean {
  return row.items.some((item) => item.str.toUpperCase() === text)
}

function cellX(row: TextRow, text: string): number {
  return row.items.find((item) => item.str.toUpperCase() === text)?.x ?? -Infinity
}

type Anchors = Record<
  'ln' | 'part' | 'description' | 'qty' | 'uom' | 'unitPrice' | 'amount' | 'coo' | 'hts' | 'eccn' | 'license' | 'sme',
  number
>

const isLnCell = (item: TextItem, anchors: Anchors): boolean =>
  Math.abs(item.x - anchors.ln) <= LN_TOLERANCE && /^\d{1,2}$/.test(item.str)

/**
 * Reshapes the printed table region into two grid rows per block, in the same cell order
 * as the pass-through heading rows: `[ln, part, description, qty, uom, unitPrice, amount]`
 * on top and `[coo, hts, eccn, license, sme]` beneath. `readLines` resolves its column
 * indices from those headings, so the two stay aligned by construction.
 *
 * The geometry rules, in order:
 *  - LN, quantity and price cells are vertically merged and centred, so they are matched
 *    to their headings by x alone, at either baseline.
 *  - Part and description values are left-aligned under centred headings, so they are
 *    split at the part/description column boundary rather than by nearest heading. The
 *    boundary is derived from the compliance headings beneath, whose columns share the
 *    same borders.
 *  - Compliance values are centred like their headings, so nearest-heading works.
 *  - Top row vs compliance row is decided by baseline: the block's first (highest) left
 *    baseline is the part/description row. PDF y grows upward.
 */
/**
 * How far two baselines may differ and still be one printed line, in PDF units.
 *
 * Absorbs the fraction of a point a renderer puts between items of one line, and nothing
 * more: the next wrapped line sits a whole font size below, which for this form is several
 * times this figure.
 */
const SAME_BASELINE_TOLERANCE = 2

function tableRowsToBlocks(rows: TextRow[], anchors: Anchors): SheetRows {
  interface Block {
    ln: string
    y: number
    top: Map<string, TextItem[]>
    bottom: Map<string, TextItem[]>
  }

  const blocks: Block[] = []
  for (const row of rows) {
    for (const item of row.items) {
      if (isLnCell(item, anchors)) blocks.push({ ln: item.str, y: item.y, top: new Map(), bottom: new Map() })
    }
  }
  if (!blocks.length) return []

  // Each block owns the vertical span nearest its LN baseline, which is centred in the
  // block. The pitch between consecutive LN cells is the block height.
  const pitch = blocks.length > 1 ? Math.abs(blocks[0].y - blocks[1].y) : 40
  const blockFor = (y: number): Block | null => {
    let best: Block | null = null
    let bestDistance = Infinity
    for (const block of blocks) {
      const distance = Math.abs(block.y - y)
      if (distance < bestDistance) {
        best = block
        bestDistance = distance
      }
    }
    return bestDistance <= pitch * 0.75 ? best : null
  }

  const nearest = (x: number, names: (keyof Anchors)[]): keyof Anchors | null => {
    let best: keyof Anchors | null = null
    let bestDistance = Infinity
    for (const name of names) {
      const distance = Math.abs(x - anchors[name])
      if (distance < bestDistance) {
        best = name
        bestDistance = distance
      }
    }
    return bestDistance <= CENTRED_TOLERANCE * 2 ? best : null
  }

  // Column borders derived from centred headings: COO and HTS are centred in the part and
  // description columns' leftmost cells, so their midpoint is the border between them; the
  // SME/QTY midpoint is the border between the description span and the quantity columns.
  const partDescriptionBorder = (anchors.coo + anchors.hts) / 2
  const quantityBorder = (anchors.sme + anchors.qty) / 2

  // Collect each block's left-region items before classifying them: the compliance row is
  // the block's *lowest* baseline, and that is only knowable once the whole block is in
  // hand. Judging by "below the LN centre" alone would also sweep a wrapped description's
  // second line into the compliance columns and file its tail as an HTS code.
  const leftItems = new Map<Block, TextItem[]>()
  for (const row of rows) {
    for (const item of row.items) {
      if (isLnCell(item, anchors)) continue
      const block = blockFor(item.y)
      if (!block) continue

      // The quantity/price cells are vertically merged, so their baseline is the block's
      // centre — the LN baseline. An item right of the border that is *not* on that
      // baseline is a description overflowing its cell (the extractor can split a long
      // description into word items that spill past the border), and belongs to the left
      // region, not to a numeric column it would corrupt.
      if (item.x >= quantityBorder && Math.abs(item.y - block.y) <= pitch / 8) {
        const column = nearest(item.x, ['qty', 'uom', 'unitPrice', 'amount'])
        if (column) push(block.top, column, item)
        continue
      }
      const bucket = leftItems.get(block)
      if (bucket) bucket.push(item)
      else leftItems.set(block, [item])
    }
  }

  for (const [block, items] of leftItems) {
    // The compliance row's baseline sits half a row below the LN centre (PDF y grows
    // upward), so it is recognised by *position*, not by being the block's lowest text:
    // a wrapped description's overflow lines hang just under the centre — or, wrapped
    // further, below the compliance baseline — and either way they belong to the
    // description, even when the compliance row itself is blank.
    for (const item of items) {
      const isComplianceRow = Math.abs(block.y - item.y - pitch / 4) <= pitch / 8
      if (isComplianceRow) {
        const column = nearest(item.x, ['coo', 'hts', 'eccn', 'license', 'sme'])
        if (column) push(block.bottom, column, item)
      } else {
        push(block.top, item.x < partDescriptionBorder ? 'part' : 'description', item)
      }
    }
  }

  // Reading order is down the page and then across it, not across alone. A description
  // that both wraps to a second printed line and is split into word items — the two
  // behaviours this whole function is written around — was reassembled by x, which
  // interleaves the lines: "Robot assembly cable, 5 m shielded" out of two rows that read
  // "Robot cable assembly," and "5 m shielded". That scrambled string is what gets filed as
  // the commodity description.
  //
  // Grouped into lines and then read across each, rather than sorted by a comparator that
  // mixes the two axes. A tolerance inside a comparator is not an ordering — a can tie with
  // b and b with c while a and c differ — and the tolerance itself has to be small: half a
  // text row, which is what a quarter of the block pitch comes to, would swallow a tightly
  // wrapped description and put its two lines back into one. Items are collected against
  // the highest baseline of the line they join, so a run of small nudges cannot walk a line
  // into the next one.
  const text = (map: Map<string, TextItem[]>, key: string): string => {
    const descending = (map.get(key) ?? []).slice().sort((a, b) => b.y - a.y)
    const rows: TextItem[][] = []
    for (const item of descending) {
      const current = rows[rows.length - 1]
      if (current && current[0].y - item.y <= SAME_BASELINE_TOLERANCE) current.push(item)
      else rows.push([item])
    }
    return rows
      .map((row) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((item) => item.str)
          .join(' '),
      )
      .join(' ')
      .trim()
  }

  return blocks.flatMap((block) => [
    [block.ln, text(block.top, 'part'), text(block.top, 'description'), text(block.top, 'qty'),
      text(block.top, 'uom'), text(block.top, 'unitPrice'), text(block.top, 'amount')],
    [text(block.bottom, 'coo'), text(block.bottom, 'hts'), text(block.bottom, 'eccn'),
      text(block.bottom, 'license'), text(block.bottom, 'sme')],
  ])
}

function push(map: Map<string, TextItem[]>, key: string, item: TextItem): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(item)
  else map.set(key, [item])
}
