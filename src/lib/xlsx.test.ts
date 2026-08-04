/**
 * The workbook writer, checked by reading its output back.
 *
 * Round-tripped through `readWorkbook` — the parser this project already uses on item-master
 * imports, written against real files from two different ERPs. It is an independent reader
 * in the sense that matters: it was written to consume other people's workbooks, not this
 * writer's, so a shape only this writer produces would not survive it.
 *
 * The archive is also checked structurally, because the failure that costs a person their
 * afternoon is not a wrong cell — it is Excel refusing to open the file at all and saying
 * only that it is corrupt.
 */
import { describe, expect, it } from 'vitest'
import { buildXlsx } from './xlsx'
import { readWorkbook } from '../domain/item-library/read-workbook'

const read = (bytes: Uint8Array) => readWorkbook('book.xlsx', bytes)

describe('a workbook', () => {
  it('round-trips its cells', async () => {
    const bytes = buildXlsx([
      { name: 'Commodities', rows: [['Part', 'Qty', 'Value'], ['44534-0730', 13, 198.12]] },
    ])
    expect(await read(bytes)).toEqual([
      ['Part', 'Qty', 'Value'],
      ['44534-0730', '13', '198.12'],
    ])
  })

  it('writes numbers as numbers, so a column sums', () => {
    // The whole reason for a workbook over a text file. A quantity stored as text is
    // left-aligned, will not total, and sorts 10 before 9.
    const sheet = new TextDecoder().decode(buildXlsx([{ name: 'S', rows: [['Qty'], [13], ['13']] }]))
    expect(sheet).toContain('<v>13</v>')
    expect(sheet).toContain('t="inlineStr"')
  })

  it('escapes what an ERP puts in a description', async () => {
    const rows = [['Description'], ['Bolt & nut <M6>'], ['REPL ACT’R MFS-11'], ['CAP 10µF "low ESR"']]
    expect(await read(buildXlsx([{ name: 'S', rows }]))).toEqual(rows)
  })

  it('drops control characters rather than producing a file Excel calls corrupt', async () => {
    const [, row] = await read(buildXlsx([{ name: 'S', rows: [['Description'], ['bad\u0000text']] }]))
    expect(row).toEqual(['badtext'])
  })

  it('keeps each sheet separate and named', () => {
    const workbook = new TextDecoder().decode(
      buildXlsx([
        { name: 'Commodities', rows: [['a']] },
        { name: 'Shipment details', rows: [['b']] },
        { name: 'Notes', rows: [['c']] },
      ]),
    )
    for (const name of ['Commodities', 'Shipment details', 'Notes']) expect(workbook).toContain(`name="${name}"`)
    expect(workbook).toContain('sheet3.xml')
  })

  it('makes a tab name Excel would reject into one it accepts', () => {
    const workbook = new TextDecoder().decode(
      buildXlsx([{ name: 'vendorA5: FC/TP1 [detail]', rows: [['a']] }, { name: '', rows: [['b']] }]),
    )
    expect(workbook).toContain('name="vendorA5  FC TP1  detail"')
    expect(workbook).toContain('name="Sheet2"')
  })

  it('keeps two tabs apart rather than writing a workbook Excel calls corrupt', () => {
    const workbook = new TextDecoder().decode(
      buildXlsx([
        { name: 'Commodities', rows: [['a']] },
        { name: 'Commodities', rows: [['b']] },
        { name: 'Commodities', rows: [['c']] },
      ]),
    )
    expect(workbook).toContain('name="Commodities"')
    expect(workbook).toContain('name="Commodities (2)"')
    expect(workbook).toContain('name="Commodities (3)"')
  })

  it('stays inside 31 characters when it has to disambiguate a truncated name', () => {
    const long = 'A commodity description far too long for a tab'
    const workbook = new TextDecoder().decode(
      buildXlsx([
        { name: long, rows: [['a']] },
        { name: long, rows: [['b']] },
      ]),
    )
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])
    expect(names).toEqual(['A commodity description far too', 'A commodity description far (2)'])
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31)
  })

  it('names columns past Z', async () => {
    const header = Array.from({ length: 30 }, (_, i) => `c${i}`)
    const sheet = new TextDecoder().decode(buildXlsx([{ name: 'S', rows: [header] }]))
    expect(sheet).toContain('r="Z1"')
    expect(sheet).toContain('r="AD1"')
    expect((await read(buildXlsx([{ name: 'S', rows: [header] }])))[0]).toHaveLength(30)
  })

  it('leaves a gap where a cell is empty rather than shifting the row', async () => {
    // The TOTAL row has no country or code. Those columns must stay empty, not close up.
    const rows = [['Part', 'COO', 'Qty'], ['TOTAL', null, 91]]
    const [, total] = await read(buildXlsx([{ name: 'S', rows }]))
    expect(total[0]).toBe('TOTAL')
    expect(total[2]).toBe('91')
  })

  it('refuses to build nothing', () => {
    expect(() => buildXlsx([])).toThrow(/at least one sheet/)
  })
})

describe('the archive itself', () => {
  const parts = (bytes: Uint8Array) => {
    const text = new TextDecoder('latin1').decode(bytes)
    return ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']
      .every((name) => text.includes(name))
  }

  it('carries every part a reader looks for', () => {
    expect(parts(buildXlsx([{ name: 'S', rows: [['a']] }]))).toBe(true)
  })

  it('ends with a central directory a reader can find', () => {
    // Without a locatable end-of-central-directory record the file is not a ZIP at all, and
    // Excel reports only that it is corrupt.
    const bytes = buildXlsx([{ name: 'S', rows: [['a']] }])
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
    // Six fixed parts plus one worksheet.
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(6)
  })
})
