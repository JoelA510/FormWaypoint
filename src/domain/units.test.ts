import { describe, expect, it } from 'vitest'
import {
  canRestate,
  derivesFromNetWeight,
  filedWhole,
  resolveReportingQuantity,
  restateQuantity,
  roundPrecise,
  roundTo,
  type QuantitySource,
} from './units'

/** A cable line: 12 pieces weighing 4.263 kg, which is the shape the KG codes arrive in. */
const CABLES: QuantitySource = { quantity: 12, uom: 'PCS', weightKg: 4.263 }

/** The `vendor-b` shape: a real quantity and no weight anywhere on the document. */
const WEIGHTLESS: QuantitySource = { quantity: 12, uom: 'PCS', weightKg: 0 }

describe('restating a quantity in the unit Schedule B requires', () => {
  it('keeps the printed figure when the units already agree', () => {
    // `PCS` on the invoice and `NO` in the Census file are the same unit written twice.
    expect(restateQuantity(CABLES, 'NO')).toEqual({ unit: 'NO', quantity: 12, basis: 'source' })
    expect(restateQuantity({ quantity: 5, uom: 'EA', weightKg: 1 }, 'NO')?.quantity).toBe(5)
  })

  it('files the net weight for a code reported by weight', () => {
    // Whole kilograms: see the block on filing units below.
    expect(restateQuantity(CABLES, 'KG')).toEqual({ unit: 'KG', quantity: 4, basis: 'net-weight' })
  })

  it('converts within a family from the document’s own figure, not the weight', () => {
    // 2 kg stated as 2 kg is 2000 g. The net weight is not consulted: the printed figure is
    // the one the document asserts, and the two can disagree on a line the join missed.
    const byWeight: QuantitySource = { quantity: 2, uom: 'KG', weightKg: 9.9 }
    expect(restateQuantity(byWeight, 'GM')).toEqual({ unit: 'GM', quantity: 2000, basis: 'converted' })
    expect(restateQuantity(byWeight, 'T')).toEqual({ unit: 'T', quantity: 0.002, basis: 'converted' })
    expect(restateQuantity({ quantity: 24, uom: 'PCS', weightKg: 1 }, 'DOZ')?.quantity).toBe(2)
  })

  it('calls a converted figure converted, never "as invoiced"', () => {
    // The document carries neither 0.83333 nor the word DOZ. Every surface that explains a
    // filed quantity reads this field to decide whether to vouch for it as transcribed.
    expect(restateQuantity({ quantity: 10, uom: 'PCS', weightKg: 1 }, 'DOZ')?.basis).toBe('converted')
    // An identity restatement genuinely is the invoice's own figure.
    expect(restateQuantity({ quantity: 10, uom: 'PCS', weightKg: 1 }, 'NO')?.basis).toBe('source')
  })

  it('keeps enough decimals that a down-scaled figure is still the same quantity', () => {
    // Three decimals is right for kilograms and wrong for every unit that is a large
    // multiple of the one being converted from. `0.004` tonnes is 4 kg — a 4.263 kg shipment
    // would lose 6% of its declared weight on the way into the box.
    expect(restateQuantity({ quantity: 12, uom: 'PCS', weightKg: 4.263 }, 'T')?.quantity).toBe(0.004263)
    expect(restateQuantity({ quantity: 10, uom: 'PCS', weightKg: 1 }, 'DOZ')?.quantity).toBe(0.83333)
    expect(restateQuantity({ quantity: 5, uom: 'PCS', weightKg: 1 }, 'GRS')?.quantity).toBe(0.034722)
    expect(restateQuantity({ quantity: 5, uom: 'PCS', weightKg: 1 }, 'THS')?.quantity).toBe(0.005)
    // Scaling a figure up needs no extra places.
    expect(restateQuantity({ quantity: 2, uom: 'KG', weightKg: 2 }, 'GM')?.quantity).toBe(2000)
  })

  it('files the unit in the spelling it was asked for, not its canonical form', () => {
    // The Census file lists both `NO` and `PCS`, and 51 commodity numbers are reported in
    // `PCS`. Filing `NO` against one of those states a unit the file does not list for it —
    // the alias table exists to normalise what a *document* prints, not what the file requires.
    expect(restateQuantity({ quantity: 5, uom: 'EA', weightKg: 1 }, 'PCS')?.unit).toBe('PCS')
    expect(restateQuantity({ quantity: 5, uom: 'PCS', weightKg: 1 }, 'NO')?.unit).toBe('NO')
  })

  it('refuses rather than inventing a figure nothing on the row supports', () => {
    // No weight anywhere, so there is no kilogram figure to file. Multiplying a piece count
    // by nothing at all would be a misdeclaration wearing a conversion's clothes.
    expect(restateQuantity(WEIGHTLESS, 'KG')).toBeNull()
    // A weight cannot be counted back into pieces: how heavy one of them is is not on the
    // document, and 4.263 kg is not 4.263 cables.
    expect(restateQuantity({ quantity: 4.263, uom: 'KG', weightKg: 4.263 }, 'NO')).toBeNull()
    // Content kilograms are the mass of an active ingredient, which no shipping weight gives.
    expect(restateQuantity(CABLES, 'CKG')).toBeNull()
    // Pairs are only pairs if the goods are sold in pairs, and the invoice does not say.
    expect(restateQuantity(CABLES, 'PRS')).toBeNull()
    expect(canRestate(CABLES, 'KG')).toBe(true)
    expect(canRestate(WEIGHTLESS, 'KG')).toBe(false)
  })

  it('reports no quantity for the codes that require none', () => {
    expect(restateQuantity(CABLES, 'X')).toEqual({ unit: 'X', quantity: 0, basis: 'none' })
  })

  it('restates a unit neither family knows onto itself', () => {
    // Square metres, litres, barrels: nothing converts them, but a row already reported in
    // one is already in the unit its code asks for, and must not be called unavailable.
    const area: QuantitySource = { quantity: 3.5, uom: 'M2', weightKg: 1 }
    expect(restateQuantity(area, 'M2')).toEqual({ unit: 'M2', quantity: 3.5, basis: 'source' })
    expect(canRestate(area, 'M2')).toBe(true)
    expect(canRestate(area, 'L')).toBe(false)
  })
})

describe('units that are filed whole', () => {
  it('files a kilogram quantity as a whole number of kilograms', () => {
    // A kilogram quantity on a declaration is a count of kilograms. 48 pieces weighing
    // 4.499 kg are filed as 4.
    expect(restateQuantity({ quantity: 48, uom: 'PCS', weightKg: 4.499 }, 'KG')?.quantity).toBe(4)
    expect(restateQuantity({ quantity: 48, uom: 'PCS', weightKg: 4.5 }, 'KG')?.quantity).toBe(5)
    expect(restateQuantity({ quantity: 48, uom: 'PCS', weightKg: 127.5 }, 'KG')?.quantity).toBe(128)
    // Including where the row was already counted in kilograms, or converted into them.
    expect(restateQuantity({ quantity: 4.499, uom: 'KG', weightKg: 4.499 }, 'KG')?.quantity).toBe(4)
    expect(restateQuantity({ quantity: 4499, uom: 'GM', weightKg: 0 }, 'KG')?.quantity).toBe(4)
  })

  it('leaves the net weight the row is proved against alone', () => {
    // Only the figure in the box is whole. The reconciliation proves the row against the
    // weight the packing list states, to the gramme.
    const restated = restateQuantity({ quantity: 48, uom: 'PCS', weightKg: 4.499 }, 'KG')
    expect(restated?.quantity).toBe(4)
    expect(filedWhole('KG')).toBe(true)
  })

  it('files whole on the fallback path too', () => {
    // A code the Census file has never heard of still files a row of kilograms. One row
    // filing 7.438 beside a neighbour filing 7 contradicts both the policy and the note the
    // review screen puts under the figure.
    const inKg: QuantitySource = { quantity: 7.438, uom: 'KG', weightKg: 7.438 }
    expect(resolveReportingQuantity(inKg, [])).toEqual({ unit: 'KG', quantity: 7, basis: 'source' })
  })

  it('does not round the units that whole numbers would destroy', () => {
    // A tonne quantity rounded whole would file almost every shipment in this trade as 0,
    // and a gram quantity gains nothing from it.
    expect(filedWhole('T')).toBe(false)
    expect(filedWhole('GM')).toBe(false)
    expect(filedWhole('NO')).toBe(false)
    expect(restateQuantity({ quantity: 12, uom: 'PCS', weightKg: 4.263 }, 'T')?.quantity).toBe(0.004263)
  })
})

describe('rounding', () => {
  it('rounds cleanly past six decimal places', () => {
    // `roundTo`'s nudge is a fixed fraction of the factor, which past six places grows larger
    // than the precision it protects: `roundTo(2, 9)` is 2.000000222, and `restateQuantity`
    // reaches nine places on a gram-to-tonne conversion.
    expect(roundPrecise(2, 9)).toBe(2)
    expect(restateQuantity({ quantity: 2000000, uom: 'GM', weightKg: 0 }, 'T')?.quantity).toBe(2)
    // And at the magnitudes where a relative nudge would itself grow past a whole unit.
    expect(roundPrecise(563000, 9)).toBe(563000)
    expect(roundPrecise(12345678, 9)).toBe(12345678)
    // While still doing the job the nudge is there for.
    expect(roundPrecise(0.544 + 0.544, 3)).toBe(1.088)
    expect(roundPrecise(0.1 + 0.2, 3)).toBe(0.3)
  })

  it('leaves `roundTo` alone, because it rounds money', () => {
    // Every customs value and every reconciled total goes through `roundTo`. Changing how it
    // breaks a tie moves a line's value by a cent, which is enough to put it a cent away from
    // the total printed on the document it is being proved against — so the quantity
    // restatement got its own function rather than editing this one.
    expect(roundTo(256.025, 2)).toBe(256.02)
    expect(roundTo(0.544 + 0.544, 3)).toBe(1.088)
  })
})

describe('which units come from the net weight', () => {
  it('names every weight-derived unit, not just kilograms', () => {
    // The reconciliation asks this to tell a filer that a missing weight is what is wrong.
    // Hard-coded to `KG`, it sent the 247 tonne codes and the gram codes to the classifier
    // instead.
    expect(derivesFromNetWeight('KG')).toBe(true)
    expect(derivesFromNetWeight('T')).toBe(true)
    expect(derivesFromNetWeight('GM')).toBe(true)
    expect(derivesFromNetWeight('NO')).toBe(false)
    expect(derivesFromNetWeight('CKG')).toBe(false)
    expect(derivesFromNetWeight('')).toBe(false)
  })
})

describe('choosing the unit a commodity row is filed in', () => {
  it('defaults to what Schedule B requires', () => {
    expect(resolveReportingQuantity(CABLES, ['KG'])).toEqual({ unit: 'KG', quantity: 4, basis: 'net-weight' })
    expect(resolveReportingQuantity(CABLES, ['NO'])).toEqual({ unit: 'NO', quantity: 12, basis: 'source' })
  })

  it('takes the first accepted unit the row can actually state', () => {
    // `NO+KG`: both are acceptable to AES, and the invoice's own count is the first listed.
    expect(resolveReportingQuantity(CABLES, ['NO', 'KG']).unit).toBe('NO')
    // The same code on a document that counts kilograms goes the other way, because `NO` is
    // not reachable from a weight.
    const byWeight: QuantitySource = { quantity: 4.263, uom: 'KG', weightKg: 4.263 }
    expect(resolveReportingQuantity(byWeight, ['NO', 'KG']).unit).toBe('KG')
  })

  it('lets an explicit choice beat the default', () => {
    expect(resolveReportingQuantity(CABLES, ['NO', 'KG'], 'KG')).toEqual({
      unit: 'KG',
      quantity: 4,
      basis: 'net-weight',
    })
  })

  it('ignores a choice the row cannot state, rather than filing a blank', () => {
    // Choosing kilograms for goods with no weight is not a choice, it is an empty box.
    expect(resolveReportingQuantity(WEIGHTLESS, ['NO'], 'KG')).toEqual({
      unit: 'NO',
      quantity: 12,
      basis: 'source',
    })
  })

  it('falls back to what the document printed when no required unit is reachable', () => {
    // The reconciliation warns about this row; it does not get a fabricated figure. And it
    // falls back in the document's own words — `PCS`, which is what it says.
    expect(resolveReportingQuantity(WEIGHTLESS, ['KG'])).toEqual({ unit: 'PCS', quantity: 12, basis: 'source' })
  })

  it('falls back when the code is not in the Census file at all', () => {
    expect(resolveReportingQuantity(CABLES, [])).toEqual({ unit: 'PCS', quantity: 12, basis: 'source' })
  })
})
