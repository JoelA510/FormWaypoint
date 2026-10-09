/**
 * The shapes that broke the `vendor-b` parser, rebuilt from invented goods.
 *
 * `parseVendorBPages` takes extracted pages rather than a PDF, which makes the layout
 * itself testable without a document: rows and x positions are the parser's whole input. So
 * these run in CI, where the shipments that exposed them cannot.
 *
 * Every defect here comes from one real file whose last line silently failed to parse. The
 * line was legible, correctly positioned, and dropped anyway — and three separate things had
 * to be wrong for nobody to be told about it.
 */
import { describe, expect, it } from 'vitest'
import { parseVendorBPages } from './parse-vendor-b'
import { isLikelyBarcode, type TextPage } from './extract-text'
import {
  BARCODE,
  LINES,
  X,
  ext,
  invoicePage,
  packingPage,
  printedTotal,
  row,
  wholeShipment,
} from '../../test/synthetic/vendor-b'
import { reconcile } from '../reconcile'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const parse = (pages: TextPage[]) => parseVendorBPages('shipment.pdf', pages)


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

  it('does not keep one read off a packing-list page when the invoice prints none', () => {
    // The header is seeded from the first recognised page, whichever kind that is, and this
    // layout prints the same label on the packing list. Leaving that figure standing would
    // let the value check pass against a number the invoice never printed — underneath a
    // warning saying the total could not be proved, which is the worst of both.
    const packing = packingPage(1, LINES)
    packing.rows.push(row(100, [[400, 'Total Net Value:'], [X.extended, '99999.00']]))
    const parsed = parse([packing, invoicePage(2, LINES)])
    expect(parsed.headers.FC.totalValue).toBe(0)
    expect(parsed.warnings.some((w) => /Total Net Value/i.test(w))).toBe(true)
  })
})
