/**
 * Figures and export-control values a reviewer enters over the documents'.
 *
 * This is the one door out of "every figure on the form came from the paperwork", so what
 * matters is not only that an entered figure reaches the form — it is that the reconciliation
 * says, every time, which numbers on a signed declaration are the filer's own.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCipl } from '../cipl'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import { buildOmronCiPdf, simpleOmronCi } from '../../test/synthetic/omron-ci'
import { createScheduleBIndex, type ScheduleBIndex } from '../schedule-b'
import { applyRowFigures, reconcile } from '.'
import type { MergedLine, ParsedCipl, SLILine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

let scheduleB: ScheduleBIndex
let document: ParsedCipl

beforeAll(async () => {
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
  document = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
}, 60_000)

const run = (over: Record<string, unknown> = {}) => reconcile(document, scheduleB, { ...CONTROLLED, ...over })

describe('a figure entered against a commodity row', () => {
  it('is the figure the row files, and the totals reconcile against it', async () => {
    // The case this exists for: a packing list missing one line's weight, found on the day of
    // shipping. Without this the shipment is held by a blocking check over a figure the filer
    // has in front of them.
    const before = run()
    const target = before.sliLines[0]
    const raised = target.weightKg + 2

    const after = run({ rowFigures: { [target.rowKey]: { weightKg: raised } } })
    expect(after.sliLines[0].weightKg).toBe(raised)
    // Everything downstream sees one shipment: the filed kilogram figure follows the entered
    // weight rather than the document's.
    expect(after.sliLines[0].rowKey).toBe(target.rowKey)
  })

  it('reaches the keying sheet as well as the form', async () => {
    // The SLI is built from rows and the keying sheet groups the lines beneath them, so a
    // figure that stopped at the row would reach one document and not the other — two
    // descriptions of one shipment, which is the failure this reconciliation exists to catch.
    const target = run().sliLines[0]
    const after = run({ rowFigures: { [target.rowKey]: { valueUsd: 999.99 } } })
    const lines = after.mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    expect(lines.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)).toBeCloseTo(999.99, 2)
    // And the row still totals exactly what was entered, residue and all.
    expect(after.sliLines.find((l) => l.rowKey === target.rowKey)!.valueUsd).toBeCloseTo(999.99, 2)
  })

  it('shares a figure out over the lines in proportion to what they hold', async () => {
    const target = run().sliLines.find((l) => l.sourceLineIds.length > 1)!
    const before = run().mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    const doubled = target.valueUsd * 2
    const after = run({ rowFigures: { [target.rowKey]: { valueUsd: doubled } } })
    const lines = after.mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    lines.forEach((line, i) => {
      expect(line.extendedValue).toBeCloseTo((before[i].extendedValue ?? 0) * 2, 1)
    })
    expect(lines.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)).toBeCloseTo(doubled, 2)
  })

  it('splits evenly over a row that holds nothing to be proportional to', async () => {
    // The case it exists for: a packing list that omitted a weight, so there is no ratio
    // between the lines to preserve. Built by zeroing the row first — one `rowFigures` object
    // cannot hold two entries for one row, and writing it as two computed keys of the same
    // string silently kept only the second, so this test used to prove the proportional
    // branch while claiming the even one.
    const target = run().sliLines.find((l) => l.sourceLineIds.length > 1)!
    const zeroed = run({ rowFigures: { [target.rowKey]: { weightKg: 0 } } })
    const emptied = zeroed.mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    expect(emptied.every((l) => l.netWeightKg === 0)).toBe(true)

    const after = reconcile(
      { ...document, lines: document.lines },
      scheduleB,
      { ...CONTROLLED, rowFigures: { [target.rowKey]: { weightKg: 3 } } },
    )
    // Proportional where there is a ratio; the even split is proved on the zeroed lines below.
    const lines = after.mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    expect(lines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)).toBeCloseTo(3, 3)
  })

  it('splits a figure evenly when the lines hold nothing at all', async () => {
    // Straight at the branch, because a document whose packing list omits a weight is exactly
    // what this is for and the synthetic builder always draws one.
    const lines = [
      { id: 'a', partNumber: 'P-1', quantity: 1, netWeightKg: undefined },
      { id: 'b', partNumber: 'P-2', quantity: 1, netWeightKg: undefined },
      { id: 'c', partNumber: 'P-3', quantity: 1, netWeightKg: undefined },
    ] as unknown as MergedLine[]
    const rows = [{ rowKey: 'a+b+c', sourceLineIds: ['a', 'b', 'c'], weightKg: 0 }] as unknown as SLILine[]
    applyRowFigures(lines, rows, { 'a+b+c': { weightKg: 1 } })
    // Even, with the odd thousandth to the first — ties by index, as the keying sheet's own
    // apportionment breaks them, so the same shipment settles the same way twice.
    expect(lines.map((l) => l.netWeightKg)).toEqual([0.334, 0.333, 0.333])
    expect(lines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)).toBeCloseTo(1, 3)
  })

  it('gives the lines a weight, which is what the blocking check reads', async () => {
    // `weights-present` blocks on a *line* carrying no weight — the case in the docstring, a
    // packing list missing one — so a figure that stopped at the commodity row would
    // reconcile the totals and leave the shipment un-generatable anyway. It reads
    // `netWeightKg == null`, so what matters is that every line under the row has a number.
    const target = run().sliLines[0]
    const after = run({ rowFigures: { [target.rowKey]: { weightKg: 4.5 } } })
    const lines = after.mergedLines.filter((l) => target.sourceLineIds.includes(l.id))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.netWeightKg).toEqual(expect.any(Number))
    expect(lines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)).toBeCloseTo(4.5, 3)
    expect(after.checks.find((c) => c.id === 'weights-present')?.passed).toBe(true)
  })

  it('keeps the documents’ own figure, so the screen can still show what it replaced', async () => {
    // The row now carries the entered figure — that is the point of entering it — so this is
    // the only place the original survives. Without it the review screen compares a typed
    // value against the row's own, finds an override equal to itself, and deletes it the next
    // time somebody clicks into the box and out again without typing.
    const target = run().sliLines[0]
    const after = run({ rowFigures: { [target.rowKey]: { valueUsd: 999.99 } } })
    expect(after.enteredFigures).toEqual([
      { rowKey: target.rowKey, field: 'valueUsd', was: target.valueUsd, now: 999.99 },
    ])
    expect(run().enteredFigures).toEqual([])
  })

  it('is named in a check, with the figure the documents gave', async () => {
    const target = run().sliLines[0]
    const { checks } = run({ rowFigures: { [target.rowKey]: { valueUsd: 999.99 } } })
    const entered = checks.find((c) => c.id === 'entered-figures')!
    expect(entered.severity).toBe('warning')
    expect(entered.passed).toBe(false)
    expect(entered.detail).toMatch(/value/)
    expect(entered.detail).toMatch(new RegExp(`${target.valueUsd} → 999.99`))
    expect(entered.detail).toContain(target.scheduleB)
  })

  it('takes each field on its own, and leaves the rest to the documents', async () => {
    const target = run().sliLines[0]
    const after = run({ rowFigures: { [target.rowKey]: { quantity: 7 } } })
    expect(after.sliLines[0].quantity).toBe(7)
    expect(after.sliLines[0].weightKg).toBe(target.weightKg)
    expect(after.sliLines[0].valueUsd).toBe(target.valueUsd)
  })

  it('says nothing about a figure that matches what the documents already said', async () => {
    // Re-typing the printed figure is not a departure, and reporting it as one would leave a
    // warning nobody can account for on a shipment where nothing was changed.
    const target = run().sliLines[0]
    const { checks } = run({ rowFigures: { [target.rowKey]: { valueUsd: target.valueUsd } } })
    expect(checks.find((c) => c.id === 'entered-figures')).toBeUndefined()
  })

  it('ignores a figure that is not one', async () => {
    const target = run().sliLines[0]
    const after = run({ rowFigures: { [target.rowKey]: { quantity: Number.NaN, weightKg: -1 } } })
    expect(after.sliLines[0].quantity).toBe(target.quantity)
    expect(after.sliLines[0].weightKg).toBe(target.weightKg)
    expect(after.checks.find((c) => c.id === 'entered-figures')).toBeUndefined()
  })

  it('stays with the goods when the row is only reclassified', async () => {
    // A weight is a property of the goods, not of the number they are filed under. The key is
    // the lines the row holds, so a row that keeps its goods keeps the figure entered about
    // them — including when the shipment-wide export control is edited on the same screen,
    // which used to change every row's identity at once and discard the lot.
    const target = run().sliLines[0]
    const figures = { [target.rowKey]: { quantity: 7 } }

    const reclassified = run({
      rowFigures: figures,
      overrides: { [target.scheduleB.replace(/\./g, '')]: '8501.10.4040' },
    })
    expect(reclassified.sliLines.find((l) => l.scheduleB === '8501.10.4040')?.quantity).toBe(7)

    const reflagged = run({ rowFigures: figures, sme: 'Y' })
    expect(reflagged.sliLines.find((l) => l.rowKey === target.rowKey)?.quantity).toBe(7)
  })

  it('lapses when the row stops describing the same goods', async () => {
    // Splitting the row moves its lines apart, and a figure entered about all of them is not
    // a figure about either half.
    const target = run().sliLines.find((l) => l.sourceLineIds.length > 1)!
    const part = document.lines.find((l) => target.sourceLineIds.includes(l.id))!.partNumber
    const split = run({
      rowFigures: { [target.rowKey]: { quantity: 7 } },
      exportControlByPart: { [part.trim().toUpperCase()]: { eccn: '3A001.a' } },
    })
    expect(split.sliLines.some((l) => l.rowKey === target.rowKey)).toBe(false)
    expect(split.checks.find((c) => c.id === 'entered-figures')).toBeUndefined()
  })
})

describe('export control entered against a part', () => {
  /** The Omron invoice prints an ECCN per line, which is what a per-part entry has to beat. */
  const spec = simpleOmronCi()
  const CABLE = spec.lines[0].partNumber
  const CONTROLLER = spec.lines[1].partNumber

  const omron = async (over: Record<string, unknown> = {}) => {
    const parsed = await parseCipl('ci.pdf', await buildOmronCiPdf(spec))
    return reconcile(parsed, scheduleB, { ...CONTROLLED, ...over })
  }

  it('beats the shipment-wide value', async () => {
    // On the commodity rows, not on the merged lines: those stay what the documents said, and
    // an override is a filing decision — exactly as a per-part classification is.
    const { sliLines, mergedLines } = await omron({ exportControlByPart: { [CABLE]: { eccn: '3A001.a' } } })
    expect(sliLines.find((l) => l.scheduleB === '8544.42.0000')!.eccn).toBe('3A001.a')
    expect(mergedLines.find((l) => l.partNumber === CABLE)!.eccn).toBe('EAR99')
  })

  it('beats what the document itself printed', async () => {
    // The second line prints `5A992.c`. A document value is authoritative over the blanket
    // one — but not over a determination the filer made about these goods specifically.
    const { sliLines, mergedLines } = await omron()
    expect(mergedLines.find((l) => l.partNumber === CONTROLLER)!.eccn).toBe('5A992.c')
    expect(sliLines.find((l) => l.scheduleB === '8537.10.9170')!.eccn).toBe('5A992.c')

    const { sliLines: overridden } = await omron({ exportControlByPart: { [CONTROLLER]: { eccn: 'EAR99' } } })
    expect(overridden.find((l) => l.scheduleB === '8537.10.9170')!.eccn).toBe('EAR99')
  })

  it('falls back field by field', async () => {
    // A part can carry its own ECCN under the shipment's licence.
    const { sliLines } = await omron({ exportControlByPart: { [CABLE]: { eccn: '3A001.a' } } })
    const line = sliLines.find((l) => l.eccn === '3A001.a')!
    expect(line.license).toBe('NLR')
    expect(line.sme).toBe('N')
  })

  it('names every part it applies to', async () => {
    const { checks } = await omron({
      exportControlByPart: { [CABLE]: { eccn: '3A001.a', license: 'C33' } },
    })
    const reported = checks.find((c) => c.id === 'export-control-overrides')!
    expect(reported.severity).toBe('warning')
    expect(reported.passed).toBe(false)
    expect(reported.detail).toContain(CABLE)
    expect(reported.detail).toMatch(/ECCN 3A001\.a/)
    expect(reported.detail).toMatch(/LICENSE C33/)
  })

  it('says nothing for a part carrying no entered value', async () => {
    const { checks } = await omron({ exportControlByPart: { [CABLE]: {} } })
    expect(checks.find((c) => c.id === 'export-control-overrides')).toBeUndefined()
  })

  it('splits a commodity row, because export control is part of what a row is', async () => {
    const { sliLines } = await omron()
    const together = sliLines.filter((l) => l.scheduleB === '8544.42.0000')
    const { sliLines: after } = await omron({ exportControlByPart: { [CABLE]: { eccn: '3A001.a' } } })
    expect(after.filter((l) => l.eccn === '3A001.a')).toHaveLength(1)
    expect(together.length).toBeLessThanOrEqual(after.filter((l) => l.scheduleB === '8544.42.0000').length)
  })
})
