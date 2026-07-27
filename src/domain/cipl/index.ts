/**
 * CIPL parsing entry point.
 *
 * Formats are detected from the document itself and dispatched to a dedicated parser. Every
 * parser returns the same `ParsedCipl` contract, so the reconciliation engine and the
 * carrier adapters never learn that more than one layout exists.
 *
 * Adding a format means adding a detector and a parser here — nothing downstream changes.
 */
import type { CiplFormat, ParsedCipl } from '../types'
import { extractTextPages, rowText, type TextPage } from './extract-text'
import { parseCiplPages as parseFcTp1Pages } from './parse-omron'
import { isOmronShipmentFormat, parseOmronShipmentPages } from './parse-omron-shipment'

export * from './extract-text'

export interface FormatDescriptor {
  id: CiplFormat
  label: string
  /** True when this parser recognises the document. */
  matches(pages: TextPage[]): boolean
  parse(fileName: string, pages: TextPage[]): ParsedCipl
}

/**
 * Order matters: the most specific detector runs first. `omron-shipment` is identified by
 * its "OMRON SHIPMENT#" banner; the FC/TP1 layout by its currency-set marker plus the
 * invoice-number label.
 */
export const CIPL_FORMATS: FormatDescriptor[] = [
  {
    id: 'omron-shipment',
    label: 'Omron shipment (commercial invoice + master packing list)',
    matches: isOmronShipmentFormat,
    parse: parseOmronShipmentPages,
  },
  {
    id: 'omron-fc-tp1',
    label: 'Omron Robotics FC/TP1 (invoice + packing list, dual currency)',
    matches: (pages) => {
      const text = pages[0] ? pages[0].rows.map(rowText).join(' ') : ''
      return /INVOICE NUMBER:/i.test(text)
    },
    parse: parseFcTp1Pages,
  },
]

export function detectCiplFormat(pages: TextPage[]): FormatDescriptor | null {
  return CIPL_FORMATS.find((format) => format.matches(pages)) ?? null
}

/**
 * Parse a CIPL of any supported layout.
 *
 * Throws when the document matches no known format, rather than returning an empty result
 * that would look like a shipment with no goods in it.
 */
export async function parseCipl(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ParsedCipl> {
  const pages = await extractTextPages(data)
  const format = detectCiplFormat(pages)
  if (!format) {
    throw new Error(
      `${fileName} does not match any CIPL layout this tool knows. Supported: ` +
        `${CIPL_FORMATS.map((f) => f.label).join('; ')}.`,
    )
  }
  return format.parse(fileName, pages)
}
