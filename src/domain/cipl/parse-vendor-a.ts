/**
 * Parser for the the vendor combined Commercial Invoice & Packing List layout.
 *
 * One PDF contains up to four documents, in this order:
 *
 *   FC  INVOICE       header page + N detail pages   (priced in USD)
 *   FC  PACKING LIST  header page + N detail pages   (weights)
 *   TP1 INVOICE       header page + N detail pages   (priced in destination currency)
 *   TP1 PACKING LIST  header page + N detail pages   (identical weights)
 *
 * FC and TP1 describe the *same physical goods*. Summing them, or picking TP1 because it
 * appears later in the file, would double the shipment. See `select-document-set.ts`.
 *
 * Detail lines are printed as a fixed 5-row block per merchandise line. The parser locates
 * each block by its distinctive first row — the order number printed twice followed by a
 * sequence number — then reads the block by content (a classification looks like
 * `8544.42.0000`, weights sit inside parentheses) rather than by hard-coded pixel columns,
 * so minor layout drift between document revisions does not silently drop data.
 */
import type { DocumentKind, DocumentSet, ParsedCipl, PartyAddress, ShipmentHeader, SourceLine } from '../types'
import {
  extractTextPages,
  findLabelRow,
  findRowIndex,
  itemsInRange,
  labelItem,
  parseNumber,
  rowText,
  valueRightOf,
  type TextPage,
  type TextRow,
} from './extract-text'

/** Quantity, unit price and extended value all sit right of this. */
const FIGURE_COLUMN_MIN = 380

const CLASSIFICATION = /^\d{4}\.\d{2}\.\d{4}$/
const LINE_NUMBER = /^\d{4}$/
const ORDER_NUMBER = /^[0-9][0-9A-Z]{7,}$/
const CURRENCY = /^[A-Z]{3}$/
const SEQUENCE = /^\d{1,4}$/

/** Left-hand label column on header pages. */
const LEFT_LABEL_MAX = 300

interface PageContext {
  set: DocumentSet
  kind: DocumentKind
  isHeaderPage: boolean
}

export async function parseCipl(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ParsedCipl> {
  const pages = await extractTextPages(data)
  return parseCiplPages(fileName, pages)
}

/** Split out from `parseCipl` so tests can feed pre-extracted pages. */
export function parseCiplPages(fileName: string, pages: TextPage[]): ParsedCipl {
  const warnings: string[] = []
  const headers: Record<string, ShipmentHeader> = {}
  const lines: SourceLine[] = []
  const availableSets: DocumentSet[] = []

  let currentSet: DocumentSet | null = null
  let currentKind: DocumentKind | null = null
  /** A line block that ran off the bottom of the previous page. See `parseDetailLines`. */
  let carry: CarriedBlock | null = null
  /** The commodity heading in force, which survives a page break but not a new document. */
  let lastGroup = ''
  let groupSet: DocumentSet | null = null
  let groupKind: DocumentKind | null = null

  for (const page of pages) {
    const ctx = classifyPage(page, currentSet, currentKind)
    if (!ctx) {
      warnings.push(`Page ${page.pageNumber}: could not determine document type; skipped.`)
      continue
    }
    currentSet = ctx.set
    currentKind = ctx.kind
    if (!availableSets.includes(ctx.set)) availableSets.push(ctx.set)

    if (ctx.isHeaderPage) {
      // Keyed by set, not by kind: the invoice header supplies values and the packing-list
      // header supplies weights, and both describe the same shipment.
      headers[ctx.set] = parseHeaderPage(page, headers[ctx.set])
    }

    // A block can only continue into the next page of the same set and kind. Anything else
    // means the document moved on and the partial block was genuinely unreadable.
    if (carry && (carry.set !== ctx.set || carry.kind !== ctx.kind)) {
      warnings.push(
        `${carry.set} ${carry.kind === 'INVOICE' ? 'invoice' : 'packing list'}: the last line on page ` +
          `${carry.page} is incomplete and nothing follows it. Its figures could not be read.`,
      )
      carry = null
    }

    // The heading only carries within one set and kind; a new document starts fresh.
    if (groupSet !== ctx.set || groupKind !== ctx.kind) {
      lastGroup = ''
      groupSet = ctx.set
      groupKind = ctx.kind
    }
    const detail = parseDetailLines(page, ctx, carry, lastGroup)
    lines.push(...detail.lines)
    carry = detail.carry
    lastGroup = detail.group
  }

  if (carry) {
    warnings.push(
      `${carry.set}: the last line on page ${carry.page} is incomplete and the document ends there.`,
    )
  }

  // The header's P/O NUMBER field is a fixed-width display field and silently truncates —
  // vendorA3 prints 6 of its 8 order numbers there. The line items are authoritative.
  for (const set of Object.keys(headers) as DocumentSet[]) {
    const header = headers[set]
    const fromLines = distinct(lines.filter((l) => l.documentSet === set).map((l) => l.orderNumber))
    if (fromLines.length) {
      const missing = fromLines.filter((o) => !header.orderNumbers.includes(o))
      if (missing.length && header.orderNumbers.length) {
        warnings.push(
          `${set}: the header P/O field lists ${header.orderNumbers.length} order number(s) but the line items ` +
            `reference ${fromLines.length}. Using the line items (added: ${missing.join(', ')}).`,
        )
      }
      header.orderNumbers = fromLines
    }
  }

  if (!availableSets.length) warnings.push('No FC or TP1 document set was recognised in this file.')

  return {
    fileName,
    format: 'vendor-a',
    providesWeights: true,
    pageCount: pages.length,
    availableSets,
    headers,
    lines,
    warnings,
  }
}

/** Prefer a freshly parsed value, falling back to what an earlier page of the set supplied. */
function coalesce<T>(next: T | null | undefined, previous: T | null | undefined, empty: T | null = null): T | null {
  if (next !== null && next !== undefined && next !== '' && next !== empty) return next
  if (previous !== null && previous !== undefined) return previous
  return null
}

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

/**
 * Header pages carry both the set marker (`FC` / `TP1`, top right) and the document title.
 * Detail pages repeat only the title, so the set is carried forward from the last header.
 */
function classifyPage(page: TextPage, prevSet: DocumentSet | null, prevKind: DocumentKind | null): PageContext | null {
  const isHeaderPage = findRowIndex(page.rows, 'INVOICE NUMBER:') !== -1
  const hasPackingList = findRowIndex(page.rows, 'PACKING LIST') !== -1
  const hasInvoiceTitle = findRowIndex(page.rows, 'INVOICE') !== -1

  const kind: DocumentKind | null = hasPackingList ? 'PACKING_LIST' : hasInvoiceTitle ? 'INVOICE' : prevKind
  if (!kind) return null

  let set = prevSet
  if (isHeaderPage) {
    const marker = findSetMarker(page)
    if (marker) set = marker
  }
  if (!set) return null

  return { set, kind, isHeaderPage }
}

/** `FC` or `TP1` printed alone at the far right of the first content row. */
function findSetMarker(page: TextPage): DocumentSet | null {
  for (const row of page.rows.slice(0, 4)) {
    for (const item of row.items) {
      if (item.x < page.width * 0.75) continue
      if (item.str === 'FC') return 'FC'
      if (item.str === 'TP1') return 'TP1'
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Header page
// ---------------------------------------------------------------------------

function parseHeaderPage(page: TextPage, existing?: ShipmentHeader): ShipmentHeader {
  const rows = page.rows

  const invoiceNumber = labelValue(rows, 'INVOICE NUMBER:') ?? existing?.invoiceNumber ?? ''
  const invoiceDate = labelValue(rows, 'DATE:') ?? existing?.invoiceDate ?? ''
  const vesselAgent = labelValue(rows, 'VESSEL AGENT OR AIR LINES:') ?? null
  const shippedFrom = labelValue(rows, 'SHIPPED FROM:') ?? null
  const dischargePort = labelValue(rows, 'DISCHARGE PORT:') ?? null

  // Printed as one run of text ("ON OR ABOUT July 25, 2026") with no separate label cell.
  const onAboutIdx = findRowIndex(rows, 'ON OR ABOUT')
  const onOrAboutDate =
    onAboutIdx === -1 ? null : (rowText(rows[onAboutIdx]).match(/ON OR ABOUT\s+(.+)$/i)?.[1]?.trim() ?? null)

  const soldTo = addressBlock(rows, 'SOLD TO:')
  const consignedTo = addressBlock(rows, 'CONSIGNED TO:')
  const notifyTo = labelValue(rows, 'NOTIFY TO:') ?? null

  const tradeTerms = tradeTermsValue(rows)
  const { totalQuantity, cartons } = totalsBlock(rows)
  const { totalValue, documentCurrency } = invoiceTotal(rows)
  const weights = packingTotals(rows)

  const orderNumbers = headerOrderNumbers(rows)

  const effectiveTradeTerms = coalesce(tradeTerms, existing?.tradeTerms)

  // The invoice header supplies values and the packing-list header supplies weights, so
  // every field falls back to whatever the other document of this set already provided.
  return {
    invoiceNumber: coalesce(invoiceNumber, existing?.invoiceNumber) ?? '',
    invoiceDate: coalesce(invoiceDate, existing?.invoiceDate) ?? '',
    onOrAboutDate: coalesce(onOrAboutDate, existing?.onOrAboutDate),
    soldTo: soldTo.name ? soldTo : (existing?.soldTo ?? soldTo),
    consignedTo: consignedTo.name ? consignedTo : (existing?.consignedTo ?? consignedTo),
    notifyTo: coalesce(notifyTo, existing?.notifyTo),
    shippedFrom: coalesce(shippedFrom, existing?.shippedFrom),
    dischargePort: coalesce(dischargePort, existing?.dischargePort),
    vesselAgent: coalesce(vesselAgent, existing?.vesselAgent),
    orderNumbers: orderNumbers.length ? orderNumbers : (existing?.orderNumbers ?? []),
    // This layout prints the customer's purchase order as the order number, so there is no
    // separate list to keep.
    purchaseOrders: [],
    tradeTerms: effectiveTradeTerms,
    incoterm: effectiveTradeTerms ? incotermFromTradeTerms(effectiveTradeTerms) : null,
    freightTerms: effectiveTradeTerms ? freightFromTradeTerms(effectiveTradeTerms) : null,
    cartons: coalesce(cartons, existing?.cartons),
    documentCurrency: coalesce(documentCurrency, existing?.documentCurrency) ?? '',
    totalQuantity: coalesce(totalQuantity, existing?.totalQuantity) ?? 0,
    totalValue: coalesce(totalValue, existing?.totalValue) ?? 0,
    totalNetWeightKg: coalesce(weights.net, existing?.totalNetWeightKg),
    totalGrossWeightKg: coalesce(weights.gross, existing?.totalGrossWeightKg),
    totalMeasurementM3: coalesce(weights.measurement, existing?.totalMeasurementM3),
  }
}

function labelValue(rows: TextRow[], label: string): string | undefined {
  // Keep looking past rows that merely mention the label in passing.
  for (let from = 0; from < rows.length; ) {
    const idx = findLabelRow(rows, label, from)
    if (idx === -1) return undefined
    const value = valueRightOf(rows[idx], label)
    if (value) return value
    from = idx + 1
  }
  return undefined
}

/**
 * A party block is the label row's value plus every following row that has text in the
 * same left-hand column, up to the next label. Right-hand column items (invoice metadata)
 * share those rows and are excluded by x.
 */
function addressBlock(rows: TextRow[], label: string): PartyAddress {
  const start = findLabelRow(rows, label)
  if (start === -1) return { name: '', lines: [], country: null }

  const labelRow = rows[start]
  const marker = labelItem(labelRow, label)
  if (!marker) return { name: '', lines: [], country: null }
  const valueX = labelRow.items.find((i) => i.x > marker.x && i.x < LEFT_LABEL_MAX)?.x
  if (valueX === undefined) return { name: '', lines: [], country: null }

  const collected: string[] = []
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]
    // Stop at the next left-column label (SOLD TO:, CONSIGNED TO:, NOTIFY TO:, ...).
    if (i > start && row.items.some((it) => it.x < valueX - 20 && it.str.endsWith(':'))) break
    const cells = itemsInRange(row, valueX - 8, LEFT_LABEL_MAX)
    // Rows carrying only right-hand invoice metadata interleave with the address block;
    // they are skipped, not treated as the end of it.
    if (!cells.length) continue
    collected.push(cells.map((c) => c.str).join(' ').trim())
  }

  const [name = '', ...rest] = collected
  return { name, lines: rest, country: null }
}

function tradeTermsValue(rows: TextRow[]): string | null {
  return labelValue(rows, 'TRADE TERMS:') ?? null
}

/** `FOB Origin - Collect` -> `FOB`. */
export function incotermFromTradeTerms(tradeTerms: string): string | null {
  const match = tradeTerms.trim().match(/^([A-Z]{3})\b/)
  return match ? match[1] : null
}

/** `FOB Origin - Collect` -> `COLLECT`. */
export function freightFromTradeTerms(tradeTerms: string): 'PREPAID' | 'COLLECT' | null {
  const upper = tradeTerms.toUpperCase()
  if (upper.includes('COLLECT')) return 'COLLECT'
  if (upper.includes('PREPAID')) return 'PREPAID'
  return null
}

function totalsBlock(rows: TextRow[]): { totalQuantity: number | null; cartons: number | null } {
  let totalQuantity: number | null = null
  let cartons: number | null = null

  const totalIdx = findLabelRow(rows, 'TOTAL:')
  if (totalIdx !== -1) {
    // Printed as either `3 PCS` in one cell or `3` and `PCS` in two.
    const after = valueRightOf(rows[totalIdx], 'TOTAL:')
    const n = parseNumber(after?.split(/\s+/)[0])
    if (n !== null) totalQuantity = n
  }

  const cartonIdx = findLabelRow(rows, 'CARTONS:')
  if (cartonIdx !== -1) {
    const after = valueRightOf(rows[cartonIdx], 'CARTONS:')
    // `1 (ONE)` on the invoice, `(ONE) 1` on some packing lists.
    const n = after?.split(/\s+/).map(parseNumber).find((v) => v !== null)
    if (n != null) cartons = n
  }
  return { totalQuantity, cartons }
}

/** The grand total sits alone on its own row as `<amount> <CUR>`. */
function invoiceTotal(rows: TextRow[]): { totalValue: number | null; documentCurrency: string | null } {
  for (const row of rows) {
    const nonRule = row.items
    if (nonRule.length !== 2) continue
    const amount = parseNumber(nonRule[0].str)
    const currency = nonRule[1].str
    if (amount !== null && CURRENCY.test(currency)) {
      return { totalValue: amount, documentCurrency: currency }
    }
  }
  return { totalValue: null, documentCurrency: null }
}

/** Packing-list header totals: three numbers above a `KGS KGS M3` unit row. */
function packingTotals(rows: TextRow[]): { net: number | null; gross: number | null; measurement: number | null } {
  const unitIdx = rows.findIndex(
    (r) => r.items.length >= 2 && r.items[0].str === 'KGS' && r.items.some((i) => i.str === 'M3'),
  )
  if (unitIdx <= 0) return { net: null, gross: null, measurement: null }

  for (let i = unitIdx - 1; i >= 0 && i >= unitIdx - 3; i--) {
    const numbers = rows[i].items.map((it) => parseNumber(it.str)).filter((n): n is number => n !== null)
    if (numbers.length >= 3) {
      return { net: numbers[0], gross: numbers[1], measurement: numbers[2] }
    }
  }
  return { net: null, gross: null, measurement: null }
}

function headerOrderNumbers(rows: TextRow[]): string[] {
  const idx = findLabelRow(rows, 'P/O NUMBER:')
  if (idx === -1) return []
  const found: string[] = []
  const label = rows[idx].items.find((i) => i.str.startsWith('P/O NUMBER'))
  const startX = label ? label.x : 0

  for (let i = idx; i < rows.length; i++) {
    const candidates = rows[i].items.filter((it) => it.x > startX && ORDER_NUMBER.test(it.str))
    // The field wraps onto unlabelled continuation rows directly beneath.
    if (!candidates.length) {
      if (i > idx) break
      continue
    }
    found.push(...candidates.map((c) => c.str))
  }
  return distinct(found)
}

// ---------------------------------------------------------------------------
// Detail lines
// ---------------------------------------------------------------------------

/**
 * A merchandise line always opens with the order number printed twice followed by the
 * sequence within that order. Nothing else on the page has that shape, which makes it a
 * reliable block delimiter even across page breaks.
 */
function isLineStart(row: TextRow): boolean {
  const [a, b, c] = row.items
  return Boolean(
    a && b && c && ORDER_NUMBER.test(a.str) && a.str === b.str && SEQUENCE.test(c.str) && b.x > a.x + 40,
  )
}

/** A line block cut in half by a page break, waiting for the rest of itself. */
interface CarriedBlock {
  rows: TextRow[]
  commodityGroup: string
  /** Page the block started on — the provenance a reviewer needs, not where it finished. */
  page: number
  set: DocumentSet
  kind: DocumentKind
}

/**
 * Whether a parsed line found the figure its document kind exists to state.
 *
 * Used to decide that a block ran off the bottom of a page rather than genuinely ending:
 * a packing-list line always carries weights, an invoice line always carries a value.
 */
function isComplete(line: SourceLine, kind: DocumentKind): boolean {
  return kind === 'PACKING_LIST' ? line.netWeightKg !== undefined : line.extendedValue !== undefined
}

/**
 * The rows on this page that belong to a block carried over from the previous one.
 *
 * Everything down to and including the column-header row is page furniture; the block's
 * remaining rows follow it. The consignee and `C/NO` lines that sit between are harmless —
 * the block parser locates fields by shape and position, and none of them match.
 */
function continuationRows(rows: TextRow[], upTo: number): TextRow[] {
  const out: TextRow[] = []
  let pastFurniture = false
  for (let i = 0; i < upTo; i++) {
    const text = rowText(rows[i])
    if (isTotalsRow(text)) break
    if (!pastFurniture) {
      if (/MARKS & NOS\./i.test(text)) pastFurniture = true
      continue
    }
    out.push(rows[i])
  }
  return out
}

function parseDetailLines(
  page: TextPage,
  ctx: PageContext,
  carryIn: CarriedBlock | null,
  groupIn: string,
): { lines: SourceLine[]; carry: CarriedBlock | null; group: string } {
  const rows = page.rows
  const starts: number[] = []
  for (let i = 0; i < rows.length; i++) if (isLineStart(rows[i])) starts.push(i)
  // A heading governs every line until the next one, and the page break is not a next one.
  // vendorA4 ends a page with `Electrical Conductors` and starts the following page with
  // the line it heads; without this that line reaches the form with no description at all.
  let group = groupIn

  const lines: SourceLine[] = []
  const parseBlock = (block: TextRow[], group: string, pageNumber: number) => {
    const on = pageNumber === page.pageNumber ? page : { ...page, pageNumber }
    return ctx.kind === 'INVOICE'
      ? parseInvoiceBlock(block, on, ctx, group)
      : parsePackingBlock(block, on, ctx, group)
  }

  // Finish a block that began on the previous page before reading this page's own.
  if (carryIn) {
    const block = [...carryIn.rows, ...continuationRows(rows, starts.length ? starts[0] : rows.length)]
    const line = parseBlock(block, carryIn.commodityGroup, carryIn.page)
    if (line) lines.push(line)
  }

  let carry: CarriedBlock | null = null
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : rows.length
    const cut = truncateAtPageTotals(rows, from, to)
    const block = rows.slice(from, cut)
    // Everything up to and including the previous block's last structural row belongs to it.
    // On the first block that is the *carried* block, whose tail finishes on this page above
    // it — without this it lends its own description row forward as this block's heading.
    const previousStart = s === 0 ? (carryIn ? detailRowsBegin(rows, from) : -1) : starts[s - 1]
    const floor = previousStart === -1 ? -1 : blockEndsAt(rows, previousStart, from, ctx.kind)
    group = commodityGroupBefore(rows, from, floor) || group
    const commodityGroup = group
    const line = parseBlock(block, commodityGroup, page.pageNumber)

    // A block that reaches the foot of the page without its figures has not ended — it is
    // continued overleaf. Emitting it here would file a line with no weight, and drop the
    // rest of it on the floor.
    if (line && s === starts.length - 1 && cut === rows.length && !isComplete(line, ctx.kind)) {
      carry = { rows: block, commodityGroup, page: page.pageNumber, set: ctx.set, kind: ctx.kind }
      continue
    }
    if (line) lines.push(line)
  }

  // A heading printed below the last block on a page belongs to the first block of the next
  // one, and nothing on this page will ever look back at it. Shipment vendorA6 ends an invoice
  // page with `Electrical Conductors` and opens the next with the plugs it heads; without
  // this they reach the form under the heading of the gaskets three blocks earlier.
  //
  // Bounded on both sides, because an unbounded look-ahead is the consignee-address bug in a
  // new place: a page with no blocks at all is a header page, whose address block sits in the
  // detail column and reads exactly like a heading, and the text below the totals row is the
  // page footer. Only the gap between the last block and the totals can hold a heading.
  const nextGroup = starts.length
    ? commodityGroupAfter(rows, starts[starts.length - 1], Boolean(carry), ctx.kind)
    : ''
  return { lines, carry, group: nextGroup || group }
}

/**
 * The final line block on a page would otherwise run into the page footer, letting the
 * trade-terms text be mistaken for a commodity description. Cut the block at the totals row.
 */
/** `(@ / 6)` — the figures beside it are the line total divided that many ways. */
const DIVIDED_FIGURES = /^\(@\s*\/\s*(\d+)\)$/

function scaleFigure(value: number, divisor: number): number {
  return divisor === 1 ? value : Math.round(value * divisor * 1000) / 1000
}

function isTotalsRow(text: string): boolean {
  return /^\s*TOTALS?:?\b/i.test(text) || /CARTONS ONLY/i.test(text) || /\bTOTALS\b/.test(text)
}

function truncateAtPageTotals(rows: TextRow[], from: number, to: number): number {
  for (let i = from + 1; i < to; i++) {
    if (isTotalsRow(rowText(rows[i]))) return i
  }
  return to
}

/**
 * The commodity heading (`Electrical Conductors`) printed just above a line block.
 *
 * Constrained to the detail column. The first block on a page has the consignee's address
 * directly above it, and its city — `Singapore` — is a single word that reads exactly like a
 * heading. That text then becomes the commodity description on the generated form, which is
 * how a shipment of cable ends up described as a country. Real headings are indented into
 * the description column at x≈72; the address sits out at the x≈24 margin, and the page
 * title further right again.
 */
/**
 * Headings and descriptions live in disjoint columns, and that is the whole guarantee.
 *
 * Both windows are measured off the document, not derived from each other: the `MARKS & NOS.`
 * column header sits at x=24 and headings indent to x≈72, while `DESCRIPTION OF GOODS` is at
 * x=144 and the descriptions under it at x≈192. The boundary goes in the gap between them.
 *
 * Deriving one bound from the other was worse than arbitrary — it looked principled while
 * putting the description floor above the description column's own left edge, so anything
 * printed flush to that edge would have been dropped and the line would have reached the form
 * with no description at all.
 *
 * They must stay disjoint. That is what makes "a heading is never read as a description" a
 * property of the layout rather than a hope about relative string lengths.
 */
const GROUP_COLUMN_MIN = 60
const GROUP_COLUMN_MAX = 130

/**
 * A heading is free text in the detail column, starting with a letter.
 *
 * The character class used to be letters and a little punctuation, which quietly rejected two
 * of the headings on a real shipment: `Glass Cartridge Fuses <=1000V` for its digits and
 * comparison, `Elect. Apparatus, Other` for its full stop. A rejected heading is not a blank
 * one — the previous heading stays in force — so a fuse was filed as `Flash drive` and a
 * printed circuit board as `RFID system`, each carrying the commodity above it.
 *
 * So the class is wide, and the *guards* do the discriminating: one item, indented into the
 * detail column, not a label, not a classification, and at least one letter after the first.
 * Those are properties of where the text sits, which is what actually distinguishes a heading
 * from an address.
 *
 * A model code is the one thing position cannot separate, because vendor A prints those in
 * this same column and `SA34-F1` passes any class permissive enough to admit `<=1000V`.
 *
 * Shape separates them, but not by counting spaces: `R6A 7833D` is a model and has one. What
 * every heading on these documents has and no model code does is a *word* — three or more
 * letters running together with no digit among them. `Gaskets`, `Glass Cartridge Fuses
 * <=1000V`, `Elect. Apparatus, Other`, `Robot, not elsewhere spec` all clear it; `SA34-F1`,
 * `R6A 7833D` and `RT6 5450A` do not, because these codes mix a digit into every token.
 */
const GROUP_TEXT = /^[A-Za-z][A-Za-z0-9 ,.&/'()<>=+%-]*[A-Za-z][A-Za-z0-9 ,.&/'()<>=+%-]*$/

/** Contains a word — three or more letters with no digit in them. See `GROUP_TEXT`. */
const readsAsProse = (text: string): boolean => /(?:^|[^A-Za-z0-9])[A-Za-z]{3,}(?:[^A-Za-z0-9]|$)/.test(text)

function isCommodityGroup(row: TextRow): string {
  const items = row.items
  if (items.length !== 1) return ''
  const { str: text, x } = items[0]
  if (x < GROUP_COLUMN_MIN || x > GROUP_COLUMN_MAX) return ''
  if (!text || text.length < 3 || text.endsWith(':') || CLASSIFICATION.test(text)) return ''
  if (isTotalsRow(text)) return ''
  return GROUP_TEXT.test(text) && readsAsProse(text) ? text : ''
}

/**
 * The heading printed just above a block.
 *
 * Floored at the end of the block before it, for the same reason the look-ahead is: a
 * description printed without its part number is a lone row in the heading column, and the
 * widened pattern accepts ordinary descriptions like `CBL, OS32C-CBL-30M`. Unbounded, the
 * previous line's own words became this line's commodity heading — and the heading is what
 * `aggregateLines` files as the SLI row description.
 */
function commodityGroupBefore(rows: TextRow[], startIdx: number, floor: number): string {
  for (let i = startIdx - 1; i > floor && i >= startIdx - 4; i--) {
    const heading = isCommodityGroup(rows[i])
    if (heading) return heading
  }
  return ''
}

/**
 * The heading left stranded at the very foot of a page, whose block begins on the next one.
 *
 * Only one row is considered — the last one before the page's totals row, or the last row on
 * the page where it has none. A page that ends in a stranded heading ends in nothing else,
 * which is what being stranded means, and searching further up finds the page footer instead.
 * The heading is what `aggregateLines` writes as the SLI row description, so a footer
 * reaching it puts the trade terms on an export declaration.
 *
 * Reading the page's final row alone was wrong in both directions at once: a heading printed
 * above a totals row was never seen, and anything printed below one was taken.
 *
 * Not consulted at all when the page's last block runs overleaf. Those closing rows belong to
 * that unfinished block, and reading one as a heading hands the *next* page's goods a
 * description taken from the middle of a line that has not been read yet.
 *
 * Nor when the row is still inside the last block. A block is figures then description, so
 * anything at or before the row after the figures is the block's own; only what follows it
 * can belong to the next one. Guarding on the block's *start* let a block whose description
 * printed without its part number — a lone row in the same column — carry forward as the next
 * page's heading.
 */
function commodityGroupAfter(rows: TextRow[], lastBlockStart: number, carried: boolean, kind: DocumentKind): string {
  if (carried) return ''
  const end = truncateAtPageTotals(rows, lastBlockStart, rows.length)
  const last = end - 1
  return last > blockEndsAt(rows, lastBlockStart, end, kind) ? isCommodityGroup(rows[last]) : ''
}

/**
 * The index of a block's last row of its own.
 *
 * The two kinds put their description on opposite sides of the figures: an invoice block ends
 * `figures` then `part description`, while a packing block carries its description on the
 * first row and ends at the figures. Assuming the invoice's shape put the boundary one row
 * past the end of every packing block, so a heading stranded below one was never carried
 * forward at all.
 */
function blockEndsAt(rows: TextRow[], from: number, to: number, kind: DocumentKind): number {
  const figures = figureRowIn(rows, from, to)
  if (figures === -1) return from
  if (kind !== 'INVOICE') return figures
  // The description row. This layout always prints one, and the alternative reading is not
  // available anyway: a block with no description row is followed directly by the next
  // block's heading, and one lone prose row after the figures looks exactly like the other.
  // Nothing in the document separates them.
  //
  // So the parser takes the reading that keeps this line's own words on this line: the row is
  // the block's description row, and the heading below a *headingless* block is floored out.
  // That is not free, and the cost is worth stating plainly. Where the row really was a
  // heading, `descriptionFrom` reads it as this block's description — the wrong words — and
  // the commodity it headed keeps whatever heading was already in force.
  //
  // The alternative reading is worse, not better: a description printed without its part
  // number is the shape this layout actually produces, so reading those as headings would
  // hand the *next* commodity the previous line's wording *and* leave this one blank. That is
  // the same wrong words one row further down, plus a missing description. Three guards in
  // this file cover cases where it does exactly that.
  return figures + 1
}

/**
 * Where a page's detail rows begin — below the column headers.
 *
 * `continuationRows` uses the same marker to decide what a carried block's tail is. Anchoring
 * a carried block at row 0 instead let page furniture stand in for its figures: `PAGE 2 OF 3`
 * is two numbers on the right of the page, which is all `figureRowIn` looks for.
 */
function detailRowsBegin(rows: TextRow[], upTo: number): number {
  for (let i = 0; i < upTo; i++) if (/MARKS & NOS\./i.test(rowText(rows[i]))) return i + 1
  return 0
}

/** The row carrying a block's quantity, price and value. */
function figureRowIn(rows: TextRow[], from: number, to: number): number {
  for (let i = from; i < to; i++) {
    const numeric = rows[i].items.filter((it) => it.x > FIGURE_COLUMN_MIN && parseNumber(it.str) !== null)
    if (numeric.length >= 2) return i
  }
  return -1
}

interface BlockCore {
  orderNumber: string
  sequence: string
  lineNumber: string
  itemId: string
  classification: string
  uom: string
  classificationRowIdx: number
  lineNumberRowIdx: number
}

/** Fields common to both document kinds, located by content rather than column. */
function readBlockCore(block: TextRow[]): BlockCore | null {
  const start = block[0]
  const orderNumber = start.items[0]?.str ?? ''
  const sequence = start.items[2]?.str ?? ''
  if (!orderNumber) return null

  let lineNumber = ''
  let itemId = ''
  let lineNumberRowIdx = -1
  for (let i = 1; i < block.length; i++) {
    const items = block[i].items
    const idx = items.findIndex((it) => LINE_NUMBER.test(it.str) && it.x < 130)
    if (idx !== -1 && items[idx + 1]) {
      lineNumber = items[idx].str
      itemId = items[idx + 1].str
      lineNumberRowIdx = i
      break
    }
  }

  let classification = ''
  let uom = ''
  let classificationRowIdx = -1
  for (let i = 1; i < block.length; i++) {
    const items = block[i].items
    const idx = items.findIndex((it) => CLASSIFICATION.test(it.str))
    if (idx !== -1) {
      classification = items[idx].str
      // Immediately right of the classification: unit of measure, then currency columns.
      uom = items[idx + 1]?.str ?? ''
      classificationRowIdx = i
      break
    }
  }

  return { orderNumber, sequence, lineNumber, itemId, classification, uom, classificationRowIdx, lineNumberRowIdx }
}

function parseInvoiceBlock(
  block: TextRow[],
  page: TextPage,
  ctx: PageContext,
  commodityGroup: string,
): SourceLine | null {
  const core = readBlockCore(block)
  if (!core) return null

  /**
   * The cells this block has already been read for, by position.
   *
   * Excluding them from the description search by *text* was the obvious way and the wrong
   * one: a description cell that happens to repeat the model — which is how some parts are
   * described — matched the blacklist and the line went out with no description at all.
   * Position is what "already used" actually means.
   */
  const consumed = new Set<string>()
  const consume = (row: number, item: number) => consumed.add(`${row}:${item}`)

  // Country of origin sits to the right of the item id on the line-number row.
  let countryOfOrigin = ''
  if (core.lineNumberRowIdx !== -1) {
    const items = block[core.lineNumberRowIdx].items
    const from = items.findIndex((it) => it.str === core.itemId) + 1
    for (let k = from; k < items.length; k++) consume(core.lineNumberRowIdx, k)
    countryOfOrigin = items.slice(from).map((t) => t.str).join(' ').trim()
  }

  const currency =
    core.classificationRowIdx === -1
      ? ''
      : (block[core.classificationRowIdx].items.find((it) => CURRENCY.test(it.str) && it.str !== core.uom)?.str ?? '')

  // The value row carries quantity, unit price and extended value in the three rightmost
  // numeric columns, in that order.
  let quantity = 0
  let unitValue: number | undefined
  let extendedValue: number | undefined
  let model = ''
  let partNumber = ''
  let valueRowIdx = -1

  for (let i = 1; i < block.length; i++) {
    const numeric = block[i].items.filter((it) => it.x > FIGURE_COLUMN_MIN && parseNumber(it.str) !== null)
    if (numeric.length >= 3) {
      quantity = parseNumber(numeric[0].str) ?? 0
      unitValue = parseNumber(numeric[1].str) ?? undefined
      extendedValue = parseNumber(numeric[2].str) ?? undefined
      valueRowIdx = i
      const left = block[i].items.map((it, k) => ({ it, k })).filter(({ it }) => it.x < FIGURE_COLUMN_MIN)
      // `[marks] model  partNumber` — marks (when present) is furthest left.
      model = left.length >= 2 ? left[left.length - 2].it.str : (left[0]?.it.str ?? '')
      partNumber = left.length >= 1 ? left[left.length - 1].it.str : ''
      if (left.length >= 2) consume(i, left[left.length - 2].k)
      if (left.length >= 1) consume(i, left[left.length - 1].k)
      break
    }
  }

  const description = descriptionFrom(block, valueRowIdx, partNumber, consumed)

  return {
    id: sourceLineId(ctx.set, 'INV', core),
    documentSet: ctx.set,
    documentKind: 'INVOICE',
    page: page.pageNumber,
    orderNumber: core.orderNumber,
    sequence: core.sequence,
    lineNumber: core.lineNumber,
    itemId: core.itemId,
    partNumber,
    model,
    description,
    commodityGroup,
    countryOfOrigin,
    classification: core.classification,
    quantity,
    uom: core.uom,
    currency,
    unitValue,
    extendedValue,
  }
}

/**
 * The description column, which is where a description is and nothing else is.
 *
 * Taking the longest free text anywhere in the block was the original rule, and it is how a
 * commodity heading at the left margin, or the trade terms at the right, could end up
 * describing the goods — both are text, and either can be longer than a terse part
 * description. Bounding the search to the column makes those two impossible rather than
 * merely unlikely, which matters because neither one failed a check: a shipment described as
 * `FOB Origin - Collect` generates and files exactly as cleanly as a correct one.
 */
/** From the `DESCRIPTION OF GOODS` column header at x=144, with room to its left. */
const DESCRIPTION_COLUMN_MIN = 140
/**
 * Left of the figures, and wide enough for both description cells.
 *
 * This layout prints two on a line — a short one at x=192 and a longer one at x=384 (`CA,
 * BELT TO M12 Y-ADAPTER, 3M` beside `Cable, Belt Encoder to M12 Fem`) — and quantity starts
 * at x=421. Tying this to `FIGURE_COLUMN_MIN` looked tidier and cut the second cell off,
 * which cost a real description on a real shipment. Measured, not derived.
 */
const DESCRIPTION_COLUMN_MAX = 400

/**
 * The per-line description is the longest free-text cell in the description column that is
 * not the part number or a code. On the invoice it is printed twice on the last row.
 */
function descriptionFrom(
  block: TextRow[],
  valueRowIdx: number,
  partNumber: string,
  consumed: ReadonlySet<string>,
): string {
  // The block's own rows and no further: figures, then the description row under them. The
  // slice runs on to the next block's first row, so everything past this point belongs to
  // the next commodity — including its heading, which is what used to win on length.
  //
  // With no figure row there is nothing to anchor on, so the whole block is read — with
  // heading rows skipped, which is what keeps the next commodity's heading out of it, and
  // with the fields already read excluded, which keeps the origin out.
  const anchored = valueRowIdx > 0
  const from = anchored ? valueRowIdx : 1
  const to = anchored ? Math.min(from + 2, block.length) : block.length

  // The model and the country of origin share a column with the description — the model at
  // the left margin on the figures row, the origin inside the description column on the
  // line-number row — and either can be longer than a terse one and win on length. Both are
  // skipped by position, so a description that reads the same as one of them still counts.
  //
  // The part number stays a text match: it is printed twice, once as the block's own label
  // beside the description, and a description reading exactly the part number says nothing
  // the part-number column is not already saying.
  const usable = (item: { str: string; x: number }, k: number, i: number, min: number, max: number) =>
    item.x >= min &&
    item.x < max &&
    !consumed.has(`${i}:${k}`) &&
    item.str !== partNumber &&
    !CLASSIFICATION.test(item.str) &&
    parseNumber(item.str) === null &&
    /[a-z]/i.test(item.str)

  const longestIn = (min: number, max: number) => {
    let best = ''
    for (let i = from; i < to; i++) {
      // Only where the search is unanchored, and it has to be only there. In the anchored
      // window the row after the figures is the block's description row — and on this layout
      // that row is often a lone one at the left margin, which is heading-shaped. Skipping it
      // would lose the very description the fallback below exists to find.
      if (!anchored && isCommodityGroup(block[i])) continue
      block[i].items.forEach((item, k) => {
        if (usable(item, k, i, min, max) && item.str.length > best.length) best = item.str
      })
    }
    return best
  }

  // Its own column first, which is where this layout prints it — twice, in fact, and the
  // longer of the two cells is the fuller wording. Failing that, the detail column: a block
  // that prints its description alone at the left margin still has one, and a blank commodity
  // description passes every check there is.
  //
  // The fallback stops at the same left edge headings do. Reaching further took in MARKS &
  // NOS. at x=24, so a block with no description in its own column was declared as its
  // shipping marks — `C/NO. ONE OF TWO` on an export declaration.
  return longestIn(DESCRIPTION_COLUMN_MIN, DESCRIPTION_COLUMN_MAX) || longestIn(GROUP_COLUMN_MIN, FIGURE_COLUMN_MIN)
}

function parsePackingBlock(
  block: TextRow[],
  page: TextPage,
  ctx: PageContext,
  commodityGroup: string,
): SourceLine | null {
  const core = readBlockCore(block)
  if (!core) return null

  // Start row: order, order, sequence, part number, description.
  const startItems = block[0].items
  const partNumber = startItems[3]?.str ?? ''
  const description = startItems.slice(4).map((i) => i.str).join(' ').trim()

  // Quantity and country share a row; quantity is the first numeric right of centre.
  let quantity = 0
  let countryOfOrigin = ''
  let model = ''
  let quantityRow: TextRow | undefined
  for (const row of block) {
    if (row.items.some((i) => i.str === '(')) continue
    const qtyItem = row.items.find((i) => i.x > 340 && i.x < 430 && parseNumber(i.str) !== null)
    if (!qtyItem) continue
    quantity = parseNumber(qtyItem.str) ?? 0
    quantityRow = row
    const between = row.items.filter((i) => i.x > 200 && i.x < qtyItem.x)
    countryOfOrigin = between.map((i) => i.str).join(' ').trim()
    const left = row.items.filter((i) => i.x < 200)
    model = left.length ? left[left.length - 1].str : ''
    break
  }

  // Per-line weights are the numbers printed inside parentheses. The unparenthesised
  // numbers to their upper right are running section totals and must not be read as line
  // data — on a multi-line section they belong to the section, not to this line.
  let netWeightKg: number | undefined
  let grossWeightKg: number | undefined
  let measurementM3: number | undefined

  let weightDivisor: number | undefined

  for (const row of block) {
    const open = row.items.findIndex((i) => i.str === '(')
    const close = row.items.findIndex((i) => i.str === ')')
    if (open === -1 || close === -1 || close < open) continue

    // `(@ / 6)` to the left of the figures means they are the line total split six ways.
    // vendorA4 prints one such line: 1.240 / 1.364 / .333330 against a line whose true
    // weight is 7.438 — the same part and quantity as the line above it, which prints
    // 7.438 outright. Multiplying is what makes the document's own total add up.
    const marker = row.items.slice(0, open).find((i) => DIVIDED_FIGURES.test(i.str))
    const divisor = marker ? Number(DIVIDED_FIGURES.exec(marker.str)?.[1] ?? 1) : 1

    const inner = row.items
      .slice(open + 1, close)
      .map((i) => parseNumber(i.str))
      .filter((n): n is number => n !== null)
    if (inner.length >= 2) {
      netWeightKg = scaleFigure(inner[0], divisor)
      grossWeightKg = scaleFigure(inner[1], divisor)
      measurementM3 = inner[2] === undefined ? undefined : scaleFigure(inner[2], divisor)
      if (divisor !== 1) weightDivisor = divisor
    }
    break
  }

  // A packing list with a single merchandise line omits the parenthesised breakdown
  // entirely and prints only the section totals (vendorA2). With one line in the section
  // those are the line's own weights. If this assumption were ever wrong for a multi-line
  // section, the weight reconciliation check would fail rather than silently overstate.
  if (netWeightKg === undefined && quantityRow) {
    const trailing = quantityRow.items
      .filter((i) => i.x > 430)
      .map((i) => parseNumber(i.str))
      .filter((n): n is number => n !== null)
    if (trailing.length >= 2) {
      netWeightKg = trailing[0]
      grossWeightKg = trailing[1]
      measurementM3 = trailing[2]
    }
  }

  return {
    id: sourceLineId(ctx.set, 'PKG', core),
    documentSet: ctx.set,
    documentKind: 'PACKING_LIST',
    page: page.pageNumber,
    orderNumber: core.orderNumber,
    sequence: core.sequence,
    lineNumber: core.lineNumber,
    itemId: core.itemId,
    partNumber,
    model,
    description,
    commodityGroup,
    countryOfOrigin,
    classification: core.classification,
    quantity,
    uom: core.uom,
    netWeightKg,
    grossWeightKg,
    measurementM3,
    weightDivisor,
  }
}

/**
 * Identity of a physical merchandise line.
 *
 * Order number and sequence alone are not unique: a single purchase-order sequence can
 * carry several order lines (0001, 0002). Including the line number and the lot id — which
 * is unique per physical line across the whole document — means two real lines can never
 * collapse into one id, which would otherwise silently drop a line during the
 * invoice-to-packing-list join and misreport it as a double count.
 */
function sourceLineId(set: DocumentSet, kind: 'INV' | 'PKG', core: BlockCore): string {
  return [set, kind, core.orderNumber, core.sequence, core.lineNumber, core.itemId].join(':')
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}
