/**
 * The shapes that broke the `omron-shipment` parser, rebuilt from invented goods.
 *
 * `parseOmronShipmentPages` takes extracted pages rather than a PDF, which makes the layout
 * itself testable without a document: rows and x positions are the parser's whole input. So
 * these run in CI, where the shipments that exposed them cannot.
 *
 * Every defect here comes from one real file whose last line silently failed to parse. The
 * line was legible, correctly positioned, and dropped anyway — and three separate things had
 * to be wrong for nobody to be told about it.
 */
import { describe, expect, it } from 'vitest'
import { parseOmronShipmentPages } from './parse-omron-shipment'
import { isLikelyBarcode, type TextPage, type TextRow } from './extract-text'
import { reconcile } from '../reconcile'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/** Columns as the layout prints them, taken from a real extraction. */
const X = { order: 23, item: 88, description: 183, code: 323, quantity: 442, unit: 510, extended: 571 }

const row = (y: number, cells: [number, string][]): TextRow => ({
  y,
  items: cells.map(([x, str]) => ({ str, x, y })),
})

interface Line {
  order: string
  part: string
  description: string
  code: string
  quantity: number
  unitPrice: number
}

const LINES: Line[] = [
  { order: '13380611.12.000', part: '44808-0035', description: 'SMALL P 2NC/1NO M12', code: '8536.50.9065', quantity: 2, unitPrice: 54.84 },
  { order: '13392257.2.000', part: '44536-0200', description: 'CM-S2 SWITCH 3M CABLE', code: '8536.50.9065', quantity: 3, unitPrice: 17.76 },
  // The line that was lost: a curly apostrophe in an otherwise ordinary description.
  { order: '13395573.2.000', part: '44508-0711', description: 'REPL ACT’R MFS-11', code: '8538.90.7080', quantity: 2, unitPrice: 19.14 },
]

const ext = (line: Line) => Math.round(line.quantity * line.unitPrice * 100) / 100
const printedTotal = () => LINES.reduce((sum, l) => sum + ext(l), 0)

/** A barcode as the font actually extracts: a short fragment, then padding. */
const BARCODE = `xh!3\u0019c\u00001Myzx${'ÿ'.repeat(20)}`

function invoicePage(pageNumber: number, lines: Line[], options: { total?: number } = {}): TextPage {
  const rows: TextRow[] = [
    row(700, [[23, 'COMMERCIAL OMRON SHIPMENT# 278999']]),
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
  rows.push(row(y - 20, [[23, 'Omron Robotics and Safety Technologies, Inc.']]))
  return { pageNumber, width: 612, height: 792, rows }
}

function packingPage(pageNumber: number, lines: Line[], options: { summary?: Line[] } = {}): TextPage {
  const rows: TextRow[] = [
    row(700, [[23, 'MASTER PACKING LIST OMRON SHIPMENT# 278999']]),
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

const parse = (pages: TextPage[]) => parseOmronShipmentPages('shipment.pdf', pages)

const wholeShipment = () => [
  invoicePage(1, LINES.slice(0, 2)),
  invoicePage(2, LINES.slice(2), { total: printedTotal() }),
  packingPage(3, LINES, { summary: LINES }),
]

describe('a description containing a typographic apostrophe', () => {
  it('is not mistaken for a barcode', () => {
    // The heuristic used to reject anything outside printable ASCII, which is most of the
    // punctuation a real item master contains.
    expect(isLikelyBarcode('REPL ACT’R MFS-11')).toBe(false)
  })

  it('leaves other legitimate non-ASCII descriptions alone', () => {
    for (const text of ['CAP 10µF 25V', 'RES 4.7Ω 1%', 'SENSOR −40°C to +85°C', 'CÂBLE 5M', 'SWITCH – 2NC/1NO']) {
      expect(isLikelyBarcode(text), text).toBe(false)
    }
  })

  it('still catches the barcode font', () => {
    expect(isLikelyBarcode(BARCODE)).toBe(true)
    expect(isLikelyBarcode('xh"\u0010c\u0000\u0000')).toBe(true)
    expect(isLikelyBarcode(`7G,yzx${'ÿ'.repeat(24)}`)).toBe(true)
    expect(isLikelyBarcode('xh"c')).toBe(true)
    expect(isLikelyBarcode('   ')).toBe(true)
  })

  it('reads the whole line rather than dropping the block', () => {
    // Losing the description cell shifted every column left, so the shipping code landed
    // where the description belongs and the parser refused the block outright.
    const parsed = parse(wholeShipment())
    const line = parsed.lines.find((l) => l.documentKind === 'INVOICE' && l.partNumber === '44508-0711')
    expect(line).toBeDefined()
    expect(line).toMatchObject({
      description: 'REPL ACT’R MFS-11',
      classification: '8538.90.7080',
      quantity: 2,
      countryOfOrigin: 'United Kingdom',
    })
  })
})

describe('a block that genuinely cannot be read', () => {
  /** The description missing entirely, which is what the barcode bug used to simulate. */
  const mangled = () => {
    const pages = wholeShipment()
    const detail = pages[1].rows.find((r) => r.items.some((i) => i.str === '13395573.2.000'))!
    detail.items = detail.items.filter((i) => i.str !== 'REPL ACT’R MFS-11')
    return pages
  }

  it('is still refused rather than filed with a shipping code as its description', () => {
    // The refusal is correct. Filing "HSCD: 8538.90.7080" as the goods description would be
    // worse than not filing the line.
    const parsed = parse(mangled())
    expect(parsed.lines.some((l) => l.description.startsWith('HSCD:'))).toBe(false)
  })

  it('says so, naming the line', () => {
    // The refusal used to be silent, which made it indistinguishable from a line that was
    // never on the document.
    const parsed = parse(mangled())
    const warning = parsed.warnings.find((w) => /could not be read/i.test(w))
    expect(warning).toBeDefined()
    expect(warning).toContain('13395573.2.000')
    expect(warning).toContain('Page 2')
  })
})

describe('the printed total', () => {
  it('is read from the last invoice page, not just the first', () => {
    // A multi-page invoice prints its total at the end. The header comes from page 1, so
    // looking only there found nothing.
    expect(parse(wholeShipment()).headers.FC.totalValue).toBeCloseTo(printedTotal(), 2)
  })

  it('is never replaced by the sum of the lines being checked', () => {
    // The old fallback made the value check self-referential: the rows were compared against
    // their own sum, so it passed no matter how many lines had been dropped.
    const pages = wholeShipment()
    const detail = pages[1].rows.find((r) => r.items.some((i) => i.str === '13395573.2.000'))!
    detail.items = detail.items.filter((i) => i.str !== 'REPL ACT’R MFS-11')

    const parsed = parse(pages)
    const result = reconcile(parsed, null, CONTROLLED)
    const value = result.checks.find((c) => c.id === 'total-value')
    expect(value).toMatchObject({ severity: 'blocking', passed: false })
    expect(Number(value?.expected)).toBeCloseTo(printedTotal(), 2)
  })

  it('warns when no total is printed anywhere', () => {
    const parsed = parse([invoicePage(1, LINES), packingPage(2, LINES)])
    expect(parsed.warnings.some((w) => /Total Net Value/i.test(w))).toBe(true)
    expect(parsed.headers.FC.totalValue).toBe(0)
  })
})

describe('the packing list’s own summary', () => {
  it('is read as a per-part total', () => {
    expect(parse(wholeShipment()).partTotals).toEqual({
      '44808-0035': 2,
      '44536-0200': 3,
      '44508-0711': 2,
    })
  })

  it('passes when every part agrees', () => {
    const result = reconcile(parse(wholeShipment()), null, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'packing-summary')).toMatchObject({ passed: true })
  })

  it('blocks, naming the part, when a line never made it through', () => {
    // The one check in this format that is not derived from the same line blocks the parser
    // reads — so it catches a dropped line even when every other total agrees.
    const parsed = parse(wholeShipment())
    const short = { ...parsed, lines: parsed.lines.filter((l) => l.partNumber !== '44508-0711') }
    const check = reconcile(short, null, CONTROLLED).checks.find((c) => c.id === 'packing-summary')
    expect(check).toMatchObject({ severity: 'blocking', passed: false })
    expect(check?.detail).toContain('44508-0711')
    expect(check?.detail).toMatch(/no line for it was read at all/)
  })

  it('blocks when a line is counted twice', () => {
    const parsed = parse(wholeShipment())
    const doubled = { ...parsed, lines: [...parsed.lines, { ...parsed.lines[0], id: `${parsed.lines[0].id}:copy` }] }
    const check = reconcile(doubled, null, CONTROLLED).checks.find((c) => c.id === 'packing-summary')
    expect(check).toMatchObject({ passed: false })
  })

  it('does not run for a layout that prints no summary', () => {
    const parsed = parse([invoicePage(1, LINES, { total: printedTotal() }), packingPage(2, LINES)])
    expect(parsed.partTotals).toBeUndefined()
    expect(reconcile(parsed, null, CONTROLLED).checks.find((c) => c.id === 'packing-summary')).toBeUndefined()
  })
})

describe('the shipment as a whole', () => {
  it('reads every line from both documents and reconciles', () => {
    const parsed = parse(wholeShipment())
    expect(parsed.lines.filter((l) => l.documentKind === 'INVOICE')).toHaveLength(3)
    expect(parsed.lines.filter((l) => l.documentKind === 'PACKING_LIST')).toHaveLength(3)

    const result = reconcile(parsed, null, {
      ...CONTROLLED,
      unitWeightsByPart: Object.fromEntries(LINES.map((l) => [l.part, 0.5])),
    })
    for (const id of ['total-quantity', 'total-value', 'packing-summary', 'line-coverage']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
  })
})

describe('when nothing at all could be parsed', () => {
  /** Every detail row stripped of its description — the whole document refused. */
  const allRefused = () => {
    const pages = wholeShipment()
    for (const page of pages) {
      for (const r of page.rows) {
        r.items = r.items.filter((i) => !LINES.some((l) => l.description === i.str))
      }
    }
    return pages
  }

  it('still holds the shipment, because the summary does not depend on the lines', () => {
    // Every other check compares zero against zero here and passes. This one has an
    // independent figure to compare against, which is the entire reason it exists.
    const parsed = parse(allRefused())
    expect(parsed.lines.filter((l) => l.documentKind === 'INVOICE')).toHaveLength(0)
    const result = reconcile(parsed, null, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'packing-summary')).toMatchObject({
      severity: 'blocking',
      passed: false,
    })
    expect(result.canGenerate).toBe(false)
  })
})

describe('a summary section that cannot be read', () => {
  it('warns rather than dropping the check silently', () => {
    // `Item Nbr:` instead of `Item Number:` — the section is plainly there, but no row
    // matches, so the check would simply vanish and nothing else would notice.
    const pages = wholeShipment()
    for (const r of pages[2].rows) {
      r.items = r.items.map((i) => ({ ...i, str: i.str.replace('Item Number:', 'Item Nbr:') }))
    }
    const parsed = parse(pages)
    expect(parsed.partTotals).toBeUndefined()
    expect(parsed.warnings.some((w) => /summary section/i.test(w))).toBe(true)
  })
})

describe('which page the total comes from', () => {
  it('takes the last invoice page when each page prints a running subtotal', () => {
    // Taking the first match would hand back page one's subtotal as the shipment total and
    // fail a document that parsed perfectly.
    const pages = [
      invoicePage(1, LINES.slice(0, 2), { total: ext(LINES[0]) + ext(LINES[1]) }),
      invoicePage(2, LINES.slice(2), { total: printedTotal() }),
      packingPage(3, LINES, { summary: LINES }),
    ]
    expect(parse(pages).headers.FC.totalValue).toBeCloseTo(printedTotal(), 2)
  })

  it('ignores a total printed on a packing-list page', () => {
    const pages = wholeShipment()
    pages[2].rows.push(row(100, [[400, 'Total Net Value:'], [X.extended, '99999.00']]))
    expect(parse(pages).headers.FC.totalValue).toBeCloseTo(printedTotal(), 2)
  })
})
