/**
 * The `SHIPMENT#` layout from a PDF, not from pre-extracted rows.
 *
 * The shape tests feed `parseVendorBPages` rows directly, which skips text extraction, format
 * detection and the `SHIPMENT#` label that selects this parser. Here the same pages are drawn
 * into a PDF and go in through `parseCipl`, as a document dropped on the upload screen does.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { parseCipl } from '.'
import { parseVendorBPages } from './parse-vendor-b'
import type { ParsedCipl } from '../types'
import { LINES, buildVendorBPdf, printedTotal, wholeShipment } from '../../test/synthetic/vendor-b'

const fields = (p: ParsedCipl) =>
  p.lines.map(({ documentKind, orderNumber, partNumber, description, classification, quantity, extendedValue, countryOfOrigin }) => ({
    documentKind, orderNumber, partNumber, description, classification, quantity, extendedValue, countryOfOrigin,
  }))

describe('a Vendor B CIPL as a PDF', () => {
  let fromPdf: ParsedCipl

  beforeAll(async () => {
    fromPdf = await parseCipl('shipment.pdf', await buildVendorBPdf(wholeShipment()))
  }, 60_000)

  it('is recognised as the SHIPMENT# layout', () => {
    expect(fromPdf.format).toBe('vendor-b')
  })

  it('reads the same lines and total as the layout parser does from the rows', () => {
    const fromRows = parseVendorBPages('shipment.pdf', wholeShipment())
    expect(fields(fromPdf)).toEqual(fields(fromRows))
    expect(fromPdf.headers.FC?.totalValue).toBeCloseTo(printedTotal(), 2)
  })

  it('reads every invoice line, the typographic apostrophe included', () => {
    const invoice = fromPdf.lines.filter((l) => l.documentKind === 'INVOICE')
    expect(invoice.map((l) => l.partNumber)).toEqual(LINES.map((l) => l.part))
    expect(invoice.find((l) => l.partNumber === '44508-0711')?.description).toBe('REPL ACT’R MFS-11')
  })
})
