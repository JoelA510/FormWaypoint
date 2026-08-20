/**
 * Unit conversions used on the output side.
 *
 * One definition, because two of them is how a shipment ends up weighing two different
 * things: the keying sheet and the CEVA package summary describe the same cartons, and a
 * reviewer comparing them should not find the pounds disagreeing in the third digit.
 *
 * The same reasoning applies to the *reported* quantity. Several Schedule B numbers are
 * reported in kilograms rather than pieces, so the figure a commodity row files is not
 * always the figure the invoice printed — and the SLI, the keying sheet and the review
 * screen must all restate it the same way, from the same rule, or the form and the sheet
 * prepared for one shipment disagree about how much of it there is.
 */
import { canonicalUnit } from './schedule-b'

/** The international avoirdupois pound, exactly 0.45359237 kg. */
export const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

/**
 * Census units that are a fixed multiple of one kilogram, and how many of them a kilogram is.
 *
 * Deliberately short. `CKG` and `CGM` are *content* kilograms and grams — the mass of an
 * active ingredient, not of the goods — and no arithmetic on a net weight produces one, so
 * they are absent and a code requiring them falls back to what the document states.
 */
const PER_KILOGRAM: Record<string, number> = { KG: 1, GM: 1000, T: 0.001 }

/**
 * Census units that are a fixed multiple of one item, and how many of them one item is.
 *
 * Pairs (`PRS`, `DPR`) are absent for the same reason as content weights: two of a thing is
 * only one pair if the things are sold in pairs, which the invoice does not say.
 */
const PER_ITEM: Record<string, number> = { NO: 1, DOZ: 1 / 12, GRS: 1 / 144, HUN: 1 / 100, THS: 1 / 1000 }

/**
 * The Census unit meaning "report no quantity for this code". Eight codes carry it.
 */
export const NO_QUANTITY_UNIT = 'X'

/** Where a filed quantity came from. Shown beside the figure wherever it is displayed. */
export type QuantityBasis =
  /** The quantity the document printed, in the unit it printed (or an exact multiple of it). */
  | 'source'
  /** The net weight from the packing list, because the code is reported by weight. */
  | 'net-weight'
  /** The code requires no quantity at all. */
  | 'none'

export interface RestatedQuantity {
  /** Canonical unit the quantity is now expressed in. */
  unit: string
  quantity: number
  basis: QuantityBasis
}

/** What a commodity row knows about itself, before any unit is chosen. */
export interface QuantitySource {
  /** Quantity as the document reports it. */
  quantity: number
  /** Unit the document reports that quantity in, in the document's own spelling. */
  uom: string
  /** Net weight in kilograms, or 0 when the shipment documents establish none. */
  weightKg: number
}

/**
 * Restate a commodity row's quantity in `targetUnit`, or `null` when nothing on the row
 * supports the figure.
 *
 * Returning null is the whole point of this function. A code reported in kilograms against a
 * `vendor-b` line — a layout that prints no weights at all — has no kilogram figure to file,
 * and inventing one from a piece count would be a misdeclaration dressed up as a conversion.
 * The caller keeps what the document said and the reconciliation says why.
 */
export function restateQuantity(source: QuantitySource, targetUnit: string): RestatedQuantity | null {
  const target = canonicalUnit(targetUnit)
  if (!target) return null
  const from = canonicalUnit(source.uom) ?? ''

  if (target === NO_QUANTITY_UNIT) return { unit: target, quantity: 0, basis: 'none' }

  // Already in the unit asked for. Ahead of the family tables so that a unit neither table
  // knows — square metres, litres, barrels — still restates onto itself, and `canRestate`
  // does not report the row's own unit as unavailable.
  if (target === from) return { unit: target, quantity: round(source.quantity), basis: 'source' }

  // Same unit, or an exact multiple of it within the same family. Preferred over the net
  // weight even for weight units: the document's own figure is the stated one.
  const sameFamily = [PER_KILOGRAM, PER_ITEM].find((family) => family[from] != null && family[target] != null)
  if (sameFamily) {
    return { unit: target, quantity: round(source.quantity * (sameFamily[target] / sameFamily[from])), basis: 'source' }
  }

  // Reported by weight, counted on the invoice. This is the case the Schedule B unit warning
  // has always described: the row files the net weight, not the piece count.
  const perKilogram = PER_KILOGRAM[target]
  if (perKilogram != null && source.weightKg > 0) {
    return { unit: target, quantity: round(source.weightKg * perKilogram), basis: 'net-weight' }
  }

  return null
}

/** Whether a quantity can be stated in `targetUnit` at all, without computing it. */
export function canRestate(source: QuantitySource, targetUnit: string): boolean {
  return restateQuantity(source, targetUnit) !== null
}

/**
 * The unit a row will actually be filed in.
 *
 * `accepted` is what the Census file requires for the code, in its own order; the first one
 * the row can actually state wins, which is what makes "file this in the Schedule B unit"
 * the default rather than a choice somebody has to remember to make. An explicit `chosen`
 * unit beats all of them — and is still checked, because a choice that cannot be stated is
 * not a choice, it is a blank box.
 *
 * Falls back to the document's own unit and quantity, which is what the form said before any
 * of this existed. The reconciliation reports that fallback rather than leaving it silent.
 */
export function resolveReportingQuantity(
  source: QuantitySource,
  accepted: string[],
  chosen?: string | null,
): RestatedQuantity {
  if (chosen) {
    const restated = restateQuantity(source, chosen)
    if (restated) return restated
  }
  for (const unit of accepted) {
    const restated = restateQuantity(source, unit)
    if (restated) return restated
  }
  return { unit: canonicalUnit(source.uom) ?? '', quantity: round(source.quantity), basis: 'source' }
}

/**
 * Three decimals, matching how weights are carried everywhere else in the pipeline.
 *
 * Nudged before rounding for the same reason `roundTo` is: a sum of binary fractions lands a
 * hair below the midpoint and rounds the wrong way.
 */
function round(value: number): number {
  const factor = 1000
  return Math.round((value + Number.EPSILON * Math.sign(value) * factor) * factor) / factor
}
