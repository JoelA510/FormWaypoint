/**
 * Shared helpers for writing AcroForm fields.
 *
 * Both carrier forms were authored by hand and their field names are inconsistent —
 * `22.03 sB UNIT1` next to `23.03 SB UNI2`, `26.07 ECCN5` next to `27.07ECCN6`. Rather than
 * pattern-match those names, each adapter declares an explicit map and these helpers write
 * through it, recording anything that could not be written instead of throwing.
 */
import { PDFDocument, PDFCheckBox, PDFRadioGroup, PDFTextField, type PDFForm } from 'pdf-lib'

export interface WriteContext {
  form: PDFForm
  written: Record<string, string>
  warnings: string[]
}

export async function loadForm(templateBytes: Uint8Array): Promise<{ doc: PDFDocument; form: PDFForm }> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true, updateMetadata: false })
  return { doc, form: doc.getForm() }
}

export function createContext(form: PDFForm): WriteContext {
  return { form, written: {}, warnings: [] }
}

/** Set a text field. A missing field is reported, never silently dropped. */
export function setText(ctx: WriteContext, fieldName: string, value: string | null | undefined): void {
  if (value === null || value === undefined || value === '') return
  try {
    const field = ctx.form.getField(fieldName)
    if (!(field instanceof PDFTextField)) {
      ctx.warnings.push(`"${fieldName}" is not a text field; skipped.`)
      return
    }
    field.setText(value)
    ctx.written[fieldName] = value
  } catch {
    ctx.warnings.push(`The form has no field named "${fieldName}", so "${truncate(value)}" was not written.`)
  }
}

/** Tick a checkbox. `false` leaves the box untouched rather than explicitly unchecking. */
export function setCheckBox(ctx: WriteContext, fieldName: string, checked: boolean): void {
  if (!checked) return
  try {
    const field = ctx.form.getField(fieldName)
    if (!(field instanceof PDFCheckBox)) {
      ctx.warnings.push(`"${fieldName}" is not a checkbox; skipped.`)
      return
    }
    field.check()
    ctx.written[fieldName] = 'checked'
  } catch {
    ctx.warnings.push(`The form has no checkbox named "${fieldName}".`)
  }
}

/**
 * Select a radio option.
 *
 * The Nippon form models most yes/no pairs as several single-option groups rather than one
 * group with two options, so selecting "no" means writing to a different field than "yes".
 */
export function selectRadio(ctx: WriteContext, fieldName: string, option: string): void {
  try {
    const field = ctx.form.getField(fieldName)
    if (!(field instanceof PDFRadioGroup)) {
      ctx.warnings.push(`"${fieldName}" is not a radio group; skipped.`)
      return
    }
    if (!field.getOptions().includes(option)) {
      ctx.warnings.push(`"${fieldName}" has no option "${option}" (has: ${field.getOptions().join(', ')}).`)
      return
    }
    field.select(option)
    ctx.written[fieldName] = option
  } catch {
    ctx.warnings.push(`The form has no radio group named "${fieldName}".`)
  }
}

/** Which of the adapter's expected fields the loaded PDF is missing. */
export function findMissingFields(form: PDFForm, expected: string[]): string[] {
  const present = new Set(form.getFields().map((f) => f.getName()))
  return expected.filter((name) => !present.has(name))
}

/** Address blocks are stored with carriage returns, matching how the forms were filled. */
export function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => Boolean(l && l.trim())).join('\r')
}

/** `2026-07-20` or `July 20, 2026` -> `07-20-2026`. */
export function formatDateMMDDYYYY(input: string, separator = '-'): string {
  const parsed = parseLooseDate(input)
  if (!parsed) return input
  const [y, m, d] = parsed
  return [pad(m), pad(d), String(y)].join(separator)
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** Real calendar date, so `25-12-2026` read as MM-DD is rejected rather than written out. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2999) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

/**
 * Returns [year, month, day] or null.
 *
 * Handles the CIPL's `July 20, 2026` wording, common abbreviations (`Jul`, `Sept`), ISO,
 * and MM/DD/YYYY. Anything that is not a real calendar date returns null so the caller can
 * surface it — an unparseable date must never reach the form unnoticed.
 */
export function parseLooseDate(input: string): [number, number, number] | null {
  const text = (input ?? '').trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const parts: [number, number, number] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return isRealDate(...parts) ? parts : null
  }

  // US convention, matching what the forms print. The `vendor-b` CIPL abbreviates the
  // year to two digits (`07/22/26`), so that is accepted and expanded — 69-99 map to the
  // 1900s per the usual POSIX pivot, everything else to the 2000s.
  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (numeric) {
    const rawYear = Number(numeric[3])
    const year = numeric[3].length === 2 ? (rawYear >= 69 ? 1900 + rawYear : 2000 + rawYear) : rawYear
    const parts: [number, number, number] = [year, Number(numeric[1]), Number(numeric[2])]
    return isRealDate(...parts) ? parts : null
  }

  const named = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (named) {
    const needle = named[1].toLowerCase()
    // `Sept` and `Sep` both have to resolve to September, so match on prefix.
    const matches = MONTHS.filter((m) => m.startsWith(needle) || needle.startsWith(m))
    if (matches.length === 1) {
      const parts: [number, number, number] = [
        Number(named[3]),
        MONTHS.indexOf(matches[0]) + 1,
        Number(named[2]),
      ]
      return isRealDate(...parts) ? parts : null
    }
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function truncate(value: string, max = 40): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

// ---------------------------------------------------------------------------
// Incoterms
// ---------------------------------------------------------------------------

/**
 * The eleven Incoterms 2020 rules, plus the 2010 rules still printed on paperwork in
 * circulation. A retired rule is recognised so that it can be *reported* rather than
 * silently dropped — no adapter ticks a box for one.
 */
const INCOTERM_CODES = new Set([
  'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF',
  // Incoterms 2010 and earlier. `DAT` became `DPU` in 2020; the others were withdrawn.
  'DAT', 'DDU', 'DAF', 'DES', 'DEQ',
])

/** Rules withdrawn or renamed since Incoterms 2010, and what replaced them. */
export const RETIRED_INCOTERMS: Record<string, string> = {
  DAT: 'DPU (Delivered at Place Unloaded), which replaced DAT in Incoterms 2020',
  DDU: 'DAP (Delivered at Place), which replaced DDU in Incoterms 2010',
  DAF: 'DAP',
  DES: 'DAP',
  DEQ: 'DPU',
}

/**
 * Wordings seen instead of the code. The `omron-ci` form is filled by hand and its
 * INCOTERMS box has been typed both ways.
 */
const INCOTERM_PHRASES: [string, string][] = [
  ['CARRIAGE AND INSURANCE PAID TO', 'CIP'],
  ['COST INSURANCE AND FREIGHT', 'CIF'],
  ['DELIVERED AT PLACE UNLOADED', 'DPU'],
  ['DELIVERED AT TERMINAL', 'DAT'],
  ['DELIVERED DUTY UNPAID', 'DDU'],
  ['FREE ALONGSIDE SHIP', 'FAS'],
  ['DELIVERED DUTY PAID', 'DDP'],
  ['CARRIAGE PAID TO', 'CPT'],
  ['DELIVERED AT PLACE', 'DAP'],
  ['COST AND FREIGHT', 'CFR'],
  ['FREE ON BOARD', 'FOB'],
  ['FREE CARRIER', 'FCA'],
  ['EX WORKS', 'EXW'],
]

export interface ParsedIncoterm {
  /** The three-letter rule, uppercased. */
  code: string
  /** Whatever qualified it: `Singapore` in `DAP Singapore`, `Origin - Collect` in `FOB Origin - Collect`. */
  namedPlace: string
  /** True for a rule that no longer exists in Incoterms 2020, so no current form has a box for it. */
  retired: boolean
}

/**
 * Read an Incoterm off whatever the document or the operator supplied.
 *
 * Both carrier forms record the rule as a tick against a fixed list, so an exact match is
 * the difference between the term being on the form and not being on it at all. What
 * reaches here is rarely exact: the `omron-ci` INCOTERMS box says `DAP Singapore`, the
 * Vendor A trade terms say `FOB Origin - Collect`, and either can be typed in lower case
 * or written out in words. Every one of those is the same rule as the box beside it.
 *
 * The named place is kept rather than discarded. An Incoterm without its place is
 * incomplete — `FOB` alone does not say which port — and the CEVA form has nowhere to tick
 * it, so the adapter writes it out instead of losing it.
 */
export function parseIncoterm(raw: string | null | undefined): ParsedIncoterm | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  const found = (code: string, rest: string): ParsedIncoterm => ({
    code,
    // Leading separators belong to the join, not to the place: `FOB - Long Beach` names
    // Long Beach.
    namedPlace: rest.replace(/^[\s,:;/|–—-]+/, '').trim(),
    retired: code in RETIRED_INCOTERMS,
  })

  const leading = text.toUpperCase().match(/^([A-Z]{3})\b/)
  if (leading && INCOTERM_CODES.has(leading[1])) return found(leading[1], text.slice(3))

  for (const [phrase, code] of INCOTERM_PHRASES) {
    // Tolerant of the punctuation and spacing a hand-filled box collects: `Ex-Works`,
    // `COST, INSURANCE AND FREIGHT`.
    const pattern = new RegExp(`^${phrase.split(' ').join('[^A-Za-z]+')}\\b`, 'i')
    const match = text.match(pattern)
    if (match) return found(code, text.slice(match[0].length))
  }

  return null
}
