import { describe, expect, it } from 'vitest'
import { canRestate, resolveReportingQuantity, restateQuantity, type QuantitySource } from './units'

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
    expect(restateQuantity(CABLES, 'KG')).toEqual({ unit: 'KG', quantity: 4.263, basis: 'net-weight' })
  })

  it('converts within a family from the document’s own figure, not the weight', () => {
    // 2 kg stated as 2 kg is 2000 g. The net weight is not consulted: the printed figure is
    // the one the document asserts, and the two can disagree on a line the join missed.
    const byWeight: QuantitySource = { quantity: 2, uom: 'KG', weightKg: 9.9 }
    expect(restateQuantity(byWeight, 'GM')).toEqual({ unit: 'GM', quantity: 2000, basis: 'source' })
    expect(restateQuantity(byWeight, 'T')).toEqual({ unit: 'T', quantity: 0.002, basis: 'source' })
    expect(restateQuantity({ quantity: 24, uom: 'PCS', weightKg: 1 }, 'DOZ')?.quantity).toBe(2)
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

describe('choosing the unit a commodity row is filed in', () => {
  it('defaults to what Schedule B requires', () => {
    expect(resolveReportingQuantity(CABLES, ['KG'])).toEqual({ unit: 'KG', quantity: 4.263, basis: 'net-weight' })
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
      quantity: 4.263,
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
    // The reconciliation warns about this row; it does not get a fabricated figure.
    expect(resolveReportingQuantity(WEIGHTLESS, ['KG'])).toEqual({ unit: 'NO', quantity: 12, basis: 'source' })
  })

  it('falls back when the code is not in the Census file at all', () => {
    expect(resolveReportingQuantity(CABLES, [])).toEqual({ unit: 'NO', quantity: 12, basis: 'source' })
  })
})
