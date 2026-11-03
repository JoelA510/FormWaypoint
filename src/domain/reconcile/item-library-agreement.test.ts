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

  // A light single piece: part 0002's packing line re-drawn as 1 PC printing the given weight.
  const lightPart = (netWeightKg: number, extra: Record<string, unknown> = {}): ParsedCipl => ({
    ...vendorA,
    lines: vendorA.lines.map((l) =>
      l.partNumber === '10000-0002' && l.documentKind === 'PACKING_LIST'
        ? { ...l, quantity: 1, netWeightKg, ...extra }
        : l,
    ),
  })

  it('treats exactly half a gram as within the printing precision, whatever the float says', () => {
    // 0.005 - 0.0045 is 0.0005000000000000004 in floating point: half a gram, not past it.
    const check = find(run([item({ partNumber: '10000-0002', netWeightKg: 0.0045 })], lightPart(0.005)).checks, 'item-library-weights')!
    expect(check.passed).toBe(true)
  })

  it('widens the floor on a line the document prints divided, and only on that line', () => {
    // 0.004 printed against 0.007 from the library is 3 g out. Past the plain half gram, but
    // inside half a gram per unit of a divisor of 6 (3.5 g).
    const entries = [item({ partNumber: '10000-0002', netWeightKg: 0.007 })]
    expect(find(run(entries, lightPart(0.004, { weightDivisor: 6 })).checks, 'item-library-weights')!.passed).toBe(true)
    expect(find(run(entries, lightPart(0.004)).checks, 'item-library-weights')!.passed).toBe(false)
  })

  it('leaves a zero-quantity line out of the comparison instead of dividing by it', () => {
    const zero: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) =>
        l.partNumber === '10000-0001' && l.documentKind === 'PACKING_LIST' ? { ...l, quantity: 0 } : l,
      ),
    }
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0.3 })], zero).checks, 'item-library-weights')!
    expect(check.passed).toBe(true)
    expect(check.detail).toContain('No part on this CIPL had both')
    expect(check.detail).not.toContain('Infinity')
  })

  it('does not treat a library weight of zero as a weight', () => {
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0 })]).checks, 'item-library-weights')!
    expect(check.passed).toBe(true)
    expect(check.detail).toContain('1 part(s) have no weight in the library')
  })

  it('counts a part with no library weight once, however many lines it is on', () => {
    const twice: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.flatMap((l) =>
        l.partNumber === '10000-0002' ? [l, { ...l, id: `${l.id}-copy`, orderNumber: `${l.orderNumber}9` }] : [l],
      ),
    }
    const check = find(
      run([item({ partNumber: '10000-0001', netWeightKg: 0.3 }), item({ partNumber: '10000-0002', netWeightKg: null })], twice).checks,
      'item-library-weights',
    )!
    expect(check.detail).toContain('1 part(s) have no weight in the library')
  })

  it('lets the line furthest from the library speak for the part', () => {
    // Two lines of part 0001, library 0.9 each (3.6 kg for 4). The first prints 3.0 kg (0.6 out),
    // the second 1.2 kg (2.4 out); the warning should quote the second.
    const lines = vendorA.lines.flatMap((l) => {
      if (l.partNumber !== '10000-0001') return [l]
      const copy = {
        ...l,
        id: `${l.id}-copy`,
        orderNumber: `${l.orderNumber}9`,
        ...(l.documentKind === 'PACKING_LIST' ? { netWeightKg: 3 } : {}),
      }
      return [copy, l]
    })
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0.9 })], { ...vendorA, lines }).checks, 'item-library-weights')!
    expect(check.detail).toContain('the CIPL has 1.2 kg for 4 PCS')
    expect(check.detail).toContain('on 2 lines')
    expect(check.detail).not.toContain('the CIPL has 3 kg')
  })

  it('names the first eight disagreeing parts and counts the rest', () => {
    const many: ParsedCipl = {
      ...vendorA,
      lines: Array.from({ length: 12 }, (_, i) =>
        vendorA.lines
          .filter((l) => l.partNumber === '10000-0001')
          .map((l) => ({
            ...l,
            id: `${l.id}-${i}`,
            itemId: `${l.itemId}-${i}`,
            orderNumber: `${l.orderNumber}${i}`,
            partNumber: `P-${String(i).padStart(2, '0')}`,
          })),
      ).flat(),
    }
    const entries = Array.from({ length: 12 }, (_, i) =>
      item({ partNumber: `P-${String(i).padStart(2, '0')}`, netWeightKg: 0.9 }),
    )
    const check = find(run(entries, many).checks, 'item-library-weights')!
    expect(check.actual).toBe('12 of 12 part(s)')
    expect(check.detail).toContain('P-07:')
    expect(check.detail).not.toContain('P-08:')
    expect(check.detail).toContain('and 4 more part(s)')
  })

  it('shows a light part’s library weight rather than rounding it to nothing', () => {
    // 0.00003 kg each against a printed 0.3 kg each: the library figure must still be readable.
    const check = find(run([item({ partNumber: '10000-0001', netWeightKg: 0.00003 })]).checks, 'item-library-weights')!
    expect(check.passed).toBe(false)
    expect(check.detail).toContain('the library has 0.00003 kg each')
    expect(check.detail).not.toContain('0 kg each')
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

  it('says "(blank)" when the CIPL line carries no commodity number at all', () => {
    const blank: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) => (l.partNumber === '10000-0001' ? { ...l, classification: '' } : l)),
    }
    const check = find(run([item({ partNumber: '10000-0001', exportCode: '8544.42.0000' })], blank).checks, 'item-library-conflict')!
    expect(check.detail).toContain('10000-0001: CIPL says (blank), library says 8544.42.0000')
  })

  it('lists a part once when it is printed under two spellings', () => {
    // ' 10000-0001' and '10000-0001' are one part to the library lookup; they were two entries here.
    const twoSpellings: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.flatMap((l) =>
        l.partNumber === '10000-0001'
          ? [l, { ...l, id: `${l.id}-copy`, orderNumber: `${l.orderNumber}9`, partNumber: ` ${l.partNumber}` }]
          : [l],
      ),
    }
    const result = run([item({ partNumber: '10000-0001', exportCode: '8504404000' })], twoSpellings)
    expect(find(result.checks, 'item-library-conflict')!.detail.match(/10000-0001:/g)).toHaveLength(1)
    expect(find(result.checks, 'item-library-codes')!.detail.match(/10000-0001:/g)).toHaveLength(1)
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

describe('parts on the CIPL that are not in the item library', () => {
  it('warns, naming each part, when the library does not hold it', () => {
    // Only 10000-0001 is in the library; 0002 and 0003 are what a mistyped part number looks like.
    const result = run([item({ partNumber: '10000-0001', netWeightKg: 0.3 })])
    const check = find(result.checks, 'item-library-missing')!
    expect(check).toMatchObject({ severity: 'warning', passed: false, actual: '2 of 3 part(s)' })
    expect(check.detail).toContain('10000-0002, 10000-0003')
    expect(check.detail).toContain('Nothing is filed differently')
    // The coverage line is still there, and nothing is blocked because of it.
    expect(find(result.checks, 'item-library-coverage')).toMatchObject({ actual: '1/3' })
    expect(result.canGenerate).toBe(run([item({ partNumber: '10000-0001' })], vendorA).canGenerate)
  })

  it('is silent when every part is in the library', () => {
    const result = run(
      ['10000-0001', '10000-0002', '10000-0003'].map((partNumber) => item({ partNumber, netWeightKg: 1 })),
    )
    expect(find(result.checks, 'item-library-missing')).toBeUndefined()
  })

  it('says nothing when no library is loaded, since there is no record to be missing from', () => {
    expect(find(reconcile(vendorA, scheduleB, CONTROLLED).checks, 'item-library-missing')).toBeUndefined()
  })

  it('does not call a part missing for its case or padding', () => {
    const padded: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) => ({ ...l, partNumber: ` ${l.partNumber.toLowerCase()} ` })),
    }
    const result = run(['10000-0001', '10000-0002', '10000-0003'].map((partNumber) => item({ partNumber })), padded)
    expect(find(result.checks, 'item-library-missing')).toBeUndefined()
  })

  it('names a line with no part number rather than dropping it from the list', () => {
    const blank: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.map((l) => (l.partNumber === '10000-0003' ? { ...l, partNumber: '' } : l)),
    }
    const result = run(['10000-0001', '10000-0002'].map((partNumber) => item({ partNumber })), blank)
    expect(find(result.checks, 'item-library-missing')!.detail).toContain('(no part number)')
  })

  it('names each part once however many lines it is on, even under two commodity numbers', () => {
    // The second copy is classified differently, so the part reaches the check as two
    // (part, number) pairs; it must still be one part in the list and in the count.
    const twice: ParsedCipl = {
      ...vendorA,
      lines: vendorA.lines.flatMap((l) =>
        l.partNumber === '10000-0002'
          ? [l, { ...l, id: `${l.id}-copy`, orderNumber: `${l.orderNumber}9`, classification: '8544.49.0000' }]
          : [l],
      ),
    }
    const check = find(run([item({ partNumber: '10000-0001' })], twice).checks, 'item-library-missing')!
    expect(check.detail.match(/10000-0002/g)).toHaveLength(1)
    expect(check.actual).toBe('2 of 3 part(s)')
  })

  it('names the first ten and counts the rest', () => {
    const many: ParsedCipl = {
      ...vendorA,
      lines: Array.from({ length: 12 }, (_, i) =>
        vendorA.lines
          .filter((l) => l.partNumber === '10000-0001')
          .map((l) => ({
            ...l,
            id: `${l.id}-${i}`,
            itemId: `${l.itemId}-${i}`,
            orderNumber: `${l.orderNumber}${i}`,
            partNumber: `P-${String(i).padStart(2, '0')}`,
          })),
      ).flat(),
    }
    const check = find(run([item({ partNumber: 'SOMETHING-ELSE' })], many).checks, 'item-library-missing')!
    expect(check.actual).toBe('12 of 12 part(s)')
    expect(check.detail).toContain('P-00, P-01, P-02, P-03, P-04, P-05, P-06, P-07, P-08, P-09 and 2 more')
    expect(check.detail).not.toContain('P-10')
  })
})
