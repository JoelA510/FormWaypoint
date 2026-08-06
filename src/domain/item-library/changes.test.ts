/**
 * The item-master worklist: which manual entries need keying into JDE, and which do not.
 *
 * The distinction that matters is `matches` versus `update`. A row that says "change this to
 * what it already is" is worse than no row — it costs the same attention as a real edit and
 * teaches the reader that the list is padded.
 */
import { describe, expect, it } from 'vitest'
import { libraryChanges, libraryChangesFileName, renderLibraryChangeLog, renderLibraryChangesCsv } from './changes'
import type { EnteredValues } from './changes'
import type { ItemLibraryEntry } from '.'

const entry = (over: Partial<ItemLibraryEntry>): ItemLibraryEntry => ({
  partNumber: 'AAA-1',
  displayPartNumber: 'AAA-1',
  description: 'CABLE, 5M',
  exportCode: '8544.42.0000',
  importCode: '',
  netWeightKg: 0.25,
  source: 'ItemTag.xlsx',
  importedAt: '2026-07-01T00:00:00.000Z',
  ...over,
})

const entered = (over: Partial<EnteredValues>): EnteredValues => ({
  partNumber: 'AAA-1',
  description: 'CABLE, 5M',
  netWeightKg: null,
  updatedAt: '2026-07-29T12:00:00.000Z',
  ...over,
})

describe('what needs keying', () => {
  it('reports a code the master does not hold as an addition', () => {
    const set = libraryChanges([entered({ exportCode: '8536.50.9065', reason: 'It is a switch' })], [
      entry({ exportCode: '' }),
    ])
    expect(set.actionable).toHaveLength(1)
    expect(set.actionable[0]).toMatchObject({ field: 'code', action: 'add', libraryValue: null, partInLibrary: true })
  })

  it('reports a differing code as an update, showing what the master holds', () => {
    const set = libraryChanges([entered({ exportCode: '8536.50.9065', reason: 'It is a switch' })], [entry({})])
    expect(set.actionable[0]).toMatchObject({
      action: 'update',
      libraryValue: '8544.42.0000',
      enteredValue: '8536.50.9065',
    })
  })

  it('leaves a code the master already agrees with off the list', () => {
    const set = libraryChanges([entered({ exportCode: '8544420000' })], [entry({})])
    expect(set.actionable).toHaveLength(0)
    expect(set.matching).toBe(1)
  })

  it('marks a part missing from the master, so a stale extract is visible', () => {
    const set = libraryChanges([entered({ partNumber: 'ZZZ-9', exportCode: '8544.42.0000' })], [entry({})])
    expect(set.actionable[0]).toMatchObject({ action: 'add', partInLibrary: false })
  })

  it('matches the part regardless of case', () => {
    const set = libraryChanges([entered({ partNumber: 'aaa-1', exportCode: '8536.50.9065' })], [entry({})])
    expect(set.actionable[0]).toMatchObject({ action: 'update', partInLibrary: true })
  })

  it('takes the master’s own wording for the description', () => {
    // The worklist should read the way the record being edited reads.
    const set = libraryChanges(
      [entered({ description: 'cable', exportCode: '8536.50.9065' })],
      [entry({ description: 'CABLE, OS32C-ECBL-05M' })],
    )
    expect(set.actionable[0].description).toBe('CABLE, OS32C-ECBL-05M')
  })

  it('falls back to the shipment’s description for a part the master lacks', () => {
    const set = libraryChanges(
      [entered({ partNumber: 'ZZZ-9', description: 'ROPE PULL', exportCode: '8536.50.9065' })],
      [entry({})],
    )
    expect(set.actionable[0].description).toBe('ROPE PULL')
  })
})

describe('weights', () => {
  it('reports a weight the master does not hold', () => {
    const set = libraryChanges([entered({ netWeightKg: 1.25 })], [entry({ netWeightKg: null })])
    expect(set.actionable[0]).toMatchObject({ field: 'weight', action: 'add', enteredValue: '1.250' })
  })

  it('does not report a weight that agrees to three decimals', () => {
    // The library figure arrives converted from grams, so an exact comparison would report a
    // floating-point tail as a change and put a row in the list that needs no work.
    const set = libraryChanges([entered({ netWeightKg: 0.056 })], [entry({ netWeightKg: 56 * 0.001 })])
    expect(set.actionable).toHaveLength(0)
    expect(set.matching).toBe(1)
  })

  it('reports a genuine difference', () => {
    const set = libraryChanges([entered({ netWeightKg: 0.3 })], [entry({ netWeightKg: 0.25 })])
    expect(set.actionable[0]).toMatchObject({ action: 'update', libraryValue: '0.250', enteredValue: '0.300' })
  })

  it('carries both fields for a part that has each', () => {
    const set = libraryChanges([entered({ netWeightKg: 0.3, exportCode: '8536.50.9065' })], [entry({})])
    expect(set.actionable.map((c) => c.field)).toEqual(['code', 'weight'])
  })

  it('does not attribute the code’s reason to the weight', () => {
    // One record holds one reason, given when the code was entered. A weight is a measurement
    // and is not justified by a classification argument — repeating it here would attribute a
    // figure to reasoning that was never about it.
    const set = libraryChanges(
      [
        entered({
          netWeightKg: 0.3,
          exportCode: '8536.50.9065',
          reason: 'Switch, not a conductor',
          enteredBy: 'Joel Abraham',
        }),
      ],
      [entry({})],
    )
    const weight = set.actionable.find((c) => c.field === 'weight')!
    const code = set.actionable.find((c) => c.field === 'code')!
    expect(weight).toMatchObject({ reason: '', enteredBy: '' })
    expect(code).toMatchObject({ reason: 'Switch, not a conductor', enteredBy: 'Joel Abraham' })
    expect(renderLibraryChangesCsv(set).split('\n')[2]).not.toContain('Switch, not a conductor')
  })
})

describe('with no library imported', () => {
  it('reports everything as an addition and says why', () => {
    const set = libraryChanges([entered({ netWeightKg: 1, exportCode: '8544.42.0000' })], [])
    expect(set.libraryMissing).toBe(true)
    expect(set.actionable.every((c) => c.action === 'add' && !c.partInLibrary)).toBe(true)
    expect(renderLibraryChangeLog(set, { today: '2026-07-29', librarySource: null })).toContain(
      'No item library was imported',
    )
  })
})

describe('rendering', () => {
  const set = libraryChanges(
    [
      entered({ exportCode: '8536.50.9065', reason: 'Switch, not a conductor', enteredBy: 'Joel Abraham' }),
      entered({ partNumber: 'BBB-2', description: 'BRACKET', netWeightKg: 1.5 }),
    ],
    [entry({}), entry({ partNumber: 'BBB-2', description: 'BRACKET', netWeightKg: null })],
  )

  it('keeps the reason and the name against a code change', () => {
    const log = renderLibraryChangeLog(set, { today: '2026-07-29', librarySource: 'ItemTag.xlsx' })
    expect(log).toContain('Switch, not a conductor')
    expect(log).toContain('Joel Abraham')
    expect(log).toContain('Compared against: ItemTag.xlsx')
  })

  it('separates codes from weights, because they are acted on differently', () => {
    const log = renderLibraryChangeLog(set, { today: '2026-07-29', librarySource: 'ItemTag.xlsx' })
    expect(log).toContain('## Commodity numbers (1)')
    expect(log).toContain('## Net weights (1)')
  })

  it('escapes a pipe in a description rather than breaking the table', () => {
    const withPipe = libraryChanges(
      [entered({ exportCode: '8536.50.9065', reason: 'a | b' })],
      [entry({ description: 'CABLE | 5M' })],
    )
    const log = renderLibraryChangeLog(withPipe, { today: '2026-07-29', librarySource: 'x' })
    expect(log).toContain('CABLE \\| 5M')
    expect(log).toContain('a \\| b')
  })

  it('writes a CSV row per change with the master’s value alongside', () => {
    const csv = renderLibraryChangesCsv(set)
    const [header, ...rows] = csv.split('\n')
    expect(header).toContain('In The Master')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('8544.42.0000')
    expect(rows[0]).toContain('8536.50.9065')
  })

  it('quotes a description containing a comma', () => {
    const csv = renderLibraryChangesCsv(
      libraryChanges([entered({ exportCode: '8536.50.9065' })], [entry({ description: 'CABLE, 5M' })]),
    )
    expect(csv).toContain('"CABLE, 5M"')
  })

  it('quotes a description carrying a bare carriage return, so the row stays one row', () => {
    // An item-master cell containing one arrives through the workbook reader as `&#13;`,
    // decoded. Unquoted it terminates the row for any reader following RFC 4180, splitting
    // one change across two misaligned lines.
    const description = `CABLE${String.fromCharCode(13)}5M`
    const csv = renderLibraryChangesCsv(
      libraryChanges([entered({ exportCode: '8536.50.9065' })], [entry({ description })]),
    )
    expect(csv).toContain(`"${description}"`)
  })

  it('says there is nothing to do when every entry matches', () => {
    const matching = libraryChanges([entered({ exportCode: '8544420000' })], [entry({})])
    expect(renderLibraryChangeLog(matching, { today: '2026-07-29', librarySource: 'x' })).toContain('Nothing to do')
  })

  it('dates the file name so successive exports do not overwrite', () => {
    expect(libraryChangesFileName('2026-07-29')).toBe('item-master-updates-2026-07-29.md')
    expect(libraryChangesFileName('2026-07-29', 'csv')).toBe('item-master-updates-2026-07-29.csv')
  })
})

describe('values that came out of a spreadsheet', () => {
  it('escapes a pipe in the library’s own value, not just the description', () => {
    // `exportCode` is verbatim spreadsheet text and is never rewritten, so it can carry
    // anything. Unescaped it adds a column and corrupts the table from that row down.
    const set = libraryChanges(
      [entered({ exportCode: '8536.50.9065', reason: 'r' })],
      [entry({ exportCode: '8544.42.0000 | see note' })],
    )
    const log = renderLibraryChangeLog(set, { today: '2026-07-30', librarySource: 'x' })
    expect(log).toContain('8544.42.0000 \\| see note')
    // Still seven columns: splitting on unescaped pipes only, since `\\|` keeps the character.
    const dataRow = log.split('\n').find((l) => l.includes('8536.50.9065') && l.startsWith('| AAA-1'))!
    expect(dataRow.split(/(?<!\\)\|/)).toHaveLength(9)
  })
})
