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
