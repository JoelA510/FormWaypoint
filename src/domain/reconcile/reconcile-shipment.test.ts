import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCipl } from '../cipl'
import { readFixture } from '../../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { reconcile, resolveDestinationCountry } from '.'
import type { ParsedCipl, SLILine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/**
 * Reproduces the SLIs filed for shipments vendorB1 (Nippon Express) and vendorB2 (CEVA).
 *
 * This format states no weights, so the per-part figures below stand in for the saved
 * weights table. The individual splits are the operator's data, not the document's — where
 * two parts share one commodity row only their *sum* is verifiable against the filed form,
 * and that sum is what the assertions check.
 */
const UNIT_WEIGHTS_vendorB1: Record<string, number> = {
  '29600-000F': 15.0,
  '19300-000': 1.421, // together 16.421 on the 8537.10.9090 row
  '10046-010': 2.655,
  '27400-29006': 0.001, // x3 = 0.003
  '68127-801F': 0.18,
  '05438-000': 3.2, // x2 = 6.400
}

const parsed: Record<string, ParsedCipl> = {}
let scheduleB: ScheduleBIndex

beforeAll(async () => {
  parsed['vendorB1'] = await parseCipl('vendorB1_CIPL.pdf', readFixture('vendorB1'))
  parsed['vendorB2'] = await parseCipl('vendorB2_CIPL.pdf', readFixture('vendorB2'))
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
}, 60_000)

const byCode = (lines: SLILine[], code: string) => lines.find((l) => l.scheduleB === code)!

describe('vendorB1 — reproduces the filed Nippon Express SLI', () => {
  const run = () =>
    reconcile(parsed['vendorB1'], scheduleB, { ...CONTROLLED, unitWeightsByPart: UNIT_WEIGHTS_vendorB1, maxRows: 8 })

  it('produces the five commodity rows that were filed', () => {
    const { sliLines } = run()
    expect(sliLines).toHaveLength(5)

    // United States origin is the only D row.
    const tool = byCode(sliLines, '8205.59.9000')
    expect(tool.domesticForeign).toBe('D')
    expect(tool.quantity).toBe(1)
    expect(tool.weightKg).toBeCloseTo(0.18, 3)
    expect(tool.valueUsd).toBeCloseTo(160.04, 2)

    // Two different parts from two different countries (Netherlands and Japan) share this
    // row: same classification, both foreign.
    const controllers = byCode(sliLines, '8537.10.9090')
    expect(controllers.domesticForeign).toBe('F')
    expect(controllers.sourceLineIds).toHaveLength(2)
    expect(controllers.quantity).toBe(2)
    expect(controllers.weightKg).toBeCloseTo(16.421, 3)
    expect(controllers.valueUsd).toBeCloseTo(4486.23, 2)
    expect(controllers.countriesOfOrigin).toEqual(['Netherlands', 'Japan'])

    expect(byCode(sliLines, '8479.90.9640').valueUsd).toBeCloseTo(1186.24, 2)
    expect(byCode(sliLines, '8539.29.2500').quantity).toBe(3)
    expect(byCode(sliLines, '8539.29.2500').weightKg).toBeCloseTo(0.003, 3)
    expect(byCode(sliLines, '8544.42.0000').quantity).toBe(2)
    expect(byCode(sliLines, '8544.42.0000').weightKg).toBeCloseTo(6.4, 3)
    expect(byCode(sliLines, '8544.42.0000').valueUsd).toBeCloseTo(5692.08, 2)
  })

  it('totals to the filed figures', () => {
    const { sliLines, checks } = run()
    expect(sliLines.reduce((s, l) => s + l.quantity, 0)).toBe(9)
    expect(sliLines.reduce((s, l) => s + l.valueUsd, 0)).toBeCloseTo(11532.24, 2)
    expect(sliLines.reduce((s, l) => s + l.weightKg, 0)).toBeCloseTo(25.659, 3)
    expect(checks.find((c) => c.id === 'total-quantity')?.passed).toBe(true)
    expect(checks.find((c) => c.id === 'total-value')?.passed).toBe(true)
  })

  it('files the ECCN the CIPL states, and says so', () => {
    const { sliLines, checks } = run()
    // The filed SLI put EAR99 on this row; the CIPL says 5A992.C.
    expect(byCode(sliLines, '8479.90.9640').eccn).toBe('5A992.C')
    // Every other row takes the blanket value.
    expect(byCode(sliLines, '8544.42.0000').eccn).toBe('EAR99')

    const notice = checks.find((c) => c.id === 'eccn-from-document')
    expect(notice?.passed).toBe(false)
    expect(notice?.detail).toMatch(/5A992\.C/)
    expect(notice?.detail).toMatch(/not EAR99/)
  })

  it('reports weights as supplied rather than reconciled', () => {
    const { checks, canGenerate } = run()
    const weight = checks.find((c) => c.id === 'total-weight')
    expect(weight?.severity).toBe('info')
    expect(weight?.detail).toMatch(/states no weights/)
    expect(weight?.actual).toBe('25.659')
    expect(canGenerate).toBe(true)
  })

  it('blocks when a part has no saved weight', () => {
    const partial = reconcile(parsed['vendorB1'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: { '68127-801F': 0.18 },
      maxRows: 8,
    })
    const present = partial.checks.find((c) => c.id === 'weights-present')
    expect(present?.severity).toBe('blocking')
    expect(present?.passed).toBe(false)
    expect(partial.canGenerate).toBe(false)
  })

  it('needs the destination country supplied — this layout never states one', () => {
    // "Kyoto 615-0803" is a postal line, not a country, and there is no discharge port.
    expect(resolveDestinationCountry(parsed['vendorB1'].headers.FC)).toBeNull()
  })
})

describe('vendorB2 — reproduces the filed CEVA SLI', () => {
  it('produces the single row that was filed', () => {
    const { sliLines } = reconcile(parsed['vendorB2'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: { '13960-102D': 0.147 }, // x2 = 0.294
      maxRows: 12,
    })
    expect(sliLines).toHaveLength(1)
    const [row] = sliLines
    expect(row.domesticForeign).toBe('D')
    expect(row.scheduleB).toBe('8504.40.4000')
    expect(row.quantity).toBe(2)
    expect(row.weightKg).toBeCloseTo(0.294, 3)
    // CEVA omits cents: 1251.37 is filed as 1251.
    expect(row.valueUsd).toBeCloseTo(1251.37, 2)
    expect(Math.round(row.valueUsd)).toBe(1251)
  })

  it('takes the country stated in the consignee block', () => {
    expect(resolveDestinationCountry(parsed['vendorB2'].headers.FC)).toBe('Brazil')
  })
})
