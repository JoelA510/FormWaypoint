/**
 * The CIPL against the item library: weights and commodity numbers.
 *
 * Runs on drawn documents, so it runs in CI. The sibling `item-library-checks.test.ts` is keyed
 * to real shipments and skips wherever those are absent, which left the commodity-number
 * disagreement check with no coverage at all.
 *
 * The shipment is `simpleShipment()`: 10000-0001 is 4 PCS printing 1.2 kg net (0.3 kg each,
 * 8544.42.0000); 10000-0002 is 2 PCS printing 0.5 kg (0.25 each, 8544.42.0000).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { reconcile, type ReconcileOptions } from '.'
import { parseCipl } from '../cipl'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { indexByPart, libraryWeights, type ItemLibraryEntry } from '../item-library'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { buildOmronCiPdf, simpleOmronCi } from '../../test/synthetic/omron-ci'
import type { CheckResult, ParsedCipl } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

let scheduleB: ScheduleBIndex
let vendorA: ParsedCipl

beforeAll(async () => {
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
  vendorA = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
})

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

function run(entries: ItemLibraryEntry[], parsed = vendorA, extra: Partial<ReconcileOptions> = {}) {
  return reconcile(parsed, scheduleB, {
    ...CONTROLLED,
    unitWeightsByPart: libraryWeights(entries),
    itemsByPart: indexByPart(entries),
    ...extra,
  })
}
const find = (checks: CheckResult[], id: string) => checks.find((c) => c.id === id)

describe('CIPL weights against the item library', () => {
  it('warns when a part’s library weight is not the one the CIPL implies, and says by how much', () => {
    // 0.9 kg each would make 3.6 kg for the 4 PCS; the CIPL prints 1.2 kg (0.3 each).
    const result = run([item({ partNumber: '10000-0001', netWeightKg: 0.9 })])
    const check = find(result.checks, 'item-library-weights')!
    expect(check).toMatchObject({ severity: 'warning', passed: false, actual: '1 of 1 part(s)' })
    expect(check.detail).toContain(
      '10000-0001: the CIPL has 1.2 kg for 4 PCS (0.3 kg each), the library has 0.9 kg each (3.6 kg for 4)',
    )
    expect(check.detail).toContain('The weight on the CIPL is what will be filed')
  })

  it('does not block, and files the document’s weight, not the library’s', () => {
    const clean = run([item({ partNumber: '10000-0001', netWeightKg: 0.3 })])
    const result = run([item({ partNumber: '10000-0001', netWeightKg: 0.9 })])
    expect(result.canGenerate).toBe(clean.canGenerate)
    expect(result.checks.filter((c) => c.severity === 'blocking' && !c.passed)).toEqual(
      clean.checks.filter((c) => c.severity === 'blocking' && !c.passed),
    )
    expect(result.sliLines.map((l) => l.weightKg)).toEqual(clean.sliLines.map((l) => l.weightKg))
  })

  it('passes, and says how many parts were compared, when every weight agrees', () => {
    const result = run([
      item({ partNumber: '10000-0001', netWeightKg: 0.3 }),
      item({ partNumber: '10000-0002', netWeightKg: 0.25 }),
    ])
    expect(find(result.checks, 'item-library-weights')).toMatchObject({
      severity: 'info',
      passed: true,
      actual: '2 compared',
    })
  })

  it('tolerates rounding but not a real change: 0.7% passes, 3% fails', () => {
    // 4 × 0.302 = 1.208 against a printed 1.2: 0.7% out, well inside one percent.
    expect(find(run([item({ partNumber: '10000-0001', netWeightKg: 0.302 })]).checks, 'item-library-weights')!.passed).toBe(true)
    // 4 × 0.309 = 1.236: 3% out.
    expect(find(run([item({ partNumber: '10000-0001', netWeightKg: 0.309 })]).checks, 'item-library-weights')!.passed).toBe(false)
  })

  it('holds a light part to the printing precision, not to one percent of nothing', () => {
    // Qty 1 printing 1.7 kg is the heaviest line, so draw a light one: re-label part 0002's
    // line as 0.004 kg for 1 PC by editing the parsed packing line.
    const light: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) =>
        l.partNumber === '10000-0002' && l.documentKind === 'PACKING_LIST'
          ? { ...l, quantity: 1, netWeightKg: 0.004 }
          : l,
      ),
    }
    // 0.0044 expected against 0.004 printed: 10% out but 0.4 g, inside half a gram.
    const within = run([item({ partNumber: '10000-0002', netWeightKg: 0.0044 })], light)
    expect(find(within.checks, 'item-library-weights')!.passed).toBe(true)
    // 0.005 expected: 1 g out, past the printing precision.
    const past = run([item({ partNumber: '10000-0002', netWeightKg: 0.005 })], light)
    expect(find(past.checks, 'item-library-weights')!.passed).toBe(false)
  })

  it('compares the weight the document printed, not one typed over it on the review screen', () => {
    const base = run([item({ partNumber: '10000-0001', netWeightKg: 0.3 })])
    // The 8544.42 row, which holds both widgets. Typing 9 kg over it is shared out over its
    // lines, so the merged weight of part 0001 stops being the 1.2 kg the document printed.
    const rowKey = base.sliLines[0].rowKey
    // The library agrees with the printed 1.2 kg, so the document is not what disagrees, and
    // the warning must not appear because of the override.
    const typed = run([item({ partNumber: '10000-0001', netWeightKg: 0.3 })], vendorA, {
      rowFigures: { [rowKey]: { weightKg: 9 } },
    })
    expect(typed.enteredFigures.length).toBeGreaterThan(0)
    expect(find(typed.checks, 'item-library-weights')!.passed).toBe(true)
  })

  it('leaves a part with no library weight out of the comparison, and says so', () => {
    const result = run([
      item({ partNumber: '10000-0001', netWeightKg: 0.3 }),
      item({ partNumber: '10000-0002', netWeightKg: null }),
    ])
    const check = find(result.checks, 'item-library-weights')!
    expect(check.passed).toBe(true)
    expect(check.actual).toBe('1 compared')
    expect(check.detail).toContain('1 part(s) have no weight in the library')
  })

  it('does not compare a line counted in a unit that is not a piece count', () => {
    const inKg: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) => (l.documentKind === 'PACKING_LIST' ? { ...l, uom: 'KG' } : l)),
    }
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0.9 })], inKg).checks, 'item-library-weights')!
    expect(check.passed).toBe(true)
    expect(check.detail).toContain('No part on this CIPL had both')
  })

  it('says a layout that prints no weights has nothing to compare, rather than staying silent', async () => {
    const omron = await parseCipl('ci.pdf', await buildOmronCiPdf(simpleOmronCi()))
    expect(omron.providesWeights).toBe(false)
    const entries = [item({ partNumber: '10000-0001', netWeightKg: 0.5 })]
    const result = run(entries, omron)
    const check = find(result.checks, 'item-library-weights')!
    expect(check).toMatchObject({ severity: 'info', passed: true })
    expect(check.detail).toContain('prints no weights')
  })

  it('shows nothing at all when no item library is loaded', () => {
    const result = reconcile(vendorA, scheduleB, CONTROLLED)
    expect(find(result.checks, 'item-library-weights')).toBeUndefined()
  })

  it('names the part once however many lines disagree, and counts the lines', async () => {
    const twice: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.flatMap((l) => {
        if (l.partNumber !== '10000-0001') return [l]
        return [l, { ...l, id: `${l.id}-copy`, orderNumber: `${l.orderNumber}9` }]
      }),
    }
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0.9 })], twice).checks, 'item-library-weights')
    expect(check).toMatchObject({ passed: false })
    expect(check!.detail.match(/10000-0001:/g)).toHaveLength(1)
    expect(check!.detail).toContain('on 2 lines')
  })
})

describe('CIPL commodity numbers against the item library', () => {
  it('warns when the library classifies a part differently, naming both numbers', () => {
    const result = run([item({ partNumber: '10000-0001', exportCode: '8504.40.4000' })])
    const check = find(result.checks, 'item-library-conflict')!
    expect(check).toMatchObject({ severity: 'warning', passed: false })
    expect(check.detail).toContain('10000-0001: CIPL says 8544.42.0000, library says 8504.40.4000')
    expect(result.canGenerate).toBe(run([]).canGenerate)
  })

  it('still reports the disagreement when the library number is itself badly written', () => {
    // 8504404000 is a different number from the CIPL's, and also not written ####.##.####.
    // Before, only the punctuation fault was reported and the disagreement was never stated.
    const result = run([item({ partNumber: '10000-0001', exportCode: '8504404000' })])
    expect(find(result.checks, 'item-library-codes')!.passed).toBe(false)
    expect(find(result.checks, 'item-library-conflict')!.detail).toContain('library says 8504404000')
  })

  it('still reports the disagreement when the library number is not in the Census file', () => {
    const result = run([item({ partNumber: '10000-0001', exportCode: '9801.00.1012' })])
    expect(find(result.checks, 'item-library-codes')!.passed).toBe(false)
    expect(find(result.checks, 'item-library-conflict')!.detail).toContain('library says 9801.00.1012')
  })

  it('treats punctuation alone as the same number: one fault, no disagreement', () => {
    const result = run([item({ partNumber: '10000-0001', exportCode: '8544420000' })])
    expect(find(result.checks, 'item-library-codes')!.passed).toBe(false)
    expect(find(result.checks, 'item-library-conflict')).toBeUndefined()
  })

  it('is silent when the library agrees, or holds no number for the part', () => {
    expect(find(run([item({ partNumber: '10000-0001', exportCode: '8544.42.0000' })]).checks, 'item-library-conflict')).toBeUndefined()
    expect(find(run([item({ partNumber: '10000-0001', exportCode: '' })]).checks, 'item-library-conflict')).toBeUndefined()
  })

  it('matches a part by its normalised number, so case and padding do not hide a disagreement', () => {
    const entries = [item({ partNumber: '10000-0001', exportCode: '8504.40.4000' })]
    const lower: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) => (l.partNumber === '10000-0001' ? { ...l, partNumber: ' 10000-0001 ' } : l)),
    }
    expect(find(run(entries, lower).checks, 'item-library-conflict')!.passed).toBe(false)
  })
})
