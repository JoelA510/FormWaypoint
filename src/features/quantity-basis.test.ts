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

  it('names the net weight a weight-derived row rounded away from', () => {
    expect(basisNote(row({ sourceUom: 'PCS', quantity: 48, reportingBasis: 'net-weight', weightKg: 4.499, reportingQuantity: 4 }), false))
      .toBe('Net weight 4.499 kg, filed as whole KG.')
  })

  it('says a converted whole-unit figure was both converted and rounded', () => {
    expect(basisNote(row({ sourceUom: 'GM', quantity: 7438, reportingBasis: 'converted', reportingQuantity: 7 }), false))
      .toBe('Converted from 7438 GM, filed as whole KG.')
  })

  it('leaves a unit that is not filed whole alone', () => {
    const grams = row({ scheduleBUnits: ['GM'], reportingUom: 'GM', sourceUom: 'KG', quantity: 7.438, reportingBasis: 'converted', reportingQuantity: 7438 })
    expect(basisNote(grams, false)).toBe('Converted from 7.438 KG.')
  })

  it('still tells a unit that was chosen away from one that was not reachable', () => {
    const off = row({ scheduleBUnits: ['KG'], reportingUom: 'PCS', sourceUom: 'PCS', quantity: 12, reportingQuantity: 12 })
    expect(basisNote(off, true)).toMatch(/by your choice/)
    expect(basisNote(off, false)).toMatch(/can only state PCS/)
  })
})
