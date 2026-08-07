/**
 * Vendor A layouts built row by row, for the shapes a drawn PDF cannot produce.
 *
 * The synthetic generator emits whole blocks, so it can put a heading at the foot of a page
 * but never split a block across one — which left the carry path with no CI coverage at all,
 * and a defect in it went out under a green suite. These feed `parseCiplPages` directly.
 *
 * Positions are the ones the real documents use: headings and models at x=72, descriptions at
 * x=192, figures right of x=380.
 */
import { describe, expect, it } from 'vitest'
import { parseCiplPages } from './parse-vendor-a'
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

const invoiceLines = (pages: TextPage[]) =>
  parseCiplPages('shapes.pdf', pages).lines.filter((l) => l.documentKind === 'INVOICE')

describe('a heading stranded at the foot of a page', () => {
  it('governs the first block of the next page', () => {
    const first = detailPage(2, [...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'), row(['Gaskets', 72])])
    const second = detailPage(3, block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'))
    expect(invoiceLines([headerPage(), first, second]).map((l) => l.commodityGroup)).toEqual(['', 'Gaskets'])
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

describe('a model code printed where a heading goes', () => {
  it('is not read as one', () => {
    // Vendor A prints models at x=72, the same column as headings, and `SA34-F1` passes any
    // character class permissive enough to admit `Glass Cartridge Fuses <=1000V`.
    const pages = [
      headerPage(),
      detailPage(2, [
        ...block('00000001OP0010', '10000-0001', '8544.42.0000', 'MODEL-A', 'CABLE ASSY'),
        row(['SA34-F1', 72]),
        ...block('00000002OP0010', '10000-0002', '4016.93.0000', 'MODEL-B', 'O-RING'),
      ]),
    ]
    expect(invoiceLines(pages).map((l) => l.commodityGroup)).toEqual(['', ''])
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
