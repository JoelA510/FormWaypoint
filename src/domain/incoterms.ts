/**
 * Incoterms: reading the delivery term a document states.
 *
 * Domain knowledge rather than carrier knowledge, and it lives here for that reason —
 * `src/domain` knows nothing about any forwarder, but "what rule is `DAP Singapore`?" is a
 * question about the trade term, not about CEVA. Both carrier adapters and the Vendor A
 * trade-terms parser ask it, and a second answer somewhere else is how one of them comes to
 * accept `PPD` as an Incoterm.
 */

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
    namedPlace: rest.replace(/^[\s,:;/|.–—-]+/, '').trim(),
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

/**
 * Wording that means "who pays the freight", not "where delivery happens".
 *
 * The trade-terms line on these documents is a composite — the rule, sometimes a place, and
 * the freight term — so what follows the rule is not always a place. `FOB Origin - Collect`
 * leaves `Origin - Collect` behind, and writing that into a box captioned "NAMED PLACE/PORT"
 * states a freight term as a port.
 */
const FREIGHT_QUALIFIER = /\b(COLLECT|PREPAID|PPD|P\.?P\.?|C\.?C\.?|FREIGHT|DUTY\s+(UN)?PAID)\b/i

/**
 * Whether `namedPlace` can be written into a form's named-place box as it stands.
 *
 * All or nothing, deliberately. Taking the place *out* of a composite line is guesswork that
 * this codebase tried three ways and got wrong three times: truncating at the qualifier lost
 * `Prepaid, Long Beach`; removing qualifiers wherever they sat turned `DUTY PAID BY ULTIMATE
 * CONSIGNEE` into a port called `CONSIGNEE`; bounding the party clause then swallowed the
 * `Hamburg` in `Collect by Shipper Hamburg`. Each fix opened the next hole, because the
 * document does not mark which words are the place and the app cannot know.
 *
 * So a remainder carrying freight wording supplies no place, and the caller says so instead
 * of guessing — the same trade the destination-country box makes, for the same reason: a
 * blank box a reviewer is told about beats a wrong one they are not.
 *
 * Punctuation alone is not a place either. `EXW.` leaves a full stop behind, and a box
 * reading `.` is worse than an empty one.
 */
export function isNamedPlace(namedPlace: string): boolean {
  return /[A-Za-z0-9]/.test(namedPlace) && !FREIGHT_QUALIFIER.test(namedPlace)
}
