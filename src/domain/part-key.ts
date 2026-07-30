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
