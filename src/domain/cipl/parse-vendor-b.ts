/**
 * Parser for the SAP-style "SHIPMENT#" commercial invoice and master packing list.
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
/** Right-hand header label column; the left address block must stop before it. */
const HEADER_LABEL_X = 300

export function isVendorBFormat(pages: TextPage[]): boolean {
  const firstPage = pages[0]
  if (!firstPage) return false
  const text = firstPage.rows.map(rowText).join(' ')
  return /SHIPMENT#/i.test(text)
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
    lines.push(...parseLineBlocks(page, kind))
  }

  if (!header) {
    warnings.push('No shipment header could be read from this file.')
  }

  const invoiceLines = lines.filter((l) => l.documentKind === 'INVOICE')
  const packingLines = lines.filter((l) => l.documentKind === 'PACKING_LIST')

  if (header) {
    header.orderNumbers = distinct(invoiceLines.map((l) => l.orderNumber).filter(Boolean))
    // Sales orders and customer POs are different columns in this layout, and the CEVA form
    // has a box for each. Keeping them apart is what stops vendor's own sales order being
    // filed as the consignee's purchase order.
    header.purchaseOrders = distinct(invoiceLines.map((l) => l.purchaseOrder ?? '').filter(Boolean))
    header.totalQuantity = round(invoiceLines.reduce((sum, l) => sum + l.quantity, 0), 3)
    // The printed "Total Net Value" is authoritative; fall back to the sum of the lines.
    if (!header.totalValue) {
      header.totalValue = round(invoiceLines.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0), 2)
    }
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

  return {
    fileName,
    format: 'vendor-b',
    providesWeights: false,
    pageCount: pages.length,
    availableSets: ['FC'],
    headers: header ? { FC: header } : {},
    lines,
    warnings,
  }
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

  const shipmentNumber = rightOfLabel(rows, 'SHIPMENT#') ?? ''
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
    const index = row.items.findIndex((item) => item.str.toLowerCase().startsWith(target))
    if (index === -1) continue
    const value = row.items
      .slice(index + 1)
      .filter((item) => !isLikelyBarcode(item.str))
      .map((item) => item.str)
      .join(' ')
      .trim()
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

function parseLineBlocks(page: TextPage, kind: DocumentKind): SourceLine[] {
  const rows = page.rows
  const starts: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].items.some((item) => item.x < COL_ORDER.max && SALES_ORDER_LINE.test(item.str))) starts.push(i)
  }
  if (!starts.length) return []

  const lines: SourceLine[] = []
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : endOfTable(rows, from)
    const line = parseBlock(rows.slice(from, to), page, kind)
    if (line) lines.push(line)
  }
  return lines
}

/** The last block runs to the totals row or the summary section, not to the page footer. */
function endOfTable(rows: TextRow[], from: number): number {
  for (let i = from + 1; i < rows.length; i++) {
    const text = rowText(rows[i]).toUpperCase()
    if (text.includes('TOTAL NET VALUE') || text.includes('SUMMARY INFORMATION') || text.includes('Vendor A')) {
      return i
    }
  }
  return rows.length
}

/** How far a continuation cell may sit from its column's anchor and still belong to it. */
const COLUMN_TOLERANCE = 30

function parseBlock(block: TextRow[], page: TextPage, kind: DocumentKind): SourceLine | null {
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
          currency: 'USD',
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
