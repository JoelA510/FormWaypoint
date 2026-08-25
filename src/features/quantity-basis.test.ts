/**
 * The line printed beside a filed quantity, saying where the figure came from.
 *
 * It is the only thing on the screen that accounts for a row filing `4` against an invoice
 * that says 4.499 — so a wording that calls a rounded figure "as invoiced" does not merely
 * read oddly, it tells the filer the box matches a document it does not match.
 */
import { describe, expect, it } from 'vitest'
import { basisNote } from './quantity-basis'
import type { SLILine } from '../domain/types'

const row = (over: Partial<SLILine>): SLILine =>
  ({
    scheduleB: '9031.90.0000',
    scheduleBUnit: 'KG',
    scheduleBUnits: ['KG'],
    sourceUom: 'KG',
    quantity: 7.438,
    weightKg: 7.438,
    reportingUom: 'KG',
    reportingQuantity: 7,
    reportingBasis: 'source',
    ...over,
  }) as SLILine

describe('why a filed quantity is what it is', () => {
  it('names the invoice figure a whole-unit row rounded away from', () => {
    // The document itself counts kilograms here, so the basis is `source` — and that is
    // exactly the case that read "As invoiced." beside a figure the invoice does not carry.
    expect(basisNote(row({}), false)).toBe('Invoiced as 7.438 KG, filed as whole KG.')
  })

  it('says "as invoiced" only where the figure really is the invoice’s', () => {
    expect(basisNote(row({ quantity: 7, reportingQuantity: 7 }), false)).toBe('As invoiced.')
    expect(
      basisNote(row({ scheduleBUnits: ['NO'], sourceUom: 'PCS', reportingUom: 'NO', quantity: 12, reportingQuantity: 12 }), false),
    ).toBe('As invoiced.')
  })

  it('names the net weight a weight-derived row rounded away from, and what the column is', () => {
    // Both. "Net weight 4.499 kg, filed as whole KG" alone drops the one clause that tells a
    // reviewer the column is not a piece count, on the rows hardest to account for.
    expect(basisNote(row({ sourceUom: 'PCS', quantity: 48, reportingBasis: 'net-weight', weightKg: 4.499, reportingQuantity: 4 }), false))
      .toBe('Net weight — this code is reported by weight, not by the piece. Net weight 4.499 kg, filed as whole KG.')
  })

  it('says only what the column is where the weight went in unrounded', () => {
    expect(basisNote(row({ sourceUom: 'PCS', quantity: 48, reportingBasis: 'net-weight', weightKg: 4, reportingQuantity: 4 }), false))
      .toBe('Net weight — this code is reported by weight, not by the piece.')
  })

  it('says a converted whole-unit figure was both converted and rounded', () => {
    expect(basisNote(row({ sourceUom: 'GM', quantity: 7438, reportingBasis: 'converted', reportingQuantity: 7 }), false))
      .toBe('Converted from 7438 GM, filed as whole KG.')
  })

  it('claims no rounding where the conversion came out exact', () => {
    // 4000 g is 4 kg on the nose. `4000` and `4` differ in every digit and in the unit, so a
    // comparison between them reported a rounding that never happened.
    expect(basisNote(row({ sourceUom: 'GM', quantity: 4000, reportingBasis: 'converted', reportingQuantity: 4 }), false))
      .toBe('Converted from 4000 GM.')
  })

  it('says a floored row overstates, as the other two surfaces do', () => {
    // Half a gramme under a kilogram code files 1. The reconciliation and the keying sheet
    // both say that figure is larger than the goods; this is the surface that exists to
    // account for the figure, so it cannot describe it as an ordinary rounding.
    const tiny = row({ sourceUom: 'PCS', quantity: 1, weightKg: 0.0004, reportingBasis: 'net-weight', reportingQuantity: 1 })
    expect(basisNote(tiny, false)).toBe(
      'Net weight — this code is reported by weight, not by the piece. Net weight 0.0004 kg, filed as 1 KG, ' +
        'the least this unit can hold — it overstates the row.',
    )
  })

  it('leaves a unit that is not filed whole alone', () => {
    const grams = row({ scheduleBUnits: ['GM'], reportingUom: 'GM', sourceUom: 'KG', quantity: 7.438, reportingBasis: 'converted', reportingQuantity: 7438 })
    expect(basisNote(grams, false)).toBe('Converted from 7.438 KG.')
  })

  it('says a figure was rounded even where it cannot say what the unit should be', () => {
    // A commodity number the Census file does not list still files whole kilograms. This is
    // the only account anywhere of the box holding 7 against an invoice reading 7.438, and it
    // used to return before it had asked whether there had been any rounding at all.
    expect(basisNote(row({ scheduleBUnits: [] }), false)).toBe(
      'Schedule B unit unknown — filing the invoice figure. Invoiced as 7.438 KG, filed as whole KG.',
    )
    // And where the unit is off the required one, by choice or by limit.
    const off = row({ scheduleBUnits: ['NO'] })
    expect(basisNote(off, true)).toBe(
      'Filed in KG by your choice; Schedule B requires NO. Invoiced as 7.438 KG, filed as whole KG.',
    )
    expect(basisNote(off, false)).toMatch(/can only state KG\. Invoiced as 7\.438 KG, filed as whole KG\./)
  })

  it('names the weight, not the piece count, on a row whose kilograms came from the weight', () => {
    // A filer who chose KG for a code reported in NO: the 4 came off the 4.499 kg net weight,
    // and calling it the invoice's 12 pieces attributes the box to a figure that had nothing
    // to do with it.
    const chosen = row({
      scheduleBUnits: ['NO'],
      sourceUom: 'PCS',
      quantity: 12,
      weightKg: 4.499,
      reportingBasis: 'net-weight',
      reportingQuantity: 4,
    })
    expect(basisNote(chosen, true)).toBe(
      'Filed in KG by your choice; Schedule B requires NO. Net weight 4.499 kg, filed as whole KG.',
    )
  })

  it('adds nothing to those branches where no rounding happened', () => {
    expect(basisNote(row({ scheduleBUnits: [], quantity: 7 }), false)).toBe(
      'Schedule B unit unknown — filing the invoice figure.',
    )
  })

  it('still tells a unit that was chosen away from one that was not reachable', () => {
    const off = row({ scheduleBUnits: ['KG'], reportingUom: 'PCS', sourceUom: 'PCS', quantity: 12, reportingQuantity: 12 })
    expect(basisNote(off, true)).toMatch(/by your choice/)
    expect(basisNote(off, false)).toMatch(/can only state PCS/)
  })
})
