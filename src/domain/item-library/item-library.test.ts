import { beforeAll, describe, expect, it } from 'vitest'
import {
  ItemLibraryError,
  WorkbookError,
  columnToIndex,
  flagEntries,
  importItems,
  indexByPart,
  inspectWorkbook,
  libraryWeights,
  readDelimited,
  readWorkbook,
  readXlsx,
  type ItemLibraryEntry,
} from '.'
import { createScheduleBIndex, screenCode, type ScheduleBIndex } from '../schedule-b'

// ---------------------------------------------------------------------------
// A minimal .xlsx writer, so the reader is tested against real ZIP + XML bytes
// rather than against a hand-made object graph.
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Builds a ZIP. CRCs are left zero — the reader does not verify them. */
async function zip(files: Record<string, string>, compress = true): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, text] of Object.entries(files)) {
    const raw = encoder.encode(text)
    const body = compress ? await deflate(raw) : raw
    const nameBytes = encoder.encode(name)
    const method = compress ? 8 : 0

    const local = new Uint8Array(30 + nameBytes.length + body.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(body, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const WORKBOOK_XML =
  '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Items" sheetId="1" r:id="rId7"/></sheets></workbook>'
const RELS_XML =
  '<?xml version="1.0"?><Relationships><Relationship Id="rId7" Target="worksheets/sheet4.xml"/></Relationships>'

function sheetXml(rows: string[][]): string {
  const letters = (i: number) => String.fromCharCode(65 + i)
  const body = rows
    .map((cells, r) => {
      const inner = cells
        .map((value, c) =>
          value === ''
            ? `<c r="${letters(c)}${r + 1}" s="1"/>`
            : `<c r="${letters(c)}${r + 1}" t="inlineStr"><is><t>${value}</t></is></c>`,
        )
        .join('')
      return `<row r="${r + 1}">${inner}</row>`
    })
    .join('')
  return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`
}

// ---------------------------------------------------------------------------

const STORE_HEADERS = ['Part Number', 'Description', 'Current Export HTS', 'Current Import HTS', 'Weight (G)']
const TAG_HEADERS = ['2nd Item Number', 'Expanded Description', 'Harmonized Shipping Code', 'Net Weight']

let index: ScheduleBIndex

beforeAll(async () => {
  const payload = await import('../../../public/data/schedule-b.json')
  index = createScheduleBIndex(payload.default as never)
})

describe('workbook reading', () => {
  it('reads a deflated .xlsx through the sheet named first, not sheet1', async () => {
    const bytes = await zip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': RELS_XML,
      // Present, and deliberately wrong: resolving by filename would read this one.
      'xl/worksheets/sheet1.xml': sheetXml([['Part Number', 'Weight (G)'], ['DECOY', '1']]),
      'xl/worksheets/sheet4.xml': sheetXml([STORE_HEADERS, ['04465-000', 'Cable', '8544.42.0000', '8544.42.9000', '544']]),
    })

    const rows = await readXlsx(bytes)
    expect(rows[0]).toEqual(STORE_HEADERS)
    expect(rows[1][0]).toBe('04465-000')
    expect(rows[1][4]).toBe('544')
  })

  it('reads stored (uncompressed) entries too', async () => {
    const bytes = await zip(
      {
        'xl/workbook.xml': WORKBOOK_XML,
        'xl/_rels/workbook.xml.rels': RELS_XML,
        'xl/worksheets/sheet4.xml': sheetXml([TAG_HEADERS, ['82578', 'Optoshield', '9801.00.1012', '1']]),
      },
      false,
    )
    expect((await readXlsx(bytes))[1][2]).toBe('9801.00.1012')
  })

  it('resolves shared strings, including rich-text runs', async () => {
    const shared =
      '<?xml version="1.0"?><sst><si><t>Part Number</t></si><si><r><t>Weight </t></r><r><t>(G)</t></r></si><si><t>04465-000</t></si></sst>'
    const sheet =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>544</v></c></row>' +
      '</sheetData></worksheet>'
    const bytes = await zip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': RELS_XML,
      'xl/worksheets/sheet4.xml': sheet,
      'xl/sharedStrings.xml': shared,
    })

    expect(await readXlsx(bytes)).toEqual([
      ['Part Number', 'Weight (G)'],
      ['04465-000', '544'],
    ])
  })

  it('keeps cells in their lettered columns when earlier ones are absent', async () => {
    // Excel omits a cell entirely when it has never been touched, so `C` can follow `A`.
    const sheet =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="D1" t="inlineStr"><is><t>d</t></is></c></row>' +
      '</sheetData></worksheet>'
    const bytes = await zip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': RELS_XML,
      'xl/worksheets/sheet4.xml': sheet,
    })
    expect(await readXlsx(bytes)).toEqual([['a', '', '', 'd']])
  })

  it('decodes XML entities in cell text', async () => {
    const bytes = await zip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': RELS_XML,
      'xl/worksheets/sheet4.xml': sheetXml([['BRACKET, L &amp; R', 'X &lt; Y', '&#65;']]),
    })
    expect(await readXlsx(bytes)).toEqual([['BRACKET, L & R', 'X < Y', 'A']])
  })

  it('rejects a file that is not a workbook', async () => {
    await expect(readXlsx(encoder.encode('this is not a zip'))).rejects.toBeInstanceOf(WorkbookError)
  })

  it('maps spreadsheet column letters past Z', () => {
    expect([columnToIndex('A'), columnToIndex('Z'), columnToIndex('AA'), columnToIndex('AB')]).toEqual([0, 25, 26, 27])
  })
})

describe('delimited text', () => {
  it('honours quoted fields containing the delimiter and newlines', () => {
    expect(readDelimited('a,"b,c","line\nbreak"\n1,2,3')).toEqual([
      ['a', 'b,c', 'line\nbreak'],
      ['1', '2', '3'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(readDelimited('"say ""hi""",x')).toEqual([['say "hi"', 'x']])
  })

  it('detects tab-separated input', () => {
    expect(readDelimited('a\tb\tc\n1\t2\t3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('routes by file extension, and sniffs when there is none', async () => {
    expect(await readWorkbook('items.csv', encoder.encode('a,b\n1,2'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(await readWorkbook('items', encoder.encode('a,b\n1,2'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    await expect(readWorkbook('old.xls', encoder.encode('anything'))).rejects.toBeInstanceOf(WorkbookError)
  })
})

describe('column detection', () => {
  it('reads the ItemStore layout, including the unit stated in the header', () => {
    const inspection = inspectWorkbook([STORE_HEADERS, ['37008', 'LED, red indicator', '8541.41.0000', '8541.41.0000', '8']])
    expect(inspection.columns).toEqual({ partNumber: 0, description: 1, exportCode: 2, importCode: 3, weight: 4 })
    expect(inspection.declaredWeightUnit).toBe('g')
    expect(inspection.dataRowCount).toBe(1)
  })

  it('reads the ItemTag layout, whose weight header states no unit', () => {
    const inspection = inspectWorkbook([TAG_HEADERS, ['40603-0010', 'Sensor head', '9031.90.0000', '1100']])
    expect(inspection.columns).toEqual({ partNumber: 0, description: 1, exportCode: 2, weight: 3 })
    expect(inspection.columns.importCode).toBeUndefined()
    expect(inspection.declaredWeightUnit).toBeNull()
  })

  it('does not mistake the import column for the export one', () => {
    // Import comes first here; the export code must still be column B.
    const inspection = inspectWorkbook([['Item', 'Current Import HTS', 'Current Export HTS'], ['P', 'a', 'b']])
    expect(inspection.columns.importCode).toBe(1)
    expect(inspection.columns.exportCode).toBe(2)
  })

  it('finds a header row below a title block', () => {
    const inspection = inspectWorkbook([
      ['Item master extract'],
      ['Run 2026-07-27'],
      [],
      STORE_HEADERS,
      ['37008', 'LED', '8541.41.0000', '8541.41.0000', '8'],
    ])
    expect(inspection.headerRow).toBe(3)
    expect(inspection.dataRowCount).toBe(1)
  })

  it('refuses a sheet with no recognisable columns', () => {
    expect(() => inspectWorkbook([['alpha', 'beta'], ['1', '2']])).toThrow(ItemLibraryError)
  })

  it('takes the net weight column when the file also carries a gross one', () => {
    // Box 26 is a net weight. Reading positionally would put gross there.
    const grossFirst = inspectWorkbook([['Part Number', 'Gross Weight (G)', 'Net Weight (G)'], ['P', '900', '544']])
    expect(grossFirst.columns.weight).toBe(2)

    const netFirst = inspectWorkbook([['Part Number', 'Net Weight (G)', 'Gross Weight (G)'], ['P', '544', '900']])
    expect(netFirst.columns.weight).toBe(1)
  })

  it('avoids a gross column when nothing is named net', () => {
    const inspection = inspectWorkbook([['Part Number', 'Gross Weight (G)', 'Shipping Weight (G)'], ['P', '900', '544']])
    expect(inspection.columns.weight).toBe(2)
  })

  it('still uses a gross column when it is the only weight there is', () => {
    const inspection = inspectWorkbook([['Part Number', 'Gross Weight (G)'], ['P', '900']])
    expect(inspection.columns.weight).toBe(1)
  })
})

describe('import', () => {
  const storeRows = [
    STORE_HEADERS,
    ['04465-000', 'Cable assembly', '8544.42.0000', '8544.42.9000', '544'],
    ['40588-0023', 'Light curtain', '9031.49.8000', '9031.49.9000', '1700'],
    ['00212-200', 'Grommet', '4016.99.6000', '4016.99.6050', ''],
  ]

  it('converts a grams column to kilograms', () => {
    const summary = importItems(storeRows, { fileName: 'ItemStore.xlsx', index, now: 'T' })
    expect(summary.weightUnit).toBe('g')
    expect(summary.entries[0]).toMatchObject({
      partNumber: '04465-000',
      exportCode: '8544.42.0000',
      importCode: '8544.42.9000',
      netWeightKg: 0.544,
      source: 'ItemStore.xlsx',
    })
    expect(summary.entries[1].netWeightKg).toBe(1.7)
  })

  it('treats a blank or zero weight as absent, never as zero', () => {
    const summary = importItems(storeRows, { fileName: 'f.xlsx', index })
    expect(summary.entries[2].netWeightKg).toBeNull()
    expect(summary.withoutWeight).toBe(1)

    const zeroed = importItems([STORE_HEADERS, ['X', 'thing', '8544.42.0000', '', '0']], { fileName: 'f.xlsx', index })
    expect(zeroed.entries[0].netWeightKg).toBeNull()
  })

  it('requires a unit when the header does not state one', () => {
    expect(() => importItems([TAG_HEADERS, ['P', 'thing', '9031.90.0000', '1100']], { fileName: 'ItemTag.xlsx', index })).toThrow(
      /does not state its unit/,
    )
  })

  it('applies a caller-supplied unit when the header is silent', () => {
    const grams = importItems([TAG_HEADERS, ['P', 'thing', '9031.90.0000', '1100']], {
      fileName: 'ItemTag.xlsx',
      index,
      weightUnit: 'g',
    })
    expect(grams.entries[0].netWeightKg).toBe(1.1)

    const pounds = importItems([TAG_HEADERS, ['P', 'thing', '9031.90.0000', '2']], {
      fileName: 'ItemTag.xlsx',
      index,
      weightUnit: 'lb',
    })
    expect(pounds.entries[0].netWeightKg).toBeCloseTo(0.907185, 6)
  })

  it('lets a stated header unit win over a mistaken caller choice', () => {
    // The header says grams; passing kg must not silently multiply the shipment by 1000.
    const summary = importItems(storeRows, { fileName: 'f.xlsx', index, weightUnit: 'kg' })
    expect(summary.weightUnit).toBe('g')
    expect(summary.entries[0].netWeightKg).toBe(0.544)
  })

  it('strips thousands separators from weights', () => {
    const summary = importItems([STORE_HEADERS, ['X', 'big', '8544.42.0000', '', '411,408']], {
      fileName: 'f.xlsx',
      index,
    })
    expect(summary.entries[0].netWeightKg).toBe(411.408)
  })

  it('reads a decimal comma as a decimal point, not a thousands separator', () => {
    // A semicolon-delimited export writes 0,544 for 0.544 g. Stripping the comma would file
    // 544 g — a thousandfold overstatement.
    const summary = importItems(
      [
        STORE_HEADERS,
        ['A', 'point five four four grams', '8544.42.0000', '', '0,544'],
        ['B', 'one and a half grams', '8544.42.0000', '', '1,5'],
      ],
      { fileName: 'f.csv', index },
    )
    expect(summary.entries[0].netWeightKg).toBe(0.000544)
    expect(summary.entries[1].netWeightKg).toBe(0.0015)
  })

  it('still reads a three-group thousands value as thousands', () => {
    const summary = importItems([STORE_HEADERS, ['X', 'big', '8544.42.0000', '', '1,234']], {
      fileName: 'f.xlsx',
      index,
    })
    expect(summary.entries[0].netWeightKg).toBe(1.234)
  })

  it('skips rows with no part number and reports duplicates', () => {
    const summary = importItems(
      [
        STORE_HEADERS,
        ['', 'orphan row', '8544.42.0000', '', '10'],
        ['04465-000', 'first', '8544.42.0000', '', '500'],
        ['04465-000', 'second wins', '8544.42.0000', '', '544'],
      ],
      { fileName: 'f.xlsx', index },
    )
    expect(summary.skipped).toBe(1)
    expect(summary.duplicates).toEqual(['04465-000'])
    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0].description).toBe('second wins')
  })

  it('keys parts case-insensitively while keeping the original spelling', () => {
    const summary = importItems([STORE_HEADERS, ['abc-100', 'thing', '8544.42.0000', '', '10']], {
      fileName: 'f.xlsx',
      index,
    })
    expect(summary.entries[0].partNumber).toBe('ABC-100')
    expect(summary.entries[0].displayPartNumber).toBe('abc-100')
    expect(indexByPart(summary.entries).get('ABC-100')).toBeDefined()
  })

  it('exposes weights as a part -> kg map, omitting parts with none', () => {
    const summary = importItems(storeRows, { fileName: 'f.xlsx', index })
    expect(libraryWeights(summary.entries)).toEqual({ '04465-000': 0.544, '40588-0023': 1.7 })
  })
})

describe('commodity number screening', () => {
  it('accepts a well-formed, current code', () => {
    expect(screenCode('8544.42.0000', index)).toMatchObject({ status: 'ok' })
  })

  it('flags a code that is not written ####.##.####', () => {
    const screening = screenCode('8544420000', index)
    expect(screening.status).toBe('malformed')
    // Still resolvable — this is a typing correction, not a reclassification.
    expect(screening).toMatchObject({ resolves: true })
  })

  it('flags a code with the wrong number of digits', () => {
    expect(screenCode('8544.42', index)).toMatchObject({ status: 'malformed', resolves: false })
  })

  it('flags a well-formed code the Census file does not carry', () => {
    // A US import HTS with a statistical suffix. Correctly written, not a Schedule B number.
    expect(screenCode('9801.00.1012', index)).toMatchObject({ status: 'unknown' })
  })

  it('reports a blank code as absent rather than malformed', () => {
    expect(screenCode('', index)).toMatchObject({ status: 'absent' })
  })

  it('says so when the dataset is unavailable instead of passing the code', () => {
    expect(screenCode('8544.42.0000', null)).toMatchObject({ status: 'unknown' })
  })
})

describe('flagging an imported library', () => {
  const entry = (over: Partial<ItemLibraryEntry>): ItemLibraryEntry => ({
    partNumber: 'P',
    displayPartNumber: 'P',
    description: 'thing',
    exportCode: '8544.42.0000',
    importCode: '',
    netWeightKg: 1,
    source: 'f.xlsx',
    importedAt: 'T',
    ...over,
  })

  it('lists only the entries that fail, with the reason', () => {
    const flagged = flagEntries(
      [
        entry({ partNumber: 'GOOD', displayPartNumber: 'GOOD' }),
        entry({ partNumber: 'BAD-FORMAT', displayPartNumber: 'BAD-FORMAT', exportCode: '85444.2.0000' }),
        entry({ partNumber: 'RETIRED', displayPartNumber: 'RETIRED', exportCode: '9801.00.1012' }),
      ],
      index,
    )
    expect(flagged.map((f) => [f.partNumber, f.status])).toEqual([
      ['BAD-FORMAT', 'malformed'],
      ['RETIRED', 'unknown'],
    ])
    expect(flagged[0].reason).toMatch(/####\.##\.####|instead of/)
  })

  it('ignores rows with no code at all, so a weights-only import is not all findings', () => {
    expect(flagEntries([entry({ exportCode: '' })], index)).toEqual([])
  })

  it('screens the export code and never the import one', () => {
    // 4016.99.6050 is an import-only number; it must not be judged, only the export code.
    expect(flagEntries([entry({ exportCode: '4016.99.6000', importCode: '4016.99.6050' })], index)).toEqual([])
  })

  it('reports only format failures when the Census dataset is unavailable', () => {
    // Without the dataset, "not in the file" is a fact about the tool, not the item master.
    // Declaring every part broken would bury the one finding that is still real.
    const entries = [
      entry({ partNumber: 'GOOD', displayPartNumber: 'GOOD' }),
      entry({ partNumber: 'RETIRED', displayPartNumber: 'RETIRED', exportCode: '9801.00.1012' }),
      entry({ partNumber: 'BAD-FORMAT', displayPartNumber: 'BAD-FORMAT', exportCode: '85444.2.0000' }),
    ]
    expect(flagEntries(entries, null).map((f) => [f.partNumber, f.status])).toEqual([['BAD-FORMAT', 'malformed']])
    // With the dataset, the retired code is a finding again.
    expect(flagEntries(entries, index)).toHaveLength(2)
  })
})
