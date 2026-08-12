/**
 * Vendor A layouts built row by row, for the shapes a drawn PDF cannot produce.
 *
 * The synthetic generator emits whole blocks, so it can put a heading at the foot of a page
 * but never split a block across one — which left the carry path with no CI coverage at all,
 * and a defect in it went out under a green suite. These feed `parseCiplPages` directly.
 *
 * Positions are the ones the real documents use: headings and models at x=72, descriptions at
 * x=192 and x=384, figures right of x=421.
 */
import { describe, expect, it } from 'vitest'
import { parseCiplPages } from './parse-vendor-a'
import type { ParsedCipl } from '../types'
import type { TextPage, TextRow } from './extract-text'

let y = 700
const row = (...items: [string, number][]): TextRow => {
  y -= 12
  return { y, items: items.map(([str, x]) => ({ str, x, y })) }
}

const page = (pageNumber: number, rows: TextRow[]): TextPage => ({ pageNumber, width: 612, height: 792, rows })

/** The header page, which is what tells the parser which set and kind follow. */
const headerPage = (): TextPage => {
  y = 700
  return page(1, [
    row(['Vendor A, Inc.', 24], ['FC', 560]),
    row(['INVOICE', 276]),
    row(['INVOICE NUMBER:', 24], ['S0000009', 120]),
    row(['DATE:', 24], ['August 07, 2026', 120]),
    row(['CONSIGNED TO:', 24], ['Example Consignee', 120]),
    row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
  ])
}

/** A complete five-row invoice block. */
const block = (order: string, part: string, code: string, model: string, description: string): TextRow[] => [
  row([order, 72], [order, 198], ['1', 246]),
  row(['0001', 72], [`${order}X`, 96], ['Japan', 198]),
  row([code, 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
  row(['5610', 24], [model, 72], [part, 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
  row([part, 72], [description, 192]),
]

const detailPage = (pageNumber: number, rows: TextRow[]): TextPage => {
  y = 700
  return page(pageNumber, [
    row(['INVOICE NO', 36], ['S0000009', 90], ['Page', 558]),
    row(['INVOICE', 276]),
    row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
    ...rows,
  ])
}

const parsed = (pages: TextPage[]): ParsedCipl => parseCiplPages('shapes.pdf', pages)

const invoiceLines = (pages: TextPage[]) =>
  parsed(pages).lines.filter((l) => l.documentKind === 'INVOICE')

describe('a heading stranded at the foot of a page', () => {
  it('governs the first block of the next page', () => {
    const first = detailPage(2, [...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'), row(['Gaskets', 72])])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })

  it('is not taken from a row that is still inside the last block', () => {
    // A description printed without its part number is a lone row in the heading column.
    // Guarding only on the block's start let it carry forward as the next page's heading.
    const first = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
      row(['CABLE ASSY', 72]),
    ])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', ''])
  })

  it('is not looked for when the page’s last block runs overleaf', () => {
    // Those closing rows belong to the unfinished block. Reading one as a heading hands the
    // next page's goods a description taken from the middle of a line not yet read — and the
    // heading is what the SLI row is described by, so it reaches the export declaration.
    const partial = detailPage(2, [
      ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
      row(['Gaskets', 72]),
      // A second block that stops before its figures: it continues on the next page.
      row(['00000002OP0010', 72], ['00000002OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000002X', 96], ['Japan', 198]),
      row(['Screw Machine Products', 72]),
    ])
    const rest = detailPage(3, [
      row(['8536.10.0020', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['5610', 24], ['MODEL-B', 72], ['10000-0002', 192], ['4', 421], ['1.000', 472], ['4.000', 550]),
      row(['10000-0002', 72], ['FUSE', 192]),
      ...block('00000003OP0010', '10000-0003', '4016.93.0000', 'MODEL-C', 'O-RING'),
    ])
    const groups = invoiceLines([headerPage(), partial, rest]).map((l) => l.commodityGroup)
    expect(groups).not.toContain('Screw Machine Products')
  })
})

describe('the block above', () => {
  it('does not lend its own description to the block below as a heading', () => {
    // The widened pattern accepts ordinary descriptions like `CBL, OS32C-CBL-30M`, which the
    // old character class rejected. Where a block prints its description without the part
    // number beside it, an unbounded look-behind reads it as the next block's heading — and
    // the heading is what `aggregateLines` files as the SLI row description.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
        row(['CBL, OS32C-CBL-30M', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual(['', ''])
  })

  it('keeps that description on the line it belongs to', () => {
    // Bounding the search to the description column dropped it: the row is at the left
    // margin, so it was neither a description nor a heading and the line went out blank.
    // Nothing blocks a blank commodity description.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
        row(['CBL, OS32C-CBL-30M', 72]),
        row(['Gaskets', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    const lines = invoiceLines(pages)
    expect(lines[0].description).toBe('CBL, OS32C-CBL-30M')
    // And the heading below it still reaches the block it heads, not the one above.
    expect(lines.map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })

  it('does not lend it forward across a page break either', () => {
    // The floor was applied from the second block on, so the first block of a page finishing
    // a carried-over one was searched with no floor at all.
    const first = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const second = detailPage(3, [
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
      row(['CBL, OS32C-CBL-30M', 72]),
      ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
    ])
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', ''])
  })

  it('still lets a real heading through from the same position', () => {
    const pages = [
      headerPage(),
      detailPage(2, [
        ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
        row(['Gaskets', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })
})

describe('what the description fallback must not reach', () => {
  it('never takes the shipping marks', () => {
    // MARKS & NOS. is at x=24 and a description at the left margin is at x=72. A fallback
    // wide enough for the second took the first, declaring the goods as `C/NO. ONE OF TWO`.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['C/NO. ONE OF TWO', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
        row(['C/NO. ONE OF TWO', 24]),
      ]),
    ]
    expect(invoiceLines(pages)[0].description).not.toContain('C/NO')
  })
})

describe('page furniture above a carried block', () => {
  it('does not stand in for the block’s own figures', () => {
    // `PAGE 2 OF 3` is two numbers on the right of the page, which is all the figure-row scan
    // looks for. Anchoring the carried block at row 0 let it satisfy that scan first, putting
    // the floor above the carried block's description — which then became the next heading.
    const first = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const second: TextPage = (() => {
      y = 700
      return page(3, [
        row(['INVOICE NO', 36], ['S0000009', 90], ['PAGE', 500], ['2', 545], ['3', 570]),
        row(['INVOICE', 276]),
        row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
        row(['CBL, OS32C-CBL-30M', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ])
    })()
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', ''])
  })
})

describe('a block whose figures could not be read', () => {
  it('is not declared as its country of origin', () => {
    // With no figure row to anchor on, a two-row window from the top of the block landed on
    // the line-number row — whose ORIGIN cell sits inside the description column.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['10000-0001', 72], ['CABLE ASSY, 30M', 192]),
        row(['Gaskets', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    const first = invoiceLines(pages)[0]
    expect(first.description).toBe('CABLE ASSY, 30M')
    // And the heading below it is still not swept in, which is what the window was bounding.
    expect(first.description).not.toBe('Gaskets')
  })

  it('is not declared as its country of origin when the origin is the longest text', () => {
    // `United States` sits in the description column on the line-number row and is longer
    // than a terse description. The block has already been read for it.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['United States', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['10000-0001', 72], ['FUSE', 192]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0]).toMatchObject({ description: 'FUSE', countryOfOrigin: 'United States' })
  })
})

describe('a description shorter than the fields printed beside it', () => {
  it('is not replaced by the model code', () => {
    // The model sits at the left margin on the figures row, the same column a left-margin
    // description uses, and `RT6 5450A` is longer than `FUSE`.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8536.10.0020', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['RT6 5450A', 72], ['10000-0001', 192], ['2', 421], ['1.000', 472], ['2.000', 550]),
        row(['FUSE', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0]).toMatchObject({ description: 'FUSE', model: 'RT6 5450A' })
  })
})

describe('a description that reads like another field', () => {
  it('is kept when it repeats the model code', () => {
    // Some parts are described by their model. Excluding the model by text rather than by
    // position matched the description cell too, and the line went out with no wording.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8536.10.0020', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['SA34-F1', 72], ['10000-0001', 192], ['2', 421], ['1.000', 472], ['2.000', 550]),
        row(['10000-0001', 72], ['SA34-F1', 192]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0]).toMatchObject({ description: 'SA34-F1', model: 'SA34-F1' })
  })

  it('is kept when it repeats the country of origin', () => {
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8536.10.0020', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['1.000', 472], ['2.000', 550]),
        row(['10000-0001', 72], ['Japan', 192]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0]).toMatchObject({ description: 'Japan', countryOfOrigin: 'Japan' })
  })
})

describe('a heading and a totals row on the same page', () => {
  const totalsPage = (heading: TextRow[], footer: TextRow[]) => {
    y = 700
    return page(2, [
      row(['INVOICE NO', 36], ['S0000009', 90]),
      row(['INVOICE', 276]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
      ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
      ...heading,
      ...footer,
    ])
  }

  it('reads a heading printed above the totals row', () => {
    // Looking only at the page's final row missed it entirely: the totals row was last.
    const first = totalsPage([row(['Gaskets', 72])], [row(['TOTAL:', 30], ['26', 79], ['PCS', 114])])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })

  it('reads one with the page footer between it and the totals row', () => {
    // This layout's footer is two rows — trade terms, then `TOTAL: n PCS`. Inspecting only
    // the row above the totals saw the trade terms and never the heading above them.
    const first = totalsPage(
      [row(['Gaskets', 72])],
      [
        row(['FOB Origin - Collect', 447], ['20.000', 550], ['USD', 588]),
        row(['TOTAL:', 30], ['26', 79], ['PCS', 114]),
      ],
    )
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })

  it('does not mistake the footer itself for the heading', () => {
    // The rows between the block and the totals are skipped until one looks like a heading;
    // the trade terms sit at x=447 and carry three items, so they never can.
    const first = totalsPage(
      [],
      [
        row(['FOB Origin - Collect', 447], ['20.000', 550], ['USD', 588]),
        row(['TOTAL:', 30], ['26', 79], ['PCS', 114]),
      ],
    )
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', ''])
  })

  it('never reads page-footer text printed below it', () => {
    // The same inversion in the other direction: whatever sat last on the page won.
    const first = totalsPage(
      [],
      [row(['TOTAL:', 30], ['26', 79], ['PCS', 114]), row(['Freight Prepaid Collect', 72])],
    )
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    const groups = invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)
    expect(groups).not.toContain('Freight Prepaid Collect')
  })
})

describe('the two readers of a block’s value row', () => {
  it('agree about which row it is when a figure is missing', () => {
    // The two used different thresholds — three figures and two — so on a line printing a
    // blank unit price they disagreed about where the block ended. Both readings happen to
    // reach the same answer here, which is why this pins the behaviour rather than proving a
    // defect; the thresholds are shared now so they cannot drift apart into one that doesn't.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        // Quantity and extended value, no unit price: two figures, not three.
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['20.000', 550]),
        row(['10000-0001', 72], ['CABLE ASSY', 192]),
        row(['Gaskets', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    const lines = invoiceLines(pages)
    expect(lines.map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
    expect(lines[0].description).toBe('CABLE ASSY')
  })
})

describe('a heading the totals test used to swallow', () => {
  it('reads one whose first word is Total', () => {
    // `isTotalsRow` matches anything starting with `Total`, and a rejected heading is not a
    // blank one — the previous heading stays in force, so these goods went out under the
    // commodity above them. A real totals row carries several items and is excluded by the
    // single-item guard, and both search windows are bounded off it besides.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['Flash drive', 72]),
        ...block('00000001OP0010', '10000-0001', '8523.51.0000', 'MODEL-A', 'BUNDLE'),
        row(['Total Station Instruments', 72]),
        ...block('00000002OP0010', '10000-0002', '9015.30.4000', 'MODEL-B', 'LEVEL'),
      ]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual([
      'Flash drive',
      'Total Station Instruments',
    ])
  })

  it('carries one stranded at the foot of a page', () => {
    // The look-ahead is bounded by the totals row, and the same leading-word match cut this
    // heading off before it — so the next page's goods kept the commodity above them.
    const first = detailPage(2, [
      ...block('00000001OP0010', '10000-0001', '8523.51.0000', 'MODEL-A', 'BUNDLE'),
      row(['Total Station Instruments', 72]),
    ])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '9015.30.4000', 'MODEL-B', 'LEVEL'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual([
      '',
      'Total Station Instruments',
    ])
  })

  it('keeps a description that begins with the word too', () => {
    // The block slice is cut at the totals row as well, so a left-margin description starting
    // with `Total` ended the block at its figures and the line went out with none at all.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['9015.30.4000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['1.000', 472], ['2.000', 550]),
        row(['Total Station Instrument', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0].description).toBe('Total Station Instrument')
  })

  it('still finds a totals row the extractor emitted as one item', () => {
    // Counting the row's items to tell a totals row from a heading was wrong the other way:
    // an extractor that merges `TOTAL: 26 PCS` into a single string made the footer
    // invisible, and the trade terms below it became the next page's heading.
    const first = detailPage(2, [
      ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
      row(['TOTAL: 26 PCS', 30]),
      row(['Freight Prepaid Collect', 72]),
    ])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    const groups = invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)
    expect(groups).not.toContain('Freight Prepaid Collect')
  })

  it('finds a totals row whose label runs to several words', () => {
    // `TOTAL PACKAGES 3` and `TOTAL NET WEIGHT 500.000` matched neither a colon nor a digit
    // straight after the word, so the block slice ran on past them.
    for (const footer of ['TOTAL PACKAGES  3', 'TOTAL NET WEIGHT  500.000']) {
      const first = detailPage(2, [
        ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
        row([footer, 30]),
        row(['Freight Prepaid Collect', 72]),
      ])
      const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
      const groups = invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)
      expect(groups, footer).not.toContain('Freight Prepaid Collect')
    }
  })

  it('does not let a carried block swallow the page totals as its own figures', () => {
    // A missed totals row is worse than a missed heading: the block slice runs on, the
    // carried block absorbs the footer, and the page totals are reported as the line's
    // quantity and value — complete enough that the reconciliation has nothing to object to.
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const tail = detailPage(3, [
      row(['TOTAL NET WEIGHT', 30], ['26', 421], ['10.000', 472], ['7,765.290', 550]),
    ])
    const line = invoiceLines([headerPage(), opening, tail])[0]
    expect(line.quantity).not.toBe(26)
    expect(line.extendedValue).not.toBe(7765.29)
  })

  it('finds a bare TOTAL: whose figures sit on the baseline below it', () => {
    // Requiring a digit on the label's own row assumed the figures are printed beside it.
    // A footer that prints `TOTAL:` above its numbers carries none, so the slice ran past it
    // and the carried block took the page totals for its own quantity and value.
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const tail = detailPage(3, [
      row(['TOTAL:', 30]),
      row(['26', 421], ['10.000', 472], ['7,765.290', 550]),
    ])
    const line = invoiceLines([headerPage(), opening, tail])[0]
    expect(line.quantity).not.toBe(26)
    expect(line.extendedValue).not.toBe(7765.29)
  })

  it('still never reads the totals row itself', () => {
    const first = detailPage(2, [
      ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
      row(['TOTAL:', 30], ['26', 79], ['PCS', 114]),
    ])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    const groups = invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)
    expect(groups.some((g) => /TOTAL/i.test(g))).toBe(false)
  })
})

describe('a block whose figures could not be read at all', () => {
  const broken = (trailing: TextRow[]) =>
    detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['CABLE ASSY, 30M', 72]),
      ...trailing,
    ])

  it('is not described as its own lot id', () => {
    // The line number and the lot id beside it are identifiers the block was already read
    // for. Left in play, they were the only text a broken block had left to offer.
    const pages = [headerPage(), broken([...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING')])]
    const first = invoiceLines(pages)[0]
    expect(first.description).toBe('CABLE ASSY, 30M')
    expect(first.description).not.toBe('00000001X')
  })

  it('does not lend its description to the block below as a heading', () => {
    // With no figure row to end the block on, the floor collapsed to the block's own start
    // and the look-behind read straight through it.
    const pages = [headerPage(), broken([...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING')])]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual(['', ''])
  })

  it('still lets a real heading below it through', () => {
    const pages = [
      headerPage(),
      broken([row(['Gaskets', 72]), ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING')]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })
})

describe('a block whose figures land on the next page', () => {
  /** The block's first two rows, with its figures and description overleaf. */
  const opening = () =>
    detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])

  const closing = (marks: string) => {
    y = 700
    return page(3, [
      row(['INVOICE NO', 36], ['S0000009', 90]),
      row(['INVOICE', 276]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
      row(['COUNTRY OF ORIGIN', 24], ['Default Country', 102]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row([marks, 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
      row(['10000-0001', 72], ['CABLE ASSY', 192]),
    ])
  }

  it('keeps its figures when the shipping marks read like a header label', () => {
    // The marks cell sits at the left margin of the figures row and reads `C/NO. ONE OF TWO`.
    // Matching the furniture label against the whole joined row discarded that row, and the
    // line came out with quantity 0 and no value at all.
    const line = invoiceLines([headerPage(), opening(), closing('C/NO. ONE OF TWO')])[0]
    expect(line).toMatchObject({ quantity: 2, extendedValue: 20, description: 'CABLE ASSY' })
  })

  it('reads the same block identically with ordinary marks', () => {
    const line = invoiceLines([headerPage(), opening(), closing('5610')])[0]
    expect(line).toMatchObject({ quantity: 2, extendedValue: 20, description: 'CABLE ASSY' })
  })

  it('says so when the figures really are not there', () => {
    // Emitted quietly with quantity 0 before. The totals then fail and block the shipment,
    // which is right and unhelpful on its own — nothing said which line was wrong.
    y = 700
    const stillBroken = page(3, [
      row(['INVOICE NO', 36], ['S0000009', 90]),
      row(['INVOICE', 276]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['10000-0001', 72], ['CABLE ASSY', 192]),
    ])
    const result = parsed([headerPage(), opening(), stillBroken])
    expect(result.lines[0].quantity).toBe(0)
    expect(result.warnings.join(' ')).toContain('continues onto page 3 but its figures could not be read')
  })
})

describe('a page holding only a carried block’s tail', () => {
  it('still carries a heading stranded below it', () => {
    // Guarding the look-ahead on "this page had block starts" dropped it, and the next
    // page's first block kept the heading from before the break.
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const tail = detailPage(3, [
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
      row(['10000-0001', 72], ['CABLE ASSY', 192]),
      row(['Gaskets', 72]),
    ])
    const last = detailPage(4, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    const lines = invoiceLines([headerPage(), opening, tail, last])
    expect(lines[0]).toMatchObject({ quantity: 2, description: 'CABLE ASSY' })
    expect(lines.map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })
})

describe('a carried tail that is still unfinished', () => {
  it('does not offer its own description as the next page’s heading', () => {
    // `carry` is only set by the block loop, so on a page with no block starts it is null
    // whatever became of the tail. Reading it there let the look-ahead run over an
    // unfinished block and return its description row as a heading.
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
    ])
    // Its figures never arrive. Two rows follow the column headings, so the block-end floor
    // — which has neither figures nor a classification to anchor on here — lands above the
    // lone description rather than on it.
    const tail = detailPage(3, [
      row(['0002', 72], ['00000001Y', 96], ['Japan', 198]),
      row(['CBL, OS32C-CBL-30M', 72]),
    ])
    const last = detailPage(4, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    const result = parsed([headerPage(), opening, tail, last])
    const lines = result.lines.filter((l) => l.documentKind === 'INVOICE')
    expect(lines.map((l) => l.commodityGroup)).toEqual(['', ''])
    // And the unreadable line still says so.
    expect(result.warnings.join(' ')).toContain('its figures could not be read')
  })

  it('does not lend it to a block starting on the same page either', () => {
    // The mirror of the case above. With neither figures nor a classification on this page,
    // the look-behind floor had nothing to anchor on and fell back to the top of the page,
    // handing the new block the broken line's description as its heading.
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
    ])
    const tail = detailPage(3, [
      row(['C/NO', 24], ['5610 - 5610', 48]),
      row(['CBL, OS32C-CBL-30M', 72]),
      ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
    ])
    const groups = invoiceLines([headerPage(), opening, tail]).map((l) => l.commodityGroup)
    expect(groups).not.toContain('CBL, OS32C-CBL-30M')
  })

  it('still carries one when the tail was completed', () => {
    const opening = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    const tail = detailPage(3, [
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
      row(['10000-0001', 72], ['CABLE ASSY', 192]),
      row(['Gaskets', 72]),
    ])
    const last = detailPage(4, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), opening, tail, last]).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
  })
})

describe('the labelled fields a detail page repeats', () => {
  it('are not read as the first block’s commodity heading', () => {
    // `COUNTRY OF ORIGIN` prints its value at x≈102, inside the heading column, and it sits
    // between the column headings and the first block — exactly where a heading would. The
    // label and value share a baseline, so the single-item guard already excludes the row;
    // this pins that rather than proving a fix.
    y = 700
    const detail = page(2, [
      row(['INVOICE NO', 36], ['S0000009', 90]),
      row(['INVOICE', 276]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
      row(['Example Consignee', 24]),
      row(['C/NO', 24], ['5610 - 5610', 48]),
      row(['COUNTRY OF ORIGIN', 24], ['Default Country', 102]),
      ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
    ])
    expect(invoiceLines([headerPage(), detail])[0].commodityGroup).toBe('')
  })
})

describe('a carried block completed on the next page', () => {
  it('is not described as the detail page’s own COUNTRY OF ORIGIN field', () => {
    // A detail page repeats labelled header fields between its column headings and its first
    // block, and `COUNTRY OF ORIGIN` prints its value at x≈102 — inside the detail column.
    // Spliced into a carried block, it was the only text that block had to offer.
    const first = detailPage(2, [
      row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
      row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
    ])
    y = 700
    const second = page(3, [
      row(['INVOICE NO', 36], ['S0000009', 90]),
      row(['INVOICE', 276]),
      row(['MARKS & NOS.', 24], ['DESCRIPTION OF GOODS', 144], ['ORIGIN', 276], ['QUANTITY', 390]),
      row(['Example Consignee', 24]),
      row(['C/NO', 24], ['5610 - 5610', 48]),
      row(['COUNTRY OF ORIGIN', 24], ['Default Country', 102]),
      // Still no figure row, and the description printed at the left margin rather than in
      // its own column — so the fallback runs, and it spans the country value's x too.
      row(['8544.42.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
      row(['CABLE ASSY', 72]),
      ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
    ])
    const lines = invoiceLines([headerPage(), first, second])
    expect(lines[0].description).not.toBe('Default Country')
    expect(lines[0].description).toBe('CABLE ASSY')
  })
})

describe('the second description cell', () => {
  it('is read, and beats the shorter one beside it', () => {
    // This layout prints two description cells on the row: a terse one at x=192 and a fuller
    // one at x=384, with quantity starting at x=421. Tying the column's right edge to the
    // figures cut the second cell off and lost a real description on a real shipment.
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['00000001OP0010', 72], ['00000001OP0010', 198], ['1', 246]),
        row(['0001', 72], ['00000001X', 96], ['Japan', 198]),
        row(['8544.20.0000', 72], ['PCS', 408], ['USD', 486], ['USD', 564]),
        row(['5610', 24], ['MODEL-A', 72], ['10000-0001', 192], ['2', 421], ['10.000', 472], ['20.000', 550]),
        row(['10000-0001', 72], ['CA, BELT TO M12', 192], ['Cable, Belt Encoder to M12 Fem', 384]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages)[0].description).toBe('Cable, Belt Encoder to M12 Fem')
  })
})

describe('a model code printed where a heading goes', () => {
  it('is not read as one, whether it carries a space or not', () => {
    // `R6A 7833D` has a space and `SA34-F1` does not; both are models. What separates them
    // from every heading on these documents is that neither contains a word.
    for (const model of ['SA34-F1', 'R6A 7833D', 'RT6 5450A']) {
      const pages = [
        headerPage(),
        detailPage(2, [
          ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
          row([model, 72]),
          ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
        ]),
      ]
      expect(invoiceLines(pages).map((l) => l.commodityGroup), model).toEqual(['', ''])
    }
  })

  it('still reads the awkward headings that broke the old pattern', () => {
    const pages = [
      headerPage(),
      detailPage(2, [
        row(['Glass Cartridge Fuses <=1000V', 72]),
        ...block('00000001OP0010', '10000-0001', '8536.10.0020', 'MODEL-A', 'FUSE'),
        row(['Elect. Apparatus, Other', 72]),
        ...block('00000002OP0010', '10000-0002', '8538.90.7080', 'MODEL-B', 'PCBAY'),
        row(['Gaskets', 72]),
        ...block('00000003OP0010', '10000-0003', '4016.93.0000', 'MODEL-C', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual([
      'Glass Cartridge Fuses <=1000V',
      'Elect. Apparatus, Other',
      'Gaskets',
    ])
  })

  it('reads the description from its own column, not the heading below the block', () => {
    const pages = [
      headerPage(),
      detailPage(2, [
        ...block('00000001OP0010', '10000-0001', '8523.51.0000', 'MODEL-A', 'BUNDLE, PACKXPERT 4.0'),
        row(['Glass Cartridge Fuses <=1000V', 72]),
        ...block('00000002OP0010', '10000-0002', '8536.10.0020', 'MODEL-B', 'FUSE'),
      ]),
    ]
    // The heading is 29 characters against a 21-character description, and the description
    // used to be whichever free text in the block was longest.
    expect(invoiceLines(pages)[0].description).toBe('BUNDLE, PACKXPERT 4.0')
  })
})
