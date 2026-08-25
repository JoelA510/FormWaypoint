/**
 * Splitting a list of rows across sheets.
 *
 * Generic on purpose, and here rather than beside either caller: the reconciliation needs to
 * say how many sheets a shipment will take, and the carrier adapters need the rows that go on
 * each. One rule, so the count the review screen reports cannot disagree with the number of
 * pages the form comes out with.
 */

/**
 * How many sheets `rowCount` rows need at `rowsPerPage` each. Never fewer than one.
 *
 * "Never fewer than one" has to survive a figure that is not a number. `Math.max(1, NaN)` is
 * `NaN`, and a NaN sheet count runs the loop below zero times: the adapter is handed no pages
 * at all and files a form with a complete header and an empty commodity table, silently.
 */
export function pagesNeeded(rowCount: number, rowsPerPage: number): number {
  const rows = Number.isFinite(rowCount) ? Math.max(0, rowCount) : 0
  return Math.max(1, Math.ceil(rows / perPage(rowsPerPage)))
}

/** At least one row to a sheet, whatever was asked for. */
function perPage(rowsPerPage: number): number {
  return Number.isFinite(rowsPerPage) ? Math.max(1, Math.floor(rowsPerPage)) : 1
}

/**
 * The rows belonging to each sheet, in order, filling each before starting the next.
 *
 * A shipment with no rows still yields one (empty) sheet: the form is the deliverable, and
 * the checks — not this — decide whether it should have been produced.
 */
export function rowsByPage<T>(rows: T[], rowsPerPage: number): T[][] {
  const size = perPage(rowsPerPage)
  const count = pagesNeeded(rows.length, size)
  const pages: T[][] = []
  for (let i = 0; i < count; i++) pages.push(rows.slice(i * size, (i + 1) * size))
  return pages
}
