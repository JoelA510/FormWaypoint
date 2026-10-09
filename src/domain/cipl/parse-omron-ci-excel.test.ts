/**
 * The Omron workbook as Excel saves it.
 *
 * This repository's own writer stores every string inline, so the round-trip tests never meet
 * the layout Excel writes: text in a shared-strings table, cells holding only an index into it.
 * A shipper's file arrives that way, so the form is rebuilt here in that layout and read through
 * the same entry point as an upload.
 */
import { describe, expect, it } from 'vitest'
import { parseCiplFile } from '.'
import { omronCiGrid, simpleOmronCi, subtotalOf } from '../../test/synthetic/omron-ci'
import { zip } from '../../test/zip'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Every non-empty cell as a shared-string reference, as Excel stores typed-in text. */
function excelSavedWorkbook(rows: string[][]): Promise<Uint8Array> {
  const strings: string[] = []
  const indexOf = (text: string) => {
    const at = strings.indexOf(text)
    return at >= 0 ? at : strings.push(text) - 1
  }
  const column = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26))
  const sheetRows = rows
    .map((cells, r) =>
      `<row r="${r + 1}">` +
      cells
        .map((value, c) => (value === '' ? '' : `<c r="${column(c)}${r + 1}" t="s"><v>${indexOf(value)}</v></c>`))
        .join('') +
      '</row>',
    )
    .join('')
  return zip({
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="P1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst>${strings.map((t) => `<si><t>${escape(t)}</t></si>`).join('')}</sst>`,
  })
}

describe('an Omron commercial invoice saved by Excel', () => {
  it('reads the header and every line through the shared-strings table', async () => {
    const spec = simpleOmronCi()
    const parsed = await parseCiplFile('ci.xlsx', await excelSavedWorkbook(omronCiGrid(spec)))
    expect(parsed.format).toBe('omron-ci')
    expect(parsed.headers.FC.invoiceNumber).toBe(spec.invoiceNumber)
    expect(parsed.headers.FC.totalValue).toBeCloseTo(subtotalOf(spec), 2)
    const invoice = parsed.lines.filter((l) => l.documentKind === 'INVOICE')
    expect(invoice.map((l) => [l.partNumber, l.classification, l.quantity])).toEqual(
      spec.lines.map((l) => [l.partNumber, l.hts, l.quantity]),
    )
  })
})
