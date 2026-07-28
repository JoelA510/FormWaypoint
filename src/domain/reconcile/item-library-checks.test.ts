/**
 * The commodity-number filter as it runs during a real conversion, and the item library
 * standing in for weights the document does not print.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { reconcile } from '.'
import { parseCipl } from '../cipl'
import { hasFixtures, readFixture } from '../../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { indexByPart, libraryWeights, type ItemLibraryEntry } from '../item-library'
import type { CheckResult, ParsedCipl } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const parsed: Record<string, ParsedCipl> = {}
let scheduleB: ScheduleBIndex

beforeAll(async () => {
  // Every suite in this file is gated on the shipment documents, but this hook is not
  // gated by them skipping. Without the guard, adding one test that needs no fixture
  // would fail the whole file wherever the documents are absent.
  if (!hasFixtures()) return
  parsed['278514'] = await parseCipl('278514_CIPL.pdf', readFixture('278514'))
  parsed.G78495IQ = await parseCipl('G78495IQ_CIPL.pdf', readFixture('G78495IQ'))
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
}, 60_000)

const find = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)

const item = (over: Partial<ItemLibraryEntry> & { partNumber: string }): ItemLibraryEntry => ({
  displayPartNumber: over.partNumber,
  description: '',
  exportCode: '',
  importCode: '',
  netWeightKg: null,
  source: 'ItemStore.xlsx',
  importedAt: '2026-07-27T00:00:00.000Z',
  ...over,
})

// 278514 is a single line: part 13960-102D, classified 8504.40.4000, no weight printed.
// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('part-level commodity number screening', () => {
  it('passes when every part on the shipment carries a well-formed, current code', () => {
    const { checks } = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: { '13960-102D': 0.147 },
    })
    const check = find(checks, 'part-codes')!
    expect(check.passed).toBe(true)
    expect(check.detail).toContain('1 part(s)')
  })

  it('screens the number printed on the CIPL, leaving an approved override to the row checks', () => {
    // An override redirects this part to an import-only HTS. The part-level check reports on
    // the document — an override is a deliberate act, and hiding the source record behind it
    // would defeat the point of a list of records to fix. The row check still catches it.
    const { checks } = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: { '13960-102D': 0.147 },
      overrides: { '8504404000': '9801001012' },
    })
    expect(find(checks, 'part-codes')!.passed).toBe(true)
    expect(checks.find((c) => c.id.startsWith('sb-active'))!.passed).toBe(false)
  })

  it('reports coverage against the imported library', () => {
    const entries = [item({ partNumber: '13960-102D', exportCode: '8504.40.4000', netWeightKg: 0.147 })]
    const { checks } = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    expect(find(checks, 'item-library-coverage')).toMatchObject({ passed: true, actual: '1/1' })
  })

  it('flags a part whose library record holds a malformed number, without blocking', () => {
    const entries = [item({ partNumber: '13960-102D', exportCode: '8504404000', netWeightKg: 0.147 })]
    const result = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    const check = find(result.checks, 'item-library-codes')!
    expect(check.passed).toBe(false)
    expect(check.severity).toBe('warning')
    expect(check.detail).toContain('13960-102D')
    expect(check.detail).toMatch(/instead of 8504\.40\.4000/)
    // The CIPL's own number is fine, so the shipment still goes out.
    expect(result.canGenerate).toBe(true)
  })

  it('flags a library number the Census file does not carry', () => {
    const entries = [item({ partNumber: '13960-102D', exportCode: '9801.00.1012', netWeightKg: 0.147 })]
    const { checks } = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    expect(find(checks, 'item-library-codes')!.detail).toMatch(/9801\.00\.1012.*Census/)
  })

  it('reports a disagreement between the CIPL and the library without changing the filing', () => {
    const entries = [item({ partNumber: '13960-102D', exportCode: '8544.42.0000', netWeightKg: 0.147 })]
    const result = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    const check = find(result.checks, 'item-library-conflict')!
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('CIPL says 8504.40.4000, library says 8544.42.0000')
    // The document's code is what is filed.
    expect(result.sliLines[0].scheduleB).toBe('8504.40.4000')
  })

  it('does not declare every part broken when the Census dataset failed to load', () => {
    const { checks } = reconcile(parsed['278514'], null, {
      ...CONTROLLED,
      unitWeightsByPart: { '13960-102D': 0.147 },
    })
    // 8504.40.4000 is well-formed; without the dataset that is all that can be said, and
    // the separate `schedule-b-unavailable` warning is what reports the missing file.
    expect(find(checks, 'part-codes')!.passed).toBe(true)
    expect(find(checks, 'schedule-b-unavailable')!.passed).toBe(false)
  })

  it('says nothing about the library when none is loaded', () => {
    const { checks } = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: { '13960-102D': 0.147 },
    })
    expect(checks.filter((c) => c.id.startsWith('item-library'))).toEqual([])
  })
})

describe.skipIf(!hasFixtures())('weights from the item library', () => {
  it('supplies the missing weight so the shipment can be generated', () => {
    const entries = [item({ partNumber: '13960-102D', exportCode: '8504.40.4000', netWeightKg: 0.147 })]
    const result = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    // Two pieces at 0.147 kg each — the figure the filed SLI carries.
    expect(result.sliLines[0].weightKg).toBeCloseTo(0.294, 3)
    expect(result.canGenerate).toBe(true)
  })

  it('matches a part number that differs only in letter case', () => {
    const entries = [item({ partNumber: '13960-102d'.toUpperCase(), netWeightKg: 0.147 })]
    const result = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
    })
    expect(result.sliLines[0].weightKg).toBeCloseTo(0.294, 3)
  })

  it('blocks when the library does not cover a part', () => {
    const result = reconcile(parsed['278514'], scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights([item({ partNumber: 'SOMETHING-ELSE', netWeightKg: 1 })]),
    })
    expect(find(result.checks, 'weights-present')!.passed).toBe(false)
    expect(result.canGenerate).toBe(false)
  })

  it('never lets a library weight displace one the document prints', () => {
    // G78495IQ states its own weights. A deliberately wrong library figure must not appear.
    const entries = [item({ partNumber: '04465-000', netWeightKg: 99 })]
    const result = reconcile(parsed.G78495IQ, scheduleB, {
      ...CONTROLLED,
      unitWeightsByPart: libraryWeights(entries),
      itemsByPart: indexByPart(entries),
    })
    expect(result.sliLines.some((l) => l.weightKg > 90)).toBe(false)
    expect(find(result.checks, 'total-weight')!.passed).toBe(true)
  })
})
