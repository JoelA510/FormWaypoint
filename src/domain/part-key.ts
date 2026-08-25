/**
 * The one way a part number becomes a map key.
 *
 * Part numbers reach this application from three systems that disagree about case and
 * padding: the CIPL prints what the ERP rendered, an item-master extract carries whatever the
 * spreadsheet held, and a person types the third variant by hand. Treating `40649-0300a` and
 * `40649-0300A` as different parts is always wrong.
 *
 * It exists as a named function rather than an inlined `.trim().toUpperCase()` because the
 * inlined form was written at ten call sites and omitted at four — and the omissions were
 * exactly where two defects lived. A manually entered weight was keyed raw while the library's
 * was keyed uppercased, so both survived the merge and the library's default won; and the
 * review panel looked weights up raw while looking codes up normalised, so a part with a
 * library weight was shown as blocking-red "needed" while the checks panel said it was fine.
 * Neither is visible in a diff that reads correctly line by line.
 */
export function partKey(partNumber: string): string {
  return partNumber.trim().toUpperCase()
}

/**
 * The distinct parts a set of lines names, in first-seen order, each in its first spelling.
 *
 * Deduped the way everything else keys a part — case-insensitively, on the trimmed number —
 * because trimming alone made one part printed in two cases look like two. A Map keeps the
 * *last* value for a repeated key, so the first spelling has to be kept deliberately: it is
 * the one the document leads with and the one an operator will recognise.
 *
 * Blank part numbers are dropped. A line that names no part is a fact about the line, and the
 * callers that care report it separately; it is not a part.
 */
export function distinctParts(lines: { partNumber: string }[]): string[] {
  const seen = new Map<string, string>()
  for (const line of lines) {
    const key = partKey(line.partNumber)
    if (key && !seen.has(key)) seen.set(key, line.partNumber.trim())
  }
  return [...seen.values()]
}
