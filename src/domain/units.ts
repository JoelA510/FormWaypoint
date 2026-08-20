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
  /** The quantity the document printed, in the unit it printed. */
  | 'source'
  /**
   * The document's own quantity, restated into another unit of the same kind — ten pieces as
   * `0.83333` dozen, two kilograms as `2000` grams.
   *
   * Told apart from `source` because it is a figure the document does not carry. Every
   * surface that explains a filed quantity has to be able to say "this was worked out"
   * rather than "as invoiced", or a derived number is presented as a transcribed one.
   */
  | 'converted'
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
  // Canonical forms decide what converts into what; the *filed* unit keeps the spelling it
  // was asked for. The Census file lists both `NO` and `PCS`, and 51 commodity numbers are
  // reported in `PCS` — writing `NO` on the form for those states a unit the file does not
  // list against that code, purely because the alias table exists to normalise what a
  // document prints.
  const unit = targetUnit.trim().toUpperCase()

  if (target === NO_QUANTITY_UNIT) return { unit, quantity: 0, basis: 'none' }

  // Already in the unit asked for. Ahead of the family tables so that a unit neither table
  // knows — square metres, litres, barrels — still restates onto itself, and `canRestate`
  // does not report the row's own unit as unavailable.
  if (target === from) return { unit, quantity: roundTo(source.quantity, 3), basis: 'source' }

  // An exact multiple within the same family. Preferred over the net weight even for weight
  // units: the document's own figure is the stated one.
  const sameFamily = [PER_KILOGRAM, PER_ITEM].find((family) => family[from] != null && family[target] != null)
  if (sameFamily) {
    const factor = sameFamily[target] / sameFamily[from]
    return { unit, quantity: roundScaled(source.quantity * factor, factor), basis: 'converted' }
  }

  // Reported by weight, counted on the invoice. This is the case the Schedule B unit warning
  // has always described: the row files the net weight, not the piece count.
  const perKilogram = PER_KILOGRAM[target]
  if (perKilogram != null && source.weightKg > 0) {
    return { unit, quantity: roundScaled(source.weightKg * perKilogram, perKilogram), basis: 'net-weight' }
  }

  return null
}

/**
 * Whether a row's net weight is what would supply `targetUnit`.
 *
 * Asked by the reconciliation so that a row missing the figure can be told what would fix it.
 * `PER_KILOGRAM` already knows which units come from a weight; a caller re-encoding that as a
 * hard-coded `'KG'` names the remedy for one of the three and sends the other two to the
 * classifier instead.
 */
export function derivesFromNetWeight(targetUnit: string): boolean {
  const target = canonicalUnit(targetUnit)
  return Boolean(target && PER_KILOGRAM[target] != null)
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
  // The document's own spelling, not its canonical form: this row is filing what the
  // document said, and saying so in the document's words is the honest label for it.
  return { unit: source.uom.trim().toUpperCase(), quantity: roundTo(source.quantity, 3), basis: 'source' }
}

export function roundTo(value: number, decimals: number): number {
  const scaled = value * 10 ** decimals
  // Nudge before rounding so binary representation error (0.544 + 0.544 = 1.0879999…) does
  // not round the wrong way.
  //
  // Proportional to the figure, not to the number of places. The nudge used to be
  // `EPSILON * 10 ** decimals`, which is a fixed 2.2e-16 of the *factor* — fine at three
  // places and ruinous past six, where it grows larger than the precision it is protecting:
  // `roundTo(2, 9)` came back as 2.000000222, and `restateQuantity` reaches nine places on a
  // gram-to-tonne conversion. Scaled to the value, it stays four ulps whatever the precision.
  return Math.round(scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON * 4) / 10 ** decimals
}

/**
 * Three decimals of the *source* unit's precision, wherever the target lands.
 *
 * Three decimals is the right precision for kilograms and the wrong one for every unit that
 * is a large multiple of the one being converted from. A 4.263 kg net weight rounded to
 * three places as tonnes is `0.004` — the shipment loses 6% of its declared weight on the way
 * into the box. Ten pieces as gross is `0.069`, a piece and a half out. So the places scale
 * with the conversion: dividing by a thousand buys three more of them, and a conversion that
 * does not shrink the figure keeps the plain three.
 */
function roundScaled(value: number, factor: number): number {
  const extra = factor > 0 && factor < 1 ? Math.ceil(-Math.log10(factor)) : 0
  return roundTo(value, Math.min(3 + extra, 9))
}
