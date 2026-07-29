/**
 * Per-part commodity numbers: what gets filed, and what the reviewer is told about it.
 *
 * Lines are built directly rather than parsed. What is under test is which of three possible
 * codes wins for a given part, and no document shape influences that.
 */
import { describe, expect, it } from 'vitest'
import { aggregateLines } from './lines'
import { reconcile } from '.'
import { overrideCodes, overrideWeights, type PartOverrideRecord } from '../../store/local-store'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { parseCipl } from '../cipl'
import type { CheckResult, MergedLine } from '../types'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const line = (partNumber: string, classification: string, overrides: Partial<MergedLine> = {}): MergedLine => ({
  id: `INV:${partNumber}`,
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
  countryOfOrigin: 'Japan',
  classification,
  quantity: 1,
  uom: 'PCS',
  extendedValue: 100,
  netWeightKg: 1,
  ...overrides,
})

describe('which code reaches the form', () => {
  it('files the code on the document when nothing was entered', () => {
    const [row] = aggregateLines([line('40649-0300', '8544.42.0000')], CONTROLLED)
    expect(row.scheduleB).toBe('8544.42.0000')
  })

  it('files a per-part code in place of the printed one', () => {
    const [row] = aggregateLines([line('40649-0300', '8544.42.0000')], {
      ...CONTROLLED,
      codesByPart: { '40649-0300': '8536.50.9065' },
    })
    expect(row.scheduleB).toBe('8536.50.9065')
  })

  it('beats a code-level override for the same code', () => {
    // The narrower statement wins: the code override says "this classification is wrong
    // wherever it appears", the per-part entry says "this part is X".
    const [row] = aggregateLines([line('40649-0300', '8544.42.0000')], {
      ...CONTROLLED,
      overrides: { '8544420000': '9031.49.8000' },
      codesByPart: { '40649-0300': '8536.50.9065' },
    })
    expect(row.scheduleB).toBe('8536.50.9065')
  })

  it('leaves other parts on the code override', () => {
    const rows = aggregateLines([line('40649-0300', '8544.42.0000'), line('40650-0050', '8544.42.0000')], {
      ...CONTROLLED,
      overrides: { '8544420000': '9031.49.8000' },
      codesByPart: { '40649-0300': '8536.50.9065' },
    })
    expect(rows.map((r) => r.scheduleB).sort()).toEqual(['8536.50.9065', '9031.49.8000'])
  })

  it('sends two parts sharing one bad code to different codes', () => {
    // The reason this is per-part at all. One wrong number copied across an item master sits
    // on parts that belong in different headings, and a single code→code redirect cannot
    // express that.
    const rows = aggregateLines([line('AAA-1', '8483.10.5000'), line('BBB-2', '8483.10.5000')], {
      ...CONTROLLED,
      codesByPart: { 'AAA-1': '8544.42.0000', 'BBB-2': '9031.49.8000' },
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.scheduleB).sort()).toEqual(['8544.42.0000', '9031.49.8000'])
  })

  it('matches the part number regardless of case', () => {
    const [row] = aggregateLines([line('40649-0300a', '8544.42.0000')], {
      ...CONTROLLED,
      codesByPart: { '40649-0300A': '8536.50.9065' },
    })
    expect(row.scheduleB).toBe('8536.50.9065')
  })

  it('merges two lines that the entries bring onto the same code', () => {
    const rows = aggregateLines([line('AAA-1', '8483.10.5000'), line('BBB-2', '7326.90.8695')], {
      ...CONTROLLED,
      codesByPart: { 'AAA-1': '8544.42.0000', 'BBB-2': '8544.42.0000' },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(2)
  })
})

describe('telling the reviewer a code was substituted', () => {
  const parse = async () => parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))

  const check = (checks: CheckResult[]) => checks.find((c) => c.id === 'part-code-overrides')

  it('says nothing when no code was entered', async () => {
    expect(check(reconcile(await parse(), null, CONTROLLED).checks)).toBeUndefined()
  })

  it('warns, naming the part and both codes', async () => {
    const result = reconcile(await parse(), null, {
      ...CONTROLLED,
      codesByPart: { '10000-0001': '8536.50.9065' },
    })
    const found = check(result.checks)
    expect(found).toMatchObject({ severity: 'warning', passed: false, actual: '1 part(s)' })
    expect(found?.detail).toContain('10000-0001')
    // Both codes punctuated the same way — the reader is comparing them.
    expect(found?.detail).toContain('8536.50.9065')
    expect(found?.detail).toContain('8544.42.0000')
    expect(found?.detail).not.toContain('8536509065')
  })

  it('punctuates a code that was entered without dots', async () => {
    const result = reconcile(await parse(), null, {
      ...CONTROLLED,
      codesByPart: { '10000-0001': '8536509065' },
    })
    expect(check(result.checks)?.detail).toContain('8536.50.9065')
  })

  it('does not block generation — it is a decision, not a defect', async () => {
    const result = reconcile(await parse(), null, {
      ...CONTROLLED,
      codesByPart: { '10000-0001': '8536.50.9065' },
    })
    expect(result.canGenerate).toBe(true)
  })

  it('stays quiet when the entered code is what the document already says', async () => {
    // A saved entry that matches this document changed nothing. Listing it would train the
    // reader to skip the notice.
    const result = reconcile(await parse(), null, {
      ...CONTROLLED,
      codesByPart: { '10000-0001': '8544420000' },
    })
    expect(check(result.checks)).toBeUndefined()
  })
})

describe('reading the saved records', () => {
  const record = (over: Partial<PartOverrideRecord>): PartOverrideRecord => ({
    partNumber: 'AAA-1',
    netWeightKg: null,
    description: '',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...over,
  })

  it('keys codes uppercased and skips records without one', () => {
    expect(
      overrideCodes([
        record({ partNumber: 'aaa-1', exportCode: '8544.42.0000' }),
        record({ partNumber: 'BBB-2' }),
        record({ partNumber: 'CCC-3', exportCode: '   ' }),
      ]),
    ).toEqual({ 'AAA-1': '8544.42.0000' })
  })

  it('skips records with no weight rather than reporting zero', () => {
    // A code-only record must not put a 0 kg weight into play; a blank weight is never zero.
    expect(
      overrideWeights([record({ partNumber: 'AAA-1', exportCode: '8544.42.0000' }), record({ partNumber: 'BBB-2', netWeightKg: 1.25 })]),
    ).toEqual({ 'BBB-2': 1.25 })
  })
})
