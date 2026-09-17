/**
 * The packing list's weight breakdown, in every shape the documents print it.
 *
 * All of these came off one shipment. An invoice went out with a weight missing from several
 * lines; the corrected re-issue redrew those rows, and the app read *fewer* weights from the
 * corrected document than from the wrong one — the corrected rows were printed in a different
 * font, which merged a bracket into the figure beside it, and the reader matched brackets by
 * exact cell text. Three lines reached the form with no weight at all and the shipment was
 * blocked as a packing list that does not add up to its own total.
 *
 * Built row by row rather than drawn, because what is under test is precisely how the
 * extractor splits a row into cells, and a drawn PDF only ever produces one of the splits.
 */
import { describe, expect, it } from 'vitest'
import { parseCiplPages } from './parse-vendor-a'
import type { SourceLine } from '../types'
import type { TextPage, TextRow } from './extract-text'

/**
 * Width of one character at the 7pt the detail pages are set in, measured off the documents:
 * a six-figure weight reported by the extractor as 21.4 points wide.
 *
 * Rows are built with widths because the parser reads a right-aligned column by its right
 * edge. A fixture that stated none would exercise the fallback rather than the rule.
 */
const CHAR = 3.43

let y = 700
const row = (...items: ([string, number] | [string, number, number])[]): TextRow => {
  y -= 12
  return {
    y,
    items: items.map(([str, x, width]) => ({ str, x, y, width: width ?? str.length * CHAR })),
  }
}

const page = (pageNumber: number, rows: TextRow[]): TextPage => ({ pageNumber, width: 612, height: 792, rows })

/** The packing-list header page: the set marker and the title are what classify what follows. */
const headerPage = (): TextPage => {
  y = 700
  return page(1, [
    row(['Vendor A, Inc.', 24], ['FC', 560]),
    row(['PACKING LIST', 36]),
    row(['INVOICE NUMBER:', 306], ['S0000011', 414]),
    row(['DATE:', 306], ['September 17, 2026', 414]),
    row(['TOTAL:', 30], ['9', 108], ['PCS', 120]),
  ])
}

/** A detail page, with the column headings the figure columns are calibrated from. */
const detailPage = (rows: TextRow[], { headings = true } = {}): TextPage => {
  y = 700
  return page(2, [
    row(['INVOICE NO', 36], ['S0000011', 90], ['Page', 540], ['2', 581]),
    row(['PACKING LIST', 264]),
    row(['NET', 426], ['GROSS', 492]),
    headings
      ? row(
          ['MARKS & NOS.', 24],
          ['DESCRIPTION OF GOODS', 144],
          ['ORIGIN', 264],
          ['QUANTITY', 366],
          ['WEIGHT', 426],
          ['WEIGHT', 492],
          ['MEASUREMENT', 534],
        )
      : row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 264]),
    ...rows,
  ])
}

type Cell = [string, number] | [string, number, number]

interface BlockSpec {
  order: string
  part: string
  model: string
  code?: string
  quantity?: number
  /** Figures on the quantity row: the section's running totals, not this line's weights. */
  sectionTotals?: [string, string, string]
  /** The breakdown row's cells, right of the model, as the extractor split them. */
  breakdown: Cell[]
  /** Extra cells on the block's start row, where a description reaches the figure columns. */
  startExtras?: Cell[]
  /** Cells to print on the quantity row in place of the country of origin. */
  origin?: Cell[]
}

/** The five-row packing block, at the columns the real documents print it in. */
const block = (spec: BlockSpec): TextRow[] => {
  const quantityRow: Cell[] = [
    ['5830', 24],
    [spec.model, 72],
    ...(spec.origin ?? [['United Kingdom', 264] as Cell]),
    [String(spec.quantity ?? 4), 397],
  ]
  if (spec.sectionTotals) {
    quantityRow.push([spec.sectionTotals[0], 437], [spec.sectionTotals[1], 503], [spec.sectionTotals[2], 565])
  }
  return [
    row(
      [spec.order, 72],
      [spec.order, 186],
      ['1', 252],
      [spec.part, 360],
      ['SWITCH, EXAMPLE', 480],
      ...(spec.startExtras ?? []),
    ),
    row(['0001', 72], [`${spec.order}X`, 96]),
    row([spec.code ?? '8536.50.9065', 72], ['PCS', 384]),
    row(...quantityRow),
    ...(spec.breakdown.length ? [row([`${spec.part} ${spec.model}`, 72], ...spec.breakdown)] : []),
  ]
}

const totalsRow = (net: string) => row(['FOB Origin - Collect', 309], ['TOTALS', 378], [net, 438], ['0.000', 504])

const packingLines = (pages: TextPage[]): SourceLine[] =>
  parseCiplPages('weights.pdf', pages).lines.filter((l) => l.documentKind === 'PACKING_LIST')

const only = (rows: TextRow[], options?: { headings?: boolean }) =>
  packingLines([headerPage(), detailPage(rows, options)])[0]

describe('the weight breakdown', () => {
  it('reads figures with the brackets printed as cells of their own', () => {
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        breakdown: [
          ['(', 337],
          ['2.904', 442],
          ['3.194', 508],
          ['.800000', 563],
          [')', 594],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(2.904)
    expect(line.grossWeightKg).toBe(3.194)
    expect(line.measurementM3).toBe(0.8)
  })

  it('reads them with the closing bracket merged into the measurement', () => {
    // What a corrected re-issue produces: the redrawn row is kerned tight, so the extractor
    // reports `.800000 )` as one cell. Matching `)` as a cell of its own found no closing
    // bracket and dropped all three weights.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        breakdown: [
          ['(', 334.5],
          ['2.904', 441.9],
          ['3.194', 509.8],
          ['.800000 )', 566.5],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(2.904)
    expect(line.grossWeightKg).toBe(3.194)
    expect(line.measurementM3).toBe(0.8)
  })

  it('reads them with the opening bracket merged into the first figure', () => {
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        breakdown: [
          ['( 2.904', 441.9],
          ['3.194', 509.8],
          ['.800000 )', 566.5],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(2.904)
    expect(line.grossWeightKg).toBe(3.194)
  })

  it('keeps a quantity printed inside the brackets out of the weights', () => {
    // A line packed across two cartons states its quantity in the breakdown as well. Read in
    // the order they appear, the quantity becomes the net weight and every figure shifts a
    // column right — a wrong weight on the form, and one that adds up to nothing obvious.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        quantity: 4,
        breakdown: [
          ['(', 334.5],
          ['4', 397.3],
          ['2.904', 441.9],
          ['3.194', 509.8],
          ['.800000 )', 566.5],
        ],
      }),
    )
    expect(line.quantity).toBe(4)
    expect(line.netWeightKg).toBe(2.904)
    expect(line.grossWeightKg).toBe(3.194)
    expect(line.measurementM3).toBe(0.8)
  })

  it('reads a breakdown printed with no brackets at all', () => {
    // This layout prints the figures bare where the section above carries no running total to
    // tell them apart from. Requiring brackets filed those lines with no weight whatever the
    // packing list stated — including, on the shipment this suite is drawn from, a line whose
    // weight was the one the re-issue existed to correct.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4750',
        model: 'MODEL-B',
        quantity: 5,
        breakdown: [
          ['1.055', 442.2],
          ['1.161', 510.2],
          ['0.000000', 562.6],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(1.055)
    expect(line.grossWeightKg).toBe(1.161)
  })

  it('reads the section running totals as the line weight on no line that has its own', () => {
    // The figures on the quantity row belong to the carton, not to the line. Reading a
    // bracketless row as weights must not reach back up to them.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '40589-0023',
        model: 'MODEL-C',
        quantity: 5,
        sectionTotals: ['22.212', '24.433', '.012800'],
        breakdown: [
          ['(', 336.7],
          ['8.500', 442.2],
          ['9.350', 508.2],
          ['0.000000', 562.6],
          [')', 594],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(8.5)
    expect(line.grossWeightKg).toBe(9.35)
  })

  it('falls back to the section totals for a section of one line', () => {
    // A packing list with a single merchandise line omits the breakdown entirely.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '40589-0023',
        model: 'MODEL-C',
        quantity: 5,
        sectionTotals: ['22.212', '24.433', '.012800'],
        breakdown: [],
      }),
    )
    expect(line.netWeightKg).toBe(22.212)
    expect(line.grossWeightKg).toBe(24.433)
  })

  it('files no weight at all where the net weight column is blank', () => {
    // The gross weight is not the net weight. Filing it as one puts a number on a customs
    // form that no document states; filing nothing fails a blocking check the operator sees.
    // With the section's running totals printed above, which is the shape that makes this
    // bite: a breakdown that cannot be read must not fall back to them. They are the
    // section's figures, so filing them here overstates this line and counts the section
    // twice — and it reconciles, because the same figures are on both sides of the sum.
    const line = only([
      ...block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        sectionTotals: ['22.212', '24.433', '.012800'],
        breakdown: [
          ['(', 337],
          ['3.194', 508],
          ['.800000 )', 566],
        ],
      }),
      totalsRow('3.194'),
    ])
    expect(line.netWeightKg).toBeUndefined()
    expect(line.grossWeightKg).toBeUndefined()
  })

  it('multiplies divided figures back up with the bracket merged', () => {
    // `(@ / 5)` means the figures beside it are the line total split five ways.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        quantity: 4,
        breakdown: [
          ['(@ / 5)', 309.3],
          ['(', 336.7],
          ['.581', 446.1],
          ['.639', 512.1],
          ['.800000 )', 566.5],
        ],
      }),
    )
    expect(line.weightDivisor).toBe(5)
    expect(line.netWeightKg).toBeCloseTo(2.905, 3)
    expect(line.grossWeightKg).toBeCloseTo(3.195, 3)
  })

  it('reads a wide figure by the edge its column is aligned by', () => {
    // Figures are right-aligned: a net weight of five figures starts left of its own heading
    // while ending where every other net weight ends. Read by its left edge it lands in the
    // quantity column and is dropped — and the line does not come out short, it comes out
    // wrong, because the gross weight slides left into the empty net slot and files as the
    // net weight with the packaging in it.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        breakdown: [
          ['(', 337],
          // Right-aligned to 459 and 525, the edges every figure on the page shares.
          ['11,113.140', 424.7],
          ['12,224.454', 490.7],
          ['.800000 )', 566],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(11113.14)
    expect(line.grossWeightKg).toBe(12224.454)
  })

  it('does not take the start row’s description cells for figures', () => {
    // A packing block prints its description from the part-number column rightwards, straight
    // through all three figure columns. Nothing but the block's own shape keeps those cells
    // out of the weights: the row is above the classification row, so the scan starts below
    // it.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        startExtras: [
          ['24', 484],
          ['1.5', 500],
        ],
        breakdown: [
          ['(', 337],
          ['2.904', 442],
          ['3.194', 508],
          ['.800000 )', 566],
        ],
      }),
    )
    expect(line.netWeightKg).toBe(2.904)
    expect(line.grossWeightKg).toBe(3.194)
  })

  it('does not take a part number of digits alone for the quantity', () => {
    const line = only(
      block({
        order: '00000001OP0060',
        part: '4450640',
        model: 'MODEL-A',
        quantity: 4,
        breakdown: [
          ['(', 337],
          ['2.904', 442],
          ['3.194', 508],
          ['.800000 )', 566],
        ],
      }),
    )
    expect(line.quantity).toBe(4)
    expect(line.netWeightKg).toBe(2.904)
  })

  it('keeps the quantity and country of a line whose origin is bracketed', () => {
    // `Korea (Republic of)`, split by the extractor. A reader that skipped any row carrying a
    // bracket lost this row altogether — and with it the quantity, the country of origin, and
    // the exclusion that keeps the section's running totals out of the weights.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        quantity: 4,
        origin: [
          ['Korea', 264],
          ['(Republic', 300],
          ['of)', 336],
        ],
        sectionTotals: ['22.212', '24.433', '.012800'],
        breakdown: [
          ['(', 337],
          ['2.904', 442],
          ['3.194', 508],
          ['.800000 )', 566],
        ],
      }),
    )
    expect(line.quantity).toBe(4)
    expect(line.countryOfOrigin).toBe('Korea (Republic of)')
    expect(line.netWeightKg).toBe(2.904)
  })

  it('multiplies divided figures back up with the marker merged into the bracket', () => {
    // The same re-issue font that merges the closing bracket into the measurement merges the
    // marker into the opening bracket. Matched as a whole cell, `(@ / 5) (` is not a marker,
    // and the line files at a fifth of its weight with no divider recorded — so the totals
    // are not even granted the rounding they would need to agree.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        quantity: 4,
        breakdown: [
          ['(@ / 5) (', 309.3],
          ['.581', 446.1],
          ['.639', 512.1],
          ['.800000 )', 566.5],
        ],
      }),
    )
    expect(line.weightDivisor).toBe(5)
    expect(line.netWeightKg).toBeCloseTo(2.905, 3)
  })

  it('reads a page whose column headings could not be read', () => {
    // Calibration is preferred, not required: the columns fall back to the ones these
    // documents print, so a page whose headings the extractor mangled still reads.
    const line = only(
      block({
        order: '00000001OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        breakdown: [
          ['(', 337],
          ['2.904', 442],
          ['3.194', 508],
          ['.800000 )', 566],
        ],
      }),
      { headings: false },
    )
    expect(line.netWeightKg).toBe(2.904)
  })
})

describe('a packing list whose rows were re-issued', () => {
  it('still adds up to the total the document states', () => {
    // The shipment in miniature: bracketed lines, a re-issued line whose closing bracket
    // merged, and a line printed with no brackets. Two of the three used to come out blank,
    // and the shipment was blocked for a shortfall of exactly their weights.
    const lines = packingLines([
      headerPage(),
      detailPage([
        ...block({
          order: '00000001OP0060',
          part: '40589-0023',
          model: 'MODEL-C',
          quantity: 5,
          sectionTotals: ['22.212', '24.433', '.012800'],
          breakdown: [
            ['(', 336.7],
            ['8.500', 442.2],
            ['9.350', 508.2],
            ['0.000000', 562.6],
            [')', 594],
          ],
        }),
        ...block({
          order: '00000002OP0060',
          part: '44506-4010',
          model: 'MODEL-A',
          quantity: 4,
          breakdown: [
            ['(', 334.5],
            ['4', 397.3],
            ['2.904', 441.9],
            ['3.194', 509.8],
            ['.800000 )', 566.5],
          ],
        }),
        ...block({
          order: '00000003OP0060',
          part: '44506-4750',
          model: 'MODEL-B',
          quantity: 5,
          breakdown: [
            ['1.055', 442.2],
            ['1.161', 510.2],
            ['0.000000', 562.6],
          ],
        }),
        totalsRow('12.459'),
      ]),
    ])
    expect(lines).toHaveLength(3)
    expect(lines.every((l) => l.netWeightKg !== undefined)).toBe(true)
    const net = lines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    expect(net).toBeCloseTo(12.459, 3)
  })

  it('does not carry a re-issued line overleaf as an unfinished block', () => {
    // A line whose weights could not be read looks exactly like one that ran off the bottom
    // of the page, so the reader held it open and swept the next page's rows into it — which
    // cost that page's first line its commodity heading as well as this line its weights.
    const first = detailPage([
      row(['SWITCH', 72]),
      ...block({
        order: '00000001OP0060',
        part: '44506-4750',
        model: 'MODEL-B',
        quantity: 5,
        breakdown: [
          ['(', 334.5],
          ['1.055', 441.9],
          ['1.161', 509.8],
          ['.428570 )', 566.5],
        ],
      }),
      row(['Helical Springs', 72]),
    ])
    y = 700
    const second = page(3, [
      row(['INVOICE NO', 36], ['S0000011', 90], ['Page', 540], ['3', 581]),
      row(['PACKING LIST', 264]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 264], ['QUANTITY', 366], ['WEIGHT', 426], ['WEIGHT', 492], ['MEASUREMENT', 534]),
      ...block({
        order: '00000002OP0060',
        part: '44506-4010',
        model: 'MODEL-A',
        code: '7320.20.5000',
        quantity: 4,
        breakdown: [
          ['(', 336.7],
          ['2.904', 442.2],
          ['3.194', 508.2],
          ['.800000', 562.6],
          [')', 594],
        ],
      }),
      totalsRow('3.959'),
    ])
    const parsed = parseCiplPages('weights.pdf', [headerPage(), first, second])
    expect(parsed.warnings).toEqual([])
    const lines = parsed.lines.filter((l) => l.documentKind === 'PACKING_LIST')
    expect(lines.map((l) => l.orderNumber)).toEqual(['00000001OP0060', '00000002OP0060'])
    expect(lines.map((l) => l.commodityGroup)).toEqual(['SWITCH', 'Helical Springs'])
    expect(lines.map((l) => l.page)).toEqual([2, 3])
  })
})
