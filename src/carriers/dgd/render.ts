/**
 * Drawing the Shipper's Declaration for Dangerous Goods.
 *
 * Every other output in this application fills a blank form the carrier supplies. This one
 * cannot: there is no blank IATA declaration to fetch, the printed pads are a commercial
 * product, and the regulations anticipate exactly this — a declaration produced by a computer
 * system is acceptable provided it conforms in format to IATA's requirements and carries the
 * information the shipment type and aircraft limitation call for. So the page is drawn.
 *
 * What "conforms in format" means in practice, and what this renderer therefore does:
 *
 *  - the candy-striped margins, **in red**, down both sides of the page;
 *  - the boxes in their published order and proportions, with their published captions;
 *  - the warning, and the certification wording, verbatim;
 *  - the dangerous goods table under its seven column headings.
 *
 * And what it deliberately does not do: sign anything, or fill the boxes the forwarder
 * completes. Where the air waybill number and the airports are unknown, the renderer leaves a
 * fillable field rather than a printed blank, so the declaration can be completed on screen by
 * whoever does know without being reprinted.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DgdLine, DgdPage, ShippersDeclaration } from '../../domain/dangerous-goods/dgd'

export interface DeclarationRender {
  bytes: Uint8Array
  /** Values that did not fit the box they were drawn in, or fields left for someone else. */
  warnings: string[]
}

/** US Letter, which is what the pads this replaces are printed on. */
const PAGE = { width: 612, height: 792 }

const RED = rgb(0.85, 0.11, 0.13)
const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.45, 0.45, 0.45)

/** The hatched margins, and the frame the boxes sit inside. */
const FRAME = { left: 30, right: 582, top: 762, bottom: 30 }
const HATCH_WIDTH = 16
const CONTENT = { left: FRAME.left + HATCH_WIDTH + 6, right: FRAME.right - HATCH_WIDTH - 6 }

/**
 * Vertical room for address lines in the Shipper and Consignee boxes, in points.
 *
 * Both boxes are 74pt tall and their first baseline sits 22pt below the top, leaving 48pt
 * with 4pt held back off the floor. At the ordinary 10pt leading that is five lines; the
 * condensed tier fits seven, which covers an international address with a unit and a
 * region line. Without the bound the sixth line sat on the border and the seventh printed
 * over the caption of the box beneath.
 */
const PARTY_HEIGHT = 48

/**
 * Column boundaries of the dangerous goods table, as x positions.
 *
 * The quantity column is the widest of the middle group on purpose. It carries not only
 * "2 Fibreboard box x 7 kg" but the overpack wording underneath, and two of those phrases are
 * prescribed — "Total quantity per Overpack 16 kg" is thirty-three characters and is not
 * mine to shorten. A column that cannot hold it either wraps it mid-phrase or lets it run
 * across the packing instruction beside it, and neither belongs on a regulated form.
 */
export const COLUMNS = {
  unNumber: CONTENT.left,
  properShippingName: CONTENT.left + 44,
  classOrDivision: CONTENT.left + 180,
  packingGroup: CONTENT.left + 230,
  quantity: CONTENT.left + 264,
  packingInstruction: CONTENT.left + 406,
  authorization: CONTENT.left + 454,
  end: CONTENT.right,
}

export const ROW_HEIGHT = 11

/** Font size the quantity column and the overpack wording under it are drawn at. */
export const QUANTITY_FONT_SIZE = 7

interface Ctx {
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  warnings: string[]
}

export async function renderDeclaration(declaration: ShippersDeclaration): Promise<DeclarationRender> {
  const doc = await PDFDocument.create()
  doc.setTitle('Shipper’s Declaration for Dangerous Goods')
  doc.setProducer('FormWaypoint')
  // No creation date beyond the default: the date that matters is box 20, which a person
  // enters and signs against.

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const warnings: string[] = []

  for (const pageModel of declaration.pages) {
    const page = doc.addPage([PAGE.width, PAGE.height])
    drawPage({ page, regular, bold, italic, warnings }, doc, declaration, pageModel)
  }

  const bytes = await doc.save({ updateFieldAppearances: true })
  return { bytes, warnings }
}

function drawPage(
  ctx: Ctx,
  doc: PDFDocument,
  declaration: ShippersDeclaration,
  pageModel: DgdPage,
): void {
  const { page } = ctx

  hatchedMargins(page)

  let y = FRAME.top

  // --- Title -------------------------------------------------------------
  text(ctx, 'SHIPPER’S DECLARATION FOR DANGEROUS GOODS', CONTENT.left, y - 10, { font: ctx.bold, size: 9 })
  text(ctx, '(Provide at least two copies to the airline.)', CONTENT.right, y - 10, {
    size: 7,
    align: 'right',
    font: ctx.italic,
  })
  y -= 20

  // --- Shipper / air waybill --------------------------------------------
  const midpoint = CONTENT.left + (CONTENT.right - CONTENT.left) * 0.52
  const shipperTop = y
  const shipperHeight = 74
  box(ctx, CONTENT.left, y - shipperHeight, midpoint, y)
  box(ctx, midpoint, y - shipperHeight, CONTENT.right, y)
  caption(ctx, 'Shipper', CONTENT.left + 4, y - 10)
  lines(ctx, declaration.shipper, CONTENT.left + 6, y - 22, midpoint - CONTENT.left - 12, 'Shipper', 8, PARTY_HEIGHT)

  caption(ctx, 'Air Waybill No.', midpoint + 4, y - 10)
  if (declaration.airWaybillNumber) {
    text(ctx, declaration.airWaybillNumber, midpoint + 76, y - 10, { size: 8 })
  } else {
    fillable(ctx, doc, `awb_${pageModel.pageNumber}`, midpoint + 74, y - 13, 130, 12)
  }

  text(ctx, `Page ${pageModel.pageNumber}   of   ${pageModel.pageCount}   Pages`, midpoint + 4, y - 28, { size: 8 })

  caption(ctx, 'Shipper’s Reference Number', midpoint + 4, y - 46)
  text(ctx, '(optional)', midpoint + 4, y - 55, { size: 6, font: ctx.italic, color: GREY })
  text(ctx, declaration.shippersReference, midpoint + 130, y - 46, { size: 8 })
  y -= shipperHeight
  void shipperTop

  // --- Consignee ---------------------------------------------------------
  const consigneeHeight = 74
  box(ctx, CONTENT.left, y - consigneeHeight, midpoint, y)
  box(ctx, midpoint, y - consigneeHeight, CONTENT.right, y)
  caption(ctx, 'Consignee', CONTENT.left + 4, y - 10)
  lines(ctx, declaration.consignee, CONTENT.left + 6, y - 22, midpoint - CONTENT.left - 12, 'Consignee', 8, PARTY_HEIGHT)
  text(ctx, 'For optional use — company logo, name and address', (midpoint + CONTENT.right) / 2, y - 38, {
    size: 7,
    color: GREY,
    align: 'center',
    font: ctx.italic,
  })
  y -= consigneeHeight

  // --- Transport details / warning ---------------------------------------
  const transportHeight = 112
  box(ctx, CONTENT.left, y - transportHeight, midpoint, y)
  box(ctx, midpoint, y - transportHeight, CONTENT.right, y)

  text(ctx, 'Two completed and signed copies of this Declaration must', CONTENT.left + 4, y - 9, {
    size: 6.5,
    font: ctx.italic,
  })
  text(ctx, 'be handed to the operator.', CONTENT.left + 4, y - 17, { size: 6.5, font: ctx.italic })

  const transportTop = y - 22
  box(ctx, CONTENT.left + 3, y - transportHeight + 2, midpoint - 3, transportTop, 1.2)
  text(ctx, 'TRANSPORT DETAILS', CONTENT.left + 7, transportTop - 10, { font: ctx.bold, size: 7 })

  text(ctx, 'This shipment is within the', CONTENT.left + 7, transportTop - 22, { size: 6.5 })
  text(ctx, 'limitations prescribed for:', CONTENT.left + 7, transportTop - 30, { size: 6.5 })
  text(ctx, '(delete non-applicable)', CONTENT.left + 7, transportTop - 38, { size: 6, font: ctx.italic })

  const passengerBox = { x: CONTENT.left + 7, y: transportTop - 66, w: 78, h: 24 }
  const cargoBox = { x: CONTENT.left + 89, y: transportTop - 66, w: 62, h: 24 }
  box(ctx, passengerBox.x, passengerBox.y, passengerBox.x + passengerBox.w, passengerBox.y + passengerBox.h)
  box(ctx, cargoBox.x, cargoBox.y, cargoBox.x + cargoBox.w, cargoBox.y + cargoBox.h)
  text(ctx, 'PASSENGER', passengerBox.x + 3, passengerBox.y + 16, { size: 6.5 })
  text(ctx, 'AND CARGO', passengerBox.x + 3, passengerBox.y + 9, { size: 6.5 })
  text(ctx, 'AIRCRAFT', passengerBox.x + 3, passengerBox.y + 2, { size: 6.5 })
  text(ctx, 'CARGO', cargoBox.x + 3, cargoBox.y + 16, { size: 6.5 })
  text(ctx, 'AIRCRAFT', cargoBox.x + 3, cargoBox.y + 9, { size: 6.5 })
  text(ctx, 'ONLY', cargoBox.x + 3, cargoBox.y + 2, { size: 6.5 })

  // Box 6. The limitation that does not apply is struck out, which is what "delete
  // non-applicable" means on a form nobody is going to take a pen to.
  strikeOut(
    ctx,
    declaration.aircraft === 'cargo-aircraft-only' ? passengerBox : cargoBox,
  )

  const airportLeft = CONTENT.left + 160
  const airportWidth = midpoint - airportLeft - 10
  caption(ctx, 'Airport of Departure:', airportLeft, transportTop - 12)
  if (declaration.airportOfDeparture) {
    lines(
      ctx,
      wrapToWidth(ctx, declaration.airportOfDeparture, airportWidth, 7.5),
      airportLeft,
      transportTop - 26,
      airportWidth,
      'Airport of departure',
      7.5,
    )
  } else {
    fillable(ctx, doc, `departure_${pageModel.pageNumber}`, airportLeft, transportTop - 30, airportWidth, 12)
  }

  const destinationY = y - transportHeight + 10
  caption(ctx, 'Airport of Destination:', CONTENT.left + 7, destinationY)
  if (declaration.airportOfDestination) {
    text(ctx, declaration.airportOfDestination, CONTENT.left + 96, destinationY, { size: 7.5 })
  } else {
    fillable(ctx, doc, `destination_${pageModel.pageNumber}`, CONTENT.left + 94, destinationY - 3, 140, 12)
  }

  text(ctx, 'WARNING', midpoint + 8, y - 14, { font: ctx.bold, size: 9 })
  const warningText = [
    'Failure to comply in all respects with the applicable',
    'Dangerous Goods Regulations may be in breach of the',
    'applicable law, subject to legal penalties.',
  ]
  warningText.forEach((line, i) => text(ctx, line, midpoint + 8, y - 30 - i * 11, { font: ctx.bold, size: 8 }))

  // Box 9. Radioactive material is out of scope for this workflow entirely, so the
  // non-applicable half is struck out rather than offered as a choice.
  text(ctx, 'Shipment type:', midpoint + 8, y - transportHeight + 30, { size: 6.5 })
  text(ctx, '(delete non-applicable)', midpoint + 62, y - transportHeight + 30, { size: 6, font: ctx.italic })
  const nonRadioactive = { x: midpoint + 8, y: y - transportHeight + 10, w: 90, h: 14 }
  const radioactive = { x: midpoint + 100, y: y - transportHeight + 10, w: 66, h: 14 }
  box(ctx, nonRadioactive.x, nonRadioactive.y, nonRadioactive.x + nonRadioactive.w, nonRadioactive.y + nonRadioactive.h)
  box(ctx, radioactive.x, radioactive.y, radioactive.x + radioactive.w, radioactive.y + radioactive.h)
  text(ctx, 'NON-RADIOACTIVE', nonRadioactive.x + 4, nonRadioactive.y + 4, { size: 7 })
  text(ctx, 'RADIOACTIVE', radioactive.x + 4, radioactive.y + 4, { size: 7 })
  strikeOut(ctx, radioactive)

  y -= transportHeight

  // --- Nature and quantity of dangerous goods ----------------------------
  // The three boxes at the foot of the page are stacked from the bottom up, and the table
  // takes whatever is left. Sizing them the other way round is how the handling information
  // ended up drawn on top of the table it is supposed to sit under.
  const signatureBottom = FRAME.bottom + 14
  const signatureTop = signatureBottom + 88
  const handlingTop = signatureTop + 58
  const tableBottom = handlingTop
  box(ctx, CONTENT.left, tableBottom, CONTENT.right, y)

  text(ctx, 'NATURE AND QUANTITY OF DANGEROUS GOODS', CONTENT.left + 4, y - 10, { font: ctx.bold, size: 7.5 })
  text(ctx, 'Dangerous Goods Identification', COLUMNS.properShippingName + 40, y - 24, { size: 7, font: ctx.italic })

  const headerBottom = y - 58
  drawTableHeadings(ctx, y - 30, headerBottom)

  // Column rules, drawn the way the form does — dashed, from the headings to the foot of
  // the box, so an entry that spans two rows still reads as one row of columns.
  for (const x of [
    COLUMNS.properShippingName,
    COLUMNS.classOrDivision,
    COLUMNS.packingGroup,
    COLUMNS.quantity,
    COLUMNS.packingInstruction,
    COLUMNS.authorization,
  ]) {
    ctx.page.drawLine({
      start: { x, y: y - 18 },
      end: { x, y: tableBottom },
      thickness: 0.5,
      color: GREY,
      dashArray: [2, 2],
    })
  }
  ctx.page.drawLine({
    start: { x: CONTENT.left, y: headerBottom },
    end: { x: CONTENT.right, y: headerBottom },
    thickness: 0.5,
    color: GREY,
    dashArray: [2, 2],
  })

  let rowY = headerBottom - 12
  for (const line of pageModel.lines) {
    rowY = drawEntry(ctx, doc, line, rowY, pageModel.pageNumber, tableBottom)
    rowY -= 4
  }

  // --- Additional handling information -----------------------------------
  box(ctx, CONTENT.left, signatureTop, CONTENT.right, handlingTop)
  caption(ctx, 'Additional Handling Information', CONTENT.left + 4, handlingTop - 10)
  // Warned about once for the declaration, not once per sheet. The box is drawn on every
  // page and holds the same four lines on each, so a two-page consignment reported the same
  // overflow twice — which reads as two separate things to shorten.
  const firstSheet = pageModel.pageNumber === 1
  const handlingWidth = CONTENT.right - CONTENT.left - 12
  declaration.additionalHandlingInformation.forEach((line, i) => {
    if (i > 3) return
    // Cut to the box, like the party blocks are. Box 18 takes whatever the shipper typed,
    // and an emergency contact line long enough to leave the box was drawn straight over
    // the red hatched margin and off the edge of the sheet — a warning alone would have
    // described a clipping that the renderer was not in fact doing.
    const printed = clipToWidth(ctx, line, handlingWidth, 7.5)
    if (firstSheet && printed !== line) {
      ctx.warnings.push(
        `Additional handling information: "${line}" is wider than its box. Printed as "${printed}". ` +
          'Shorten it, or carry the rest on a separate sheet.',
      )
    }
    text(ctx, printed, CONTENT.left + 6, handlingTop - 22 - i * 9, { size: 7.5 })
  })
  if (declaration.additionalHandlingInformation.length > 4 && firstSheet) {
    ctx.warnings.push(
      'The additional handling information runs to more lines than the box holds; only the first four were ' +
        'printed. Shorten it, or carry the rest on a separate sheet.',
    )
  }

  // --- Certification -----------------------------------------------------
  const signatureSplit = CONTENT.left + (CONTENT.right - CONTENT.left) * 0.66
  box(ctx, CONTENT.left, signatureBottom, signatureSplit, signatureTop)
  box(ctx, signatureSplit, signatureBottom, CONTENT.right, signatureTop)

  const certification = [
    'I hereby declare that the contents of this consignment are fully and accurately',
    'described above by the proper shipping name, and are classified, packaged, marked',
    'and labelled/placarded, and are in all respects in proper condition for transport',
    'according to applicable international and national governmental regulations. I declare',
    'that all of the applicable air transport requirements have been met.',
  ]
  certification.forEach((line, i) =>
    text(ctx, line, CONTENT.left + 5, signatureTop - 12 - i * 10, { font: ctx.bold, size: 7.2 }),
  )

  caption(ctx, 'Name', signatureSplit + 6, signatureTop - 12)
  text(ctx, declaration.signerName, signatureSplit + 6, signatureTop - 23, { size: 8 })
  if (declaration.signerTitle) {
    text(ctx, declaration.signerTitle, signatureSplit + 6, signatureTop - 33, { size: 7, color: GREY })
  }
  caption(ctx, 'Place and Date', signatureSplit + 6, signatureTop - 47)
  text(
    ctx,
    [declaration.signerPlace, formatDate(declaration.signerDate)].filter(Boolean).join(', '),
    signatureSplit + 6,
    signatureTop - 58,
    { size: 8 },
  )
  // The caption sits at the top of the space, so the space beneath it is the space to sign in.
  caption(ctx, 'Signature', signatureSplit + 6, signatureTop - 72)
  text(ctx, '(see warning above)', signatureSplit + 48, signatureTop - 72, { size: 6, font: ctx.italic, color: GREY })

  text(
    ctx,
    'Generated by FormWaypoint. Sign by hand — a typewritten signature is not acceptable.',
    CONTENT.left,
    FRAME.bottom + 4,
    { size: 6, color: GREY, font: ctx.italic },
  )
}

/**
 * One dangerous goods entry across the seven columns. Returns the y the next entry starts at.
 *
 * Rows are clipped at the foot of the table rather than drawn past it. The paginator keeps
 * *entries* inside its per-page budget but never bounds one entry's own height, and two
 * free-text inputs feed that height — the packaging type wrapped into the quantity column,
 * and the overpack marks list under it. An entry taller than the space left would otherwise
 * draw straight across the handling-information and certification boxes, silently, on a
 * regulated form.
 */
function drawEntry(
  ctx: Ctx,
  doc: PDFDocument,
  line: DgdLine,
  top: number,
  pageNumber: number,
  tableBottom: number,
): number {
  const size = 7.5
  const rows = Math.max(line.properShippingName.length, line.quantityAndType.length)
  // Rows at or below this y would leave the table box. `top` is the first row's baseline.
  const rowFits = (i: number) => top - i * ROW_HEIGHT > tableBottom + 2
  const totalRows = rows + line.annotations.length
  // Counted over rows, not over the cells drawn in them. The name and the quantity are two
  // columns of one row: incrementing in both callbacks reported a two-row entry as having
  // lost four rows, which reads as a different, larger problem than the one on the sheet.
  let clipped = 0
  for (let i = 0; i < totalRows; i++) if (!rowFits(i)) clipped++

  text(ctx, line.unNumber, COLUMNS.unNumber + 3, top, { size })
  line.properShippingName.forEach((part, i) => {
    if (!rowFits(i)) return
    text(ctx, part, COLUMNS.properShippingName + 4, top - i * ROW_HEIGHT, { size })
  })
  text(ctx, line.classOrDivision, COLUMNS.classOrDivision + 18, top, { size })
  text(ctx, line.packingGroup, COLUMNS.packingGroup + 16, top, { size })
  line.quantityAndType.forEach((part, i) => {
    if (!rowFits(i)) return
    text(ctx, part, COLUMNS.quantity + 4, top - i * ROW_HEIGHT, { size: QUANTITY_FONT_SIZE })
  })
  text(ctx, line.packingInstruction, COLUMNS.packingInstruction + 5, top, { size })

  // Box 17 is the shipper's, for a special provision number where one has been granted. It
  // is left fillable rather than blank so an approval reference can be added without
  // reprinting the sheet.
  if (line.authorization) {
    text(ctx, line.authorization, COLUMNS.authorization + 4, top, { size })
  } else {
    fillable(
      ctx,
      doc,
      `authorization_${pageNumber}_${Math.round(top)}`,
      COLUMNS.authorization + 2,
      top - 3,
      COLUMNS.end - COLUMNS.authorization - 6,
      11,
    )
  }

  let y = top - rows * ROW_HEIGHT
  line.annotations.forEach((annotation, i) => {
    if (!rowFits(rows + i)) return
    text(ctx, annotation, COLUMNS.quantity + 4, y - i * ROW_HEIGHT, { size: QUANTITY_FONT_SIZE })
  })
  y -= line.annotations.length * ROW_HEIGHT

  if (clipped) {
    ctx.warnings.push(
      `The ${line.unNumber} entry runs to ${totalRows} rows but the table has room for fewer; ` +
        `${clipped} row(s) were not printed. Shorten the packaging description or the overpack marks, ` +
        'and check the printed sheet against the review screen before signing.',
    )
  }
  return y
}

/**
 * The largest size at or below the nominal one at which every part of a heading fits.
 *
 * Separated out and exported so the invariant — no heading wider than the column it names —
 * can be asserted against the real column geometry rather than eyeballed on a render.
 */
export function fitHeadingSize(
  label: string[],
  available: number,
  measure: (part: string, size: number) => number,
): number {
  let size = HEADING_SIZE
  while (size > MIN_HEADING_SIZE && label.some((part) => measure(part, size) > available)) size -= 0.2
  return size
}

const HEADING_SIZE = 6.2
const MIN_HEADING_SIZE = 4.4

function drawTableHeadings(ctx: Ctx, top: number, bottom: number): void {
  /**
   * A column heading, shrunk to fit its column.
   *
   * Measured rather than assumed. "(Subsidiary Risk)" is wider than the class column at the
   * nominal size, and a heading that overhangs into the column beside it makes two headings
   * unreadable rather than one. Shrinking is the right trade here — these are fixed captions
   * a reader already knows, not data.
   */
  const heading = (label: string[], left: number, right: number) => {
    const size = fitHeadingSize(label, right - left - 4, (part, at) => ctx.bold.widthOfTextAtSize(part, at))
    label.forEach((part, i) =>
      text(ctx, part, (left + right) / 2, bottom + 6 + (label.length - 1 - i) * 7, {
        size,
        align: 'center',
        font: ctx.bold,
      }),
    )
  }
  heading(['UN', 'or', 'ID No.'], COLUMNS.unNumber, COLUMNS.properShippingName)
  heading(['Proper Shipping Name'], COLUMNS.properShippingName, COLUMNS.classOrDivision)
  heading(['Class', 'or Division', '(Subsidiary Risk)'], COLUMNS.classOrDivision, COLUMNS.packingGroup)
  heading(['Packing', 'Group'], COLUMNS.packingGroup, COLUMNS.quantity)
  heading(['Quantity and', 'Type of packing'], COLUMNS.quantity, COLUMNS.packingInstruction)
  heading(['Packing', 'Inst.'], COLUMNS.packingInstruction, COLUMNS.authorization)
  heading(['Authorization'], COLUMNS.authorization, COLUMNS.end)
  void top
}

/**
 * The red candy stripes down both margins.
 *
 * Not decoration. The declaration is identified across a warehouse by these stripes, the
 * regulation requires them printed in red, and the training materials make the point twice
 * that a monochrome print is a defective document. Drawn rather than depended on from a
 * template so that a colour printer is the only thing standing between the file and a valid
 * form.
 */
function hatchedMargins(page: PDFPage): void {
  for (const left of [FRAME.left, FRAME.right - HATCH_WIDTH]) {
    hatch(page, left, FRAME.bottom, HATCH_WIDTH, FRAME.top - FRAME.bottom)
    page.drawRectangle({
      x: left,
      y: FRAME.bottom,
      width: HATCH_WIDTH,
      height: FRAME.top - FRAME.bottom,
      borderColor: BLACK,
      borderWidth: 0.6,
    })
  }
}

/** 45° stripes clipped to a rectangle, by solving the line against each edge. */
function hatch(page: PDFPage, x: number, y: number, width: number, height: number): void {
  const spacing = 9
  for (let c = y - (x + width); c <= y + height - x; c += spacing) {
    const startX = Math.max(x, y - c)
    const endX = Math.min(x + width, y + height - c)
    if (startX >= endX) continue
    page.drawLine({
      start: { x: startX, y: startX + c },
      end: { x: endX, y: endX + c },
      thickness: 4,
      color: RED,
    })
  }
}

function box(ctx: Ctx, left: number, bottom: number, right: number, top: number, thickness = 0.7): void {
  ctx.page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    borderColor: BLACK,
    borderWidth: thickness,
  })
}

function caption(ctx: Ctx, label: string, x: number, y: number): void {
  text(ctx, label, x, y, { size: 7 })
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center' } = {},
): void {
  if (!value) return
  const font = options.font ?? ctx.regular
  const size = options.size ?? 8
  const width = font.widthOfTextAtSize(value, size)
  const left = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x
  ctx.page.drawText(value, { x: left, y, size, font, color: options.color ?? BLACK })
}

/**
 * The longest prefix of `value` that fits `maxWidth`, marked with an ellipsis where one was
 * taken. Returns `value` unchanged when the whole of it fits.
 *
 * A shortened line is visibly shortened. Cut silently at the box edge it would read as a
 * complete instruction that happens to end oddly, which on a shipping paper is worse than
 * an obviously truncated one — the ellipsis is what sends a reader back to the screen.
 */
function clipToWidth(ctx: Ctx, value: string, maxWidth: number, size: number): string {
  if (ctx.regular.widthOfTextAtSize(value, size) <= maxWidth) return value
  let cut = value.length
  while (cut > 0 && ctx.regular.widthOfTextAtSize(`${value.slice(0, cut)}…`, size) > maxWidth) cut--
  return `${value.slice(0, cut)}…`
}

/** A block of address lines, reporting anything too wide for its box rather than clipping it. */
function lines(
  ctx: Ctx,
  values: string[],
  x: number,
  top: number,
  maxWidth: number,
  label: string,
  size = 8,
  /**
   * Vertical room below `top`, in points, or `Infinity` where the box is not the
   * constraint.
   *
   * A block that does not fit is condensed rather than truncated. Address lines are not
   * decoration — box 1 and box 2 are required to be complete, and an address delivered
   * without its country line is a defective declaration whether the reader is told or
   * not. Only past what condensing can hold is anything left off, and then loudly.
   */
  available = Infinity,
): void {
  // These blocks are drawn on every sheet, so each complaint would otherwise be made once
  // per page about one address. Deduplicated here rather than over the whole list: two
  // genuinely different truncated table rows can carry the same wording, and collapsing
  // those would under-report truncation on a regulated form.
  const warn = (message: string) => {
    if (!ctx.warnings.includes(message)) ctx.warnings.push(message)
  }

  const fit = fitLines(values.length, available, size)
  values.forEach((value, i) => {
    if (i >= fit.capacity) return
    if (ctx.regular.widthOfTextAtSize(value, fit.size) > maxWidth) {
      warn(`${label}: "${value}" is wider than its box and may be clipped when printed.`)
    }
    text(ctx, value, x, top - i * fit.leading, { size: fit.size })
  })

  if (values.length > fit.capacity) {
    warn(
      `${label}: ${values.length} lines were supplied and only ${fit.capacity} fit the box, even condensed. ` +
        `Not printed: ${values.slice(fit.capacity).map((v) => `"${v}"`).join(', ')}. ` +
        'Shorten the address, or write the rest on the form by hand before signing.',
    )
  }
}

/**
 * The type size and leading that put `count` lines inside `available` points.
 *
 * Two tiers and then a stop. The printed form's own boxes are generous for four lines and
 * tight for six, so the second tier buys the two lines that separate an ordinary
 * international address from one that overflows, without shrinking every declaration to
 * fit the worst one.
 */
function fitLines(
  count: number,
  available: number,
  size: number,
): { size: number; leading: number; capacity: number } {
  const tiers = [
    { size, leading: 10 },
    { size: size - 1, leading: 8 },
  ]
  for (const tier of tiers) {
    const capacity = Number.isFinite(available) ? Math.floor(available / tier.leading) + 1 : Infinity
    if (count <= capacity) return { ...tier, capacity }
  }
  const last = tiers[tiers.length - 1]
  return { ...last, capacity: Math.floor(available / last.leading) + 1 }
}

/** Word wrap against the real font metrics, for the few places the model does not pre-wrap. */
function wrapToWidth(ctx: Ctx, value: string, maxWidth: number, size: number): string[] {
  const words = value.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.regular.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate
    else {
      out.push(current)
      current = word
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * A crossed-out box.
 *
 * The published instruction is "delete non-applicable", and the worked examples do it by
 * overtyping the words with X's. Two diagonals across the box read the same way and survive
 * a photocopier better than a row of characters.
 */
function strikeOut(ctx: Ctx, area: { x: number; y: number; w: number; h: number }): void {
  const rows = Math.max(1, Math.round(area.h / 8))
  for (let i = 0; i < rows; i += 1) {
    const bottom = area.y + (i * area.h) / rows
    const top = area.y + ((i + 1) * area.h) / rows
    ctx.page.drawLine({ start: { x: area.x, y: bottom }, end: { x: area.x + area.w, y: top }, thickness: 0.8 })
    ctx.page.drawLine({ start: { x: area.x, y: top }, end: { x: area.x + area.w, y: bottom }, thickness: 0.8 })
  }
}

/**
 * A blank the shipper is not the one to complete.
 *
 * An AcroForm text field rather than an empty rectangle, because these boxes — the air
 * waybill number, the airports, the authorization column — are routinely filled in by the
 * forwarder or the airline after the declaration reaches them, and a printed blank means the
 * whole sheet is retyped when they do.
 */
function fillable(
  ctx: Ctx,
  doc: PDFDocument,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const field = doc.getForm().createTextField(name)
  field.setText('')
  field.addToPage(ctx.page, {
    x,
    y,
    width,
    height,
    font: ctx.regular,
    borderWidth: 0,
    backgroundColor: undefined,
  })
  // A rule under the field, because the declaration is as likely to be completed with a pen
  // as on screen and an empty form field prints as nothing at all.
  ctx.page.drawLine({
    start: { x, y: y - 1 },
    end: { x: x + width, y: y - 1 },
    thickness: 0.5,
    color: GREY,
  })
}

/** `2026-08-06` as `6 August 2026` — the form's own boxes are read by people, not parsers. */
function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return iso.trim()
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const [, year, month, day] = match
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`
}
