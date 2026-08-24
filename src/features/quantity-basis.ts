/**
 * Why a filed quantity is the figure it is, in one line beside it.
 *
 * Its own module rather than a helper inside the review screen: it is the only account
 * anywhere of a row filing `4` against an invoice that reads 4.499, which makes it worth
 * testing directly, and a component file that exports a function loses fast refresh.
 */
import { canonicalUnit } from '../domain/schedule-b'
import { filedWhole } from '../domain/units'
import type { SLILine } from '../domain/types'

/**
 * Why the filed figure is what it is, in one line beside it.
 *
 * A row off the required unit says whether that was a choice or a limit, because the two
 * need different things done about them: one is somebody's decision to reconsider, the other
 * is a missing weight or a wrong classification.
 */
export function basisNote(line: SLILine, byChoice: boolean): string {
  if (!line.scheduleBUnits.length) return 'Schedule B unit unknown — filing the invoice figure.'
  if (line.reportingBasis === 'none') return 'Schedule B reports this code with no quantity.'
  // Compared canonically. `PCS` and `NO` are one unit, and a row filing the document's
  // spelling of the unit its code requires has not departed from Schedule B — the check
  // beside this panel compares the same way and would say the row passes.
  const filed = canonicalUnit(line.reportingUom)
  if (!line.scheduleBUnits.some((unit) => canonicalUnit(unit) === filed)) {
    const required = line.scheduleBUnits.join(' or ')
    return byChoice
      ? `Filed in ${line.reportingUom} by your choice; Schedule B requires ${required}.`
      : `Schedule B requires ${required}; this row can only state ${line.reportingUom}.`
  }
  // Named alongside the figure wherever the two differ, on every basis and not just the
  // weight-derived one. A row showing `4 KG` beside a document reading 4.499 looks like one
  // of them is a typo until the line beside it says which is which — and that is as true of
  // an invoice already counting kilograms, which files its own figure rounded whole, as it
  // is of one whose kilograms were read off the net weight.
  const whole = filedWhole(line.reportingUom)
  if (line.reportingBasis === 'net-weight') {
    return whole && line.weightKg !== line.reportingQuantity
      ? `Net weight ${line.weightKg} kg, filed as whole ${line.reportingUom}.`
      : 'Net weight — this code is reported by weight, not by the piece.'
  }
  // Not "as invoiced": the document carries neither this figure nor this unit.
  if (line.reportingBasis === 'converted') {
    return whole
      ? `Converted from ${line.quantity} ${line.sourceUom}, filed as whole ${line.reportingUom}.`
      : `Converted from ${line.quantity} ${line.sourceUom}.`
  }
  return whole && line.quantity !== line.reportingQuantity
    ? `Invoiced as ${line.quantity} ${line.sourceUom}, filed as whole ${line.reportingUom}.`
    : 'As invoiced.'
}
