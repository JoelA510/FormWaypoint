/**
 * Writing a value into a form field.
 *
 * `formatQuantity` decides what number appears in a quantity box on a signed export
 * declaration, so what it does with a figure it cannot render faithfully is the whole test.
 */
import { describe, expect, it } from 'vitest'
import { formatQuantity, parseLooseDate } from './form-utils'

describe('formatting a quantity for a form box', () => {
  it('never writes scientific notation, float noise or NaN into a box', () => {
    // Whatever reaches a PDF field is what a person signs. `String()` renders 4.263e-7 in
    // scientific notation and 0.1 + 0.2 as seventeen digits.
    expect(formatQuantity(4.263e-7)).toBe('0.000000426')
    expect(formatQuantity(0.1 + 0.2)).toBe('0.300')
    expect(formatQuantity(Number.NaN)).toBe('')
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('keeps three decimals as a floor and the conversion’s precision as the ceiling', () => {
    expect(formatQuantity(10)).toBe('10')
    expect(formatQuantity(1.5)).toBe('1.500')
    expect(formatQuantity(4.263)).toBe('4.263')
    expect(formatQuantity(0.004263)).toBe('0.004263')
    expect(formatQuantity(0.83333)).toBe('0.83333')
  })
})

describe('reading a loose date', () => {
  it('rejects anything that is not a real calendar date', () => {
    // Guarded here because an unparseable date reaches the form unformatted otherwise.
    expect(parseLooseDate('2026-07-20')).toEqual([2026, 7, 20])
    expect(parseLooseDate('July 20, 2026')).toEqual([2026, 7, 20])
    expect(parseLooseDate('25-12-2026')).toBeNull()
    expect(parseLooseDate('')).toBeNull()
  })
})
