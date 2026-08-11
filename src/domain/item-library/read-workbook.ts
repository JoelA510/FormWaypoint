/**
 * Reads a spreadsheet into rows of strings, in the browser, with no dependencies.
 *
 * An .xlsx file is a ZIP of XML parts. Everything needed to read one is already in the
 * platform: `DecompressionStream('deflate-raw')` inflates the entries, and the parts
 * themselves are machine-generated XML regular enough to read without a DOM.
 *
 * The alternative was a spreadsheet library. The maintained build of the usual one is not
 * published to npm, and pulling a parser for a file the user picks by hand would put a
 * large dependency on the same page as their shipment data for no capability gain. This is
 * ~150 lines and reads every export Excel produces.
 *
 * Deliberately narrow: first worksheet, cell text only. No formulas, styles, or dates —
 * an item master is a table of part numbers, codes and weights.
 */

/** A sheet as a rectangle of trimmed strings. Row 0 is whatever the file had first. */
export type SheetRows = string[][]

export class WorkbookError extends Error {}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

/** Finds the end-of-central-directory record, scanning back over any trailing comment. */
function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 0xffff - 22)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i
  }
  throw new WorkbookError('Not a .xlsx file — no ZIP end-of-directory record was found.')
}

async function inflate(bytes: Uint8Array, method: number, name: string): Promise<Uint8Array> {
  if (method === 0) return bytes
  if (method !== 8) {
    throw new WorkbookError(`"${name}" uses an unsupported ZIP compression method (${method}).`)
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Extracts the named entries from a ZIP. Returns only those present, so a caller can ask
 * for optional parts (`sharedStrings.xml` is absent from a workbook with no text cells).
 */
async function unzip(data: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const eocd = findEocd(view)
  const entryCount = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)

  if (entryCount === 0xffff || offset === 0xffffffff) {
    throw new WorkbookError('This workbook uses ZIP64, which this reader does not support. Re-save it as .xlsx or export it as .csv.')
  }

  const out = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()

  /**
   * Every offset this walk follows comes out of the file itself.
   *
   * A truncated download or a file that is not really a workbook will point past the end,
   * and `DataView` answers that with a `RangeError` about bounds — which is then shown to
   * whoever picked the file, in place of the plain sentences the rest of this module takes
   * care to produce. Checked rather than caught, so the message names the file's problem.
   */
  const within = (at: number, bytes: number) => at >= 0 && at + bytes <= view.byteLength
  const damaged = () => new WorkbookError('This workbook’s ZIP directory is damaged.')

  for (let i = 0; i < entryCount; i++) {
    if (!within(offset, 46) || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) throw damaged()
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    if (!within(offset + 46, nameLength)) throw damaged()
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength))

    if (wanted(name)) {
      // The local header repeats the name and extra fields, and its extra-field length can
      // differ from the central one, so it has to be read rather than assumed.
      if (!within(localOffset, 30)) throw damaged()
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + localNameLength + localExtraLength
      if (!within(start, compressedSize)) throw damaged()
      out.set(name, await inflate(data.subarray(start, start + compressedSize), method, name))
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  return out
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

/**
 * A numeric entity whose value is outside Unicode, or not a number at all.
 *
 * `String.fromCodePoint` throws on both, and the pattern this runs against is loose enough
 * to reach them: `&#abc;` matches the decimal branch because `abc` is valid hex, and
 * `&#x110000;` is a perfectly well-formed entity for a code point that does not exist. Either
 * would take down the whole import with a `RangeError` about code points, so an entity that
 * cannot be decoded is left standing as text instead — the same thing an unknown named
 * entity already does.
 */
function codePoint(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return null
  return String.fromCodePoint(value)
}

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return codePoint(parseInt(body.slice(2), 16)) ?? match
    if (body.startsWith('#')) return codePoint(Number(body.slice(1))) ?? match
    return ENTITIES[body] ?? match
  })
}

/** Concatenates every `<t>` in a fragment, which is how rich-text runs spell one string. */
function textRuns(fragment: string): string {
  let out = ''
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(match[1])
  return out
}

/** `A` -> 0, `Z` -> 25, `AA` -> 26. */
export function columnToIndex(reference: string): number {
  let n = 0
  for (const char of reference) n = n * 26 + (char.charCodeAt(0) - 64)
  return n - 1
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

/**
 * Resolves worksheet paths through the workbook's relationships, in tab order.
 *
 * Sheet order in `workbook.xml` is the order shown in Excel's tab bar, which is not
 * necessarily `sheet1.xml` — a workbook whose first tab was deleted and re-added starts at
 * `sheet2.xml`. Falling back to the lowest-numbered file would silently read the wrong tab.
 */
function sheetPaths(workbookXml: string, relsXml: string): string[] {
  const targets = new Map<string, string>()
  for (const relation of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = relation[0].match(/Id="([^"]+)"/)?.[1]
    const target = relation[0].match(/Target="([^"]+)"/)?.[1]
    if (id && target) {
      targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`)
    }
  }

  const paths: string[] = []
  for (const sheet of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const relationId = sheet[0].match(/r:id="([^"]+)"/)?.[1]
    const path = relationId ? targets.get(relationId) : undefined
    if (path) paths.push(path)
  }
  return paths
}

/** The workbook's worksheet XML parts in tab order, with the shared-string table. */
async function loadSheetParts(data: Uint8Array): Promise<{ sheetParts: Uint8Array[]; shared: string[] }> {
  const decoder = new TextDecoder()
  const parts = await unzip(
    data,
    (name) =>
      name === 'xl/workbook.xml' ||
      name === 'xl/_rels/workbook.xml.rels' ||
      name === 'xl/sharedStrings.xml' ||
      name.startsWith('xl/worksheets/'),
  )

  const workbookXml = parts.get('xl/workbook.xml')
  if (!workbookXml) throw new WorkbookError('Not a .xlsx workbook — xl/workbook.xml is missing.')

  const relsXml = parts.get('xl/_rels/workbook.xml.rels')
  const ordered = relsXml ? sheetPaths(decoder.decode(workbookXml), decoder.decode(relsXml)) : []
  const sheetParts = ordered.map((path) => parts.get(path)).filter((bytes): bytes is Uint8Array => bytes != null)
  if (!sheetParts.length) {
    // No resolvable relationships: fall back to the worksheet files themselves — sheet
    // XML only, since xl/worksheets/_rels/*.rels also live under this prefix and sort
    // before sheet1.xml — with sheet1.xml first, matching what Excel shows first.
    const byName = [...parts.entries()]
      .filter(([name]) => /^xl\/worksheets\/[^/]+\.xml$/.test(name))
      .sort(([a], [b]) => (a === 'xl/worksheets/sheet1.xml' ? -1 : b === 'xl/worksheets/sheet1.xml' ? 1 : a.localeCompare(b)))
      .map(([, bytes]) => bytes)
    sheetParts.push(...byName)
  }
  if (!sheetParts.length) throw new WorkbookError('This workbook contains no worksheets.')

  const shared: string[] = []
  const sharedBytes = parts.get('xl/sharedStrings.xml')
  if (sharedBytes) {
    for (const item of decoder.decode(sharedBytes).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(item[1]))
  }

  return { sheetParts, shared }
}

/**
 * Reads the worksheets of an .xlsx file, in tab order, up to `limit`. The limit exists so
 * `readXlsx` does not row-parse ten tabs of somebody's item master only to throw nine of
 * them away.
 */
export async function readXlsxSheets(data: Uint8Array, limit = Infinity): Promise<SheetRows[]> {
  const decoder = new TextDecoder()
  const { sheetParts, shared } = await loadSheetParts(data)
  return sheetParts.slice(0, limit).map((bytes) => sheetRows(decoder.decode(bytes), shared))
}

/**
 * The first worksheet, in tab order, that satisfies `predicate` — parsed lazily, one
 * sheet at a time, so finding a form behind a cover tab does not row-parse every other
 * tab of a large workbook. Returns the sheet count alongside, for error messages.
 */
export async function findXlsxSheet(
  data: Uint8Array,
  predicate: (rows: SheetRows) => boolean,
): Promise<{ sheet: SheetRows | null; sheetCount: number }> {
  const decoder = new TextDecoder()
  const { sheetParts, shared } = await loadSheetParts(data)
  for (const bytes of sheetParts) {
    const rows = sheetRows(decoder.decode(bytes), shared)
    if (predicate(rows)) return { sheet: rows, sheetCount: sheetParts.length }
  }
  return { sheet: null, sheetCount: sheetParts.length }
}

/** Reads the first worksheet of an .xlsx file. */
export async function readXlsx(data: Uint8Array): Promise<SheetRows> {
  return (await readXlsxSheets(data, 1))[0]
}

function sheetRows(sheetXml: string, shared: string[]): SheetRows {
  const rows: SheetRows = []
  // Both `<row ...>…</row>` and the self-closing `<row .../>` Excel writes for a row that
  // is styled but empty. Matching only the first form makes a self-closing row swallow the
  // next real row's cells — and with the row index honoured below, everything after it
  // lands one row out, which on the Commercial Invoice form moves the commodity table's
  // headings off their own row and yields an invoice with no lines at all.
  for (const row of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    // Honour the row's own index. Excel and LibreOffice omit <row> records that hold no
    // cells, and a consumer that reads the grid positionally (the Commercial Invoice
    // form's two-rows-per-line table) must not see later rows shifted up into the gap.
    const declaredIndex = Number(row[1].match(/r="(\d+)"/)?.[1])
    if (Number.isInteger(declaredIndex)) {
      while (rows.length < declaredIndex - 1) rows.push([])
    }
    const cells: string[] = []
    // Matches both `<c ...>...</c>` and the self-closing `<c ... />` Excel writes for a
    // cell that carries only formatting.
    // Undefined for a self-closing row, which has no body and therefore no cells.
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1]
      const body = cell[2] ?? ''
      const reference = attributes.match(/r="([A-Z]+)\d+"/)?.[1]
      const type = attributes.match(/t="([^"]+)"/)?.[1]

      let value: string
      if (type === 's') {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        value = shared[Number(raw)] ?? ''
      } else if (type === 'inlineStr') {
        value = textRuns(body)
      } else {
        value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
      }

      const index = reference ? columnToIndex(reference) : cells.length
      while (cells.length < index) cells.push('')
      cells[index] = value.trim()
    }
    rows.push(cells)
  }

  return rows
}

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

/** Parses CSV/TSV, honouring RFC 4180 quoting (`"a,b"`, `""` for a literal quote). */
export function readDelimited(text: string, delimiter?: string): SheetRows {
  const body = text.replace(/^\uFEFF/, '')
  const sep = delimiter ?? guessDelimiter(body)
  const rows: SheetRows = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (quoted) {
      if (char !== '"') field += char
      else if (body[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === sep) { row.push(field.trim()); field = '' }
    else if (char === '\n') { row.push(field.trim()); rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row) }

  return rows
}

function guessDelimiter(text: string): string {
  const sample = text.slice(0, 4096)
  const tabs = (sample.match(/\t/g) ?? []).length
  const commas = (sample.match(/,/g) ?? []).length
  const semicolons = (sample.match(/;/g) ?? []).length
  if (tabs > commas && tabs > semicolons) return '\t'
  if (semicolons > commas) return ';'
  return ','
}

/** The PK magic number every ZIP container — and therefore every .xlsx — starts with. */
export const isZip = (data: Uint8Array): boolean => data[0] === 0x50 && data[1] === 0x4b

/** Reads whichever of the supported formats `fileName` names. */
export async function readWorkbook(fileName: string, data: Uint8Array): Promise<SheetRows> {
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return readDelimited(new TextDecoder().decode(data))
  if (/\.xlsx$/i.test(fileName)) return readXlsx(data)
  if (/\.xls$/i.test(fileName)) {
    throw new WorkbookError('The old .xls format is not supported. Open it in Excel and save as .xlsx or .csv.')
  }
  // No recognised extension: sniff the ZIP magic number rather than refusing outright.
  if (isZip(data)) return readXlsx(data)
  return readDelimited(new TextDecoder().decode(data))
}
