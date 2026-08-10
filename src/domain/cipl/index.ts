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
import { isZip, readXlsxSheets, WorkbookError } from '../item-library/read-workbook'
import { extractTextPages, rowText, type TextPage } from './extract-text'
import { isOmronCiPdf, isOmronCiWorkbook, parseOmronCiPdf, parseOmronCiWorkbook } from './parse-omron-ci'
import { parseCiplPages as parseVendorAPages } from './parse-vendor-a'
import { isVendorBFormat, parseVendorBPages } from './parse-vendor-b'

export * from './extract-text'
export { isOmronCiWorkbook, parseOmronCiWorkbook } from './parse-omron-ci'

export interface FormatDescriptor {
  id: CiplFormat
  label: string
  /** True when this parser recognises the document. */
  matches(pages: TextPage[]): boolean
  parse(fileName: string, pages: TextPage[]): ParsedCipl
}

/**
 * Order matters: the most specific detector runs first. `omron-ci` is identified by its
 * printed document number; `vendor-b` by its shipment-number banner; the FC/TP1 layout by
 * its currency-set marker plus the invoice-number label.
 */
export const CIPL_FORMATS: FormatDescriptor[] = [
  {
    id: 'omron-ci',
    label: 'Omron Commercial Invoice (form 00004-00202)',
    matches: isOmronCiPdf,
    parse: parseOmronCiPdf,
  },
  {
    id: 'vendor-b',
    label: 'Vendor B (commercial invoice + master packing list)',
    matches: isVendorBFormat,
    parse: parseVendorBPages,
  },
  {
    id: 'vendor-a',
    label: 'Vendor A (FC/TP1 dual-currency) (invoice + packing list, dual currency)',
    matches: (pages) => {
      const text = pages[0] ? pages[0].rows.map(rowText).join(' ') : ''
      return /INVOICE NUMBER:/i.test(text)
    },
    parse: parseVendorAPages,
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

/**
 * Parse a shipment document of any supported kind — a CIPL PDF or the Commercial Invoice
 * workbook (form 00004-00202) as .xlsx.
 *
 * Dispatch is by content, not extension: a workbook is a ZIP whatever it is called, and a
 * PDF renamed .xlsx should be read as the PDF it is rather than refused for its name.
 */
export async function parseCiplFile(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ParsedCipl> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (!isZip(bytes)) return parseCipl(fileName, bytes)

  let sheets
  try {
    sheets = await readXlsxSheets(bytes)
  } catch (error) {
    if (error instanceof WorkbookError) throw new Error(`${fileName}: ${error.message}`)
    throw error
  }
  // Every tab, not just the first: a controlled document's form can sit behind a cover or
  // revision-history sheet, and the doc number identifies the right one wherever it is.
  const rows = sheets.find(isOmronCiWorkbook)
  if (!rows) {
    throw new Error(
      `${fileName} is a workbook, but none of its ${sheets.length} sheet(s) is the Commercial Invoice ` +
        'form (00004-00202) this tool reads. Workbook import supports that form only; CIPLs from other ' +
        'systems are read from their PDFs.',
    )
  }
  return parseOmronCiWorkbook(fileName, rows)
}
