/**
 * The in-house form's "NO CHARGE - VALUE FOR CUSTOMS PURPOSES ONLY" box, read from the
 * workbook and from a PDF printed from it, and what the reconciliation says about it.
 */
import { describe, expect, it } from 'vitest'
import { parseCipl, parseCiplFile } from '.'
import { reconcile } from '../reconcile'
import { buildXlsx } from '../../lib/xlsx'
import { buildSyntheticCipl, simpleShipment } from '../../test/synthetic/cipl'
import {
  buildInHouseCiPdf,
  buildInHouseCiPdfPages,
  inHouseCiGrid,
  inHouseCiGrids,
  inHouseCiPageSpecs,
  simpleInHouseCi,
  type InHouseCiSpec,
} from '../../test/synthetic/inhouse-ci'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }
const workbook = (spec: InHouseCiSpec) => parseCiplFile('ci.xlsx', buildXlsx([{ name: 'INV', rows: inHouseCiGrid(spec) }]))
const withMark = (noChargeMark: string): InHouseCiSpec => ({ ...simpleInHouseCi(), noChargeMark })

describe('reading the box from the workbook', () => {
  it('reads the template’s empty box as unticked', async () => {
    expect((await workbook(simpleInHouseCi())).noChargeBox).toBe('unticked')
  })

  it('reads each mark a person types over the glyph as ticked', async () => {
    for (const mark of ['☒', '☑', '✓', '✔', 'X', 'x', '[X]', '[x]', '■']) {
      expect((await workbook(withMark(mark))).noChargeBox, mark).toBe('ticked')
    }
  })

  it('never reads a mark it does not know, or no mark at all, as unticked', async () => {
    for (const mark of ['', '?', 'Yes', '-']) {
      expect((await workbook(withMark(mark))).noChargeBox, JSON.stringify(mark)).toBe('unreadable')
    }
  })

  it('finds a mark typed into the cell before the wording, where a print or a person split them', async () => {
    const rows = inHouseCiGrid(simpleInHouseCi()).map((row) => [...row])
    const at = rows.findIndex((row) => row.some((cell) => /NO CHARGE/.test(cell)))
    const col = rows[at].findIndex((cell) => /NO CHARGE/.test(cell))
    rows[at][col - 1] = '☒'
    rows[at][col] = 'NO CHARGE — VALUE FOR CUSTOMS PURPOSES ONLY'
    expect((await parseCiplFile('ci.xlsx', buildXlsx([{ name: 'INV', rows }]))).noChargeBox).toBe('ticked')
  })

  it('does not take a commodity described as no charge for the box', async () => {
    const spec = simpleInHouseCi()
    spec.lines[0] = { ...spec.lines[0], description: 'Warranty replacement - NO CHARGE' }
    expect((await workbook(spec)).noChargeBox).toBe('unticked')
  })
})

describe('reading the box from a printed PDF', () => {
  it('reads an empty box and a ticked one', async () => {
    expect((await parseCiplFile('ci.pdf', await buildInHouseCiPdf(simpleInHouseCi()))).noChargeBox).toBe('unticked')
    expect((await parseCiplFile('ci.pdf', await buildInHouseCiPdf(withMark('[X]')))).noChargeBox).toBe('ticked')
  })

  it('calls the box unreadable when the print lost its mark', async () => {
    expect((await parseCiplFile('ci.pdf', await buildInHouseCiPdf(withMark('')))).noChargeBox).toBe('unreadable')
  })
})

describe('a form of several pages', () => {
  const pages = (marks: string[]) => inHouseCiPageSpecs({ ...simpleInHouseCi() }, 1).map((page, i) => ({ ...page, noChargeMark: marks[i] }))

  it('takes the box from the pages where they agree', async () => {
    const specs = pages(['☒', '☒'])
    const parsed = await parseCiplFile('ci.xlsx', buildXlsx(inHouseCiGrids(specs).map((rows, i) => ({ name: `P${i + 1}`, rows }))))
    expect(parsed.noChargeBox).toBe('ticked')
  })

  it('calls it unreadable where the pages disagree, and does not pick one', async () => {
    const specs = pages(['☐', '☒'])
    expect(specs).toHaveLength(2)
    const fromWorkbook = await parseCiplFile('ci.xlsx', buildXlsx(inHouseCiGrids(specs).map((rows, i) => ({ name: `P${i + 1}`, rows }))))
    expect(fromWorkbook.noChargeBox).toBe('unreadable')
    const fromPdf = await parseCiplFile('ci.pdf', await buildInHouseCiPdfPages(pages(['[ ]', '[X]'])))
    expect(fromPdf.noChargeBox).toBe('unreadable')
  })
})

describe('what the reconciliation says', () => {
  const check = async (spec: InHouseCiSpec) =>
    reconcile(await workbook(spec), null, CONTROLLED).checks.find((c) => c.id === 'no-charge-box')

  it('says a ticked box is ticked, where it will be seen, and that nothing changes because of it', async () => {
    const ticked = await check(withMark('☒'))
    expect(ticked).toMatchObject({ severity: 'info', passed: false, title: 'The no-charge box is ticked' })
    expect(ticked?.detail).toContain('filed exactly as printed')
  })

  it('files the same rows and values whether the box is ticked or not', async () => {
    const plain = reconcile(await workbook(simpleInHouseCi()), null, CONTROLLED)
    const ticked = reconcile(await workbook(withMark('☒')), null, CONTROLLED)
    expect(ticked.sliLines).toEqual(plain.sliLines)
    expect(ticked.canGenerate).toBe(plain.canGenerate)
  })

  it('states an empty box plainly, and an unreadable one as unreadable', async () => {
    expect(await check(simpleInHouseCi())).toMatchObject({ passed: true, title: 'The no-charge box is not ticked' })
    expect(await check(withMark('?'))).toMatchObject({ passed: false, title: 'The no-charge box could not be read' })
  })

  it('says nothing for a layout that has no such box', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
    expect(parsed.noChargeBox).toBeUndefined()
    expect(reconcile(parsed, null, CONTROLLED).checks.some((c) => c.id === 'no-charge-box')).toBe(false)
  })
})
