import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCipl } from '../cipl/parse-vendor-a'
import { readFixture } from '../../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { reconcile, resolveDestinationCountry, selectDocumentSet } from '.'
import type { ParsedCipl, SLILine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Regression fixtures. Expected values come from the *completed, manually prepared* SLIs
 * for these three shipments, so a pass means the tool reproduces what a human filed.
 *
 * One deliberate exception is documented in the classification test below.
 */

const parsed: Record<string, ParsedCipl> = {}
let scheduleB: ScheduleBIndex

/** No compliance attribute is inferred; these mirror the Nippon adapter defaults. */
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

beforeAll(async () => {
  parsed.vendorA1 = await parseCipl('vendorA1', readFixture('vendorA1'))
  parsed.vendorA2 = await parseCipl('vendorA2', readFixture('vendorA2'))
  parsed.vendorA3 = await parseCipl('vendorA3', readFixture('vendorA3'))
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8'))
  scheduleB = createScheduleBIndex(raw)
}, 60_000)

const byCode = (lines: SLILine[], code: string) => lines.find((l) => l.scheduleB === code)!

describe('document set selection', () => {
  it('always chooses the USD set, never the later destination-currency one', () => {
    for (const name of Object.keys(parsed)) {
      const { set, reason } = selectDocumentSet(parsed[name])
      expect(set, name).toBe('FC')
      expect(reason).toMatch(/USD/)
    }
    // TP1 appears *after* FC in the file and is the one a naive "last wins" reader picks.
    expect(parsed.vendorA3.headers.TP1.documentCurrency).toBe('EUR')
  })

  it('never lets both sets contribute to the same output', () => {
    const result = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    expect(new Set(result.mergedLines.map((l) => l.documentSet))).toEqual(new Set(['FC']))
    expect(result.checks.find((c) => c.id === 'single-document-set')?.passed).toBe(true)
    // 97 pieces, not 194.
    expect(result.sliLines.reduce((s, l) => s + l.quantity, 0)).toBe(97)
  })
})

describe('vendorA1 — merges two cable lines, keeps the motor separate', () => {
  it('produces the quantities, weights and values on the filed SLI', () => {
    const { sliLines } = reconcile(parsed.vendorA1, scheduleB, CONTROLLED)
    expect(sliLines).toHaveLength(2)

    // Two separate order lines for the same cable, combined into one row.
    const cable = byCode(sliLines, '8544.42.0000')
    expect(cable.sourceLineIds).toHaveLength(2)
    expect(cable.quantity).toBe(2)
    expect(cable.weightKg).toBeCloseTo(1.088, 3)
    expect(cable.valueUsd).toBeCloseTo(145.13, 2)
    expect(cable.domesticForeign).toBe('F')

    const motor = byCode(sliLines, '8501.51.3040')
    expect(motor.sourceLineIds).toHaveLength(1)
    expect(motor.quantity).toBe(1)
    expect(motor.weightKg).toBeCloseTo(1.38, 3)
    expect(motor.valueUsd).toBeCloseTo(968.01, 2)
  })

  it('does not adopt the classification change made on the historical SLI', () => {
    // The filed SLI reclassified the cable lines from 8544.42.0000 to 8483.10.5000.
    // 8483.10.5000 is "TRANSMISSION SHAFTS AND CRANKS", which does not describe a cable
    // assembly, so this is treated as a data-entry error rather than a rule to learn.
    // Applying it requires an explicit, recorded override.
    const { sliLines } = reconcile(parsed.vendorA1, scheduleB, CONTROLLED)
    expect(sliLines.map((l) => l.scheduleB)).not.toContain('8483.10.5000')

    const overridden = reconcile(parsed.vendorA1, scheduleB, {
      ...CONTROLLED,
      overrides: { '8544420000': '8483.10.5000' },
    })
    expect(byCode(overridden.sliLines, '8483.10.5000').quantity).toBe(2)
    // ...and the override is still challenged, because it does not fit the goods.
    const applicability = overridden.checks.find((c) => c.id.startsWith('sb-applicability') && !c.passed)
    expect(applicability?.detail).toMatch(/TRANSMISSION SHAFTS/)
  })

  it('reconciles to the printed document totals', () => {
    const { checks, canGenerate } = reconcile(parsed.vendorA1, scheduleB, CONTROLLED)
    for (const id of ['total-quantity', 'total-value', 'total-weight', 'line-coverage', 'weights-present']) {
      expect(checks.find((c) => c.id === id)?.passed, id).toBe(true)
    }
    expect(canGenerate).toBe(true)
  })
})

describe('vendorA2 — single line', () => {
  it('reproduces the filed row', () => {
    const { sliLines } = reconcile(parsed.vendorA2, scheduleB, CONTROLLED)
    expect(sliLines).toHaveLength(1)
    const [row] = sliLines
    expect(row.domesticForeign).toBe('F')
    expect(row.scheduleB).toBe('8544.42.0000')
    expect(row.quantity).toBe(1)
    expect(row.weightKg).toBeCloseTo(1.27, 3)
    expect(row.valueUsd).toBeCloseTo(51.6, 2)
  })

  it('resolves the destination country from the discharge port', () => {
    expect(resolveDestinationCountry(parsed.vendorA2.headers.FC)).toBe('China')
  })
})

describe('vendorA3 — CEVA, groups across different part numbers', () => {
  it('reproduces all three filed rows exactly', () => {
    const { sliLines } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    expect(sliLines).toHaveLength(3)

    // Two different cable part numbers on two different orders share one row.
    const conductors = byCode(sliLines, '8544.42.0000')
    expect(conductors.domesticForeign).toBe('F')
    expect(conductors.quantity).toBe(10)
    expect(conductors.weightKg).toBeCloseTo(7.078, 3)
    expect(conductors.valueUsd).toBeCloseTo(1149.4, 2)
    expect(conductors.sourceLineIds).toHaveLength(2)

    // Seven source lines, three part numbers, one row.
    const optical = byCode(sliLines, '9031.49.8000')
    expect(optical.domesticForeign).toBe('D')
    expect(optical.quantity).toBe(75)
    expect(optical.weightKg).toBeCloseTo(127.5, 3)
    expect(optical.valueUsd).toBeCloseTo(128181.8, 2)
    expect(optical.sourceLineIds).toHaveLength(7)

    const measuring = byCode(sliLines, '9031.90.0000')
    expect(measuring.domesticForeign).toBe('D')
    expect(measuring.quantity).toBe(12)
    expect(measuring.weightKg).toBeCloseTo(4.263, 3)
    expect(measuring.valueUsd).toBeCloseTo(667.9, 2)
  })

  it('derives D and F per line from country of origin', () => {
    const { sliLines } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    expect(byCode(sliLines, '8544.42.0000').countriesOfOrigin).toEqual(['Japan'])
    expect(byCode(sliLines, '9031.49.8000').countriesOfOrigin).toEqual(['United States'])
  })

  it('reconciles to the printed totals', () => {
    const { checks, canGenerate } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    expect(checks.find((c) => c.id === 'total-quantity')?.actual).toBe('97')
    expect(checks.find((c) => c.id === 'total-value')?.actual).toBe('129999.10')
    expect(checks.find((c) => c.id === 'total-weight')?.actual).toBe('138.841')
    expect(canGenerate).toBe(true)
  })

  it('resolves the destination country the consignee address never states', () => {
    // The consignee block ends "'s-Hertogenbosch NA 5234" — no country anywhere.
    expect(resolveDestinationCountry(parsed.vendorA3.headers.FC)).toBe('Netherlands')
  })
})

describe('Schedule B validation', () => {
  it('accepts the codes actually used and rejects a retired one', () => {
    const { checks } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    const active = checks.filter((c) => c.id.startsWith('sb-active'))
    expect(active).toHaveLength(3)
    expect(active.every((c) => c.passed)).toBe(true)

    expect(scheduleB.lookup('9999.99.9999')).toBeNull()
    expect(scheduleB.lookup('8544.42.0000')?.description).toMatch(/ELECTRICAL CONDUCTORS/)
  })

  it('flags rows whose quantity is not in the unit Schedule B requires', () => {
    // 9031.90.0000 is reported in kilograms, but the invoice counts pieces. The filed CEVA
    // SLI carries "12" here, which is a real reporting defect this check catches.
    const { checks } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    const uom = checks.filter((c) => c.id.startsWith('sb-uom') && !c.passed)
    expect(uom).toHaveLength(1)
    expect(uom[0].expected).toBe('KG')
    expect(uom[0].actual).toBe('NO')
    expect(uom[0].detail).toMatch(/net weight in kilograms/)
  })

  it('does not block generation on advisory findings', () => {
    const { canGenerate } = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    expect(canGenerate).toBe(true)
  })
})

describe('form capacity', () => {
  it('blocks when a shipment needs more rows than the form holds', () => {
    const tight = reconcile(parsed.vendorA3, scheduleB, { ...CONTROLLED, maxRows: 2 })
    const capacity = tight.checks.find((c) => c.id === 'row-capacity')
    expect(capacity?.passed).toBe(false)
    expect(tight.canGenerate).toBe(false)

    const roomy = reconcile(parsed.vendorA3, scheduleB, { ...CONTROLLED, maxRows: 8 })
    expect(roomy.checks.find((c) => c.id === 'row-capacity')?.passed).toBe(true)
    expect(roomy.canGenerate).toBe(true)
  })
})

describe('classification applicability', () => {
  it('accepts a correct code even when the group heading is worded differently', () => {
    // The row is headed "Power Supply" but its line reads "ASSY, J3 MOTOR, I4H", and
    // 8501.51.3040 is "ELECTRIC MOTORS...". Judging on the heading alone would flag it.
    const { checks } = reconcile(parsed.vendorA1, scheduleB, CONTROLLED)
    const motorRow = reconcile(parsed.vendorA1, scheduleB, CONTROLLED).sliLines.findIndex(
      (l) => l.scheduleB === '8501.51.3040',
    )
    const check = checks.find((c) => c.id === `sb-applicability:row-${motorRow + 1}`)
    expect(check?.passed).toBe(true)
    expect(check?.expected).toMatch(/ELECTRIC MOTORS/)
  })

  it('still rejects a code that does not describe the goods', () => {
    const { checks } = reconcile(parsed.vendorA1, scheduleB, {
      ...CONTROLLED,
      overrides: { '8544420000': '8483.10.5000' },
    })
    const failed = checks.filter((c) => c.id.startsWith('sb-applicability') && !c.passed)
    expect(failed).toHaveLength(1)
    expect(failed[0].expected).toMatch(/TRANSMISSION SHAFTS/)
  })
})
