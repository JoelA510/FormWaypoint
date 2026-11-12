/**
 * The low-value exemption advisory: which totals it counts, and what it refuses to conclude.
 *
 * Rows are built directly. What is under test is the arithmetic of 15 CFR 30.37(a), and no
 * document shape influences that.
 */
import { describe, expect, it } from 'vitest'
import { EEI_LOW_VALUE_EXEMPTION, eeiBuckets, eeiThresholdCheck } from './eei'
import { reconcile } from '.'
import { createScheduleBIndex } from '../schedule-b'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { parseCipl } from '../cipl'
import type { SLILine } from '../types'

const row = (scheduleB: string, domesticForeign: 'D' | 'F', valueUsd: number, over: Partial<SLILine> = {}): SLILine =>
  ({
    rowKey: `${scheduleB}:${domesticForeign}:${valueUsd}:${over.eccn ?? ''}`,
    sourceLineIds: ['a'],
    domesticForeign,
    scheduleB,
    description: 'Parts',
    quantity: 1,
    scheduleBUnit: 'NO',
    scheduleBUnits: ['NO'],
    sourceUom: 'PCS',
    reportingUom: 'NO',
    reportingQuantity: 1,
    reportingBasis: 'count',
    weightKg: 1,
    valueUsd,
    eccn: 'EAR99',
    sme: 'N',
    license: 'NLR',
    countriesOfOrigin: ['Japan'],
    ...over,
  }) as SLILine

const only = (rows: SLILine[]) => {
  const checks = eeiThresholdCheck(rows)
  expect(checks).toHaveLength(1)
  return checks[0]
}

describe('the figure and where it was read', () => {
  it('is held as dated data with its citation and source', () => {
    expect(EEI_LOW_VALUE_EXEMPTION.thresholdUsd).toBe(2500)
    expect(EEI_LOW_VALUE_EXEMPTION.citation).toBe('15 CFR 30.37(a)')
    expect(EEI_LOW_VALUE_EXEMPTION.source).toMatch(/^https:\/\/www\.ecfr\.gov\//)
    expect(EEI_LOW_VALUE_EXEMPTION.currentTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(EEI_LOW_VALUE_EXEMPTION.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('which totals are over the figure', () => {
  it('treats exactly $2,500 as exempt and a cent more as not', () => {
    // "$2,500 or less" is the exemption's wording.
    expect(only([row('8544.42.0000', 'F', 2500)]).passed).toBe(true)
    const over = only([row('8544.42.0000', 'F', 2500.01)])
    expect(over.passed).toBe(false)
    expect(over.detail).toContain('8544.42.0000 F: $2,500.01')
  })

  it('adds rows that share a number and a letter, however else they differ', () => {
    // Two commodity rows, because the ECCN differs. One total for the exemption.
    const rows = [row('8544.42.0000', 'F', 1500), row('8544.42.0000', 'F', 1500, { eccn: '5A992.c' })]
    const check = only(rows)
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('8544.42.0000 F: $3,000.00 across 2 rows')
    expect(check.actual).toBe('1 over')
  })

  it('counts domestic and foreign goods under one number apart', () => {
    // $1,500 D and $1,500 F under one number: neither is over, though together they are.
    expect(only([row('8544.42.0000', 'D', 1500), row('8544.42.0000', 'F', 1500)]).passed).toBe(true)
    // And when only one of them is over, only that one is named.
    const check = only([row('8544.42.0000', 'D', 2600), row('8544.42.0000', 'F', 100)])
    expect(check.detail).toContain('8544.42.0000 D: $2,600.00')
    expect(check.detail).not.toContain('8544.42.0000 F')
  })

  it('does not add different commodity numbers together', () => {
    expect(only([row('8544.42.0000', 'F', 2000), row('9031.49.8000', 'F', 2000)]).passed).toBe(true)
  })

  it('treats one number written two ways as one number', () => {
    const buckets = eeiBuckets([row('8544.42.0000', 'F', 1500), row('8544420000', 'F', 1500)])
    expect(buckets).toEqual([{ scheduleB: '8544.42.0000', domesticForeign: 'F', valueUsd: 3000, rows: 2 }])
  })

  it('names every total over the figure, largest first, and none under it', () => {
    const check = only([row('9031.49.8000', 'D', 2600), row('8544.42.0000', 'F', 9000), row('8536.50.9065', 'F', 40)])
    expect(check.detail.indexOf('8544.42.0000 F: $9,000.00')).toBeLessThan(check.detail.indexOf('9031.49.8000 D: $2,600.00'))
    expect(check.detail).not.toContain('8536.50.9065')
    expect(check.actual).toBe('2 over')
  })

  it('sums in whole cents, so many small rows cannot drift a total across the line', () => {
    // 25,000 rows of $0.10 are $2,500.00 exactly, and exempt. In floating point they are not.
    const rows = Array.from({ length: 25000 }, (_, i) => row('8544.42.0000', 'F', 0.1, { rowKey: String(i) }))
    expect(rows.reduce((sum, r) => sum + r.valueUsd, 0)).not.toBe(2500)
    expect(eeiBuckets(rows)[0].valueUsd).toBe(2500)
    expect(only(rows).passed).toBe(true)
  })
})

describe('what the advisory will not conclude', () => {
  it('is information, never a block or a warning, in either direction', () => {
    expect(only([row('8544.42.0000', 'F', 100)]).severity).toBe('info')
    expect(only([row('8544.42.0000', 'F', 100000)]).severity).toBe('info')
  })

  it('never says no filing is required, and says why not', () => {
    const check = only([row('8544.42.0000', 'F', 100)])
    expect(check.passed).toBe(true)
    expect(check.detail).toContain('It does not mean no filing is required')
    expect(check.detail).toContain('15 CFR 30.2(a)(1)(iv)')
  })

  it('cites the section and the date the text was current to', () => {
    for (const value of [100, 100000]) {
      expect(only([row('8544.42.0000', 'F', value)]).detail).toContain('15 CFR 30.37(a), as the eCFR read on 2026-11-09')
    }
  })

  it('says nothing about a shipment with no rows', () => {
    expect(eeiThresholdCheck([])).toEqual([])
  })
})

describe('through the reconciliation', () => {
  it('is among the checks for a real parse, and does not change whether the shipment can be generated', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const scheduleB = createScheduleBIndex({
      source: 'test',
      generatedAt: '2026-07-27',
      count: 1,
      codes: { '8544420000': { d: 'INSULATED ELECTRIC CONDUCTORS', u: ['NO'] } },
    })
    const result = reconcile(parsed, scheduleB, { eccn: 'EAR99', sme: 'N', license: 'NLR' })
    const check = result.checks.find((c) => c.id === 'eei-low-value-exemption')
    expect(check?.severity).toBe('info')
    // It agrees with the rows the same reconciliation produced.
    const over = eeiBuckets(result.sliLines).filter((b) => b.valueUsd > 2500)
    expect(check?.passed).toBe(over.length === 0)
    for (const b of over) expect(check?.detail).toContain(`${b.scheduleB} ${b.domesticForeign}`)
  })
})
