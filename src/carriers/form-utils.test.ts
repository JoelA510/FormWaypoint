/**
 * Writing a value into a form field.
 *
 * `formatQuantity` decides what number appears in a quantity box on a signed export
 * declaration, so what it does with a figure it cannot render faithfully is the whole test.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, formatQuantity, loadForm, parseLooseDate, selectRadio, setCheckBox, setText } from './form-utils'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

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

/**
 * The forms are somebody else's files and their boxes have their own rules. A box that refuses
 * a value is a note for the filer about that box, not a reason to hand them no declaration.
 */
describe('a box that will not take what it is given', () => {
  it('warns and carries on rather than abandoning the form', async () => {
    // The CEVA `ZipCode` box carries `/MaxLen 5`, so a company profile holding a ZIP+4 makes
    // pdf-lib refuse the write. Everything else on the declaration is still worth having.
    const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates/ceva-sli.pdf')))
    const { form } = await loadForm(bytes)
    const ctx = createContext(form)

    setText(ctx, 'ZipCode', '94588-1234')
    setText(ctx, 'Ultimate Consignee', 'Written all the same')

    expect(ctx.written['ZipCode']).toBeUndefined()
    expect(ctx.written['Ultimate Consignee']).toBe('Written all the same')
    expect(ctx.warnings).toHaveLength(1)
    expect(ctx.warnings[0]).toMatch(/ZipCode/)
    expect(ctx.warnings[0]).toMatch(/94588-1234/)
  })

  it('still says so when the box is not there at all', async () => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates/ceva-sli.pdf')))
    const { form } = await loadForm(bytes)
    const ctx = createContext(form)
    setText(ctx, 'No Such Box', 'value')
    setCheckBox(ctx, 'No Such Tick', true)
    selectRadio(ctx, 'No Such Group', 'YES')
    expect(ctx.warnings).toHaveLength(3)
    expect(ctx.warnings.join(' ')).toMatch(/no field named "No Such Box"/)
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
