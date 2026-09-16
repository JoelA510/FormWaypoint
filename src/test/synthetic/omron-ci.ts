/**
 * Builds the Omron Commercial Invoice form (00004-00202) as test fixtures, in both of the
 * shapes the parser accepts: the workbook cell grid, and a PDF drawn to the printed form's
 * geometry.
 *
 * Same reasoning as the CIPL builder next door: completed forms are somebody's shipment
 * and cannot be committed, so the fixtures are drawn from the template's measurements with
 * invented goods. If the form drifts far enough that the parser needs changing, this
 * needs changing too, and the released form remains the final word.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { SheetRows } from '../../domain/item-library/read-workbook'

export interface OmronCiLine {
  partNumber: string
  description: string
  coo: string
  hts: string
  eccn: string
  license: string
  sme: string
  quantity: number
  uom: string
  unitPrice: number
  /** Overrides the computed amount, to model a workbook whose cached result disagrees. */
  amount?: number
  /**
   * Extra description text printed on a second baseline between the block's two rows, to
   * model a wrapped description in the PDF. Only the PDF builder draws it.
   */
  descriptionTail?: string
  /**
   * Extra description word drawn past the quantity column border on the top baseline, to
   * model a split description overflowing its cell. Only the PDF builder draws it.
   */
  descriptionOverflow?: string
  /**
   * Draw the description and its wrapped tail one item per word, as pdfjs often reports
   * text. Combined with `descriptionTail` this is the shape that exposes reading order:
   * sorted across the column alone, the two printed lines interleave.
   */
  splitDescription?: boolean
}

export interface OmronCiSpec {
  invoiceNumber: string
  invoiceDate: string
  /** The form's own SHIP DATE box, which is what dates the SLI. */
  shipDate?: string
  purchaseOrder: string
  shipReference?: string
  carrier?: string
  incoterms?: string
  freightCharges?: string
  consigneeName: string
  consigneeLines: string[]
  billToName?: string
  billToLines?: string[]
  pieces?: number
  netWeightKg?: number
  grossWeightKg?: number
  lines: OmronCiLine[]
  /** The `PAGE:` box, e.g. `{ at: 2, of: 4 }`. Defaults to `1 of 1`. */
  page?: { at: number; of: number }
  /** Line numbering starts here rather than at 1 — page 2 of a set carries `9`, not `1`. */
  firstLineNumber?: number
  /** The TAX cell of the totals band. Blank when omitted, as the form prints it. */
  tax?: number
  /** The FREIGHT cell of the totals band. Blank when omitted. */
  freight?: number
  /**
   * The grand `TOTAL (USD)`, overriding subtotal + tax + freight.
   *
   * On a multi-page set every page repeats the *document's* total, which is what makes it
   * an independent check on the pages this reader was handed.
   */
  grandTotal?: number
  /** Omit the SUBTOTAL figure, to model a workbook saved without cached formula results. */
  omitSubtotal?: boolean
  /**
   * Draw each header value as one text item per word, to model pdfjs splitting a cell's
   * text into several items. Only the PDF builder honours it.
   */
  splitValues?: boolean
  /**
   * Draw the `SME (Y/N)` column heading as two items, to model pdfjs splitting a *heading*
   * rather than a value — which leaves that column with no anchor to calibrate against.
   */
  splitHeadings?: boolean
  /**
   * Draw the `DESCRIPTION OF GOODS` heading as two items. That column's heading positions
   * nothing — part and description are separated by the border between COO and HTS — so
   * the table must still parse.
   */
  splitDescriptionHeading?: boolean
  /**
   * Draw every right-hand header label one item per word, to model pdfjs splitting a *label*
   * on the header grid — which, unhealed, folds it into the value in the cell before it.
   */
  splitHeaderLabel?: boolean
  /**
   * Print no header grid at all, so nothing below the address band carries a label. Models
   * a revision that moves those fields elsewhere: the addresses must still be bounded by
   * the commodity table rather than running on into it.
   */
  omitHeaderGrid?: boolean
}

export function simpleOmronCi(): OmronCiSpec {
  return {
    invoiceNumber: 'CI-2026-0001',
    invoiceDate: '08/10/2026',
    purchaseOrder: '4501234567',
    shipReference: 'RMA-88',
    carrier: 'Nippon Express',
    incoterms: 'DAP Singapore',
    freightCharges: 'PREPAID',
    consigneeName: 'Example Consignee Pte. Ltd.',
    consigneeLines: ['1 Harbour Way', 'Singapore 018989', 'Singapore'],
    pieces: 2,
    netWeightKg: 3.2,
    grossWeightKg: 4.1,
    lines: [
      {
        partNumber: '10000-0001',
        description: 'Robot cable assembly',
        coo: 'US',
        hts: '8544.42.0000',
        eccn: 'EAR99',
        license: 'NLR',
        sme: 'N',
        quantity: 4,
        uom: 'EA',
        unitPrice: 10,
      },
      {
        partNumber: '20000-0002',
        description: 'Controller module',
        coo: 'JP',
        hts: '8537.10.9170',
        eccn: '5A992.c',
        license: 'NLR',
        sme: 'N',
        quantity: 3,
        uom: 'EA',
        unitPrice: 50,
      },
    ],
  }
}

const amountOf = (line: OmronCiLine): number => line.amount ?? Math.round(line.quantity * line.unitPrice * 100) / 100

export const subtotalOf = (spec: OmronCiSpec): number =>
  Math.round(spec.lines.reduce((sum, line) => sum + amountOf(line), 0) * 100) / 100

/** What the form prints on its `TOTAL (USD)` row: merchandise plus tax and freight. */
export const grandTotalOf = (spec: OmronCiSpec): number =>
  spec.grandTotal ?? Math.round((subtotalOf(spec) + (spec.tax ?? 0) + (spec.freight ?? 0)) * 100) / 100

const pageBox = (spec: OmronCiSpec): string => `${spec.page?.at ?? 1} of ${spec.page?.of ?? 1}`
const firstLine = (spec: OmronCiSpec): number => spec.firstLineNumber ?? 1

/**
 * One invoice across several pages: the same header on each, the lines dealt out in order,
 * and every page carrying the document's grand total under its own subtotal — which is how
 * the real form is issued, and the only shape in which the page checks mean anything.
 */
export function omronCiPageSpecs(base: OmronCiSpec, linesPerPage: number): OmronCiSpec[] {
  const pages: OmronCiLine[][] = []
  for (let i = 0; i < base.lines.length; i += linesPerPage) pages.push(base.lines.slice(i, i + linesPerPage))
  const grandTotal = grandTotalOf(base)
  let lineNumber = 1
  return pages.map((lines, index) => {
    const spec: OmronCiSpec = {
      ...base,
      lines,
      firstLineNumber: lineNumber,
      page: { at: index + 1, of: pages.length },
      grandTotal,
    }
    lineNumber += lines.length
    return spec
  })
}

// ---------------------------------------------------------------------------
// Workbook grid
// ---------------------------------------------------------------------------

/**
 * The form's cell grid exactly as `readXlsx` returns it: column A is index 0, and merged
 * cells surface at their anchor. Mirrors template 00004-00202 Rev C.
 */
export function omronCiGrid(spec: OmronCiSpec): SheetRows {
  const money = (value: number): string => value.toFixed(2)
  const grid: SheetRows = [
    [],
    ['', '', '', '', 'Omron Robotics and Safety Technologies, Inc.'],
    ['', '', '', '', '4225 Hacienda Drive, Pleasanton, CA 94588, United States of America'],
    [],
    ['', 'COMMERCIAL INVOICE', '', '', '', '', '', '', 'Doc. # 00004-00202   Rev. C'],
    [],
    ['', 'SHIPPER (SHIP FROM / EXPORTER)', '', '', 'CONSIGNEE (SHIP TO)', '', '', 'BILL TO / SOLD TO (IF DIFFERENT)'],
  ]

  const shipper = ['Omron Robotics & Safety Technologies, Inc.', '4225 Hacienda Drive', 'Pleasanton, CA 94588', 'United States of America', 'Contact / Phone:']
  const consignee = [spec.consigneeName, ...spec.consigneeLines]
  const billTo = spec.billToName ? [spec.billToName, ...(spec.billToLines ?? [])] : []
  for (let i = 0; i < 5; i++) {
    grid.push(['', shipper[i] ?? '', '', '', consignee[i] ?? '', '', '', billTo[i] ?? ''])
  }
  grid.push([])

  const pair = (label1: string, value1: string, label2: string, value2: string): string[] => [
    '', label1, '', value1, '', label2, '', value2,
  ]
  grid.push(
    pair('INVOICE #:', spec.invoiceNumber, 'INVOICE DATE:', spec.invoiceDate),
    pair('PURCHASE ORDER #:', spec.purchaseOrder, 'SHIP DATE:', spec.shipDate ?? ''),
    pair('SHIP REFERENCE:', spec.shipReference ?? '', 'AIR WAYBILL / TRACKING #:', ''),
    pair('CARRIER / AGENT:', spec.carrier ?? '', 'FREIGHT CHARGES:', spec.freightCharges ?? ''),
    pair('SERVICE / SHIP METHOD:', '', 'G/L ACCT. #:', ''),
    pair('CONSIGNEE EORI / USCI / VAT:', '', 'SHIPPER EIN / TAX ID:', ''),
    pair('INCOTERMS:', spec.incoterms ?? '', 'PAGE:', pageBox(spec)),
    [],
    ['', 'LN', 'PART #', 'DESCRIPTION OF GOODS', '', '', '', 'QTY', 'UOM', 'UNIT PRICE', 'AMOUNT'],
    ['', '', 'COO', 'HTS / SCHEDULE B', 'ECCN / EAR99', 'LICENSE / NLR', 'SME (Y/N)'],
  )

  spec.lines.forEach((line, i) => {
    grid.push(
      ['', String(firstLine(spec) + i), line.partNumber, line.description, '', '', '',
        String(line.quantity), line.uom, money(line.unitPrice), money(amountOf(line))],
      ['', '', line.coo, line.hts, line.eccn, line.license, line.sme],
    )
  })
  // Unused form lines: an LN with everything else blank.
  for (let i = spec.lines.length; i < 8; i++) {
    grid.push(['', String(firstLine(spec) + i)], [])
  }

  const subtotal = spec.omitSubtotal ? '' : money(subtotalOf(spec))
  const total = spec.omitSubtotal && spec.grandTotal == null ? '' : money(grandTotalOf(spec))
  grid.push(
    ['', '☐  NO CHARGE — VALUE FOR CUSTOMS PURPOSES ONLY', '', '', '', '', '', 'SUBTOTAL', '', '', subtotal],
    ['', '# OF PIECES:', '', spec.pieces != null ? String(spec.pieces) : '', 'NET WT (KG):',
      spec.netWeightKg != null ? String(spec.netWeightKg) : '', '', 'TAX', '', '', spec.tax != null ? money(spec.tax) : ''],
    ['', 'GROSS WT (KG):', '', spec.grossWeightKg != null ? String(spec.grossWeightKg) : '', 'DIMS / VOLUME:', '', '', 'FREIGHT', '', '',
      spec.freight != null ? money(spec.freight) : ''],
    ['', '', '', '', '', '', '', 'TOTAL (USD)', '', '', total],
    ['', 'NAME / TITLE:', '', '', '', 'SIGNATURE:', '', '', '', 'DATE:', ''],
  )
  return grid
}

/** The pages of one invoice as the workbook holds them: one grid per sheet. */
export const omronCiGrids = (specs: OmronCiSpec[]): SheetRows[] => specs.map(omronCiGrid)

// ---------------------------------------------------------------------------
// Printed PDF
// ---------------------------------------------------------------------------

/** Column left edges and widths, in points, measured off the printed Rev C template. */
const COLUMNS = {
  ln: { left: 30, width: 25 },
  c: { left: 55, width: 72 },
  d: { left: 127, width: 77 },
  e: { left: 204, width: 67 },
  f: { left: 271, width: 61 },
  g: { left: 332, width: 40 },
  h: { left: 372, width: 35 },
  i: { left: 407, width: 35 },
  j: { left: 442, width: 59 },
  k: { left: 501, width: 72 },
}
const center = (column: { left: number; width: number }): number => column.left + column.width / 2
const DESCRIPTION_CENTER = (COLUMNS.d.left + COLUMNS.g.left + COLUMNS.g.width) / 2

export async function buildOmronCiPdf(spec: OmronCiSpec): Promise<ArrayBuffer> {
  return buildOmronCiPdfPages([spec])
}

/**
 * One printed document of several pages, each drawn to the same geometry.
 *
 * The pages are separate PDF pages, not a taller one: PDF y restarts on every page, which
 * is exactly what the parser has to cope with and what concatenating rows would destroy.
 */
export async function buildOmronCiPdfPages(specs: OmronCiSpec[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const spec of specs) drawOmronCiPage(doc.addPage([612, 792]), font, spec)
  return (await doc.save()).buffer as ArrayBuffer
}

function drawOmronCiPage(page: PDFPage, font: PDFFont, spec: OmronCiSpec): void {
  const size = 7

  const at = (x: number, y: number, text: string) => {
    if (text) page.drawText(text, { x, y, size, font })
  }
  const centred = (cx: number, y: number, text: string) => {
    if (text) at(cx - font.widthOfTextAtSize(text, size) / 2, y, text)
  }

  at(COLUMNS.ln.left, 760, 'Omron Robotics and Safety Technologies, Inc.')
  at(COLUMNS.ln.left, 745, 'COMMERCIAL INVOICE')
  at(COLUMNS.j.left, 745, 'Doc. # 00004-00202   Rev. C')

  // One printed run drawn as one item per word, the way pdfjs often reports it.
  const words = (x: number, y: number, text: string, split: boolean) => {
    if (!split || !text) {
      at(x, y, text)
      return
    }
    let cursor = x
    for (const word of text.split(' ')) {
      at(cursor, y, word)
      cursor += font.widthOfTextAtSize(word + ' ', size)
    }
  }

  // Address band: titles and lines all left-aligned at their column's edge.
  const bandX = { shipper: COLUMNS.ln.left, consignee: COLUMNS.e.left, billTo: COLUMNS.h.left }
  at(bandX.shipper, 720, 'SHIPPER (SHIP FROM / EXPORTER)')
  at(bandX.consignee, 720, 'CONSIGNEE (SHIP TO)')
  at(bandX.billTo, 720, 'BILL TO / SOLD TO (IF DIFFERENT)')
  const shipper = ['Omron Robotics & Safety Technologies, Inc.', '4225 Hacienda Drive', 'Pleasanton, CA 94588', 'United States of America']
  const consignee = [spec.consigneeName, ...spec.consigneeLines]
  const billTo = spec.billToName ? [spec.billToName, ...(spec.billToLines ?? [])] : []
  for (let i = 0; i < 5; i++) {
    const y = 708 - i * 12
    words(bandX.shipper, y, shipper[i] ?? '', !!spec.splitValues)
    words(bandX.consignee, y, consignee[i] ?? '', !!spec.splitValues)
    words(bandX.billTo, y, billTo[i] ?? '', !!spec.splitValues)
  }

  const pairs: [string, string, string, string][] = [
    ['INVOICE #:', spec.invoiceNumber, 'INVOICE DATE:', spec.invoiceDate],
    ['PURCHASE ORDER #:', spec.purchaseOrder, 'SHIP DATE:', spec.shipDate ?? ''],
    ['SHIP REFERENCE:', spec.shipReference ?? '', 'AIR WAYBILL / TRACKING #:', ''],
    ['CARRIER / AGENT:', spec.carrier ?? '', 'FREIGHT CHARGES:', spec.freightCharges ?? ''],
    ['SERVICE / SHIP METHOD:', '', 'G/L ACCT. #:', ''],
    ['CONSIGNEE EORI / USCI / VAT:', '', 'SHIPPER EIN / TAX ID:', ''],
    ['INCOTERMS:', spec.incoterms ?? '', 'PAGE:', pageBox(spec)],
  ]
  // With splitValues, a value is drawn one item per word, as pdfjs often reports it.
  const value = (x: number, y: number, text: string) => words(x, y, text, !!spec.splitValues)
  // With splitHeaderLabel, every right-hand label is drawn one item per word, the way pdfjs
  // reports a run it decided to break.
  const label = words
  if (!spec.omitHeaderGrid) {
    pairs.forEach(([label1, value1, label2, value2], i) => {
      const y = 640 - i * 12
      at(COLUMNS.ln.left, y, label1)
      value(COLUMNS.d.left, y, value1)
      label(COLUMNS.f.left, y, label2, !!spec.splitHeaderLabel)
      value(COLUMNS.h.left, y, value2)
    })
  }

  // Table headings, centred like the printed form — including its awkwardest habit: the
  // vertically merged headings (LN, QTY, …) print centred *between* the two heading rows,
  // so they land on their own baseline below PART # and DESCRIPTION. The real
  // LibreOffice print of the Rev C template does exactly this.
  centred(center(COLUMNS.c), 552, 'PART #')
  if (spec.splitDescriptionHeading) {
    at(DESCRIPTION_CENTER - 40, 552, 'DESCRIPTION')
    at(DESCRIPTION_CENTER + 20, 552, 'OF GOODS')
  } else {
    centred(DESCRIPTION_CENTER, 552, 'DESCRIPTION OF GOODS')
  }
  centred(center(COLUMNS.ln), 546, 'LN')
  centred(center(COLUMNS.h), 546, 'QTY')
  centred(center(COLUMNS.i), 546, 'UOM')
  centred(center(COLUMNS.j), 546, 'UNIT PRICE')
  centred(center(COLUMNS.k), 546, 'AMOUNT')
  centred(center(COLUMNS.c), 538, 'COO')
  centred(center(COLUMNS.d), 538, 'HTS / SCHEDULE B')
  centred(center(COLUMNS.e), 538, 'ECCN / EAR99')
  centred(center(COLUMNS.f), 538, 'LICENSE / NLR')
  if (spec.splitHeadings) {
    // Two items, so no single item reads "SME (Y/N)" and the column has no anchor.
    at(COLUMNS.g.left + 2, 538, 'SME')
    at(COLUMNS.g.left + 22, 538, '(Y/N)')
  } else {
    centred(center(COLUMNS.g), 538, 'SME (Y/N)')
  }

  drawLines(page, font, spec)

  const subtotal = spec.omitSubtotal ? '' : subtotalOf(spec).toFixed(2)
  const total = spec.omitSubtotal && spec.grandTotal == null ? '' : grandTotalOf(spec).toFixed(2)
  const totalsTop = 240
  // The real print carries a checkbox glyph here; Helvetica cannot encode it, and the
  // parser keys on the words, so the fixture spells the box as ASCII.
  at(COLUMNS.ln.left, totalsTop, '[ ]  NO CHARGE - VALUE FOR CUSTOMS PURPOSES ONLY')
  at(COLUMNS.j.left, totalsTop, 'SUBTOTAL')
  centred(center(COLUMNS.k), totalsTop, subtotal)
  // TAX and FREIGHT share their rows with the weights, exactly as the printed form does —
  // and to the *right* of them, which is what stops a blank tax cell being read as the net
  // weight of the shipment.
  at(COLUMNS.ln.left, totalsTop - 14, '# OF PIECES:')
  at(COLUMNS.d.left, totalsTop - 14, spec.pieces != null ? String(spec.pieces) : '')
  at(COLUMNS.e.left, totalsTop - 14, 'NET WT (KG):')
  at(COLUMNS.f.left, totalsTop - 14, spec.netWeightKg != null ? String(spec.netWeightKg) : '')
  at(COLUMNS.j.left, totalsTop - 14, 'TAX')
  centred(center(COLUMNS.k), totalsTop - 14, spec.tax != null ? spec.tax.toFixed(2) : '')
  at(COLUMNS.ln.left, totalsTop - 28, 'GROSS WT (KG):')
  at(COLUMNS.d.left, totalsTop - 28, spec.grossWeightKg != null ? String(spec.grossWeightKg) : '')
  at(COLUMNS.j.left, totalsTop - 28, 'FREIGHT')
  centred(center(COLUMNS.k), totalsTop - 28, spec.freight != null ? spec.freight.toFixed(2) : '')
  at(COLUMNS.j.left, totalsTop - 42, 'TOTAL (USD)')
  centred(center(COLUMNS.k), totalsTop - 42, total)
}

function drawLines(page: PDFPage, font: PDFFont, spec: OmronCiSpec): void {
  const size = 7
  const at = (x: number, y: number, text: string) => {
    if (text) page.drawText(text, { x, y, size, font })
  }
  const centred = (cx: number, y: number, text: string) => {
    if (text) at(cx - font.widthOfTextAtSize(text, size) / 2, y, text)
  }

  const blockHeight = 28
  spec.lines.forEach((line, i) => {
    const topY = 520 - i * blockHeight
    const bottomY = topY - 14
    const middleY = topY - 7

    // LN and the quantity/price cells are vertically merged: their baseline is the
    // block's centre, exactly where a spreadsheet print puts them.
    centred(center(COLUMNS.ln), middleY, String(firstLine(spec) + i))
    at(COLUMNS.c.left + 2, topY, line.partNumber)
    const words = (x: number, y: number, text: string) => {
      if (!line.splitDescription) {
        at(x, y, text)
        return
      }
      let cursor = x
      for (const word of text.split(' ')) {
        at(cursor, y, word)
        cursor += font.widthOfTextAtSize(word + ' ', size)
      }
    }
    words(COLUMNS.d.left + 2, topY, line.description)
    if (line.descriptionTail) words(COLUMNS.d.left + 2, topY - 9, line.descriptionTail)
    if (line.descriptionOverflow) at(COLUMNS.h.left + 4, topY, line.descriptionOverflow)
    centred(center(COLUMNS.h), middleY, String(line.quantity))
    centred(center(COLUMNS.i), middleY, line.uom)
    centred(center(COLUMNS.j), middleY, line.unitPrice.toFixed(2))
    centred(center(COLUMNS.k), middleY, (line.amount ?? line.quantity * line.unitPrice).toFixed(2))

    centred(center(COLUMNS.c), bottomY, line.coo)
    centred(center(COLUMNS.d), bottomY, line.hts)
    centred(center(COLUMNS.e), bottomY, line.eccn)
    centred(center(COLUMNS.f), bottomY, line.license)
    centred(center(COLUMNS.g), bottomY, line.sme)
  })
  // Unused form lines print their LN only.
  for (let i = spec.lines.length; i < 8; i++) {
    centred(center(COLUMNS.ln), 520 - i * blockHeight - 7, String(firstLine(spec) + i))
  }
}
