/**
 * Why a filed quantity is the figure it is, in one line beside it.
 *
 * Its own module rather than a helper inside the review screen: it is the only account
 * anywhere of a row filing `4` against an invoice that reads 4.499, which makes it worth
 * testing directly, and a component file that exports a function loses fast refresh.
 */
import { canonicalUnit } from '../domain/schedule-b'
import { filedWhole, restateExact } from '../domain/units'
import type { SLILine } from '../domain/types'

/**
 * Why the filed figure is what it is, in one line beside it.
 *
 * A row off the required unit says whether that was a choice or a limit, because the two
 * need different things done about them: one is somebody's decision to reconsider, the other
 * is a missing weight or a wrong classification.
 */
export function basisNote(line: SLILine, byChoice: boolean): string {
  if (line.reportingBasis === 'none') return 'Schedule B reports this code with no quantity.'
  // Whether the box was rounded, asked of the rule that would have rounded it rather than
  // inferred from the figures on either side. The two are not comparable on a converted row —
  // 4000 GM and 4 KG differ in every digit and in the unit — so comparing them said "filed as
  // whole KG" about a conversion that came out exact.
  //
  // Worked out before the branches below and appended to whichever one answers, because a row
  // is rounded or not independently of what Schedule B has to say about its unit. A row whose
  // commodity number is not in the dataset at all still files whole kilograms, and saying only
  // "filing the invoice figure" beside a `7` the invoice does not carry is this screen telling
  // the filer the box matches a document it does not match.
  const rounded = wasRounded(line)
  const whole = rounded ? ` Invoiced as ${line.quantity} ${line.sourceUom}, filed as whole ${line.reportingUom}.` : ''

  if (!line.scheduleBUnits.length) return `Schedule B unit unknown — filing the invoice figure.${whole}`
  // Compared canonically. `PCS` and `NO` are one unit, and a row filing the document's
  // spelling of the unit its code requires has not departed from Schedule B — the check
  // beside this panel compares the same way and would say the row passes.
  const filed = canonicalUnit(line.reportingUom)
  if (!line.scheduleBUnits.some((unit) => canonicalUnit(unit) === filed)) {
    const required = line.scheduleBUnits.join(' or ')
    return byChoice
      ? `Filed in ${line.reportingUom} by your choice; Schedule B requires ${required}.${whole}`
      : `Schedule B requires ${required}; this row can only state ${line.reportingUom}.${whole}`
  }
  if (line.reportingBasis === 'net-weight') {
    // Named alongside the figure where the two differ. A row showing `4 KG` beside a net
    // weight of 4.499 kg looks like one of them is a typo until this says which is which.
    return rounded
      ? `Net weight ${line.weightKg} kg, filed as whole ${line.reportingUom}.`
      : 'Net weight — this code is reported by weight, not by the piece.'
  }
  // Not "as invoiced": the document carries neither this figure nor this unit.
  if (line.reportingBasis === 'converted') {
    return rounded
      ? `Converted from ${line.quantity} ${line.sourceUom}, filed as whole ${line.reportingUom}.`
      : `Converted from ${line.quantity} ${line.sourceUom}.`
  }
  // And as true of an invoice already counting kilograms, which files its own figure rounded
  // whole, as of one whose kilograms were read off the net weight.
  return rounded
    ? `Invoiced as ${line.quantity} ${line.sourceUom}, filed as whole ${line.reportingUom}.`
    : 'As invoiced.'
}

/**
 * Whether the filed figure is the restated one or a rounded form of it.
 *
 * `restateExact` is the same restatement with only its unit's whole-number rule left off, so
 * the difference between the two *is* the rounding and nothing else.
 */
function wasRounded(line: SLILine): boolean {
  if (!filedWhole(line.reportingUom)) return false
  const exact = restateExact(
    { quantity: line.quantity, uom: line.sourceUom, weightKg: line.weightKg },
    line.reportingUom,
  )
  return exact !== null && exact.quantity !== line.reportingQuantity
}
