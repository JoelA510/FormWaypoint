/**
 * Builds CIPL PDFs that reproduce the supported layouts without reproducing a customer's data.
 *
 * Real shipment documents cannot be committed — they are part numbers, values, consignees
 * and classifications belonging to someone else — which left the parser suite unable to run
 * anywhere but a machine that happened to have the originals. That is the wrong trade for
 * the piece of this tool most able to put a wrong number on a customs form.
 *
 * So the fixtures are drawn instead. The column positions, the five-row block, the row
 * pitch and the page furniture are all taken from measurements of the real documents, which
 * is what the parser keys off; the goods are invented. That also makes it possible to test
 * shapes no real document to hand happens to contain — a block split across a page break,
 * weights printed divided, a heading stranded at a page foot — deliberately rather than by
 * waiting for one to turn up.
 *
 * This is a fixture builder, not a second implementation of the format: if the layout drifts
 * far enough that the parser needs changing, this needs changing too, and the real documents
 * remain the final word.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

export interface SyntheticLine {
  order: string
  sequence: string
  lineNumber: string
  itemId: string
  partNumber: string
  model: string
  description: string
  /** Heading printed above this line. Repeat it to keep the previous one in force. */
  commodityGroup?: string
  country: string
  classification: string
  quantity: number
  unitPrice: number
  netWeightKg: number
  grossWeightKg: number
  carton: string
  /** Print this line's packing figures divided N ways, as `(@ / N)`. */
  weightDivisor?: number
}

export interface SyntheticCipl {
  invoiceNumber: string
  invoiceDate: string
  onOrAboutDate?: string
  consigneeName: string
  consigneeLines: string[]
  soldToName: string
  vesselAgent: string
  shippedFrom: string
  dischargePort: string
  tradeTerms: string
  cartons: number
  lines: SyntheticLine[]
  /** Lines per detail page. Lower it to force a block over a page break. */
  linesPerPage?: number
  /** Emit the TP1 set as well, priced in another currency. */
  includeTp1?: boolean
  /**
   * Order numbers to print in the header's P/O field instead of the ones the lines carry.
   *
   * The field normally lists what the lines list, truncated. Setting it apart is how a
   * header that names an order no line item accounts for — the shape of a lost line — gets
   * put in front of the parser.
   */
  headerOrders?: string[]
}

const PAGE = { width: 612, height: 792 }
const ROW = 12
const BLOCK_GAP = 24

interface Cursor {
  page: PDFPage
  y: number
}

function text(page: PDFPage, str: string, x: number, y: number, font: PDFFont, size = 7) {
  if (!str) return
  page.drawText(str, { x, y, size, font })
}

const money = (n: number) => n.toFixed(3)
const weight = (n: number) => (n < 1 ? n.toFixed(3).replace(/^0/, '') : n.toFixed(3))

/**
 * The header page: everything `parseHeaderPage` reads, at the offsets it reads them from.
 * `INVOICE NUMBER:` is what marks a page as a header, and the set marker sits far right.
 */
function drawHeaderPage(doc: PDFDocument, spec: SyntheticCipl, set: string, kind: string, font: PDFFont) {
  const page = doc.addPage([PAGE.width, PAGE.height])
  let y = 757
  text(page, 'Vendor A Manufacturing, Inc.', 308, y, font)
  text(page, set, 594, y, font)
  y -= 10
  text(page, kind, 36, y, font)
  text(page, '4225 Hacienda Drive', 306, y, font)
  y -= 14
  text(page, 'Pleasanton CA 94588', 306, y, font)
  y -= 6
  text(page, 'SOLD TO:', 36, y, font)
  text(page, spec.soldToName, 102, y, font)

  text(page, 'INVOICE NUMBER:', 306, 673, font)
  text(page, spec.invoiceNumber, 414, 673, font)
  text(page, 'DATE:', 306, 661, font)
  text(page, spec.invoiceDate, 414, 661, font)

  text(page, 'CONSIGNED TO:', 36, 643, font)
  text(page, spec.consigneeName, 102, 643, font)
  let addressY = 631
  for (const line of spec.consigneeLines) {
    text(page, line, 102, addressY, font)
    addressY -= 12
  }

  text(page, 'VESSEL AGENT OR AIR LINES:', 306, 625, font)
  text(page, spec.vesselAgent, 414, 625, font)
  text(page, 'SHIPPED FROM:', 306, 613, font)
  text(page, spec.shippedFrom, 414, 613, font)
  if (spec.onOrAboutDate) text(page, `ON OR ABOUT ${spec.onOrAboutDate}`, 414, 601, font)
  text(page, 'DISCHARGE PORT:', 306, 589, font)
  text(page, spec.dischargePort, 414, 589, font)

  // The P/O field is a fixed-width display field; three per row is what the real form fits.
  text(page, 'P/O NUMBER:', 306, 577, font)
  const orders = spec.headerOrders ?? [...new Set(spec.lines.map((l) => l.order))]
  orders.slice(0, 6).forEach((order, i) => {
    text(page, order, 414 + (i % 3) * 72, 577 - Math.floor(i / 3) * 12, font)
  })
  text(page, 'NOTIFY TO:', 36, 559, font)
  text(page, 'SAME AS BUYER', 102, 559, font)

  const totalQty = spec.lines.reduce((s, l) => s + l.quantity, 0)
  if (kind === 'PACKING LIST') {
    text(page, 'NET', 432, 499, font)
    text(page, 'GROSS', 498, 499, font)
    const net = spec.lines.reduce((s, l) => s + l.netWeightKg, 0)
    const gross = spec.lines.reduce((s, l) => s + l.grossWeightKg, 0)
    const measurement = spec.lines.reduce((s, l) => s + l.quantity, 0)
    // The units row is how the parser finds the totals above it: `KGS KGS M3`.
    text(page, net.toFixed(3), 438, 463, font)
    text(page, gross.toFixed(3), 504, 463, font)
    text(page, measurement.toFixed(6), 559, 463, font)
    text(page, 'KGS', 444, 451, font)
    text(page, 'KGS', 510, 451, font)
    text(page, 'M3', 582, 451, font)
  } else {
    const total = spec.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    text(page, total.toFixed(3), 550, 463, font)
    text(page, 'USD', 588, 463, font)
  }
  text(page, 'MARKS & NOS.', 30, 487, font)
  text(page, 'DESCRIPTION OF GOODS', 150, 487, font)
  text(page, 'TOTAL:', 30, 445, font)
  text(page, String(totalQty), 108, 445, font)
  text(page, 'PCS', 120, 445, font)
  text(page, 'CARTONS:', 30, 433, font)
  text(page, String(spec.cartons), 72, 433, font)
  text(page, 'TRADE TERMS:', 372, 409, font)
  text(page, spec.tradeTerms, 432, 409, font)
}

function startDetailPage(doc: PDFDocument, spec: SyntheticCipl, kind: string, font: PDFFont): Cursor {
  const page = doc.addPage([PAGE.width, PAGE.height])
  text(page, 'INVOICE NO', 36, 757, font)
  text(page, spec.invoiceNumber, 90, 757, font)
  text(page, 'Page', 540, 757, font)
  text(page, '2', 581, 757, font)
  text(page, kind, 264, 753, font)
  if (kind === 'PACKING LIST') {
    text(page, 'NET', 426, 721, font)
    text(page, 'GROSS', 492, 721, font)
  }
  // The column-header row: `continuationRows` uses it to find where furniture ends.
  text(page, 'MARKS & NOS.', 24, 709, font)
  text(page, 'DESCRIPTION OF GOODS', 144, 709, font)
  text(page, 'ORIGIN', 264, 709, font)
  text(page, 'QUANTITY', 366, 709, font)
  if (kind === 'PACKING LIST') {
    text(page, 'WEIGHT', 426, 709, font)
    text(page, 'WEIGHT', 492, 709, font)
    text(page, 'MEASUREMENT', 534, 709, font)
  } else {
    text(page, 'UNIT PRICE', 462, 709, font)
    text(page, 'TOTAL', 558, 709, font)
  }
  // Consignee block, then `C/NO` and `COUNTRY OF ORIGIN` — the furniture whose city used to
  // be mistaken for a commodity heading, which is why it is reproduced here.
  text(page, spec.consigneeName, 24, 679, font)
  text(page, spec.consigneeLines.at(-1) ?? '', 24, 667, font)
  text(page, 'C/NO', 24, 655, font)
  text(page, '-', 50, 655, font)
  text(page, 'COUNTRY OF ORIGIN', 24, 643, font)
  text(page, 'Default Country', 102, 643, font)
  return { page, y: 631 }
}

function drawInvoiceBlock(cursor: Cursor, line: SyntheticLine, font: PDFFont) {
  const { page } = cursor
  let y = cursor.y
  text(page, line.order, 72, y, font)
  text(page, line.order, 180, y, font)
  text(page, line.sequence, 246, y, font)
  y -= ROW
  text(page, line.lineNumber, 72, y, font)
  text(page, line.itemId, 96, y, font)
  text(page, line.country, 198, y, font)
  y -= ROW
  text(page, line.classification, 72, y, font)
  text(page, 'PCS', 408, y, font)
  text(page, 'USD', 486, y, font)
  text(page, 'USD', 564, y, font)
  y -= ROW
  text(page, line.carton, 24, y, font)
  text(page, line.model, 72, y, font)
  text(page, line.partNumber, 192, y, font)
  text(page, String(line.quantity), 421, y, font)
  text(page, money(line.unitPrice), 478, y, font)
  text(page, money(line.quantity * line.unitPrice), 556, y, font)
  y -= ROW
  text(page, line.description, 72, y, font)
  text(page, line.description, 192, y, font)
  text(page, line.model, 384, y, font)
  cursor.y = y
}

function drawPackingBlock(cursor: Cursor, line: SyntheticLine, font: PDFFont) {
  const { page } = cursor
  let y = cursor.y
  text(page, line.order, 72, y, font)
  text(page, line.order, 186, y, font)
  text(page, line.sequence, 252, y, font)
  text(page, line.partNumber, 360, y, font)
  text(page, line.description, 480, y, font)
  y -= ROW
  text(page, line.lineNumber, 72, y, font)
  text(page, line.itemId, 96, y, font)
  y -= ROW
  text(page, line.classification, 72, y, font)
  text(page, 'PCS', 384, y, font)
  y -= ROW
  text(page, line.carton, 24, y, font)
  text(page, line.model, 72, y, font)
  text(page, line.country, 264, y, font)
  text(page, String(line.quantity), 397, y, font)
  y -= ROW
  const divisor = line.weightDivisor ?? 1
  text(page, line.model, 72, y, font)
  if (divisor !== 1) text(page, `(@ / ${divisor})`, 309, y, font)
  text(page, '(', 337, y, font)
  text(page, weight(round3(line.netWeightKg / divisor)), 442, y, font)
  text(page, weight(round3(line.grossWeightKg / divisor)), 508, y, font)
  text(page, (line.quantity / divisor).toFixed(6), 563, y, font)
  text(page, ')', 594, y, font)
  cursor.y = y
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

function drawTotalsRow(cursor: Cursor, spec: SyntheticCipl, kind: string, font: PDFFont) {
  const y = cursor.y - BLOCK_GAP
  const { page } = cursor
  if (kind === 'PACKING LIST') {
    const net = spec.lines.reduce((s, l) => s + l.netWeightKg, 0)
    const gross = spec.lines.reduce((s, l) => s + l.grossWeightKg, 0)
    const measurement = spec.lines.reduce((s, l) => s + l.quantity, 0)
    text(page, spec.tradeTerms, 309, y, font)
    text(page, 'TOTALS', 378, y, font)
    text(page, net.toFixed(3), 438, y, font)
    text(page, gross.toFixed(3), 504, y, font)
    text(page, measurement.toFixed(6), 559, y, font)
  } else {
    const total = spec.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    text(page, spec.tradeTerms, 447, y, font)
    text(page, total.toFixed(3), 550, y, font)
    text(page, 'USD', 588, y, font)
  }
  text(page, 'TOTAL:', 30, y - 6, font)
  text(page, String(spec.lines.reduce((s, l) => s + l.quantity, 0)), 79, y - 6, font)
  text(page, 'PCS', 114, y - 6, font)
}

function drawSet(doc: PDFDocument, spec: SyntheticCipl, set: string, kind: string, font: PDFFont) {
  drawHeaderPage(doc, spec, set, kind, font)
  const perPage = spec.linesPerPage ?? 6
  let cursor = startDetailPage(doc, spec, kind, font)
  let onPage = 0
  let group = ''

  for (const [i, line] of spec.lines.entries()) {
    if (onPage >= perPage) {
      cursor = startDetailPage(doc, spec, kind, font)
      onPage = 0
    }
    if (line.commodityGroup && line.commodityGroup !== group) {
      group = line.commodityGroup
      text(cursor.page, group, 72, cursor.y, font)
      cursor.y -= BLOCK_GAP
    }
    const draw = kind === 'INVOICE' ? drawInvoiceBlock : drawPackingBlock
    draw(cursor, line, font)
    onPage++
    const isLast = i === spec.lines.length - 1
    if (!isLast) cursor.y -= BLOCK_GAP
  }
  drawTotalsRow(cursor, spec, kind, font)
}

/** Renders the whole CIPL: FC invoice, FC packing list, and optionally the TP1 pair. */
export async function buildSyntheticCipl(spec: SyntheticCipl): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  drawSet(doc, spec, 'FC', 'INVOICE', font)
  drawSet(doc, spec, 'FC', 'PACKING LIST', font)
  if (spec.includeTp1) {
    drawSet(doc, spec, 'TP1', 'INVOICE', font)
    drawSet(doc, spec, 'TP1', 'PACKING LIST', font)
  }
  return doc.save()
}

/** A small, ordinary shipment: two headings, three lines, everything stated outright. */
export function simpleShipment(over: Partial<SyntheticCipl> = {}): SyntheticCipl {
  return {
    invoiceNumber: 'S0000001',
    invoiceDate: 'July 28, 2026',
    consigneeName: 'Example Consignee Pte. Ltd.',
    consigneeLines: ['1 Example Road', 'Exampleton EX 100200', 'Singapore'],
    soldToName: 'Example Buyer Corporation',
    vesselAgent: 'Nippon Express',
    shippedFrom: 'San Francisco',
    dischargePort: 'Singapore, Singapore',
    tradeTerms: 'FOB Origin - Collect',
    cartons: 2,
    lines: [
      {
        order: '00000001OP0010',
        sequence: '1',
        lineNumber: '0001',
        itemId: '1AA000001',
        partNumber: '10000-0001',
        model: 'MODEL-ONE',
        description: 'WIDGET, EXAMPLE TYPE ONE',
        commodityGroup: 'Electrical Conductors',
        country: 'Japan',
        classification: '8544.42.0000',
        quantity: 4,
        unitPrice: 10,
        netWeightKg: 1.2,
        grossWeightKg: 1.32,
        carton: '0001',
      },
      {
        order: '00000002OP0010',
        sequence: '1',
        lineNumber: '0001',
        itemId: '1AA000002',
        partNumber: '10000-0002',
        model: 'MODEL-TWO',
        description: 'WIDGET, EXAMPLE TYPE TWO',
        commodityGroup: 'Electrical Conductors',
        country: 'Malaysia',
        classification: '8544.42.0000',
        quantity: 2,
        unitPrice: 25,
        netWeightKg: 0.5,
        grossWeightKg: 0.55,
        carton: '0001',
      },
      {
        order: '00000003OP0010',
        sequence: '1',
        lineNumber: '0001',
        itemId: '1AA000003',
        partNumber: '10000-0003',
        model: 'MODEL-THREE',
        description: 'SENSOR, EXAMPLE TYPE THREE',
        commodityGroup: 'Optical instruments',
        country: 'United States',
        classification: '9031.49.8000',
        quantity: 1,
        unitPrice: 100,
        netWeightKg: 1.7,
        grossWeightKg: 1.87,
        carton: '0002',
      },
    ],
    ...over,
  }
}
