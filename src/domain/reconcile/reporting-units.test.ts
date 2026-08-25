/**
 * The unit each commodity row is filed in.
 *
 * Several Schedule B numbers are reported in kilograms while every invoice in this trade
 * counts pieces, and a piece count filed against one of them is a reporting error that
 * nothing else on the form gives any sign of. These build a real document and reconcile it
 * against the shipped Census dataset, because the whole question is what that dataset says
 * about a code the parser read.
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
import type { ParsedCipl, SLILine } from '../types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/** Reported in NO. */
const BY_COUNT = '8544.42.0000'
/** Reported in KG — the case this exists for. */
const BY_WEIGHT = '9031.90.0000'

let scheduleB: ScheduleBIndex

beforeAll(() => {
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../../public/data/schedule-b.json'), 'utf8')),
  )
})

/** One shipment line, classified however the test needs, with a stated weight. */
async function shipment(classification: string, over: Record<string, unknown> = {}): Promise<ParsedCipl> {
  const spec = simpleShipment()
  const bytes = await buildSyntheticCipl({
    ...spec,
    lines: [{ ...spec.lines[0], classification, quantity: 12, netWeightKg: 4.263, grossWeightKg: 4.5, ...over }],
  })
  return parseCipl('synthetic.pdf', bytes)
}

const row = (lines: SLILine[], code: string) => lines.find((l) => l.scheduleB === code)!

describe('the unit a commodity row is filed in', () => {
  it('files the invoice count for a code reported by the piece', async () => {
    const { sliLines } = reconcile(await shipment(BY_COUNT), scheduleB, CONTROLLED)
    const line = row(sliLines, BY_COUNT)
    expect(line.reportingUom).toBe('NO')
    expect(line.reportingQuantity).toBe(12)
    expect(line.reportingBasis).toBe('source')
    // The document's own figures are never overwritten — they are what the reconciliation
    // proves the totals against.
    expect(line.quantity).toBe(12)
    expect(line.sourceUom).toBe('PCS')
  })

  it('files the net weight for a code reported by weight', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    expect(line.reportingUom).toBe('KG')
    // Whole kilograms: 4.263 kg files as 4.
    expect(line.reportingQuantity).toBe(4)
    expect(line.reportingBasis).toBe('net-weight')
    // Still 12 pieces on the invoice, and the row still says so.
    expect(line.quantity).toBe(12)
  })

  it('passes the unit check once the row files the required unit', async () => {
    // The warning this replaces fired on every one of these shipments and there was nothing
    // anyone could do about it from inside the app.
    const { checks } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(true)
    expect(uom.detail).toMatch(/net weight/)
  })

  it('warns, and keeps the printed figure, when the required unit cannot be stated', async () => {
    // No weight anywhere on the document, so there is no kilogram figure to file. The row
    // keeps what was printed rather than acquiring an invented one.
    const parsed = await shipment(BY_WEIGHT, { netWeightKg: undefined, grossWeightKg: undefined })
    const { sliLines, checks } = reconcile(parsed, scheduleB, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    // In the document's own words, because that is what the row is filing.
    expect(line.reportingUom).toBe('PCS')
    expect(line.reportingQuantity).toBe(12)

    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(false)
    expect(uom.severity).toBe('warning')
    expect(uom.expected).toBe('KG')
    // Compared canonically, so the check reads the same whichever spelling was filed.
    expect(uom.actual).toBe('NO')
  })

  it('names the missing weight for any weight-derived unit, not just kilograms', async () => {
    // 2523.10.0000 is reported in `T`. What is wrong with this row is the absent weight, and
    // the check used to send the filer to the classification instead whenever the required
    // unit was anything but KG.
    const parsed = await shipment('2523.10.0000', { netWeightKg: undefined, grossWeightKg: undefined })
    const { checks } = reconcile(parsed, scheduleB, CONTROLLED)
    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(false)
    expect(uom.expected).toBe('T')
    expect(uom.detail).toMatch(/per-part weights/)
    expect(uom.detail).toMatch(/the T figure/)
  })

  it('tells a unit that was chosen away from one that cannot be reached', async () => {
    // The row has a weight, so KG is reachable and the only reason it is filing pieces is
    // that somebody picked them. Sending that filer to go and supply per-part weights — the
    // advice for a row that genuinely has none — points at the wrong fix.
    const parsed = await shipment(BY_WEIGHT)
    const { checks } = reconcile(parsed, scheduleB, { ...CONTROLLED, reportingUnits: { '9031900000': 'NO' } })
    const uom = checks.find((c) => c.id.startsWith('sb-uom:'))!
    expect(uom.passed).toBe(false)
    expect(uom.detail).toMatch(/changed by hand/)
    expect(uom.detail).not.toMatch(/per-part weights/)
  })

  it('blocks generation when a row has no usable quantity', async () => {
    // Gated once, upstream. Left to the outputs, a blank box on a signed declaration reads
    // as nothing to declare and the keying sheet's TOTAL comes out short by the row.
    const parsed = await shipment(BY_COUNT)
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    expect(result.checks.find((c) => c.id === 'quantities-usable')?.passed).toBe(true)

    result.sliLines[0].reportingQuantity = Number.NaN
    const broken = { ...result, sliLines: result.sliLines }
    // The check reads the rows it is given, so a row spoiled after the fact still fails it.
    expect(
      broken.sliLines.filter((l) => l.reportingBasis !== 'none' && !Number.isFinite(l.reportingQuantity)),
    ).toHaveLength(1)
  })

  it('publishes every unit the code accepts, so the choice can be offered', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    expect(row(sliLines, BY_WEIGHT).scheduleBUnits).toEqual(['KG'])
    expect(row(sliLines, BY_WEIGHT).scheduleBUnit).toBe('KG')
  })

  it('lets a chosen unit override the default, keyed by commodity number', async () => {
    const parsed = await shipment(BY_COUNT)
    const { sliLines } = reconcile(parsed, scheduleB, {
      ...CONTROLLED,
      reportingUnits: { '8544420000': 'KG' },
    })
    const line = row(sliLines, BY_COUNT)
    expect(line.reportingUom).toBe('KG')
    expect(line.reportingQuantity).toBe(4)
    expect(line.reportingBasis).toBe('net-weight')
  })

  it('ignores a chosen unit the shipment cannot state', async () => {
    // Choosing kilograms for goods with no weight is an empty box, not a choice.
    const parsed = await shipment(BY_COUNT, { netWeightKg: undefined, grossWeightKg: undefined })
    const { sliLines } = reconcile(parsed, scheduleB, {
      ...CONTROLLED,
      reportingUnits: { '8544420000': 'KG' },
    })
    expect(row(sliLines, BY_COUNT).reportingUom).toBe('NO')
    expect(row(sliLines, BY_COUNT).reportingQuantity).toBe(12)
  })

  it('falls back to the document when the dataset is not loaded at all', async () => {
    const { sliLines } = reconcile(await shipment(BY_WEIGHT), null, CONTROLLED)
    const line = row(sliLines, BY_WEIGHT)
    expect(line.scheduleBUnits).toEqual([])
    expect(line.reportingUom).toBe('PCS')
    expect(line.reportingQuantity).toBe(12)
  })
})

describe('a row that rounds away to nothing', () => {
  it('warns when the weight it files rounds away, and names that weight', async () => {
    // A quantity box reading `0` on a signed declaration says the goods are not there.
    // 4016.93.0000 is reported in KG; a fifth of a kilo has nowhere to land.
    const parsed = await shipment('4016.93.0000', { netWeightKg: 0.2, grossWeightKg: 0.3 })
    const { sliLines, checks } = reconcile(parsed, scheduleB, CONTROLLED)
    expect(row(sliLines, '4016.93.0000').reportingQuantity).toBe(0)

    const zero = checks.find((c) => c.id === 'quantities-nonzero')!
    expect(zero.passed).toBe(false)
    expect(zero.severity).toBe('warning')
    expect(zero.detail).toMatch(/4016\.93\.0000 at 0\.2 kg/)
  })

  it('warns with no weight anywhere, and names the figure that did round away', async () => {
    // The Omron invoice states a unit per line and no weights at all, so a line invoiced as
    // `0.3 KG` files its own figure — rounded whole, to nothing — with no weight behind it.
    // Sending that filer to look at `0 kg` points them at a number the document has not got
    // and is never going to have.
    const spec = simpleOmronCi()
    const bytes = await buildOmronCiPdf({
      ...spec,
      netWeightKg: undefined,
      grossWeightKg: undefined,
      lines: [{ ...spec.lines[0], hts: '4016.93.0000', quantity: 0.3, uom: 'KG' }],
    })
    const parsed = await parseCipl('ci.pdf', bytes)
    const { sliLines, checks } = reconcile(parsed, scheduleB, CONTROLLED)
    const line = row(sliLines, '4016.93.0000')
    expect(line.weightKg).toBe(0)
    expect(line.reportingQuantity).toBe(0)

    const zero = checks.find((c) => c.id === 'quantities-nonzero')!
    expect(zero.passed).toBe(false)
    expect(zero.detail).toMatch(/4016\.93\.0000 at 0\.3 KG/)
    expect(zero.detail).not.toMatch(/0 kg/)
  })

  it('says nothing when every row files at least one', async () => {
    const { checks } = reconcile(await shipment(BY_WEIGHT), scheduleB, CONTROLLED)
    expect(checks.find((c) => c.id === 'quantities-nonzero')?.passed).toBe(true)
  })
})

describe('a shipment with more rows than a sheet holds', () => {
  it('reports the sheet count instead of refusing the shipment', async () => {
    // This was a blocking check: the form was refused and nothing came out, over a situation
    // the paper handles by being filed as several sheets.
    const spec = simpleShipment()
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(spec))
    // Three invoice lines aggregate to two commodity rows, so one to a sheet is two sheets.
    const { sliLines, checks } = reconcile(parsed, scheduleB, { ...CONTROLLED, maxRows: 1 })
    expect(sliLines.length).toBe(2)

    const capacity = checks.find((c) => c.id === 'row-capacity')!
    expect(capacity.severity).toBe('info')
    expect(capacity.passed).toBe(true)
    expect(capacity.detail).toMatch(/2 pages/)
    // And nothing blocking is raised by the length alone.
    expect(checks.filter((c) => c.severity === 'blocking' && !c.passed)).toEqual([])
  })

  it('refuses a row count no real shipment has', async () => {
    // The blocking check this replaced fired at one sheet, which is what the tool now handles
    // by producing several. But nothing else notices a parse that went wrong: each sheet is a
    // full copy of the template page written on the browser's main thread, so a mis-merged
    // invoice becomes tens of megabytes and a frozen tab with the checks panel saying nothing.
    const codes = [
      '8501.10.3000', '8501.10.4040', '8501.10.4060', '8501.10.4080', '8501.10.6020', '8501.10.6040',
      '8501.10.6060', '8501.10.6080', '8501.20.2000', '8501.20.3000', '8501.20.6000', '8501.31.2000',
      '8501.31.3000', '8501.31.6000', '8501.31.8100', '8501.32.2000', '8501.32.4000', '8501.32.6100',
      '8501.33.2000', '8501.33.3000', '8501.33.4040',
    ]
    const spec = simpleShipment()
    const build = async (count: number) =>
      parseCipl(
        'synthetic.pdf',
        await buildSyntheticCipl({
          ...spec,
          lines: codes.slice(0, count).map((classification, i) => ({
            ...spec.lines[0],
            lineNumber: String(i + 1).padStart(4, '0'),
            partNumber: `P-${i + 1}`,
            classification,
          })),
        }),
      )

    // One row to a sheet, so the row count is the sheet count.
    const fine = reconcile(await build(20), scheduleB, { ...CONTROLLED, maxRows: 1 })
    expect(fine.checks.find((c) => c.id === 'row-capacity')?.passed).toBe(true)
    expect(fine.canGenerate).toBe(true)

    const absurd = reconcile(await build(21), scheduleB, { ...CONTROLLED, maxRows: 1 })
    const capacity = absurd.checks.find((c) => c.id === 'row-capacity')!
    expect(capacity.severity).toBe('blocking')
    expect(capacity.passed).toBe(false)
    expect(capacity.detail).toMatch(/read wrongly/)
    expect(absurd.canGenerate).toBe(false)
  })

  it('still says so when one sheet is enough', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    const { checks } = reconcile(parsed, scheduleB, { ...CONTROLLED, maxRows: 8 })
    const capacity = checks.find((c) => c.id === 'row-capacity')!
    expect(capacity.detail).toMatch(/one sheet/)
  })
})
