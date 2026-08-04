/**
 * A minimal XLSX writer: enough OOXML for a workbook of plain grids, and nothing else.
 *
 * The alternative was SheetJS, and this is perhaps a hundred and fifty lines against a
 * dependency that would ship inside an installer somebody's IT department is responsible
 * for. The project already reads workbooks without one — the same reasoning, in the other
 * direction.
 *
 * What it does: several sheets, cells typed as number or text so Excel sums a column rather
 * than left-aligning it, a bold header row, frozen headers, and column widths. What it does
 * not: formulas, merged cells, styling beyond the header, dates as serials. Anything this
 * cannot express belongs in a cell as text.
 *
 * Entries are STORED, not deflated. `CompressionStream` would shrink a worksheet that is
 * already tiny, at the cost of making the writer asynchronous and platform-dependent — and
 * the reader on the other side of this project accepts method 0 for exactly this reason.
 */

export type CellValue = string | number | null | undefined

export interface Sheet {
  /** Tab name. Excel forbids `[]:*?/\` and more than 31 characters; both are enforced. */
  name: string
  /** First row is the header: bold, frozen, and sized from its own width. */
  rows: CellValue[][]
  /** Character widths per column. Derived from the content when omitted. */
  columnWidths?: number[]
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** Excel rejects a tab name containing any of these, or one longer than 31 characters. */
function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  return cleaned || `Sheet${index + 1}`
}

/**
 * Escapes text for an XML text node.
 *
 * Everything written here came out of somebody's ERP, so `&`, `<` and control characters all
 * turn up. A raw control character does not merely look wrong — Excel refuses to open a
 * workbook containing one, reporting only that the file is corrupt.
 */
function xml(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : char
  }
  return out
}

const columnName = (index: number): string => {
  let name = ''
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) name = String.fromCharCode(65 + (n % 26)) + name
  return name
}

const isNumber = (value: CellValue): value is number => typeof value === 'number' && Number.isFinite(value)

function sheetXml(sheet: Sheet): string {
  const widths = sheet.columnWidths ?? deriveWidths(sheet.rows)
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value == null || value === '') return ''
          const ref = `${columnName(c)}${r + 1}`
          // Style 1 is the bold header; the header row is always the first.
          const style = r === 0 ? ' s="1"' : ''
          return isNumber(value)
            ? `<c r="${ref}"${style}><v>${value}</v></c>`
            : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')

  // The header stays on screen while the rows scroll, which is the whole point of a grid
  // whose columns are only distinguishable by their headings.
  const frozen =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

/** Wide enough for the longest cell, within bounds that keep a sheet readable on a screen. */
function deriveWidths(rows: CellValue[][]): number[] {
  const columns = Math.max(0, ...rows.map((r) => r.length))
  return Array.from({ length: columns }, (_, c) => {
    const longest = Math.max(0, ...rows.map((r) => String(r[c] ?? '').length))
    return Math.min(60, Math.max(9, longest + 2))
  })
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  if (!sheets.length) throw new Error('A workbook needs at least one sheet.')
  const named = sheets.map((s, i) => ({ ...s, name: safeSheetName(s.name, i) }))

  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ],
    [
      '_rels/.rels',
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
        .map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', STYLES],
    ...named.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]

  return zip(files)
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Stored entries only — see the note at the top of the file. */
function zip(files: [string, string][]): Uint8Array {
  const encoder = new TextEncoder()
  const entries = files.map(([name, contents]) => {
    const data = encoder.encode(contents)
    return { name: encoder.encode(name), data, crc: crc32(data) }
  })

  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0)
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let offset = 0
  const offsets: number[] = []

  for (const entry of entries) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true) // version needed
    view.setUint16(offset + 6, 0x0800, true) // UTF-8 names
    view.setUint16(offset + 8, 0, true) // stored
    view.setUint32(offset + 14, entry.crc, true)
    view.setUint32(offset + 18, entry.data.length, true)
    view.setUint32(offset + 22, entry.data.length, true)
    view.setUint16(offset + 26, entry.name.length, true)
    offset += 30
    out.set(entry.name, offset)
    offset += entry.name.length
    out.set(entry.data, offset)
    offset += entry.data.length
  }

  const centralStart = offset
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint32(offset + 16, entry.crc, true)
    view.setUint32(offset + 20, entry.data.length, true)
    view.setUint32(offset + 24, entry.data.length, true)
    view.setUint16(offset + 28, entry.name.length, true)
    view.setUint32(offset + 42, offsets[i], true)
    offset += 46
    out.set(entry.name, offset)
    offset += entry.name.length
  })

  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, entries.length, true)
  view.setUint16(offset + 10, entries.length, true)
  view.setUint32(offset + 12, centralStart === 0 ? 0 : offset - centralStart, true)
  view.setUint32(offset + 16, centralStart, true)

  return out
}
