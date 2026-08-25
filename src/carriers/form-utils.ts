/**
 * Shared helpers for writing AcroForm fields.
 *
 * Both carrier forms were authored by hand and their field names are inconsistent —
 * `22.03 sB UNIT1` next to `23.03 SB UNI2`, `26.07 ECCN5` next to `27.07ECCN6`. Rather than
 * pattern-match those names, each adapter declares an explicit map and these helpers write
 * through it, recording anything that could not be written instead of throwing.
 */
import { PDFDocument, PDFCheckBox, PDFRadioGroup, PDFTextField, type PDFField, type PDFForm } from 'pdf-lib'

export interface WriteContext {
  written: Record<string, string>
  warnings: string[]
  /**
   * Every field in the document, by name.
   *
   * `PDFForm.getField` walks the whole field tree and builds a wrapper for every field it
   * passes, which was cheap while a form was one sheet with a fixed field count. Continuation
   * pages make that count grow with the shipment, so writing row `n` costs more the more rows
   * there are: an eleven-sheet Nippon SLI has 1032 fields and 792 row writes, and spent 2.75
   * seconds of the browser's main thread on lookups alone. Built once here instead.
   */
  fields: Map<string, PDFField>
}

export async function loadForm(templateBytes: Uint8Array): Promise<{ doc: PDFDocument; form: PDFForm }> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true, updateMetadata: false })
  return { doc, form: doc.getForm() }
}

export function createContext(form: PDFForm): WriteContext {
  const fields = new Map<string, PDFField>()
  for (const field of form.getFields()) fields.set(field.getName(), field)
  // The form itself is deliberately not kept. Writing through `form.getField` would bypass
  // both this map and the warning path below, which is the whole contract of this module.
  return { written: {}, warnings: [], fields }
}

/** Set a text field. A missing field is reported, never silently dropped. */
export function setText(ctx: WriteContext, fieldName: string, value: string | null | undefined): void {
  if (value === null || value === undefined || value === '') return
  const field = ctx.fields.get(fieldName)
  if (!field) {
    ctx.warnings.push(`The form has no field named "${fieldName}", so "${truncate(value)}" was not written.`)
    return
  }
  if (!(field instanceof PDFTextField)) {
    ctx.warnings.push(`"${fieldName}" is not a text field; skipped.`)
    return
  }
  // The write itself can refuse the value — the CEVA `ZipCode` box carries `/MaxLen 5`, so a
  // profile holding a ZIP+4 throws here. That is a warning about one box, not a reason to
  // produce no form at all: everything else on the declaration is still worth having, and the
  // filer is told which box to complete by hand.
  try {
    field.setText(value)
  } catch (error) {
    ctx.warnings.push(`"${fieldName}" would not take "${truncate(value)}" (${reason(error)}).`)
    return
  }
  ctx.written[fieldName] = value
}

/** A pdf-lib rejection in one clause, for a warning a filer reads. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim() || 'the field refused the value'
}

/** Tick a checkbox. `false` leaves the box untouched rather than explicitly unchecking. */
export function setCheckBox(ctx: WriteContext, fieldName: string, checked: boolean): void {
  if (!checked) return
  const field = ctx.fields.get(fieldName)
  if (!field) {
    ctx.warnings.push(`The form has no checkbox named "${fieldName}".`)
    return
  }
  if (!(field instanceof PDFCheckBox)) {
    ctx.warnings.push(`"${fieldName}" is not a checkbox; skipped.`)
    return
  }
  try {
    field.check()
  } catch (error) {
    ctx.warnings.push(`"${fieldName}" would not tick (${reason(error)}).`)
    return
  }
  ctx.written[fieldName] = 'checked'
}

/**
 * Select a radio option.
 *
 * The Nippon form models most yes/no pairs as several single-option groups rather than one
 * group with two options, so selecting "no" means writing to a different field than "yes".
 */
export function selectRadio(ctx: WriteContext, fieldName: string, option: string): void {
  const field = ctx.fields.get(fieldName)
  if (!field) {
    ctx.warnings.push(`The form has no radio group named "${fieldName}".`)
    return
  }
  if (!(field instanceof PDFRadioGroup)) {
    ctx.warnings.push(`"${fieldName}" is not a radio group; skipped.`)
    return
  }
  if (!field.getOptions().includes(option)) {
    ctx.warnings.push(`"${fieldName}" has no option "${option}" (has: ${field.getOptions().join(', ')}).`)
    return
  }
  try {
    field.select(option)
  } catch (error) {
    ctx.warnings.push(`"${fieldName}" would not take "${option}" (${reason(error)}).`)
    return
  }
  ctx.written[fieldName] = option
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

/**
 * A commodity quantity as a form's quantity box carries it.
 *
 * Three decimals is the floor, not the ceiling. It is the precision the filed SLIs use for a
 * kilogram figure, and it is nowhere near enough for a unit that is a large multiple of the
 * one being converted from: `0.004263` tonnes truncated to three places is `0.004`, which
 * declares 4 kg where the shipment weighs 4.263, and a 0.4 kg row would declare nothing at
 * all. `restateQuantity` has already rounded to a precision that suits the conversion, so
 * anything beyond three places is significant and is kept.
 */
export function formatQuantity(quantity: number): string {
  // A figure that is not a number is a fault upstream. Writing the word "NaN" into a
  // quantity box on a signed declaration is the one response worse than leaving it blank.
  if (!Number.isFinite(quantity)) return ''
  if (Number.isInteger(quantity)) return String(quantity)
  // Fixed notation, never the float's own shortest form. `String()` renders 4.263e-7 in
  // scientific notation — which a PDF box would carry verbatim — and 0.1 + 0.2 as seventeen
  // digits. Nine places is what `roundScaled` caps its precision at, so nothing significant
  // is beyond it; the trailing zeros it adds come back off, down to the three the filed
  // forms use for a kilogram figure.
  return quantity.toFixed(9).replace(/(\.\d{3}\d*?)0+$/, '$1')
}
