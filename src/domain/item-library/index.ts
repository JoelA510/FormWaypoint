/**
 * The item library: an imported item master that supplies what a CIPL does not.
 *
 * The `vendor-b` layout prints no weights at all, so box 26 has to come from
 * somewhere other than the document. A company item master already holds that figure
 * against every part, along with the commodity number it is normally shipped under.
 *
 * Two things this deliberately does not do:
 *
 *   - It does not replace the code printed on the CIPL. The library is reference data, not
 *     an authority over the shipping document; where the two disagree the reviewer is told
 *     and the existing override mechanism is how a code actually gets changed.
 *   - It does not correct a bad commodity number. Every code is put through the same
 *     mechanical filter — written as `####.##.####`, present in the Census concordance —
 *     and the failures are listed for a human to fix at source.
 *
 * Layouts differ between systems, so columns are matched by header name rather than
 * position, and the weight unit is taken from the header only when the header states one.
 */
import { screenCode, type CodeScreening, type ScheduleBIndex } from '../schedule-b'
import { partKey } from '../part-key'

export * from './read-workbook'
export * from './changes'

/** One part as the item master describes it. */
export interface ItemLibraryEntry {
  /** Uppercased, trimmed part number — the lookup key. */
  partNumber: string
  /** The part number as the file wrote it, for display. */
  displayPartNumber: string
  description: string
  /**
   * The commodity number this part is exported under, exactly as the file writes it.
   * Never rewritten — `screenCode` reports on it instead.
   */
  exportCode: string
  /**
   * The import HTS, where the file carries one.
   *
   * Kept for display and never used to file an export. The two columns disagree on more
   * than half the rows of a real item master, because an import number carries statistical
   * suffixes that Schedule B does not have.
   */
  importCode: string
  netWeightKg: number | null
  /** File this row was imported from. */
  source: string
  importedAt: string
}

export type WeightUnit = 'g' | 'kg' | 'lb'

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  g: 'grams',
  kg: 'kilograms',
  lb: 'pounds',
}

const TO_KG: Record<WeightUnit, number> = { g: 0.001, kg: 1, lb: 0.45359237 }

export type ColumnRole = 'partNumber' | 'description' | 'exportCode' | 'importCode' | 'weight'

export type DetectedColumns = Partial<Record<ColumnRole, number>>

export interface WorkbookInspection {
  /** Index of the row the headers were found on. */
  headerRow: number
  headers: string[]
  columns: DetectedColumns
  /** Unit stated by the weight header, e.g. `Weight (G)`. Null when the header is silent. */
  declaredWeightUnit: WeightUnit | null
  /** First few data rows, for the caller to show before committing to an import. */
  preview: string[][]
  dataRowCount: number
}

/** A library row whose commodity number failed the mechanical filter. */
export interface FlaggedItem {
  partNumber: string
  description: string
  code: string
  status: 'malformed' | 'unknown' | 'absent'
  reason: string
}

export interface ImportSummary {
  entries: ItemLibraryEntry[]
  inspection: WorkbookInspection
  weightUnit: WeightUnit
  /** Rows skipped because they had no part number. */
  skipped: number
  /** Part numbers that appeared more than once; the last row won. */
  duplicates: string[]
  /** Rows with no usable weight. They do not block an import — they block a shipment. */
  withoutWeight: number
  flagged: FlaggedItem[]
}

export class ItemLibraryError extends Error {}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Header patterns, most specific first. Both sample item masters name the same concepts
 * differently — `Part Number` vs `2nd Item Number`, `Current Export HTS` vs `Harmonized
 * Shipping Code` — so matching is on meaning, not on an exact string.
 */
const ROLE_PATTERNS: { role: ColumnRole; test: (header: string) => boolean }[] = [
  { role: 'importCode', test: (h) => h.includes('import') && /hts|harmon|tariff|code|schedule/.test(h) },
  {
    role: 'exportCode',
    test: (h) =>
      (h.includes('export') && /hts|harmon|tariff|code|schedule/.test(h)) ||
      h.includes('schedule b') ||
      h.includes('harmonized shipping code') ||
      /^(hts|hts code|harmonized code|commodity code|tariff code)$/.test(h),
  },
  { role: 'weight', test: (h) => h.includes('weight') || /^(wt|mass)\b/.test(h) },
  { role: 'description', test: (h) => h.includes('desc') },
  {
    role: 'partNumber',
    test: (h) => /\b(part|item|material|product|sku|model)\b/.test(h) && !h.includes('desc'),
  },
]

/**
 * Ranks weight columns so the *net* one wins.
 *
 * An item master that carries both a gross and a net weight would otherwise be read
 * positionally, and whichever came first would end up in box 26 — which is a net weight.
 * Filing gross there overstates the shipment, silently and plausibly.
 */
function preferNetWeight(candidates: number[], normalised: string[]): number {
  const net = candidates.find((i) => /\bnet\b/.test(normalised[i]))
  if (net != null) return net
  const notGross = candidates.find((i) => !/\bgross\b/.test(normalised[i]))
  return notGross ?? candidates[0]
}

function detectColumns(headers: string[]): DetectedColumns {
  const columns: DetectedColumns = {}
  const normalised = headers.map(normalise)

  for (const { role, test } of ROLE_PATTERNS) {
    const candidates: number[] = []
    for (let i = 0; i < normalised.length; i++) {
      // A column already claimed by a more specific role is not offered again — otherwise
      // `Current Import HTS` would also satisfy the looser export-code pattern.
      if (Object.values(columns).includes(i)) continue
      if (normalised[i] && test(normalised[i])) candidates.push(i)
    }
    if (!candidates.length) continue
    columns[role] = role === 'weight' ? preferNetWeight(candidates, normalised) : candidates[0]
  }

  return columns
}

function detectWeightUnit(header: string | undefined): WeightUnit | null {
  const text = normalise(header ?? '')
  if (!text) return null
  if (/\b(g|gr|gram|grams|grammes)\b/.test(text)) return 'g'
  if (/\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b/.test(text)) return 'kg'
  if (/\b(lb|lbs|pound|pounds)\b/.test(text)) return 'lb'
  return null
}

/**
 * Finds the header row and works out what its columns mean.
 *
 * The header is not assumed to be row 1: exports frequently carry a title or a run date
 * above it. The first row that yields both a part number and one of weight or export code
 * wins.
 */
export function inspectWorkbook(rows: string[][]): WorkbookInspection {
  // The 20-row budget counts rows with content, not raw indices: the workbook reader
  // preserves the sheet's own row numbering, so a file whose header sits below a run of
  // empty rows (which Excel omits from the XML but the grid now represents) must not
  // have its header pushed out of the search window by the padding.
  let scanned = 0
  for (let i = 0; i < rows.length && scanned < 20; i++) {
    const headers = rows[i] ?? []
    if (!headers.some(Boolean)) continue
    scanned++
    const columns = detectColumns(headers)
    if (columns.partNumber == null) continue
    if (columns.weight == null && columns.exportCode == null) continue

    const data = rows.slice(i + 1).filter((row) => row.some(Boolean))
    return {
      headerRow: i,
      headers,
      columns,
      declaredWeightUnit: columns.weight != null ? detectWeightUnit(headers[columns.weight]) : null,
      preview: data.slice(0, 5),
      dataRowCount: data.length,
    }
  }

  throw new ItemLibraryError(
    'Could not find a header row naming a part number alongside a weight or a commodity code. ' +
      'Expected column headings such as "Part Number", "Weight (G)" and "Current Export HTS".',
  )
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Reads a number that may be written in either convention.
 *
 * `411,408` is four hundred and eleven thousand; `0,544` is nought point five four four.
 * Stripping every comma turns the second into 544 — a thousandfold error on a figure that
 * goes straight onto a customs form — and this reader accepts semicolon-delimited files,
 * which is exactly where the second convention shows up.
 *
 * `1,234` is genuinely ambiguous. It is read as a thousands separator, because the forms
 * this tool files are US export declarations.
 */
function parseLooseNumber(text: string): number {
  if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) return Number(text.replace(/,/g, ''))
  if (/^\d+,\d+$/.test(text)) return Number(text.replace(',', '.'))
  return Number(text.replace(/,/g, ''))
}

function parseWeight(raw: string | undefined, unit: WeightUnit): number | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const value = parseLooseNumber(text)
  // Zero is not a weight. Filing one would put 0.000 kg in box 26, which is exactly the
  // silent wrong answer a blank is meant to prevent.
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * TO_KG[unit] * 1e6) / 1e6
}

export interface ImportOptions {
  fileName: string
  /**
   * Unit the weight column is expressed in. Required when the header does not state one:
   * reading grams as kilograms overstates a shipment by a factor of a thousand, and there
   * is nothing in the data that reliably distinguishes them.
   */
  weightUnit?: WeightUnit
  index: ScheduleBIndex | null
  now?: string
}

/** Turns a sheet into library entries, and reports everything that needs a human. */
export function importItems(rows: string[][], options: ImportOptions): ImportSummary {
  const inspection = inspectWorkbook(rows)
  const { columns } = inspection

  const weightUnit = inspection.declaredWeightUnit ?? options.weightUnit ?? null
  if (columns.weight != null && !weightUnit) {
    throw new ItemLibraryError(
      `The weight column ("${inspection.headers[columns.weight]}") does not state its unit. ` +
        'Choose grams, kilograms or pounds before importing.',
    )
  }

  const importedAt = options.now ?? new Date().toISOString()
  const byPart = new Map<string, ItemLibraryEntry>()
  const duplicates: string[] = []
  let skipped = 0

  for (const row of rows.slice(inspection.headerRow + 1)) {
    if (!row.some(Boolean)) continue
    const displayPartNumber = (row[columns.partNumber as number] ?? '').trim()
    const partNumber = displayPartNumber.toUpperCase()
    if (!partNumber) {
      skipped++
      continue
    }

    if (byPart.has(partNumber)) duplicates.push(partNumber)

    byPart.set(partNumber, {
      partNumber,
      displayPartNumber,
      description: columns.description != null ? (row[columns.description] ?? '').trim() : '',
      exportCode: columns.exportCode != null ? (row[columns.exportCode] ?? '').trim() : '',
      importCode: columns.importCode != null ? (row[columns.importCode] ?? '').trim() : '',
      netWeightKg: columns.weight != null ? parseWeight(row[columns.weight], weightUnit as WeightUnit) : null,
      source: options.fileName,
      importedAt,
    })
  }

  const entries = [...byPart.values()]

  return {
    entries,
    inspection,
    weightUnit: (weightUnit ?? 'kg') as WeightUnit,
    skipped,
    duplicates: [...new Set(duplicates)],
    withoutWeight: entries.filter((e) => e.netWeightKg == null).length,
    flagged: flagEntries(entries, options.index),
  }
}

/**
 * Every entry whose export code fails the format or existence filter.
 *
 * With no Census dataset loaded only the *format* rule can be applied. Reporting the rest as
 * findings would tell the user their whole item master is broken when the truth is that
 * nothing could be checked — the missing dataset is reported on its own, once.
 */
export function flagEntries(entries: ItemLibraryEntry[], index: ScheduleBIndex | null): FlaggedItem[] {
  const flagged: FlaggedItem[] = []
  for (const entry of entries) {
    // A library that carries no code column at all is a weights-only import, not 2,856
    // findings. Only a column that exists but is empty on this row is a finding.
    if (!entry.exportCode) continue
    const screening = screenCode(entry.exportCode, index)
    if (screening.status === 'ok') continue
    if (!index && screening.status !== 'malformed') continue
    flagged.push({
      partNumber: entry.displayPartNumber,
      description: entry.description,
      code: entry.exportCode,
      status: screening.status,
      reason: screening.reason,
    })
  }
  return flagged
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Case-insensitive lookup over the library.
 *
 * Keyed through `partKey`, not on `entry.partNumber` directly. The import normalises that
 * field itself, so the two agree today — but the lookup side is `itemsByPart.get(partKey(...))`
 * and an index whose keys are merely *assumed* to match is the shape of defect `partKey`
 * exists to close: every entry silently missing its library record, with nothing in the diff
 * to read wrong.
 */
export function indexByPart(entries: ItemLibraryEntry[]): Map<string, ItemLibraryEntry> {
  return new Map(entries.map((entry) => [partKey(entry.partNumber), entry]))
}

/** Per-part net weights in the shape the reconciliation engine expects. */
export function libraryWeights(entries: ItemLibraryEntry[]): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const entry of entries) {
    if (entry.netWeightKg != null) weights[partKey(entry.partNumber)] = entry.netWeightKg
  }
  return weights
}

export type { CodeScreening }
