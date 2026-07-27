/**
 * Parser for the vendor combined Commercial Invoice & Packing List layout.
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

    lines.push(...parseDetailLines(page, ctx))
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

  return { fileName, pageCount: pages.length, availableSets, headers, lines, warnings }
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

function parseDetailLines(page: TextPage, ctx: PageContext): SourceLine[] {
  const rows = page.rows
  const starts: number[] = []
  for (let i = 0; i < rows.length; i++) if (isLineStart(rows[i])) starts.push(i)
  if (!starts.length) return []

  const lines: SourceLine[] = []
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : rows.length
    const block = rows.slice(from, truncateAtPageTotals(rows, from, to))
    const commodityGroup = commodityGroupBefore(rows, from)
    const line = ctx.kind === 'INVOICE' ? parseInvoiceBlock(block, page, ctx, commodityGroup) : parsePackingBlock(block, page, ctx, commodityGroup)
    if (line) lines.push(line)
  }
  return lines
}

/**
 * The final line block on a page would otherwise run into the page footer, letting the
 * trade-terms text be mistaken for a commodity description. Cut the block at the totals row.
 */
function truncateAtPageTotals(rows: TextRow[], from: number, to: number): number {
  for (let i = from + 1; i < to; i++) {
    const text = rowText(rows[i])
    if (/^\s*TOTALS?:?\b/i.test(text) || /CARTONS ONLY/i.test(text) || /\bTOTALS\b/.test(text)) return i
  }
  return to
}

/** The commodity heading (`Electrical Conductors`) printed just above a line block. */
function commodityGroupBefore(rows: TextRow[], startIdx: number): string {
  for (let i = startIdx - 1; i >= 0 && i >= startIdx - 4; i--) {
    const items = rows[i].items
    if (items.length !== 1) continue
    const text = items[0].str
    if (!text || text.endsWith(':') || CLASSIFICATION.test(text)) continue
    if (/^[A-Za-z][A-Za-z ,&/-]{2,}$/.test(text)) return text
  }
  return ''
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

  // Country of origin sits to the right of the item id on the line-number row.
  let countryOfOrigin = ''
  if (core.lineNumberRowIdx !== -1) {
    const items = block[core.lineNumberRowIdx].items
    const tail = items.slice(items.findIndex((it) => it.str === core.itemId) + 1)
    countryOfOrigin = tail.map((t) => t.str).join(' ').trim()
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
    const numeric = block[i].items.filter((it) => it.x > 380 && parseNumber(it.str) !== null)
    if (numeric.length >= 3) {
      quantity = parseNumber(numeric[0].str) ?? 0
      unitValue = parseNumber(numeric[1].str) ?? undefined
      extendedValue = parseNumber(numeric[2].str) ?? undefined
      valueRowIdx = i
      const left = block[i].items.filter((it) => it.x < 380)
      // `[marks] model  partNumber` — marks (when present) is furthest left.
      model = left.length >= 2 ? left[left.length - 2].str : (left[0]?.str ?? '')
      partNumber = left.length >= 1 ? left[left.length - 1].str : ''
      break
    }
  }

  const description = descriptionFrom(block, valueRowIdx, partNumber)

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
 * The per-line description is the longest free-text cell in the block that is not the part
 * number or a code. On the invoice it is printed twice on the last row.
 */
function descriptionFrom(block: TextRow[], valueRowIdx: number, partNumber: string): string {
  let best = ''
  for (let i = Math.max(valueRowIdx, 1); i < block.length; i++) {
    for (const item of block[i].items) {
      const s = item.str
      if (s === partNumber || CLASSIFICATION.test(s) || parseNumber(s) !== null) continue
      if (s.length > best.length && /[a-z]/i.test(s)) best = s
    }
  }
  return best
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

  for (const row of block) {
    const open = row.items.findIndex((i) => i.str === '(')
    const close = row.items.findIndex((i) => i.str === ')')
    if (open === -1 || close === -1 || close < open) continue
    const inner = row.items
      .slice(open + 1, close)
      .map((i) => parseNumber(i.str))
      .filter((n): n is number => n !== null)
    if (inner.length >= 2) {
      netWeightKg = inner[0]
      grossWeightKg = inner[1]
      measurementM3 = inner[2]
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
