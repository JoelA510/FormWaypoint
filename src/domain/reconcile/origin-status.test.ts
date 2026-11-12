/**
 * D/F: where the letter comes from, who can change it, and what the reviewer is told.
 *
 * Lines are built directly, as in `part-codes.test.ts`: what is under test is which letter a
 * part files under, and no document shape influences that.
 */
import { describe, expect, it } from 'vitest'
import { aggregateLines, domesticForeign, domesticForeignFor } from './lines'
import { reconcile } from '.'
import { createScheduleBIndex } from '../schedule-b'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { parseCipl } from '../cipl'
import type { MergedLine, ParsedCipl } from '../types'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const line = (partNumber: string, countryOfOrigin: string, overrides: Partial<MergedLine> = {}): MergedLine => ({
  id: `INV:${partNumber}:${countryOfOrigin}`,
  documentSet: 'FC',
  documentKind: 'INVOICE',
  page: 1,
  orderNumber: '00000001OP0010',
  sequence: '1',
  lineNumber: '1',
  itemId: '',
  partNumber,
  model: '',
  description: 'Parts',
  commodityGroup: '',
  countryOfOrigin,
  classification: '8544.42.0000',
  quantity: 1,
  uom: 'PCS',
  extendedValue: 100,
  netWeightKg: 1,
  ...overrides,
})

describe('which letter reaches the form', () => {
  it('starts from the country of origin when nothing was entered', () => {
    const rows = aggregateLines([line('20000-0001', 'Japan'), line('20000-0002', 'United States')], CONTROLLED)
    expect(rows.map((r) => r.domesticForeign).sort()).toEqual(['D', 'F'])
  })

  it('files D for a foreign-origin part a person entered as domestic', () => {
    // 15 CFR 30.1(c): imported goods substantially transformed or enhanced in value in the
    // United States are domestic. The origin still says Japan, and stays on the row.
    const [row] = aggregateLines([line('20000-0001', 'Japan')], {
      ...CONTROLLED,
      originStatusByPart: { '20000-0001': 'D' },
    })
    expect(row.domesticForeign).toBe('D')
    expect(row.countriesOfOrigin).toEqual(['Japan'])
  })

  it('files F for a US-origin part a person entered as foreign', () => {
    const [row] = aggregateLines([line('20000-0001', 'USA')], { ...CONTROLLED, originStatusByPart: { '20000-0001': 'F' } })
    expect(row.domesticForeign).toBe('F')
  })

  it('matches the part however the document cases it', () => {
    const [row] = aggregateLines([line('ab-100', 'Japan')], { ...CONTROLLED, originStatusByPart: { 'AB-100': 'D' } })
    expect(row.domesticForeign).toBe('D')
  })

  it('leaves other parts under the same code on their own origin, as separate rows', () => {
    const rows = aggregateLines([line('20000-0001', 'Japan'), line('20000-0002', 'Japan')], {
      ...CONTROLLED,
      originStatusByPart: { '20000-0001': 'D' },
    })
    expect(rows.map((r) => r.domesticForeign).sort()).toEqual(['D', 'F'])
  })

  it('merges an entered part into the row its new letter belongs to', () => {
    const rows = aggregateLines([line('20000-0001', 'Japan'), line('20000-0002', 'United States')], {
      ...CONTROLLED,
      originStatusByPart: { '20000-0001': 'D' },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ domesticForeign: 'D', quantity: 2, valueUsd: 200 })
  })

  it('never applies an entry to a line that has no part number', () => {
    expect(domesticForeignFor({ partNumber: '  ', countryOfOrigin: 'Japan' }, { '': 'D' })).toBe('F')
  })

  it('still derives the letter the way it always has', () => {
    for (const us of ['United States', 'usa', ' U.S.A. ', 'US']) expect(domesticForeign(us)).toBe('D')
    for (const other of ['Japan', 'Malaysia', 'Ruritania']) expect(domesticForeign(other)).toBe('F')
  })
})

describe('what the reviewer is told about D/F', () => {
  const scheduleB = createScheduleBIndex({
    source: 'test',
    generatedAt: '2026-07-27',
    count: 1,
    codes: { '8544420000': { d: 'INSULATED ELECTRIC CONDUCTORS', u: ['NO'] } },
  })
  let parsed: ParsedCipl
  const reconciled = async (
    change: (lines: ParsedCipl['lines']) => void,
    originStatusByPart?: Record<string, 'D' | 'F'>,
  ) => {
    parsed ??= await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const copy: ParsedCipl = { ...parsed, lines: parsed.lines.map((l) => ({ ...l })) }
    change(copy.lines)
    return reconcile(copy, scheduleB, { ...CONTROLLED, originStatusByPart })
  }
  const check = (result: Awaited<ReturnType<typeof reconciled>>, id: string) => result.checks.find((c) => c.id === id)

  it('passes the origin check, and says nothing about entries, on a document that states every origin', async () => {
    const result = await reconciled(() => {})
    expect(check(result, 'origin-stated')).toMatchObject({ severity: 'blocking', passed: true })
    expect(check(result, 'origin-status-entered')).toBeUndefined()
  })

  it('blocks on a line with no country of origin instead of filing it as foreign', async () => {
    const result = await reconciled((lines) => {
      for (const l of lines) if (l.partNumber === lines[0].partNumber) l.countryOfOrigin = ''
    })
    const stated = check(result, 'origin-stated')
    expect(stated).toMatchObject({ severity: 'blocking', passed: false })
    expect(stated?.detail).toContain(parsed.lines[0].partNumber)
    expect(stated?.detail).toContain('a blank is not "foreign"')
  })

  it('lets a person answer for that part, and reports that they did', async () => {
    const part = (await reconciled(() => {})).mergedLines[0].partNumber
    const result = await reconciled(
      (lines) => {
        for (const l of lines) if (l.partNumber === part) l.countryOfOrigin = ''
      },
      { [part.toUpperCase()]: 'D' },
    )
    expect(check(result, 'origin-stated')?.passed).toBe(true)
    const entered = check(result, 'origin-status-entered')
    expect(entered).toMatchObject({ severity: 'warning', passed: false, actual: '1 part(s)' })
    expect(entered?.detail).toContain(`${part}: filing D where the document states no origin`)
  })

  it('names the part, the letter and the origin it replaces when an entry changes the letter', async () => {
    const first = (await reconciled(() => {})).mergedLines[0]
    const derived = domesticForeign(first.countryOfOrigin)
    const other = derived === 'D' ? 'F' : 'D'
    const result = await reconciled(() => {}, { [first.partNumber.toUpperCase()]: other })
    const entered = check(result, 'origin-status-entered')
    expect(entered?.detail).toContain(
      `${first.partNumber}: filing ${other} where the origin on the document (${first.countryOfOrigin}) gives ${derived}`,
    )
    expect(entered?.detail).toContain('15 CFR 30.1(c)')
  })

  it('says nothing about an entry that agrees with the document', async () => {
    // A saved entry that matches what this document gives changed nothing; listing it would
    // train the reader to skip the notice.
    const first = (await reconciled(() => {})).mergedLines[0]
    const result = await reconciled(() => {}, { [first.partNumber.toUpperCase()]: domesticForeign(first.countryOfOrigin) })
    expect(check(result, 'origin-status-entered')).toBeUndefined()
  })
})
