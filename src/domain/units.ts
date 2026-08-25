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

/**
 * Units filed as a whole number of themselves.
 *
 * A kilogram quantity on an export declaration is a count of kilograms, not a measurement to
 * three places: 48 pieces weighing 4.499 kg are filed as `4`. The net weight the row is
 * proved against keeps every decimal it had — this is the figure that goes in the box, and
 * only that.
 *
 * `KG` alone, deliberately. Rounding a tonne quantity to a whole number would file almost
 * every shipment in this trade as `0`, and a gram quantity gains nothing from it.
 */
const WHOLE_UNITS = new Set(['KG'])

/** Whether `unit` is filed as a whole number. */
export function filedWhole(unit: string): boolean {
  const canonical = canonicalUnit(unit)
  return Boolean(canonical && WHOLE_UNITS.has(canonical))
}

/**
 * How a computed figure is turned into the one a form carries.
 *
 * Given the figure as the arithmetic produced it, and the rounding its *unit* would otherwise
 * apply. A unit filed whole ignores that rounding and takes the raw value, because the two
 * compose the wrong way round: three decimals applied first turns four ten-thousandths of a
 * kilogram into a nought, and the whole-number rule then has nothing left to tell it there
 * were goods there at all.
 */
type UnitRule = (raw: number, round: (value: number) => number, unit: string) => number

/**
 * The figure as its unit files it: whole where the unit is filed whole, as computed otherwise.
 *
 * Never zero for goods that are there. Rounding is what the unit requires, but a quantity box
 * reading `0` on a signed declaration states that nothing was shipped, and 30 grams of gasket
 * under a kilogram code is not nothing — it is a shipment the box cannot describe exactly, and
 * one is the nearest thing to the truth that the unit can hold. The reconciliation names every
 * row this applies to, because filing one kilogram for thirty grams overstates the weight
 * thirty-fold and only the filer can decide whether that is what should be declared.
 */
const asFiled: UnitRule = (raw, round, unit) => {
  if (!filedWhole(unit)) return round(raw)
  const whole = Math.round(raw)
  return whole === 0 && raw > 0 ? 1 : whole
}

/** The same figure with its unit's whole-number rule left off. */
const asComputed: UnitRule = (raw, round) => round(raw)

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
  return restate(source, targetUnit, asFiled)
}

/**
 * The same restatement with its unit's whole-number rule left off.
 *
 * One caller: the keying sheet, which shares a commodity row's whole figure out across the
 * finer rows it prints. Sharing out needs the exact figure each of those rows contributes —
 * rounding them first is what makes 3.719 and 3.719 into 4 and 4 under a row filing 7.
 *
 * Never write this to a form or a sheet. It is the input to a decision about whole units, not
 * a quantity anything files.
 */
export function restateExact(source: QuantitySource, targetUnit: string): RestatedQuantity | null {
  return restate(source, targetUnit, asComputed)
}

function restate(source: QuantitySource, targetUnit: string, applyUnitRule: UnitRule): RestatedQuantity | null {
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

  const filed = (raw: number, round: (value: number) => number): number => applyUnitRule(raw, round, target)

  // Already in the unit asked for. Ahead of the family tables so that a unit neither table
  // knows — square metres, litres, barrels — still restates onto itself, and `canRestate`
  // does not report the row's own unit as unavailable.
  if (target === from) return { unit, quantity: filed(source.quantity, (v) => roundPrecise(v, 3)), basis: 'source' }

  // An exact multiple within the same family. Preferred over the net weight even for weight
  // units: the document's own figure is the stated one.
  const sameFamily = [PER_KILOGRAM, PER_ITEM].find((family) => family[from] != null && family[target] != null)
  if (sameFamily) {
    const factor = sameFamily[target] / sameFamily[from]
    const raw = source.quantity * factor
    return { unit, quantity: filed(raw, (v) => roundScaled(v, factor)), basis: 'converted' }
  }

  // Reported by weight, counted on the invoice. This is the case the Schedule B unit warning
  // has always described: the row files the net weight, not the piece count.
  const perKilogram = PER_KILOGRAM[target]
  if (perKilogram != null && source.weightKg > 0) {
    const raw = source.weightKg * perKilogram
    return { unit, quantity: filed(raw, (v) => roundScaled(v, perKilogram)), basis: 'net-weight' }
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
  //
  // Filed whole where the unit is filed whole, like every other path out of here. A row whose
  // code is not in the Census file is still a row of kilograms, and one that files `7.438`
  // beside a neighbour filing `7` contradicts both the policy and the note on the screen.
  const unit = source.uom.trim().toUpperCase()
  return { unit, quantity: asFiled(source.quantity, (v) => roundPrecise(v, 3), unit), basis: 'source' }
}

/**
 * Whether a filed figure is a rounded form of what the row actually holds.
 *
 * Asked of the rule that would have done the rounding rather than inferred from the figures
 * on either side: 4000 GM and 4 KG differ in every digit and in the unit, and comparing them
 * reports a rounding that a conversion coming out exact never performed.
 *
 * Here rather than at each of the three surfaces that need it. The review screen explains the
 * figure, the reconciliation warns about it and the keying sheet prints a note beside it, and
 * three copies of "was this rounded" written three ways is how those three came to disagree
 * about one row. Adding a unit to `WHOLE_UNITS` should not mean finding them again.
 */
export function wasRoundedWhole(source: QuantitySource, unit: string, filed: number): boolean {
  if (!filedWhole(unit)) return false
  const exact = restateExact(source, unit)
  return exact !== null && exact.quantity !== filed
}

/**
 * Whether a row is filing the minimum its unit allows rather than what it holds.
 *
 * `asFiled` will not put a zero in a quantity box for goods that are there, so a row under
 * half a unit files one. That is the least wrong figure available, and it is still wrong:
 * one kilogram declared for thirty grams overstates the weight thirty-fold. Only the filer
 * can decide whether that is what should go on the form, so every row it applies to is named.
 *
 * Not `wasRoundedWhole`, which asks whether the filed figure differs from the restated one.
 * That restatement is itself rounded to three places, so half a gramme under a kilogram code
 * is already `0` before the whole-number rule touches it — and the row whose figure vanished
 * most completely would be the one reported as not having been rounded at all.
 *
 * The restatement is still consulted, for whether the unit is reachable: a row that fell back
 * to the document's own unit is not filing a rounded anything.
 */
export function filedAtMinimum(source: QuantitySource, unit: string, filed: number): boolean {
  if (!filedWhole(unit) || filed !== 1) return false
  const exact = restateExact(source, unit)
  return exact !== null && exact.quantity < 0.5
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  // Nudge before rounding so binary representation error (0.544 + 0.544 = 1.0879999…)
  // does not round the wrong way.
  return Math.round((value + Number.EPSILON * Math.sign(value) * factor) * factor) / factor
}

/**
 * `roundTo`, but safe past six decimal places.
 *
 * `roundTo`'s nudge is a fixed fraction of the *factor*, which is right for the two and three
 * decimal places every other caller uses and ruinous at nine: it grows to 2.2e-7, larger than
 * the precision it is protecting, and `roundTo(2, 9)` comes back as 2.000000222.
 *
 * This lives here, and `roundTo` is left exactly as it was, deliberately. `roundTo` rounds
 * every customs value and every reconciled total in the application, and changing how it
 * breaks a tie moves money: a value of `256.025` rounds to `256.02` under one nudge and
 * `256.03` under another, which is enough to put a line's value a cent away from the total
 * printed on the document it is being proved against. A quantity restatement is not a reason
 * to take that on.
 */
export function roundPrecise(value: number, decimals: number): number {
  const scaled = value * 10 ** decimals
  // Relative to the figure, so it stays below the last place whatever the precision — and
  // capped, so that at magnitudes where four ulps grow past a whole unit it cannot reach a
  // genuine rounding boundary and carry the figure over it.
  const nudge = Math.min(Math.abs(scaled) * Number.EPSILON * 4, 1e-6)
  return Math.round(scaled + Math.sign(scaled) * nudge) / 10 ** decimals
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
  return roundPrecise(value, Math.min(3 + extra, 9))
}
