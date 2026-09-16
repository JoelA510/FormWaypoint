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
 * A shipment longer than the form's eight line slots runs onto further pages — further
 * sheets in the workbook, further pages in the print — and every one of them repeats the
 * whole header, states its own SUBTOTAL, and numbers itself `2 of 4` in the PAGE box. Each
 * is therefore read as a complete form and the results merged, with that page box and the
 * grand TOTAL used to prove no page went missing on the way in.
 *
 * Both readers are label-driven, not coordinate-driven. The form is a controlled document,
 * but anchoring on the printed labels ("INVOICE #:", "PART #", …) means an extra inserted
 * row or a column nudged in a future revision moves nothing.
 */
import type { ParsedCipl, PartyAddress, ShipmentHeader, SourceLine } from '../types'
import type { SheetRows } from '../item-library/read-workbook'
import { countryFromAddressLines } from '../countries'
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

const normalizeLabel = (text: string): string =>
  text.replace(/:\s*$/, '').trim().replace(/\s+/g, ' ').toUpperCase()
/**
 * Whether a cell is a header-grid label.
 *
 * Four of them — `INCOTERMS`, `PAGE`, `SIGNATURE`, `DATE` — are ordinary words as well as
 * labels, and pdfjs hands back a printed run one word at a time: `3000 Page Mill Road`
 * offers `Page`, and `CARRIER / AGENT: Page Aviation` offers it again. Read as labels those
 * ended the address band on the consignee's own street and emptied all three blocks, with
 * nothing said. The form prints every one of them with a colon, and no value word carries
 * one, so for a label that is a bare word the colon is what makes it a label.
 *
 * The rest carry `#`, `/` or a second word and are in no danger of being typed by accident.
 */
const isLabel = (text: string): boolean => {
  const normalized = normalizeLabel(text)
  if (!HEADER_LABELS.has(normalized)) return false
  return !/^[A-Z]+$/.test(normalized) || /:\s*$/.test(text.trim())
}

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

/**
 * One page of the form, read on its own terms.
 *
 * The form is printed one page per sheet (or per PDF page) and *repeats its whole header*
 * on every one of them — addresses, dates, weights and the grand total included. Only the
 * commodity table, the SUBTOTAL under it and the `PAGE:` box differ. So each page is read
 * as a complete form and the pages are merged afterwards, rather than concatenating their
 * rows and reading the result as one long sheet: concatenating would find eight COO
 * headings, four address bands and four totals bands, and there is no ordering of the
 * search that makes that mean anything.
 */
interface OmronCiPage {
  /** Where this page sat in the import: 1 for the first grid handed in. Ids are built on it. */
  index: number
  /**
   * The page this is *of the document*, from its own `PAGE: 2 of 4` box.
   *
   * What a reader is told to go and look at, and what a line's provenance points to. Not
   * the import order: hand in pages 1 and 3 of a three-page print and the defect reported
   * on "page 2" sends somebody to a sheet they do not have.
   */
  printedPage: number | null
  /** The `of` half of the same box: how many pages the document says it has. */
  printedOf: number | null
  fields: Map<string, string>
  parties: Parties
  /** False when the address band could not be read on this page at all. */
  partiesRead: boolean
  rows: SheetRows
  /** The merchandise total printed under this page's own commodity table. */
  subtotal: number | null
  tax: number | null
  freight: number | null
  /** The document-wide `TOTAL (USD)`, which every page repeats. */
  grandTotal: number | null
  warnings: string[]
}

type Parties = { shipper: PartyAddress; consignee: PartyAddress; billTo: PartyAddress }

/**
 * A header-grid box that spells "nothing" rather than a value.
 *
 * The form is filled in by hand and its unused boxes are struck through — `-`, `–`, `N/A`.
 * Read literally, that dash becomes the invoice number in the output filename and the
 * consignee's purchase order on the SLI. An empty box and a box holding a dash say the same
 * thing, so they are read the same way.
 *
 * The header grid only. A commodity cell reading `-` is something somebody typed against
 * goods being declared, and the reconciliation is where that gets held, in front of the
 * person who can fix it.
 */
const PLACEHOLDER = /^(?:[-–—/\\.]+|n\/?a)$/i

/**
 * Header boxes whose value describes the document rather than the page.
 *
 * Every one of them is printed identically on every page, so two pages stating different
 * values are two different documents — or one that was re-filled after part of it was
 * printed. `PAGE` is the one box that is *meant* to differ, and is checked separately.
 */
const PAGE_LABEL = 'PAGE'

/** The Commercial Invoice form as a single page — the shape the workbook reader started at. */
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
  return parseOmronCiPages(fileName, [rows], fromWorkbook)
}

/**
 * The form as it is actually issued: one grid per page, in printed order.
 *
 * A workbook carries them as sheets (`P1`, `P2`, …) and a print carries them as PDF pages;
 * both arrive here as one grid each. The header comes from the pages that state it, the
 * commodity lines are the pages' tables end to end, and the figures that describe the whole
 * document — the page count in the `PAGE:` box and the grand `TOTAL (USD)` — are what prove
 * no page went missing between the printer and here.
 *
 * Read in two passes, header before lines. The commodity lines carry the purchase order and
 * the invoice number, and a page whose boxes are struck through has to take both from the
 * pages that do state them — otherwise half a shipment's rows are filed against an order
 * number the header says is something else.
 */
export function parseOmronCiPages(fileName: string, pages: SheetRows[], fromWorkbook = true): ParsedCipl {
  const warnings: string[] = []
  const read = pages.map((rows, i) => readPage(rows, i + 1, fromWorkbook))
  const label = (page: OmronCiPage, warning: string): string =>
    read.length > 1 ? `Page ${page.printedPage ?? page.index}: ${warning}` : warning
  for (const page of read) {
    for (const warning of page.warnings) warnings.push(label(page, warning))
  }

  // Every label's first stated value, searched page by page. The header repeats on each
  // page, so this is normally page 1's — but a value typed on only one page of a set (a
  // tracking number added after the first page was filled) is still found.
  const fields = new Map<string, string>()
  for (const page of read) {
    for (const [key, value] of page.fields) if (!fields.has(key)) fields.set(key, value)
  }
  const field = (label: string): string => fields.get(label) ?? ''

  const parties = mergeParties(read, warnings)

  const lines = read.flatMap((page) =>
    readPageLines(page, field('PURCHASE ORDER #'), field('INVOICE #'), fromWorkbook, (warning) =>
      warnings.push(label(page, warning)),
    ),
  )

  const incomplete = pageProblems(read, fields)
  warnings.push(...incomplete)
  const { totalValue, warnings: totalWarnings } = documentTotal(read)
  warnings.push(...totalWarnings)

  const header = buildHeader(field, parties, lines, totalValue)

  warnings.push(
    'This form states no per-line weights. Box 26 must be supplied from the saved per-part weights or entered by hand.',
  )

  return {
    fileName,
    format: 'omron-ci',
    providesWeights: false,
    pageCount: pages.length,
    availableSets: ['FC'],
    headers: { FC: header },
    lines,
    // Blocking, not advisory. Every one of these says the pages handed in are not one
    // complete document, and none of them is caught by the arithmetic: a page that never
    // arrived takes its subtotal with it, so the rows it left behind reconcile perfectly
    // against the total of the pages that did. `reconcile` turns this into the check that
    // holds generation.
    ...(incomplete.length ? { incompleteReason: incomplete.join(' ') } : {}),
    warnings,
  }
}

const emptyParty = (): PartyAddress => ({ name: '', lines: [], country: null })
const emptyParties = (): Parties => ({ shipper: emptyParty(), consignee: emptyParty(), billTo: emptyParty() })

/**
 * The address blocks, from the page that actually read them.
 *
 * The consignee decides which page that is. A band can be found and still yield a blank
 * consignee column — a merged cell, or an x-mapping the print defeated — and "some block on
 * page 1 was read" is not a reason to prefer page 1's empty consignee over page 2's filled
 * one. Both failures are reported: a band no page could read, and a consignee no page
 * stated. Those are the two ways the SLI's CONSIGNED TO box and box 7 come out blank, and
 * neither may be silent.
 */
function mergeParties(pages: OmronCiPage[], warnings: string[]): Parties {
  const parties = pages.find((page) => page.parties.consignee.name)?.parties ?? pages.find((page) => page.partiesRead)?.parties
  if (!parties) {
    warnings.push(
      'The shipper, consignee and bill-to blocks could not be read from this document. Enter the consignee by ' +
        'hand, and check the addresses on the generated form against the invoice before signing.',
    )
    return emptyParties()
  }
  if (!parties.consignee.name) {
    warnings.push(
      'No consignee was read from the address band. Enter the ultimate consignee by hand, and check the ' +
        'generated form against the invoice before signing.',
    )
  }
  return parties
}

function readPage(rows: SheetRows, index: number, fromWorkbook: boolean): OmronCiPage {
  const warnings: string[] = []

  // Header grid: first value found for each label anywhere on the sheet. The instructions
  // block below the print area repeats no labels, so first occurrence is the form's cell.
  //
  // A struck-through box is not a value and is not recorded as one. Applied here so that
  // every reader of the grid agrees — the purchase order reaching the commodity lines is
  // the same one reaching the header, and a page that fills a box its neighbours struck
  // through still supplies it.
  const fields = new Map<string, string>()
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (!row[i] || !isLabel(row[i])) continue
      const key = normalizeLabel(row[i])
      if (fields.has(key)) continue
      const value = valueAfter(row, i).trim()
      if (value && !PLACEHOLDER.test(value)) fields.set(key, value)
    }
  }

  const parties = readParties(rows)
  const printed = /^(\d+)\s*of\s*(\d+)$/i.exec((fields.get(PAGE_LABEL) ?? '').trim())

  // Without the table's own AMOUNT column the figures are taken from the cells to the
  // right of each totals label — never the rightmost number on the row. The totals band
  // shares its rows with `# OF PIECES`, `NET WT (KG)` and `GROSS WT (KG)`, and on a print
  // `TAX` sits to the right of the net weight: read from the end of the row, a blank tax
  // cell hands back the weight, which then reconciles the shipment against a package.
  const amountColumn = fromWorkbook ? amountColumnIn(rows) : -1
  const subtotal = amountOnRow(rows, 'SUBTOTAL', amountColumn)
  if (subtotal == null) {
    warnings.push(
      'No subtotal could be read from this invoice, so the commodity values cannot be proved against the ' +
        'document. If the workbook was generated rather than saved from Excel, its formulas may have no ' +
        'cached results — open it in Excel, save, and import again.',
    )
  }

  return {
    index,
    printedPage: printed ? Number(printed[1]) : null,
    printedOf: printed ? Number(printed[2]) : null,
    fields,
    parties: parties.parties,
    partiesRead: parties.read,
    rows,
    subtotal,
    tax: amountOnRow(rows, 'TAX', amountColumn),
    freight: amountOnRow(rows, 'FREIGHT', amountColumn),
    grandTotal: amountOnRow(rows, 'TOTAL (USD)', amountColumn),
    warnings,
  }
}

/** This page's commodity lines, with the document's order and invoice numbers on them. */
function readPageLines(
  page: OmronCiPage,
  purchaseOrder: string,
  invoiceNumber: string,
  fromWorkbook: boolean,
  warn: (warning: string) => void,
): SourceLine[] {
  const warnings: string[] = []
  const lines = readLines(page.rows, purchaseOrder, invoiceNumber, page, warnings, fromWorkbook)
  for (const warning of warnings) warn(warning)
  return lines
}

/**
 * Every way the pages handed in fail to be one complete document.
 *
 * The `PAGE:` box is the only place the document states its own extent, and the header
 * boxes below it are printed identically on every page. A page missed on the way in — a
 * print job that dropped one, a workbook whose last tab was deleted — otherwise produces a
 * shorter invoice that looks entirely complete, which is the one failure this reader must
 * not produce in silence.
 *
 * Every problem found is reported, not the first. Two pages that disagree about the page
 * count are also frequently two pages of different invoices, and the invoice numbers are
 * the more actionable of the two things to be told.
 */
function pageProblems(pages: OmronCiPage[], fields: Map<string, string>): string[] {
  const problems: string[] = []

  const totals = [...new Set(pages.map((page) => page.printedOf).filter((of) => of != null))]
  if (totals.length > 1) {
    problems.push(
      `These pages do not belong to one document: their PAGE boxes claim ${totals.join(' and ')} pages.`,
    )
  } else if (totals[0] != null && totals[0] !== pages.length) {
    problems.push(
      `The form states it is ${totals[0]} page(s), but ${pages.length} were read. ` +
        'Every page of the invoice must be imported, or the commodity list will be short.',
    )
  }

  const numbered = pages.map((page) => page.printedPage).filter((at) => at != null)
  if (numbered.length !== new Set(numbered).size) {
    problems.push(
      `Two of the imported pages carry the same PAGE number (${numbered.join(', ')}). ` +
        'A page imported twice files its goods twice.',
    )
  }

  // Every other header box describes the document, so pages that disagree on one are not
  // pages of one document. Reported with the values themselves, not just the label that
  // differs: "INVOICE # (CI-2026-0001, CI-2026-0009)" names the two invoices somebody has
  // stapled together, and that is what they have to go and separate. Merged silently, the
  // date of exportation and box 26 would come from whichever page was handed in first.
  const disagreeing = [...fields.keys()]
    .filter((key) => key !== PAGE_LABEL)
    .map((key) => ({ key, values: [...new Set(pages.map((page) => page.fields.get(key)).filter((v) => v != null))] }))
    .filter(({ values }) => values.length > 1)
  if (disagreeing.length) {
    problems.push(
      'The imported pages disagree about ' +
        `${disagreeing.map(({ key, values }) => `${key} (${values.join(', ')})`).join('; ')}. ` +
        'Import the pages of a single invoice.',
    )
  }

  return problems
}

/**
 * The merchandise total the whole document states, and what has to be said about it.
 *
 * Two figures describe it, and they are independent of each other. The SUBTOTALs are the
 * pages' own arithmetic over the lines this reader just read; the grand `TOTAL (USD)` is
 * the document's statement about itself, repeated on every page, and it still counts the
 * goods on a page that never arrived. So the grand total is preferred, with tax and freight
 * taken back out of it — they are not commodity value, and reconciling against a total that
 * includes them would fail every invoice carrying either.
 *
 * Preferring it is what makes a missing page fail the arithmetic as well as the page count:
 * the rows are then short of a total the document itself prints, and the blocking
 * total-value check says so with both figures in hand. Where the two disagree the
 * discrepancy is reported here as well, because which of them is wrong is a question for
 * the person holding the paperwork.
 */
function documentTotal(pages: OmronCiPage[]): { totalValue: number; warnings: string[] } {
  const warnings: string[] = []
  const subtotals = pages.map((page) => page.subtotal)
  const subtotalSum = subtotals.every((value) => value != null)
    ? roundTo(subtotals.reduce((sum, value) => sum + (value ?? 0), 0), 2)
    : null

  // Every page repeats the same band, so each of the three figures is taken from the first
  // page that states it — not all three from one page. A tax printed only on the page that
  // carries the goods it is charged on would otherwise be left in the merchandise total,
  // and a complete import would fail the arithmetic and be reported as missing a page.
  const grandTotal = pages.find((page) => page.grandTotal != null)?.grandTotal ?? null
  const tax = pages.find((page) => page.tax != null)?.tax ?? 0
  const freight = pages.find((page) => page.freight != null)?.freight ?? 0

  const stated = [...new Set(pages.map((page) => page.grandTotal).filter((value) => value != null))]
  if (stated.length > 1) {
    warnings.push(
      'The pages print different grand totals, so the value of this shipment is not established by the ' +
        'document. Check the invoice before generating anything.',
    )
  }

  const merchandise = grandTotal == null ? null : roundTo(grandTotal - tax - freight, 2)

  if (merchandise != null && subtotalSum != null && Math.abs(merchandise - subtotalSum) > 0.01) {
    warnings.push(
      `The page subtotals add to ${subtotalSum.toFixed(2)}, but the invoice's own total states ` +
        `${merchandise.toFixed(2)} of merchandise. A page of this invoice is missing, or a subtotal on it is stale.`,
    )
  }

  return { totalValue: merchandise ?? subtotalSum ?? 0, warnings }
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
function readParties(rows: SheetRows): { parties: Parties; read: boolean } {
  const bandIndex = rows.findIndex(
    (row) => row.some((c) => isPartyTitle(c, 'SHIPPER')) && row.some((c) => isPartyTitle(c, 'CONSIGNEE')),
  )
  // Reported by the caller rather than here. The addresses are the one part of this form
  // nothing downstream demands — the SLI will fill its consignee box with whatever is
  // there, including nothing — so a band that could not be read has to be said out loud or
  // it reads as a blank form. On a multi-page import that is only true of a document whose
  // *every* page failed, which is not something one page can know.
  const unreadable = () => ({ parties: emptyParties(), read: false })
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
    // And at the commodity table, whether or not a header grid was found between the two.
    // Stopping on a label alone rested on there being one below the addresses: a revision
    // that moves those fields, or a print that loses them, ran the band to the end of the
    // sheet and filed `PART #` and a part number as the consignee's street.
    if (row.some((c) => TABLE_HEADINGS.has(c.trim().toUpperCase()))) break
    for (const key of ['shipper', 'consignee', 'billTo'] as const) {
      const column = columns[key]
      const cell = column >= 0 ? (row[column] ?? '').trim() : ''
      if (cell) collected[key].push(cell)
    }
  }

  const toParty = (lines: string[]): PartyAddress => {
    const [name = '', ...rest] = lines
    // The country the block itself names, which is the only statement of it this form
    // makes — it has no discharge-port box. Read off the address rather than left null:
    // without it box 7, the country of ultimate destination, has nothing to fill from and
    // the blocking check holds every shipment on this form.
    return { name, lines: rest, country: countryFromAddressLines([name, ...rest]) }
  }
  // The band was found and still yielded nothing — on the PDF path, a band whose three
  // titles could not all be located, which `partyRow` declines to map rather than guess at.
  if (!collected.shipper.length && !collected.consignee.length && !collected.billTo.length) return unreadable()
  return {
    parties: {
      shipper: toParty(collected.shipper),
      consignee: toParty(collected.consignee),
      billTo: toParty(collected.billTo),
    },
    read: true,
  }
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
  page: OmronCiPage,
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
      // The page is part of the id, not decoration. Line numbers run on across the pages
      // of this form, but nothing makes them: a set whose pages each restart at 1 would
      // otherwise collide, and two lines sharing an id are one line to everything
      // downstream that joins, groups or overrides by it.
      //
      // Keyed on where the page sat in the import, not on the number printed on it: two
      // pages both printed `1 of 1` are exactly the case this guards against, and they
      // would share a printed number.
      id: ['FC', 'INV', invoiceNumber || 'CI', `P${page.index}`, String(lineNumber), partNumber].join(':'),
      documentSet: 'FC',
      documentKind: 'INVOICE',
      // Provenance points at the document's own page, which is what a reviewer turns to.
      page: page.printedPage ?? page.index,
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
  // Reported only where the row that stopped the read looks like a line the reader failed
  // on — a part number or a quantity, which is what a commodity whose LN cell was left
  // blank still carries. Deliberately not the description column: a continuation marker or
  // a no-charge note printed under the table is prose in exactly that column, and warning
  // about it would cry truncation on every clean import of a template that carries one.
  const stoppedOnGoods =
    endedAt !== undefined &&
    !isTotalsRow(endedAt) &&
    [columns.part, columns.qty].some((c) => c >= 0 && (endedAt[c] ?? '').trim())
  if (stoppedOnGoods) {
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
 * Without the column — the PDF path, whose totals rows are rebuilt from drawn text — the
 * figure is taken from the cells *after* the label, in printed order. The rightmost number
 * is not the same thing and is wrong on this very form: `TAX` prints to the right of the
 * net weight, so an empty tax cell handed back `9.7` kg as an amount of money. Nothing
 * after the label means nothing was printed there, which is what an empty tax box is.
 */
function amountOnRow(rows: SheetRows, label: string, amountColumn: number): number | null {
  const row = rows.find((r) => r.some((c) => normalizeLabel(c) === label))
  if (!row) return null
  if (amountColumn >= 0) return parseNumber(row[amountColumn] ?? '')
  const at = row.findIndex((c) => normalizeLabel(c) === label)
  for (let i = at + 1; i < row.length; i++) {
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
  parties: Parties,
  lines: SourceLine[],
  totalValue: number,
): ShipmentHeader {
  const freight = field('FREIGHT CHARGES').toUpperCase()
  return {
    invoiceNumber: field('INVOICE #'),
    invoiceDate: dateText(field('INVOICE DATE')),
    // Still null. `onOrAboutDate` means the *later sailing* date on the vendor layouts,
    // and this form has no box for that — its SHIP DATE is the date the goods leave, which
    // is `shipDate` below.
    onOrAboutDate: null,
    // The date of exportation for this layout. The form states when the shipment goes, so
    // that is what box 2 files; `buildDraft` prefers it over the invoice date, which on
    // this form is routinely struck through because the goods are not sold.
    shipDate: dateText(field('SHIP DATE')) || null,
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
    // The merchandise total the commodity rows must sum to, across every page — see
    // `documentTotal`. Zero when the document states none, so the total-value check fails
    // loudly rather than proving the lines against themselves.
    totalValue,
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
  // Only the pages that are this form. The detector looks at the first page alone, and a
  // print of the invoice with a terms sheet or a signed SLI bound after it would otherwise
  // have those pages read as pages of the form — supplying header values for any box the
  // invoice left blank, and pushing whatever their tables reshaped into. The doc number is
  // printed in the title bar of every page of the form, so it is what tells them apart.
  const own = pages.filter((page) => page.rows.map(rowText).join(' ').includes(DOC_NUMBER))
  const parsed = parseOmronCiPages(
    fileName,
    // One page at a time, never the pages' rows concatenated. PDF y restarts on every page,
    // so a second page's blocks collide with the first's by baseline — and the geometry
    // below is all baselines. Each page is reshaped into its own grid and read as the
    // complete form it is printed as; `parseOmronCiPages` merges them.
    own.map((page) => pageToGrid(page)),
    false,
  )
  if (own.length !== pages.length) {
    parsed.warnings.unshift(
      `${pages.length - own.length} of this file's ${pages.length} pages do not carry the Commercial Invoice ` +
        `form's document number (${DOC_NUMBER}) and were not read as part of it. If any of them is a page of ` +
        'this invoice, it is missing from what was imported.',
    )
  }
  return parsed
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
 * Rebuilds one printed page into the same row/cell grid the workbook reader consumes.
 *
 * One page, not several. PDF y restarts on every page, so rows taken from two of them share
 * a baseline space they were never drawn in, and the blocks below merge into garbage. The
 * signature says so, rather than a comment at the call site saying so.
 *
 * Three regions, three treatments. The label/value rows pass through in reading order,
 * which `valueAfter` already handles. The three-column address band is mapped by x, so an
 * empty consignee cannot shift the bill-to into its place. The commodity table is reshaped
 * into the two-rows-per-block layout `readLines` expects, with cells resolved against the
 * table's own printed headings.
 */
function pageToGrid(page: TextPage): SheetRows {
  const rows = page.rows
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

  // Searched through the same healing the rest of the grid gets. `isPartyTitle` refuses an
  // item that *is* a header label, which is what keeps `SHIPPER EIN / TAX ID:` from passing
  // for the SHIPPER block — but only while the extractor leaves the label in one piece.
  // Split into words, its first item is the bare word `SHIPPER`, and the header grid then
  // answers to the band's own description. That the real band is found first is a property
  // of where the form prints its rows, which is exactly what this guard exists not to rest
  // on.
  const partyBand = rows.findIndex((row) => {
    const strings = row.items.map((item) => item.str)
    return titlesPartyBlock(strings, 'SHIPPER') && titlesPartyBlock(strings, 'CONSIGNEE')
  })
  // Where the commodity table's headings begin. The merged ones can land a row above the
  // row carrying PART #, which is why the anchor band reaches back a row — but only where
  // that row is a heading row. Taking it unconditionally cost the last line of every
  // address on a form with nothing printed between the two.
  const headingBandStart =
    headIndex > 0 && rows[headIndex - 1].items.some((item) => TABLE_HEADINGS.has(item.str.toUpperCase()))
      ? headIndex - 1
      : headIndex

  // The band runs to the first header-grid label below it, and no further than the table
  // headings whatever else is found.
  //
  // Collapsing to the band's own row when no label follows meant no row was column-mapped
  // at all, and `readParties` then read cells 0, 1 and 2 of every remaining row — the
  // synthesized commodity headings among them — as shipper, consignee and bill-to. That
  // there is always a header grid below the addresses is the print order this search is
  // written not to rest on; the table headings bound it whether or not one is there.
  let partyEnd = partyBand
  if (partyBand !== -1) {
    const labelled = rows.findIndex((row, i) => i > partyBand && hasLabel(row))
    partyEnd = labelled === -1 ? headingBandStart : Math.min(labelled, headingBandStart)
    if (partyEnd < partyBand) partyEnd = partyBand
  }

  // The heading rows are synthesized in canonical order rather than passed through,
  // because the print can split them across baselines in ways `readLines` should not
  // have to know about. The blocks are emitted in the same canonical order.
  //
  // Only rows inside the heading band count. Tested against the whole header region, a
  // single ordinary word did it: an address line reading `Amount Tower` and a freight term
  // reading `PREPAID AMOUNT AGREED` were dropped entire, silently, because `AMOUNT` is
  // also the name of a column.
  const isHeadingRow = (i: number): boolean =>
    i >= headingBandStart && rows[i].items.some((item) => TABLE_HEADINGS.has(item.str.toUpperCase()))

  const grid: SheetRows = []
  for (let i = 0; i < subIndex + 1; i++) {
    if (isHeadingRow(i)) continue
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
  const strings = row.items.map((item) => item.str)
  for (let i = 0; i < strings.length; i++) {
    const span = labelSpanAt(strings, i)
    if (span) {
      flush()
      cells.push(span.text)
      i = span.end
    } else {
      pending.push(strings[i])
    }
  }
  flush()
  return cells
}

/**
 * How many text items one printed label is allowed to have been split into.
 *
 * Six, because `CONSIGNEE EORI / USCI / VAT` is six words and a label that cannot be
 * reassembled is a label that folds into the value beside it — which is the whole point of
 * looking. Matching is on equality with a closed list, so the extra reach costs only the
 * chance that several consecutive value items spell a label exactly.
 */
const MAX_LABEL_ITEMS = 6

/**
 * The label printed at `start`, whether the extractor emitted it as one item or several.
 *
 * pdfjs splits a printed run wherever it likes, and the table headings are guarded against
 * exactly that a few functions up. The header grid was not: a split `INVOICE DATE:` was two
 * ordinary items, so it folded into the value beside `INVOICE #:` — leaving an invoice
 * number of `INV-123 INVOICE DATE: 08/10/2026`, which goes on to the SLI, the keying sheet
 * reference and the output filename — and the date itself was never found.
 *
 * A single item that is already a whole label wins before any lookahead, so a row that the
 * extractor did not split reads exactly as it did before. Both joins are tried because the
 * split can fall between words (`INVOICE` + `DATE:`) or inside one (`INVOICE DA` + `TE:`).
 */
function labelSpanAt(
  items: readonly string[],
  start: number,
  includeTotalsCells = true,
): { text: string; end: number } | null {
  const parts: string[] = []
  // The longest match wins, and a header label beats a totals cell of the same length.
  //
  // Taking the first match instead let a shorter name swallow a longer one it is a prefix
  // of: a split `FREIGHT CHARGES:` matched the totals cell `FREIGHT` on its first item and
  // stopped there, so the label was never reassembled, `freightTerms` came back null and a
  // PREPAID invoice was filed as COLLECT. `TAX` sits inside `SHIPPER EIN / TAX ID` the same
  // way.
  let best: { text: string; end: number; header: boolean } | null = null
  for (let end = start; end < items.length && end - start < MAX_LABEL_ITEMS; end++) {
    parts.push(items[end])
    for (const joined of end === start ? [parts[0]] : [parts.join(' '), parts.join('')]) {
      const header = isLabel(joined)
      if (!header && !(includeTotalsCells && TOTALS_CELLS.has(normalizeLabel(joined)))) continue
      if (!best || end > best.end || (end === best.end && header && !best.header)) {
        best = { text: joined, end, header }
      }
    }
  }
  return best && { text: best.text, end: best.end }
}

/**
 * Whether the row carries a header-grid label, counting one the extractor split.
 *
 * Header labels only. The totals cells `coalescedRow` also delimits on are ordinary words —
 * a consignee at `NIPPON EXPRESS FREIGHT KK`, split into word items, ends the address band
 * on `FREIGHT` and every address in the consignment is dropped.
 */
function hasLabel(row: TextRow): boolean {
  const strings = row.items.map((item) => item.str)
  return strings.some((_, i) => labelSpanAt(strings, i, false) !== null)
}

/**
 * Whether these text items title an address block, counting a header label the extractor
 * split into words.
 *
 * Exported so the separation can be asserted against the form's real label list, the way
 * `isPartyTitle` already is — the split case is the one `isPartyTitle` alone cannot see.
 */
export function titlesPartyBlock(items: readonly string[], block: PartyBlock): boolean {
  return items.some((item, i) => labelSpanAt(items, i, false) === null && isPartyTitle(item, block))
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

/**
 * An LN cell: a line number centred under the LN heading.
 *
 * Up to three digits. Two was enough while the reader refused anything past one page, and
 * is not now: eight lines to a page puts line 100 on page 13, and a block that is never
 * opened folds its part number and description into the line above — silently, because the
 * lines below it simply do not exist to be counted. The column is ~25pt wide and the
 * tolerance is 8pt, so nothing else on the row can answer to it.
 */
const isLnCell = (item: TextItem, anchors: Anchors): boolean =>
  Math.abs(item.x - anchors.ln) <= LN_TOLERANCE && /^\d{1,3}$/.test(item.str)

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
