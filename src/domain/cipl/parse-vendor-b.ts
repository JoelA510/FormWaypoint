/**
 * Parser for the SAP-style shipment-banner commercial invoice and master packing list.
 *
 * Structurally unlike the FC/TP1 layout in three ways that matter:
 *
 *  1. **One currency, one copy.** No duplicate document set, so nothing has to be excluded.
 *     Everything is reported under the synthetic `FC` set so downstream code is unchanged.
 *  2. **No weights anywhere.** The master packing list has a Quantity column and a Box ID
 *     column and nothing else. Every weight on the SLIs filed from this format came from
 *     outside the document, so `providesWeights` is false and the reconciliation refuses to
 *     pretend the figures were proved against the source.
 *  3. **It carries an ECCN.** The Shipping Codes column holds `HSCD: <code>` and sometimes
 *     `ECCN: <code>`. Where an ECCN is printed it is authoritative — one sample line reads
 *     `ECCN: 5A992.C` while the SLI filed for it says EAR99, which is exactly the
 *     substitution this tool must surface rather than repeat.
 *
 * The commercial invoice is the controlling document: it carries prices, and its Quantity
 * column agrees with the packing list's summary totals. The packing list is parsed only to
 * confirm the same lines appear on both.
 */
import type { DocumentKind, ParsedCipl, PartyAddress, ShipmentHeader, SourceLine } from '../types'
import { extractTextPages, isLikelyBarcode, parseNumber, rowText, type TextPage, type TextRow } from './extract-text'
import { partKey } from '../part-key'

/**
 * `13383820.1.000` — sales order, line, schedule line. The master packing list appends the
 * slip code to the same cell (`13383820.1.000 SG`), so a trailing token is tolerated.
 */
const SALES_ORDER_LINE = /^(\d{6,})\.(\d+)\.(\d+)(?:\s+\S+)?$/
const SHIPPING_CODE = /^(HSCD|ECCN)\s*:\s*(.+)$/i
/** `1.00 EA` */
const QUANTITY_UOM = /^([\d,]+\.?\d*)\s+([A-Z]{2,4})$/

// Only the leftmost column is fixed; the rest are calibrated per block. See parseBlock.
const COL_ORDER = { min: 0, max: 80 }
/**
 * Text printed on the source documents, kept in one place.
 *
 * These are layout markers, not a vendor endorsement, and they are deliberately generic so
 * this repository carries no customer's name. A deployment whose documents need a stricter
 * marker can supply one through the environment without editing code; see `.env.example`.
 */
const env: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env) || {}

/** Label that precedes the shipment number in the header block. */
export const SHIPMENT_NUMBER_LABEL = env.VITE_CIPL_SHIPMENT_LABEL || 'SHIPMENT#'

/**
 * Rows that mark the end of a line-item table. The first two are standard; the third is
 * optional and exists for layouts that close the table with the exporter's own name.
 */
const TABLE_END_MARKERS = [
  'TOTAL NET VALUE',
  'SUMMARY INFORMATION',
  ...(env.VITE_CIPL_TABLE_END_MARKER ? [env.VITE_CIPL_TABLE_END_MARKER.toUpperCase()] : []),
]

/** Right-hand header label column; the left address block must stop before it. */
const HEADER_LABEL_X = 300

export function isVendorBFormat(pages: TextPage[]): boolean {
  const firstPage = pages[0]
  if (!firstPage) return false
  const text = firstPage.rows.map(rowText).join(' ')
  return text.toUpperCase().includes(SHIPMENT_NUMBER_LABEL.toUpperCase())
}

export function parseVendorBPages(fileName: string, pages: TextPage[]): ParsedCipl {
  const warnings: string[] = []
  const lines: SourceLine[] = []
  let header: ShipmentHeader | null = null

  for (const page of pages) {
    const kind = pageKind(page)
    if (!kind) {
      warnings.push(`Page ${page.pageNumber}: unrecognised page type; skipped.`)
      continue
    }
    if (!header) header = parseHeader(page)
    const block = parseLineBlocks(page, kind, header.documentCurrency)
    lines.push(...block.lines)
    for (const refusal of block.refused) {
      warnings.push(
        `Page ${page.pageNumber}: a line block could not be read and was left out — ${refusal}. ` +
          'Check this line against the document before filing.',
      )
    }
  }

  if (!header) {
    warnings.push('No shipment header could be read from this file.')
  }

  const invoiceLines = lines.filter((l) => l.documentKind === 'INVOICE')
  const packingLines = lines.filter((l) => l.documentKind === 'PACKING_LIST')

  if (header) {
    /**
     * The printed total is on the *last* invoice page, not the first.
     *
     * The header is read from the first page, which on a multi-page invoice carries no total
     * at all — so this used to find nothing and fall back to summing the very lines the
     * total-value check then compared it against. That made the check self-referential: it
     * could never fail, however many lines the parser had dropped. Shipment vendorB3 lost a
     * line and reconciled perfectly at 8,445.61 against a document that says 8,483.88.
     *
     * So every page is searched, and no line-derived fallback is used. A total that cannot
     * be read leaves zero, which fails the check loudly — an unproved total is not the same
     * as a proved one.
     */
    // The *last* invoice page, not the first match anywhere. A layout that prints a
    // carried-forward subtotal per page would otherwise hand back page one's subtotal as the
    // shipment total and fail a correctly parsed document; a packing-list page carrying the
    // label would otherwise outrank the invoice's own figure.
    const printedTotal = pages
      .filter((page) => pageKind(page) === 'INVOICE')
      .map((page) => parseNumber(rightOfLabel(page.rows, 'Total Net Value:')))
      .filter((value): value is number => value != null)
      .at(-1)
    if (printedTotal != null) {
      header.totalValue = printedTotal
    } else {
      // Zeroed, not left alone. The header was seeded from the first recognised page, and
      // `parseHeader` reads the same label off whatever page that is — including a packing
      // list, which this layout can also print it on. Leaving that figure standing would let
      // the total-value check pass against a number the invoice never printed, underneath a
      // warning saying the total could not be proved.
      header.totalValue = 0
      warnings.push(
        'No "Total Net Value" could be read from this invoice, so the commodity values cannot be proved ' +
          'against the document. Check the total by hand before filing.',
      )
    }

    header.orderNumbers = distinct(invoiceLines.map((l) => l.orderNumber).filter(Boolean))
    // Sales orders and customer POs are different columns in this layout, and the CEVA form
    // has a box for each. Keeping them apart is what stops the vendor's own sales order being
    // filed as the consignee's purchase order.
    header.purchaseOrders = distinct(invoiceLines.map((l) => l.purchaseOrder ?? '').filter(Boolean))
    // This layout prints no quantity total, so this is the sum of the lines and the
    // `total-quantity` check that compares against it is therefore self-referential — it
    // proves only that addition works. The real quantity check for this format is
    // `packing-summary` below, which uses the per-part totals the document does print.
    header.totalQuantity = round(invoiceLines.reduce((sum, l) => sum + l.quantity, 0), 3)
  }

  if (invoiceLines.length && packingLines.length && invoiceLines.length !== packingLines.length) {
    warnings.push(
      `The commercial invoice lists ${invoiceLines.length} line(s) but the master packing list lists ` +
        `${packingLines.length}. The invoice is used; check the packing list.`,
    )
  }

  warnings.push(
    'This format prints no weights. Box 26 must be supplied from the saved per-part weights or entered by hand.',
  )

  const partTotals = parsePartTotals(pages)

  // A summary section the parser could not read is worse than none at all: the check it
  // feeds simply disappears, and the two totals left for this format are — by their own
  // comments — sums of the very lines they are meant to prove. So say so.
  if (!Object.keys(partTotals).length && pages.some(hasSummarySection)) {
    warnings.push(
      'The packing list has a summary section but none of its per-part totals could be read, so the parts on ' +
        'this shipment could not be checked against it. Compare them by hand before filing.',
    )
  }

  return {
    fileName,
    format: 'vendor-b',
    providesWeights: false,
    pageCount: pages.length,
    availableSets: ['FC'],
    headers: header ? { FC: header } : {},
    lines,
    ...(Object.keys(partTotals).length ? { partTotals } : {}),
    warnings,
  }
}

/**
 * `Item Number: 44508-0711 Total Qty: 2.00`, from the packing list's summary section.
 *
 * The one figure in this layout that is not derived from the line blocks the parser reads,
 * which is what makes it worth having: a line that fails to parse still appears here, so the
 * totals stop agreeing and the shipment is held. Everything else this format prints is
 * either a line or a sum of the lines.
 *
 * A part listed twice is summed rather than overwritten — the summary is keyed on the item
 * number and should not repeat, but a repeat that silently replaced the earlier figure would
 * understate the shipment, and understating is the failure that matters here.
 */
const SUMMARY_LINE = /Item Number:\s*(\S+)\s+Total Qty:\s*([\d,]+\.?\d*)/i

/** The marker `endOfTable` already keys off, so the parser knows the section exists. */
function hasSummarySection(page: TextPage): boolean {
  return page.rows.some((row) => rowText(row).toUpperCase().includes('SUMMARY INFORMATION'))
}

function parsePartTotals(pages: TextPage[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const page of pages) {
    for (const row of page.rows) {
      const match = rowText(row).match(SUMMARY_LINE)
      if (!match) continue
      const quantity = parseNumber(match[2])
      if (quantity == null) continue
      const part = partKey(match[1])
      totals[part] = round((totals[part] ?? 0) + quantity, 3)
    }
  }
  return totals
}

export async function parseVendorBShipment(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ParsedCipl> {
  return parseVendorBPages(fileName, await extractTextPages(data))
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function pageKind(page: TextPage): DocumentKind | null {
  const text = page.rows.slice(0, 6).map(rowText).join(' ').toUpperCase()
  if (text.includes('PACKING LIST')) return 'PACKING_LIST'
  if (text.includes('COMMERCIAL') || text.includes('INVOICE')) return 'INVOICE'
  return null
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function parseHeader(page: TextPage): ShipmentHeader {
  const rows = page.rows

  const shipmentNumber = rightOfLabel(rows, SHIPMENT_NUMBER_LABEL) ?? ''
  const shipDate = rightOfLabel(rows, 'Ship Date:') ?? ''
  const currency = rightOfLabel(rows, 'Currency:') ?? ''
  const modeOfTransport = rightOfLabel(rows, 'Mode of Transport:') ?? null
  const freightHandling = rightOfLabel(rows, 'Freight Handling:') ?? null

  const soldTo = leftAddressBlock(rows, 'Sold To:')
  const consignedTo = leftAddressBlock(rows, 'Ship To:')

  const totalValue = parseNumber(rightOfLabel(rows, 'Total Net Value:')) ?? 0

  return {
    invoiceNumber: shipmentNumber,
    // This format prints a single Ship Date and no separate invoice date; the filed SLIs
    // use it directly for box 2.
    invoiceDate: shipDate,
    onOrAboutDate: null,
    soldTo,
    consignedTo,
    notifyTo: null,
    shippedFrom: null,
    // No discharge port is printed, which is why the destination country has to be
    // confirmed by the reviewer for this format.
    dischargePort: null,
    vesselAgent: modeOfTransport,
    orderNumbers: [],
    purchaseOrders: [],
    tradeTerms: null,
    // No Incoterm appears anywhere in this layout. It is left null rather than guessed.
    incoterm: null,
    freightTerms: freightTermsFrom(freightHandling),
    cartons: null,
    documentCurrency: currency,
    totalQuantity: 0,
    totalValue,
    totalNetWeightKg: null,
    totalGrossWeightKg: null,
    totalMeasurementM3: null,
  }
}

function freightTermsFrom(handling: string | null): 'PREPAID' | 'COLLECT' | null {
  const upper = (handling ?? '').toUpperCase()
  if (upper.includes('COLLECT')) return 'COLLECT'
  if (upper.includes('PREPAID')) return 'PREPAID'
  return null
}

/** Value printed immediately right of a label cell. */
function rightOfLabel(rows: TextRow[], label: string): string | undefined {
  const target = label.toLowerCase()
  for (const row of rows) {
    const index = row.items.findIndex((item) => item.str.toLowerCase().includes(target))
    if (index === -1) continue
    // The label may sit mid-item ("<exporter> SHIPMENT# 12345"); take whatever follows it
    // inside that item first, then continue with the rest of the row.
    const matched = row.items[index].str
    const inline = matched.slice(matched.toLowerCase().indexOf(target) + target.length).trim()
    const rest = row.items
      .slice(index + 1)
      .filter((item) => !isLikelyBarcode(item.str))
      .map((item) => item.str)
      .join(' ')
      .trim()
    const value = [inline, rest].filter(Boolean).join(' ').trim()
    if (value) return value
  }
  return undefined
}

/**
 * The `Sold To:` / `Ship To:` blocks occupy the left half; the right half carries unrelated
 * header labels on the same rows, so the band is bounded well before them.
 */
function leftAddressBlock(rows: TextRow[], label: string): PartyAddress {
  const start = rows.findIndex((row) => row.items.some((i) => i.str.toLowerCase().startsWith(label.toLowerCase())))
  if (start === -1) return { name: '', lines: [], country: null }

  const marker = rows[start].items.find((i) => i.str.toLowerCase().startsWith(label.toLowerCase()))!
  const valueX = rows[start].items.find((i) => i.x > marker.x && i.x < HEADER_LABEL_X)?.x
  if (valueX === undefined) return { name: '', lines: [], country: null }

  const collected: string[] = []
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]
    // Stop at the next left-hand label, and at the commodity table header.
    if (i > start && row.items.some((it) => it.x < valueX - 20 && /:$|^SO #|^Sales Order/.test(it.str))) break
    const cells = row.items.filter(
      (it) => it.x >= valueX - 8 && it.x < HEADER_LABEL_X - 10 && !isLikelyBarcode(it.str),
    )
    if (!cells.length) continue
    collected.push(cells.map((c) => c.str).join(' ').trim())
  }

  const [name = '', ...rest] = collected
  return { name, lines: rest, country: null }
}

// ---------------------------------------------------------------------------
// Line blocks
// ---------------------------------------------------------------------------

/**
 * Every line block on a page, plus the ones that could not be read.
 *
 * Refusals are returned rather than dropped. `parseBlock` declines a block whose columns do
 * not line up, which is the right call — filing a shipping code as a commodity description
 * would be worse than not filing the line. But a refusal that nobody hears is just a missing
 * line, and on shipment vendorB3 that is exactly what happened: one block was refused, the
 * line vanished, and the only way to notice was to read the PDF beside the screen.
 */
function parseLineBlocks(
  page: TextPage,
  kind: DocumentKind,
  currency: string,
): { lines: SourceLine[]; refused: string[] } {
  const rows = page.rows
  const starts: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].items.some((item) => item.x < COL_ORDER.max && SALES_ORDER_LINE.test(item.str))) starts.push(i)
  }
  if (!starts.length) return { lines: [], refused: [] }

  const lines: SourceLine[] = []
  const refused: string[] = []
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : endOfTable(rows, from)
    const block = rows.slice(from, to)
    const line = parseBlock(block, page, kind, currency)
    if (line) lines.push(line)
    else refused.push(describeBlock(block))
  }
  return { lines, refused }
}

/** Enough of a refused block to find it in the PDF: its sales order, and the part if legible. */
function describeBlock(block: TextRow[]): string {
  const cells = block[0].items.map((i) => i.str)
  const order = cells.find((c) => SALES_ORDER_LINE.test(c)) ?? '(unidentified)'
  const part = cells.find((c) => c !== order && !isLikelyBarcode(c) && !isStructuralCell(c))
  return part ? `${order} (${part})` : order
}

/** The last block runs to the totals row or the summary section, not to the page footer. */
function endOfTable(rows: TextRow[], from: number): number {
  for (let i = from + 1; i < rows.length; i++) {
    const text = rowText(rows[i]).toUpperCase()
    if (TABLE_END_MARKERS.some((marker) => text.includes(marker))) {
      return i
    }
  }
  return rows.length
}

/** How far a continuation cell may sit from its column's anchor and still belong to it. */
const COLUMN_TOLERANCE = 30

function parseBlock(block: TextRow[], page: TextPage, kind: DocumentKind, currency: string): SourceLine | null {
  // The head row is the calibration: its cells are, left to right, the sales order, the
  // item number, the description, the shipping code, the quantity, then prices. Their x
  // positions define this page's columns, which matters because the commercial invoice and
  // the master packing list use the same layout at different offsets (item # at x=88 on one
  // and x=118 on the other). Anchoring to the head row rather than to fixed bands means
  // both pages — and any future re-spacing — parse with the same code.
  const head = block[0].items.filter((i) => !isLikelyBarcode(i.str)).sort((a, b) => a.x - b.x)
  const orderIndex = head.findIndex((i) => i.x < COL_ORDER.max && SALES_ORDER_LINE.test(i.str))
  if (orderIndex === -1) return null

  const [, salesOrder, orderLine, schedule] = head[orderIndex].str.match(SALES_ORDER_LINE)!
  const itemAnchor = head[orderIndex + 1]
  const descriptionAnchor = head[orderIndex + 2]
  if (!itemAnchor || !descriptionAnchor) return null
  // Positional indexing is only safe while those two cells really are the item number and
  // the description. If a line omitted one, the description anchor would land on the
  // shipping code and "HSCD: 8537.10.9090" would be filed as the commodity description —
  // silently. Refuse the block instead; the caller reports the shortfall.
  if (isStructuralCell(itemAnchor.str) || isStructuralCell(descriptionAnchor.str)) return null

  const partNumber = itemAnchor.str
  const description = descriptionAnchor.str

  const near = (anchorX: number) =>
    block
      .slice(1)
      .flatMap((row) => row.items)
      .filter((i) => !isLikelyBarcode(i.str) && Math.abs(i.x - anchorX) <= COLUMN_TOLERANCE)

  // Below the item number: an optional customer reference, then the country of origin last.
  const itemColumn = near(itemAnchor.x).map((i) => i.str)
  const countryOfOrigin = itemColumn.at(-1) ?? ''
  const customerReference = itemColumn.length > 1 ? itemColumn[0] : ''

  // Below the description: the lot or serial number, when the part carries one.
  const lotSerial = near(descriptionAnchor.x)[0]?.str ?? ''

  // Purchase order sits under the sales order, in the leftmost column.
  const purchaseOrder = near(head[orderIndex].x).find((i) => /^\d{6,}$/.test(i.str))?.str ?? ''

  // Shipping codes: `HSCD: <code>` on the head row, `ECCN: <code>` beneath it when present.
  let classification = ''
  let eccn: string | undefined
  for (const cell of [...head, ...block.slice(1).flatMap((r) => r.items)]) {
    const match = cell.str.match(SHIPPING_CODE)
    if (!match) continue
    if (match[1].toUpperCase() === 'HSCD') classification ||= match[2].trim()
    else eccn ??= match[2].trim()
  }

  let quantity = 0
  let uom = ''
  let quantityX = Infinity
  for (const cell of head) {
    const match = cell.str.match(QUANTITY_UOM)
    if (match) {
      quantity = parseNumber(match[1]) ?? 0
      uom = match[2]
      quantityX = cell.x
      break
    }
  }

  // Prices are the numeric cells right of the quantity, on the head row *only*. A
  // dual-currency shipment repeats them underneath in the same columns (vendorB2 prints USD
  // 625.68 / 1,251.37 above BRL 3,202.00 / 6,404.00), so scanning the block would pick the
  // foreign figure as the extended value. On the packing list nothing numeric follows the
  // quantity — the Box ID is text — so this correctly yields no prices.
  const prices = head
    .filter((i) => i.x > quantityX)
    .map((i) => ({ x: i.x, value: parseNumber(i.str) }))
    .filter((p): p is { x: number; value: number } => p.value !== null)
    .sort((a, b) => a.x - b.x)

  return {
    id: [kind === 'INVOICE' ? 'INV' : 'PKG', salesOrder, orderLine, schedule, partNumber].join(':'),
    documentSet: 'FC',
    documentKind: kind,
    page: page.pageNumber,
    // The sales order is the reference the filed SLIs put in the shipment-reference box.
    orderNumber: salesOrder,
    sequence: orderLine,
    lineNumber: schedule,
    // Box ID is deliberately *not* used as the line identifier: it is one value for the
    // entire shipment here, so joining on it would let any line match any other. The
    // lot/serial is used when present, otherwise the join falls back to sales order + line.
    itemId: lotSerial,
    partNumber,
    model: customerReference,
    description,
    commodityGroup: '',
    countryOfOrigin,
    classification,
    eccn,
    quantity,
    uom,
    // The customer purchase order, kept for the CEVA consignee-PO box.
    purchaseOrder,
    ...(kind === 'INVOICE'
      ? {
          // Whatever the document declares, not an assumption. These prices are the
          // left-hand column of a layout that can print a second currency underneath, and
          // labelling them USD regardless would hide a foreign-priced invoice from the
          // reconciliation's currency check rather than surface it.
          currency,
          unitValue: prices[0]?.value,
          extendedValue: prices.length > 1 ? prices[1].value : prices[0]?.value,
        }
      : {}),
  }
}

/** A cell that belongs to a later column and can never be the item number or description. */
function isStructuralCell(text: string): boolean {
  return SHIPPING_CODE.test(text) || QUANTITY_UOM.test(text) || parseNumber(text) !== null
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
