/**
 * Shipment K78541WH, which prints three things no other fixture does.
 *
 * All three were found by running the packaged app against a real shipment, and all three
 * failed silently in ways that ended at a blocking check rather than a wrong form — but a
 * blocked shipment is still a shipment nobody can file.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseCipl } from '.'
import { readFixture } from '../../test/fixtures'
import { reconcile } from '../reconcile'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import type { ParsedCipl, SourceLine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

let parsed: ParsedCipl
let scheduleB: ScheduleBIndex

beforeAll(async () => {
  parsed = await parseCipl('K78541WH_CIPL.pdf', readFixture('K78541WH'))
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
}, 60_000)

const fc = (kind: SourceLine['documentKind']) =>
  parsed.lines.filter((l) => l.documentSet === 'FC' && l.documentKind === kind)

const byOrder = (kind: SourceLine['documentKind'], order: string) =>
  fc(kind).find((l) => l.orderNumber === order)!

describe('a line block split by a page break', () => {
  it('reads every invoice and packing line', () => {
    // 01004367OP0010 starts at the foot of one page and finishes on the next. Before this
    // was handled it parsed with quantity 0 and no weights at all.
    expect(fc('INVOICE')).toHaveLength(13)
    expect(fc('PACKING_LIST')).toHaveLength(13)
  })

  it('completes the split line from the following page', () => {
    const line = byOrder('PACKING_LIST', '01004367OP0010')
    expect(line.quantity).toBe(2)
    expect(line.countryOfOrigin).toBe('Malaysia')
    expect(line.netWeightKg).toBeDefined()
  })

  it('credits the split line to the page it started on', () => {
    // Provenance points a reviewer at where the line is printed, which is where it began.
    expect(byOrder('PACKING_LIST', '01004367OP0010').page).toBe(7)
  })

  it('does not warn about an incomplete line, because none is left incomplete', () => {
    expect(parsed.warnings.filter((w) => /incomplete/i.test(w))).toEqual([])
  })
})

describe('weights printed divided', () => {
  it('multiplies a `(@ / 6)` line back up to the whole line', () => {
    // Printed 1.240 / 1.364; the line above it is the same part at the same quantity and
    // prints 7.438 / 8.182 outright.
    const line = byOrder('PACKING_LIST', '01004367OP0010')
    expect(line.weightDivisor).toBe(6)
    expect(line.netWeightKg).toBeCloseTo(7.44, 3)
    expect(line.grossWeightKg).toBeCloseTo(8.184, 3)
  })

  it('leaves an ordinary line alone', () => {
    const twin = byOrder('PACKING_LIST', '01004338OP0010')
    expect(twin.weightDivisor).toBeUndefined()
    expect(twin.netWeightKg).toBe(7.438)
  })

  it('reconciles to the document total, within the rounding the division created', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const check = result.checks.find((c) => c.id === 'total-weight')!
    // 36.585 against a stated 36.583: the 0.002 is 1.240 having been rounded before it was
    // divided. Reporting a mismatch here would block a shipment whose document is sound.
    expect(check.passed).toBe(true)
    expect(check.detail).toMatch(/divided and multiplied back up/)
  })

  it('still fails when a line is genuinely missing', () => {
    // Drop a line the divided one did not create, and the check must fire regardless of
    // any slack the reconstruction earned.
    const short: ParsedCipl = {
      ...parsed,
      lines: parsed.lines.filter((l) => l.orderNumber !== '00994686OP0010'),
    }
    const result = reconcile(short, scheduleB, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'total-weight')!.passed).toBe(false)
  })
})

describe('a commodity heading stranded at the foot of a page', () => {
  it('carries the heading onto the line it governs', () => {
    // `Electrical Conductors` is the last row of one page; the line it heads is the first
    // block of the next. Left empty, that line reaches the form with no description.
    expect(byOrder('INVOICE', '01004367OP0010').commodityGroup).toBe('Electrical Conductors')
    expect(byOrder('INVOICE', '01004338OP0010').commodityGroup).toBe('Electrical Conductors')
  })

  it('never reads the consignee address as a heading', () => {
    // The consignee city sits directly above the first block on every detail page and is a
    // single word — indistinguishable from a heading except by its column.
    const groups = new Set(fc('INVOICE').map((l) => l.commodityGroup))
    expect(groups).not.toContain('Singapore')
    expect([...groups].every(Boolean)).toBe(true)
  })
})

describe('the shipment as a whole', () => {
  it('reconciles quantity and value against the printed totals', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    for (const id of ['total-quantity', 'total-value', 'weights-present', 'line-coverage']) {
      expect(result.checks.find((c) => c.id === id), id).toMatchObject({ passed: true })
    }
  })

  it('leaves nothing blocking that the document itself supplies', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    expect(result.checks.filter((c) => c.severity === 'blocking' && !c.passed)).toEqual([])
    expect(result.canGenerate).toBe(true)
  })
})
