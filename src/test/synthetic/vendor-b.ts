/**
 * The `SHIPMENT#` CIPL layout ("Vendor B"), built from invented goods.
 *
 * The pages are described as extracted text (rows of positioned strings), which is what
 * `parseVendorBPages` reads, so the layout tests need no document. `buildVendorBPdf` draws the
 * same rows into a real PDF, so detection and text extraction are tested on them too.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { TextPage, TextRow } from '../../domain/cipl/extract-text'

/** Columns as the layout prints them, taken from a real extraction. */
export const X = { order: 23, item: 88, description: 183, code: 323, quantity: 442, unit: 510, extended: 571 }

export const row = (y: number, cells: [number, string][]): TextRow => ({
  y,
  items: cells.map(([x, str]) => ({ str, x, y })),
})

export interface Line {
  order: string
  part: string
  description: string
  code: string
  quantity: number
  unitPrice: number
}

export const LINES: Line[] = [
  { order: '13380611.12.000', part: '44808-0035', description: 'SMALL P 2NC/1NO M12', code: '8536.50.9065', quantity: 2, unitPrice: 54.84 },
  { order: '13392257.2.000', part: '44536-0200', description: 'CM-S2 SWITCH 3M CABLE', code: '8536.50.9065', quantity: 3, unitPrice: 17.76 },
  // The line that was lost: a curly apostrophe in an otherwise ordinary description.
  { order: '13395573.2.000', part: '44508-0711', description: 'REPL ACT’R MFS-11', code: '8538.90.7080', quantity: 2, unitPrice: 19.14 },
]

export const ext = (line: Line) => Math.round(line.quantity * line.unitPrice * 100) / 100
export const printedTotal = () => LINES.reduce((sum, l) => sum + ext(l), 0)

/** A barcode as the font actually extracts: a short fragment, then padding. */
export const BARCODE = `xh!3\u0019c\u00001Myzx${'ÿ'.repeat(20)}`

export function invoicePage(pageNumber: number, lines: Line[], options: { total?: number } = {}): TextPage {
  const rows: TextRow[] = [
    row(700, [[23, 'COMMERCIAL SHIPMENT# 278999']]),
    row(690, [[23, 'INVOICE'], [400, `Page ${pageNumber}/2`]]),
    row(660, [[23, 'Sold To: Example Consignee Ltda'], [300, 'Ship Date: 07/30/26']]),
    row(650, [[23, 'Rua Example, 1.413'], [300, 'Customer PO #: (see detail)']]),
    row(640, [[23, 'Example City SP 13212-541']]),
    row(630, [[23, 'Brazil'], [300, 'Currency: USD']]),
    row(610, [[23, 'Ship To: Example Consignee Ltda'], [300, 'Mode of Transport: CEVA Logistics']]),
    row(600, [[23, 'Rua Example, 1.413'], [300, 'Freight Handling: Collect']]),
    row(590, [[23, 'Example City SP 13212-541']]),
    row(580, [[23, 'Brazil']]),
    row(560, [[X.order, 'SO #.Line #'], [X.item, 'Item #'], [X.unit, 'Unit Price'], [X.extended, 'Ext. Price']]),
  ]

  let y = 540
  for (const line of lines) {
    rows.push(
      row(y, [
        [X.order, line.order],
        [X.item, line.part],
        [X.description, line.description],
        [X.code, `HSCD: ${line.code}`],
        [X.quantity, `${line.quantity.toFixed(2)} EA`],
        [X.unit, line.unitPrice.toFixed(2)],
        [X.extended, ext(line).toFixed(2)],
      ]),
      row(y - 10, [[X.order, 'SG']]),
      row(y - 20, [[393, 'B00000115571']]),
      row(y - 30, [[X.order, '1410821'], [509, '(BRL)'], [569, '(BRL)']]),
      row(y - 40, [[506, '285.70'], [566, '571.40']]),
      row(y - 50, [[X.item, 'United Kingdom']]),
      row(y - 60, [[X.description, BARCODE]]),
    )
    y -= 80
  }

  if (options.total != null) {
    rows.push(row(y, [[400, 'Total Net Value:'], [X.extended, options.total.toFixed(2)]]))
  }
  rows.push(row(y - 20, [[23, 'Vendor A Manufacturing, Inc.']]))
  return { pageNumber, width: 612, height: 792, rows }
}

export function packingPage(pageNumber: number, lines: Line[], options: { summary?: Line[] } = {}): TextPage {
  const rows: TextRow[] = [
    row(700, [[23, 'MASTER PACKING LIST SHIPMENT# 278999']]),
    row(690, [[23, 'PACKING LIST']]),
    row(660, [[23, 'Sold To: Example Consignee Ltda'], [300, 'Ship Date: 07/30/26']]),
    row(630, [[23, 'Brazil'], [300, 'Currency: USD']]),
    row(560, [[X.order, 'SO #.Line #'], [X.item, 'Item #']]),
  ]

  let y = 540
  for (const line of lines) {
    rows.push(
      row(y, [
        [X.order, line.order],
        [X.item, line.part],
        [X.description, line.description],
        [X.code, `HSCD: ${line.code}`],
        [X.quantity, `${line.quantity.toFixed(2)} EA`],
      ]),
      row(y - 10, [[X.item, 'United Kingdom']]),
    )
    y -= 30
  }

  if (options.summary) {
    rows.push(row(y, [[23, 'SUMMARY INFORMATION FOLLOWS']]))
    y -= 20
    for (const line of options.summary) {
      rows.push(
        row(y, [
          [23, 'Level Part Number Serial Number'],
          [200, `Item Number: ${line.part}`],
          [400, `Total Qty: ${line.quantity.toFixed(2)}`],
        ]),
      )
      y -= 15
    }
  }
  return { pageNumber, width: 612, height: 792, rows }
}

export const wholeShipment = () => [
  invoicePage(1, LINES.slice(0, 2)),
  invoicePage(2, LINES.slice(2), { total: printedTotal() }),
  packingPage(3, LINES, { summary: LINES }),
]

/**
 * The pages as a PDF, each string drawn where the extraction says it sits. A string the
 * standard font cannot encode (the barcode glyphs) is left out, as the extractor drops it.
 */
export async function buildVendorBPdf(pages: TextPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const spec of pages) {
    const page = doc.addPage([spec.width, spec.height])
    for (const row of spec.rows) {
      for (const item of row.items) {
        try {
          font.encodeText(item.str)
        } catch {
          // Not drawable in a standard font; see above.
          continue
        }
        page.drawText(item.str, { x: item.x, y: item.y, size: 7, font })
      }
    }
  }
  return doc.save()
}
