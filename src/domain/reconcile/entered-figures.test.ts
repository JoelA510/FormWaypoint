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
import { reconcile } from '.'
import type { ParsedCipl } from '../types'

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

  it('lapses rather than following the row onto other goods', async () => {
    // The key is what the row *is*. Reclassifying it moves it out from under the figure
    // instead of carrying a hand-entered quantity onto a different commodity number.
    const target = run().sliLines[0]
    const figures = { [target.rowKey]: { quantity: 7 } }
    const reclassified = run({
      rowFigures: figures,
      overrides: { [target.scheduleB.replace(/\./g, '')]: '8501.10.4040' },
    })
    expect(reclassified.sliLines.some((l) => l.quantity === 7 && l.scheduleB === '8501.10.4040')).toBe(false)
    expect(reclassified.checks.find((c) => c.id === 'entered-figures')).toBeUndefined()
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
