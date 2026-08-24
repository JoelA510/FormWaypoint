/**
 * Splitting a list of rows across sheets.
 *
 * Generic on purpose, and here rather than beside either caller: the reconciliation needs to
 * say how many sheets a shipment will take, and the carrier adapters need the rows that go on
 * each. One rule, so the count the review screen reports cannot disagree with the number of
 * pages the form comes out with.
 */

/** How many sheets `rowCount` rows need at `rowsPerPage` each. Never fewer than one. */
export function pagesNeeded(rowCount: number, rowsPerPage: number): number {
  return Math.max(1, Math.ceil(rowCount / Math.max(1, rowsPerPage)))
}

/**
 * The rows belonging to each sheet, in order, filling each before starting the next.
 *
 * A shipment with no rows still yields one (empty) sheet: the form is the deliverable, and
 * the checks — not this — decide whether it should have been produced.
 */
export function rowsByPage<T>(rows: T[], rowsPerPage: number): T[][] {
  const perPage = Math.max(1, rowsPerPage)
  const pages: T[][] = []
  for (let i = 0; i < pagesNeeded(rows.length, perPage); i++) {
    pages.push(rows.slice(i * perPage, (i + 1) * perPage))
  }
  return pages
}
