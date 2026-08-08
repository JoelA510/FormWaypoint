/**
 * Shared rendering for the worklists this app writes to disk.
 *
 * Two features produce one: the Schedule B refresh writes what a revision changed, and the
 * item-master export writes what was entered by hand. Both render a markdown log for reading
 * and a CSV for working through, from the same kind of data, into the same sinks.
 *
 * They had a copy each of these three helpers, character for character — and the markdown
 * escaping was applied to four fields in one copy and six in the other, which is exactly the
 * cost of the duplication: a gap in one is invisible from the other.
 */

/**
 * Makes text safe inside a markdown table cell.
 *
 * Everything rendered through these reports is someone else's data — part numbers,
 * descriptions and commodity codes out of an ERP export. An unescaped `|` or an embedded
 * newline silently adds a column and corrupts the table from that row down, in the one file
 * whose entire purpose is being read by a person.
 */
export function cell(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

/**
 * A CSV field, quoted only when it has to be.
 *
 * A bare carriage return counts. Rows here are joined with `\n`, but a reader following
 * RFC 4180 terminates on CR just as readily — and a lone CR does reach this function: an
 * item-master cell containing one arrives through the workbook reader as `&#13;`, decoded.
 * Unquoted, it splits one worklist row into two misaligned ones.
 */
export function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** A CSV document from a header row and its data rows. */
export function csvRows(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n')
}

/**
 * `item-master-updates-2026-07-30.csv` — dated so a later export sits beside an earlier one
 * rather than replacing it. Two exports on the same day do still overwrite; the date is what
 * a person needs to tell one revision from the next, and a timestamped name nobody can read
 * would trade that away for a case that has no cost.
 */
export function datedFileName(stem: string, date: string, extension: string): string {
  return `${stem}-${date}.${extension}`
}

/**
 * Today's date where the user is, as `YYYY-MM-DD`.
 *
 * `toISOString().slice(0, 10)` is UTC, which names the wrong day for most of the working
 * afternoon anywhere west of Greenwich — a file stamped the 30th for work done on the 29th,
 * disagreeing with the dates on its own rows.
 */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
