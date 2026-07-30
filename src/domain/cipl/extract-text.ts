/**
 * Position-aware text extraction.
 *
 * These CIPLs are generated PDFs with a real text layer, so there is no OCR anywhere in
 * this pipeline. What matters is *geometry*: the documents are column-oriented reports
 * whose content-stream order does not match reading order (on the TP1 pages a value is
 * frequently emitted before its own label). Reconstructing rows by y and sorting by x
 * recovers the visual layout exactly, which is what the parser keys off.
 */

export interface TextItem {
  str: string
  /** PDF user-space x of the item's left edge. Larger = further right. */
  x: number
  /** PDF user-space y of the baseline. Larger = further up the page. */
  y: number
}

export interface TextRow {
  y: number
  /** Items on this row, left to right. */
  items: TextItem[]
}

export interface TextPage {
  pageNumber: number
  width: number
  height: number
  rows: TextRow[]
}

/** Baselines within this many points are treated as the same visual row. */
const ROW_TOLERANCE = 2.5

/** A run of dashes used as a horizontal rule. Carries no data. */
const RULE = /^-{10,}$/

let workerConfigured = false

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!workerConfigured) {
    // In Node (tests) pdfjs runs inline with no worker. In a browser we point it at the
    // worker bundled next to the legacy build; Vite rewrites this URL at build time.
    if (typeof window !== 'undefined') {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url,
      ).toString()
    }
    workerConfigured = true
  }
  return pdfjs
}

/**
 * Read every page of a PDF into rows of positioned text.
 *
 * `data` is consumed by pdfjs and must not be reused by the caller afterwards; pass a copy
 * if the same buffer is needed again (the browser File API gives a fresh one each read).
 */
export async function extractTextPages(data: ArrayBuffer | Uint8Array): Promise<TextPage[]> {
  const pdfjs = await loadPdfjs()
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise

  try {
    const pages: TextPage[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const items: TextItem[] = []
      for (const raw of content.items) {
        if (!('str' in raw)) continue
        const str = raw.str.trim()
        if (!str || RULE.test(str)) continue
        items.push({
          str,
          x: round1(raw.transform[4]),
          y: round1(raw.transform[5]),
        })
      }

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rows: groupIntoRows(items),
      })
      page.cleanup()
    }
    return pages
  } finally {
    await doc.destroy()
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Bucket items into visual rows (top to bottom), each sorted left to right. */
export function groupIntoRows(items: TextItem[]): TextRow[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextRow[] = []
  let current: TextItem[] = []
  let currentY: number | null = null

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > ROW_TOLERANCE) {
      if (current.length) rows.push({ y: currentY as number, items: sortByX(current) })
      current = []
      currentY = item.y
    }
    current.push(item)
  }
  if (current.length) rows.push({ y: currentY as number, items: sortByX(current) })
  return rows
}

function sortByX(items: TextItem[]): TextItem[] {
  return [...items].sort((a, b) => a.x - b.x)
}

// ---------------------------------------------------------------------------
// Row query helpers. The parser uses these instead of indexing into `items`
// directly, so a small horizontal shift between document revisions does not
// break extraction.
// ---------------------------------------------------------------------------

/** Every item whose left edge falls in [min, max]. */
export function itemsInRange(row: TextRow, min: number, max: number): TextItem[] {
  return row.items.filter((i) => i.x >= min && i.x <= max)
}

/** The whole row as a single space-joined string, in visual order. */
export function rowText(row: TextRow): string {
  return row.items.map((i) => i.str).join(' ')
}

/** Index of the first row whose text contains `needle` (case-insensitive). */
export function findRowIndex(rows: TextRow[], needle: string, from = 0): number {
  const target = needle.toLowerCase()
  for (let i = from; i < rows.length; i++) {
    if (rowText(rows[i]).toLowerCase().includes(target)) return i
  }
  return -1
}

/**
 * Index of the first row containing an item that *begins* with `label`.
 *
 * Stricter than `findRowIndex` on purpose. Searching for `DATE:` by substring also matches
 * a row holding `DELIVERY DATE:`, and the caller would then look for an item starting with
 * `DATE:`, find none, and give up — silently losing the real field further down the page.
 * Matching the label cell itself means the search continues past near misses.
 */
export function findLabelRow(rows: TextRow[], label: string, from = 0): number {
  const target = label.toLowerCase()
  for (let i = from; i < rows.length; i++) {
    if (rows[i].items.some((item) => item.str.toLowerCase().startsWith(target))) return i
  }
  return -1
}

/** The item that carries `label`, if this row has one. */
export function labelItem(row: TextRow, label: string): TextItem | undefined {
  const target = label.toLowerCase()
  return row.items.find((item) => item.str.toLowerCase().startsWith(target))
}

/**
 * Value printed to the right of a label on the same row.
 *
 * Labels and values live in fixed columns, so "the next item to the right of the label"
 * is unambiguous — including when the value column is blank, which yields undefined
 * rather than accidentally picking up the next label.
 */
export function valueRightOf(row: TextRow, label: string): string | undefined {
  const idx = row.items.findIndex((i) => i.str.toLowerCase().startsWith(label.toLowerCase()))
  if (idx === -1) return undefined
  const rest = row.items.slice(idx + 1)
  if (!rest.length) return undefined
  return rest.map((i) => i.str).join(' ').trim() || undefined
}

/**
 * Text rendered in a barcode font, which extracts as mojibake.
 *
 * The `vendor-b` layout puts a Code-128 barcode under several columns; pdfjs reports
 * its glyphs as strings like `xh!3<1B>c<00>1Myzx` followed by a run of `ÿ`. They sit in
 * the same x-bands as real data, so they have to be dropped before a column is read rather
 * than after.
 *
 * Matched on the font's actual signature — control characters and runs of `ÿ` padding —
 * rather than on "not printable ASCII", which this used to do. That was far too wide: it
 * discarded any cell containing a typographic apostrophe, an en dash, a degree sign, µ, Ω,
 * or an accented letter, all of which occur in real part descriptions. Shipment 278563
 * printed `REPL ACT’R MFS-11` with a curly apostrophe, and losing that cell shifted the
 * whole block's columns and cost the line — see the note on `parseBlock`.
 */
export function isLikelyBarcode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  // Control characters. Nothing typed into an ERP contains one; the barcode font is riddled
  // with them.
  if (hasControlCharacter(trimmed)) return true
  // The font pads with `ÿ`. Any of them, not a run: pdfjs splits the barcode into several
  // items, and a fragment that happens to carry only one would otherwise pass as text and
  // shift the block's columns by a cell. `ÿ` does not occur in these part descriptions, so
  // this costs nothing that the old "any non-ASCII" rule was not already costing.
  if (trimmed.includes('ÿ')) return true
  // Short leading fragments the font splits off, e.g. `xh"c` or `xh`.
  return /^x[hi][\s"'#&(]*[A-Za-z0-9]?$/.test(trimmed)
}

/**
 * A C0 control character or DEL, written as a scan rather than a regex.
 *
 * The equivalent character class trips `no-control-regex`, and the rule is right in general —
 * a control character in a pattern is nearly always a mistake. Here it is the entire point,
 * so the intent is spelled out instead of suppressed. Tab, newline and carriage return are
 * excluded: they are legitimate spacing, not font mojibake.
 */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** Parse a report number like `1,113.140` or `.544`. Returns null when not numeric. */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null
  const cleaned = raw.replace(/,/g, '').trim()
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
