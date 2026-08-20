/**
 * Schedule B lookup and validation, backed by the U.S. Census Bureau AES commodity file.
 *
 * The dataset is the authority on three things a CIPL cannot tell us:
 *   1. whether a code is currently valid at all (absent = retired or never existed),
 *   2. the official commodity description for that code,
 *   3. the unit of quantity AES requires the line to be reported in.
 *
 * Point 3 matters more than it looks. Several codes in the sample shipments are reported
 * in kilograms, not pieces — filing a piece count against them is a reporting error even
 * though every other number on the form is right.
 *
 * Nothing in here decides a classification. It reports what the source says and what the
 * official data says, and flags disagreement for a human. Silently "correcting" a code
 * would be exactly the wrong behaviour for an export declaration.
 */
import type { CheckResult } from '../types'
import type { QuantityBasis } from '../units'

export interface ScheduleBEntry {
  code: string
  description: string
  /** Unit(s) of quantity AES requires, e.g. `['NO']` or `['NO','KG']`. */
  units: string[]
}

/**
 * The on-disk dataset, exactly as `scripts/build-schedule-b.mjs` writes it.
 *
 * Exported because the revision diff compares two of these directly — an installed dataset
 * against a freshly downloaded one — before either becomes a lookup index.
 */
export interface RawPayload {
  source: string
  generatedAt: string
  count: number
  codes: Record<string, { d: string; u: string[] }>
}

export interface ScheduleBIndex {
  readonly source: string
  readonly generatedAt: string
  readonly size: number
  lookup(rawCode: string): ScheduleBEntry | null
}

/** `8544.42.0000` -> `8544420000`. Also tolerates spaces and hyphens. */
export function normalizeScheduleB(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

/** `8544420000` -> `8544.42.0000`, the form both carrier SLIs print. */
export function formatScheduleB(code: string): string {
  const digits = normalizeScheduleB(code)
  if (digits.length !== 10) return code
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

/** The written form every Schedule B number is expected in. */
export const SCHEDULE_B_PATTERN = /^\d{4}\.\d{2}\.\d{4}$/

export type CodeScreening =
  /** Correctly written and present in the Census file. */
  | { status: 'ok'; code: string; description: string }
  /** Not written as `####.##.####` — may still resolve, but needs correcting at source. */
  | { status: 'malformed'; code: string; reason: string; resolves: boolean }
  /** Correctly written, but absent from the Census file. AES will reject it. */
  | { status: 'unknown'; code: string; reason: string }
  /** No code at all. */
  | { status: 'absent'; code: string; reason: string }

/**
 * The standing filter over any commodity number, wherever it came from — a CIPL line or an
 * imported item master.
 *
 * Two rules, both purely mechanical: is it written as `####.##.####`, and is it in the
 * Census concordance. Nothing here judges whether a code *suits* the goods, and nothing
 * corrects one; a number that fails either rule is reported so a human can fix it at source.
 *
 * `malformed` is reported separately from `unknown` because they need different fixes: a
 * punctuation slip is a typing correction, while a code the Census file has never heard of
 * is a reclassification.
 */
export function screenCode(raw: string | null | undefined, index: ScheduleBIndex | null): CodeScreening {
  const text = (raw ?? '').trim()
  if (!text) return { status: 'absent', code: '', reason: 'No commodity number.' }

  const digits = normalizeScheduleB(text)
  const entry = index?.lookup(digits) ?? null

  if (!SCHEDULE_B_PATTERN.test(text)) {
    const resolves = digits.length === 10 && Boolean(entry)
    return {
      status: 'malformed',
      code: text,
      reason:
        digits.length === 10
          ? `Written as "${text}" instead of ${formatScheduleB(digits)}.`
          : `Has ${digits.length} digit(s); Schedule B numbers have exactly 10, written ####.##.####.`,
      resolves,
    }
  }

  if (!entry) {
    return {
      status: 'unknown',
      code: text,
      reason: index
        ? 'Not in the Census Bureau commodity file. The code is retired, mistyped, or an import-only HTS number.'
        : 'The Census commodity file is not loaded, so this code could not be checked.',
    }
  }

  return { status: 'ok', code: text, description: entry.description }
}

export function createScheduleBIndex(payload: RawPayload): ScheduleBIndex {
  const { codes } = payload
  return {
    source: payload.source,
    generatedAt: payload.generatedAt,
    size: Object.keys(codes).length,
    lookup(rawCode: string) {
      const digits = normalizeScheduleB(rawCode)
      const hit = codes[digits]
      return hit ? { code: digits, description: hit.d, units: hit.u } : null
    },
  }
}

/**
 * Whether the dataset predates the most recent Schedule B revision window.
 *
 * The Census Bureau reissues the concordance when Schedule B changes, effective each
 * 1 January and 1 July. A dataset generated before the latest of those boundaries can list
 * retired codes as active — which silently defeats the "is this code current?" check, the
 * one question this dataset exists to answer. An unreadable date is treated as stale,
 * because "cannot tell how old" and "too old" call for the same response.
 */
export function scheduleBIsStale(generatedAt: string, today: Date = new Date()): boolean {
  const generated = Date.parse(generatedAt)
  if (Number.isNaN(generated)) return true
  const year = today.getUTCFullYear()
  const boundaries = [Date.UTC(year - 1, 6, 1), Date.UTC(year, 0, 1), Date.UTC(year, 6, 1)]
  const latest = Math.max(...boundaries.filter((b) => b <= today.getTime()))
  return generated < latest
}

/**
 * The dataset shipped inside the bundle.
 *
 * On the desktop this is the starting point rather than the last word — a refresh writes a
 * newer one beside the app and that takes precedence. See `loadInstalledDataset`.
 */
export async function loadBundledPayload(): Promise<RawPayload> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/schedule-b.json`)
  if (!res.ok) throw new Error(`Could not load the Schedule B dataset (${res.status}).`)
  return (await res.json()) as RawPayload
}

let cached: Promise<ScheduleBIndex> | null = null

/** Loads (and memoises) the dataset. In the browser it is fetched from /data. */
export function loadScheduleB(fetchJson?: () => Promise<RawPayload>): Promise<ScheduleBIndex> {
  if (!cached) {
    cached = (fetchJson ?? loadBundledPayload)().then(createScheduleBIndex)
  }
  return cached
}

// ---------------------------------------------------------------------------
// Unit of quantity
// ---------------------------------------------------------------------------

/**
 * Unit names used on the CIPL mapped onto the Census vocabulary. `PCS` on an the vendor invoice
 * and `NO` in the Census file both mean "a count of items".
 *
 * The table runs in both directions on purpose: the same function canonicalises what a
 * document printed *and* what the Census file requires, so `restateQuantity` can compare the
 * two without either side having its own spelling rules.
 *
 * Deliberately absent: `GR` (grams or gross, and the document does not say which) and `TON`
 * (a short ton in US trade, a tonne elsewhere). An ambiguous alias here would silently
 * convert a quantity by a factor of 144 or 1.1, which is worse than not converting it.
 */
const UNIT_ALIASES: Record<string, string> = {
  PCS: 'NO',
  PC: 'NO',
  EA: 'NO',
  EACH: 'NO',
  NO: 'NO',
  UNIT: 'NO',
  UNITS: 'NO',
  KG: 'KG',
  KGS: 'KG',
  KGM: 'KG',
  G: 'GM',
  GM: 'GM',
  GRAM: 'GM',
  GRAMS: 'GM',
  T: 'T',
  MT: 'T',
  DOZ: 'DOZ',
  DZ: 'DOZ',
  DOZEN: 'DOZ',
  GRS: 'GRS',
  HUN: 'HUN',
  THS: 'THS',
}

export function canonicalUnit(raw: string | null | undefined): string | null {
  if (!raw) return null
  return UNIT_ALIASES[raw.trim().toUpperCase()] ?? raw.trim().toUpperCase()
}

// ---------------------------------------------------------------------------
// Description plausibility
// ---------------------------------------------------------------------------

/** Words too generic to count as evidence that a code matches a commodity. */
const STOPWORDS = new Set([
  'and', 'or', 'the', 'of', 'for', 'with', 'not', 'nesoi', 'other', 'parts', 'part', 'in', 'this', 'a', 'an',
  'to', 'by', 'per', 'from', 'assy', 'kit', 'system', 'cbl', 'ca', 'exceeding', 'except', 'used', 'use',
])

function significantTerms(text: string): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      // The Census file is written in the plural ("ELECTRIC MOTORS") while invoice lines
      // are usually singular ("ASSY, J3 MOTOR"). Without this they never match.
      .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
  )
}

/**
 * Advisory only. A shared significant term between the CIPL's own wording and the official
 * Schedule B description is weak evidence the code is plausible; no shared term is a reason
 * for a human to look, not a reason to reject.
 *
 * On the sample data this is what separates `8544.42.0000 ELECTRICAL CONDUCTORS ... FITTED
 * WITH CONNECTORS` (matches "Electrical Conductors") from `8483.10.5000 TRANSMISSION SHAFTS
 * AND CRANKS` applied to a cable assembly (matches nothing).
 */
export function descriptionOverlap(sourceText: string, officialDescription: string): number {
  const source = significantTerms(sourceText)
  const official = significantTerms(officialDescription)
  if (!source.size || !official.size) return 0
  let shared = 0
  for (const term of source) if (official.has(term)) shared++
  return shared / Math.min(source.size, official.size)
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface ClassificationSubject {
  /** Code as it will be filed. */
  code: string
  /** Free text describing the goods — commodity group plus line description. */
  sourceText: string
  /** Unit the quantity is expressed in on the CIPL. */
  sourceUom: string
  /**
   * Unit the row will actually be filed in. Defaults to `sourceUom` when the caller has not
   * resolved one, which is what a row files when nothing can restate it.
   */
  reportingUom?: string
  /** How the filed quantity was obtained — the invoice's own count, or the net weight. */
  reportingBasis?: QuantityBasis
  /** Whether the row has a net weight at all, which decides whether a kilogram unit is reachable. */
  hasNetWeight?: boolean
  /** Reference for the UI, e.g. an SLI line index. */
  ref?: string
}

/**
 * Validate one classification. Returns a check per rule so the review screen can show
 * exactly which rule fired rather than a single opaque pass/fail.
 */
export function checkClassification(subject: ClassificationSubject, index: ScheduleBIndex): CheckResult[] {
  const results: CheckResult[] = []
  const refs = subject.ref ? [subject.ref] : undefined
  const digits = normalizeScheduleB(subject.code)
  const pretty = formatScheduleB(subject.code)

  // --- 1. Ten digits ------------------------------------------------------
  const isTenDigits = digits.length === 10
  results.push({
    id: `sb-format:${subject.ref ?? digits}`,
    severity: 'blocking',
    title: `${pretty} is 10 digits`,
    detail: isTenDigits
      ? 'Schedule B numbers are exactly 10 digits once punctuation is removed.'
      : `Found ${digits.length} digit(s). Both carrier forms require exactly 10.`,
    passed: isTenDigits,
    expected: '10 digits',
    actual: `${digits.length} digits`,
    refs,
  })
  if (!isTenDigits) return results

  // --- 2. Currently valid -------------------------------------------------
  const entry = index.lookup(digits)
  results.push({
    id: `sb-active:${subject.ref ?? digits}`,
    severity: 'blocking',
    title: `${pretty} is an active Schedule B number`,
    detail: entry
      ? entry.description
      : `Not present in the Census Bureau commodity file (${index.generatedAt}). The code is either ` +
        `retired or mistyped, and AES will reject it.`,
    passed: Boolean(entry),
    refs,
  })
  if (!entry) return results

  // --- 3. Unit of quantity ------------------------------------------------
  //
  // Judged on the unit the row is *filed* in, not the one the invoice printed. Those are the
  // same thing only until a code reported in kilograms meets an invoice counted in pieces —
  // and that case is now restated from the net weight rather than merely complained about, so
  // a check that went on reading the invoice unit would warn about a form that is correct.
  const required = entry.units.map((u) => canonicalUnit(u)).filter((u): u is string => Boolean(u))
  const printed = canonicalUnit(subject.sourceUom)
  const filed = canonicalUnit(subject.reportingUom) ?? printed
  if (required.length && filed) {
    const ok = required.includes(filed)
    const wanted = required[0]
    // How the figure was arrived at, where that is not simply "off the invoice". Both cases
    // put a number on the form that the document does not print, and a check that called
    // either of them "matching the invoice" would vouch for a figure nobody transcribed.
    const worked =
      subject.reportingBasis === 'net-weight'
        ? `so the row files the net weight in ${filed} rather than the ${printed ?? 'invoice'} count the invoice prints`
        : subject.reportingBasis === 'converted'
          ? `so the row files the invoice's ${printed ?? 'own'} figure restated as ${filed}`
          : ''
    results.push({
      id: `sb-uom:${subject.ref ?? digits}`,
      severity: ok ? 'info' : 'warning',
      title: `${pretty} quantity is reported in the required unit`,
      detail: ok
        ? worked
          ? `Schedule B reports this code in ${required.join(' and ')}, ${worked}.`
          : `Schedule B reports this code in ${required.join(' and ')}, matching the invoice.`
        : `Schedule B requires this code to be reported in ${required.join(' or ')}, but this row files ${filed}. ` +
          (wanted === 'KG'
            ? subject.hasNetWeight === false
              ? 'Nothing on this shipment gives a net weight for these goods, so the kilogram figure the code ' +
                'requires cannot be worked out — supply the per-part weights, or correct the classification.'
              : 'This row does have a net weight, so it can be filed in KG; the unit was changed by hand. Put it ' +
                'back to the Schedule B unit, or correct the classification.'
            : `The ${printed ?? 'invoice'} figure the document prints cannot be converted to ` +
              `${wanted}, so the classification or the unit needs correcting before this is filed.`),
      passed: ok,
      expected: required.join(' or '),
      actual: filed,
      refs,
    })
  }

  // --- 4. Does the code plausibly describe the goods? ---------------------
  const overlap = descriptionOverlap(subject.sourceText, entry.description)
  const plausible = overlap > 0
  results.push({
    id: `sb-applicability:${subject.ref ?? digits}`,
    severity: plausible ? 'info' : 'warning',
    title: `${pretty} matches the goods described`,
    detail: plausible
      ? `Official description "${entry.description}" shares wording with the invoice description.`
      : `Official description is "${entry.description}", which has no wording in common with the invoice ` +
        `description "${subject.sourceText.trim()}". This is a prompt to check the classification by hand, ` +
        `not proof that it is wrong.`,
    passed: plausible,
    expected: entry.description,
    actual: subject.sourceText.trim(),
    refs,
  })

  return results
}
