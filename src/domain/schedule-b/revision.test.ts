import { describe, expect, it } from 'vitest'
import {
  affectedParts,
  changeLogFileName,
  diffScheduleB,
  renderAffectedCsv,
  renderChangeLog,
} from './revision'
import type { RawPayload } from '.'
import type { ItemLibraryEntry } from '../item-library'

const payload = (generatedAt: string, codes: Record<string, { d: string; u: string[] }>): RawPayload => ({
  source: 'https://www.census.gov/foreign-trade/aes/documentlibrary/concordance/expaes.txt',
  generatedAt,
  count: Object.keys(codes).length,
  codes,
})

const BASE = payload('2026-01-15', {
  '8544420000': { d: 'ELECTRICAL CONDUCTORS FITTED WITH CONNECTORS', u: ['NO'] },
  '9031900000': { d: 'PARTS AND ACCESSORIES FOR MEASURING INSTRUMENTS', u: ['KG'] },
  '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['NO'] },
  '8483105000': { d: 'TRANSMISSION SHAFTS AND CRANKS', u: ['KG'] },
})

const item = (over: Partial<ItemLibraryEntry> & { partNumber: string; exportCode: string }): ItemLibraryEntry => ({
  displayPartNumber: over.partNumber,
  description: 'a part',
  importCode: '',
  netWeightKg: 1,
  source: 'ItemStore.xlsx',
  importedAt: '2026-07-28T00:00:00.000Z',
  ...over,
})

describe('diffScheduleB', () => {
  it('reports nothing when the datasets match', () => {
    const revision = diffScheduleB(BASE, payload('2026-07-01', BASE.codes))
    expect(revision.empty).toBe(true)
    expect(revision.unchanged).toBe(4)
    expect([revision.added, revision.retired, revision.changed]).toEqual([[], [], []])
  })

  it('separates added, retired and redefined codes', () => {
    const next = payload('2026-07-01', {
      '8544420000': { d: 'ELECTRICAL CONDUCTORS FITTED WITH CONNECTORS', u: ['NO'] },
      // description reworded
      '9031900000': { d: 'PARTS FOR MEASURING OR CHECKING INSTRUMENTS', u: ['KG'] },
      // unit of quantity changed
      '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['KG'] },
      // 8483105000 retired
      '8541410000': { d: 'LIGHT-EMITTING DIODES', u: ['NO'] },
    })
    const revision = diffScheduleB(BASE, next)

    expect(revision.from).toBe('2026-01-15')
    expect(revision.to).toBe('2026-07-01')
    expect(revision.added.map((c) => c.code)).toEqual(['8541410000'])
    expect(revision.retired.map((c) => c.code)).toEqual(['8483105000'])
    expect(revision.changed.map((c) => c.code)).toEqual(['8504404000', '9031900000'])
    expect(revision.unchanged).toBe(1)
    expect(revision.empty).toBe(false)
  })

  it('distinguishes a unit change from a wording change', () => {
    const next = payload('2026-07-01', {
      ...BASE.codes,
      '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['KG'] },
      '9031900000': { d: 'PARTS FOR MEASURING OR CHECKING INSTRUMENTS', u: ['KG'] },
    })
    const { changed } = diffScheduleB(BASE, next)
    const units = changed.find((c) => c.code === '8504404000')!
    const wording = changed.find((c) => c.code === '9031900000')!

    expect(units).toMatchObject({ unitsChanged: true, previousUnits: ['NO'], units: ['KG'] })
    expect(units.descriptionChanged).toBe(false)
    expect(wording).toMatchObject({ descriptionChanged: true, unitsChanged: false })
  })

  it('treats a reordered unit list as a change, since the first unit is the one filed', () => {
    const next = payload('2026-07-01', {
      ...BASE.codes,
      '8544420000': { d: 'ELECTRICAL CONDUCTORS FITTED WITH CONNECTORS', u: ['KG', 'NO'] },
    })
    expect(diffScheduleB(BASE, next).changed.map((c) => c.code)).toEqual(['8544420000'])
  })

  it('sorts each list by code so successive runs are comparable', () => {
    const next = payload('2026-07-01', {
      '9999999999': { d: 'Z', u: ['NO'] },
      '1111111111': { d: 'A', u: ['NO'] },
      '5555555555': { d: 'M', u: ['NO'] },
    })
    expect(diffScheduleB(payload('2026-01-15', {}), next).added.map((c) => c.code)).toEqual([
      '1111111111',
      '5555555555',
      '9999999999',
    ])
  })
})

describe('affectedParts', () => {
  const next = payload('2026-07-01', {
    '8544420000': { d: 'ELECTRICAL CONDUCTORS FITTED WITH CONNECTORS', u: ['NO'] },
    '9031900000': { d: 'PARTS FOR MEASURING OR CHECKING INSTRUMENTS', u: ['KG'] },
    '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['KG'] },
    '8541410000': { d: 'LIGHT-EMITTING DIODES', u: ['NO'] },
  })
  const revision = diffScheduleB(BASE, next)

  const library = [
    item({ partNumber: 'CABLE-1', exportCode: '8544.42.0000' }), // untouched
    item({ partNumber: 'SHAFT-1', exportCode: '8483.10.5000' }), // retired
    item({ partNumber: 'PSU-1', exportCode: '8504.40.4000' }), // unit changed
    item({ partNumber: 'SENSOR-1', exportCode: '9031.90.0000' }), // description changed
  ]

  it('lists only the parts the revision touches, worst first', () => {
    const affected = affectedParts(revision, library)
    expect(affected.map((a) => [a.partNumber, a.severity])).toEqual([
      ['SHAFT-1', 'retired'],
      ['PSU-1', 'unit'],
      ['SENSOR-1', 'description'],
    ])
  })

  it('matches however the item master punctuates the code', () => {
    const affected = affectedParts(revision, [item({ partNumber: 'SHAFT-2', exportCode: '8483105000' })])
    expect(affected.map((a) => a.partNumber)).toEqual(['SHAFT-2'])
  })

  it('ignores added codes — nothing can already be classified under one', () => {
    const onlyAdded = diffScheduleB(BASE, payload('2026-07-01', { ...BASE.codes, '8541410000': { d: 'LED', u: ['NO'] } }))
    expect(affectedParts(onlyAdded, [item({ partNumber: 'LED-1', exportCode: '8541.41.0000' })])).toEqual([])
  })

  it('skips library rows carrying no code', () => {
    expect(affectedParts(revision, [item({ partNumber: 'NOCODE', exportCode: '' })])).toEqual([])
  })

  it('names every part sharing a retired code, not just the first', () => {
    // This is the whole reason the worklist is separate from the revision listing: on the
    // real item master a five-code revision produced 161 affected parts, because one
    // retired code is held against dozens of them.
    const shared = Array.from({ length: 40 }, (_, i) =>
      item({ partNumber: `SHAFT-${String(i).padStart(2, '0')}`, exportCode: '8483.10.5000' }),
    )
    const affected = affectedParts(revision, shared)
    expect(affected).toHaveLength(40)
    expect(new Set(affected.map((a) => a.severity))).toEqual(new Set(['retired']))
    expect(affected[0].partNumber).toBe('SHAFT-00')
  })

  it('returns nothing when the revision only adds codes', () => {
    expect(affectedParts(diffScheduleB(BASE, payload('2026-07-01', BASE.codes)), library)).toEqual([])
  })
})

describe('renderChangeLog', () => {
  const next = payload('2026-07-01', {
    '8544420000': { d: 'ELECTRICAL CONDUCTORS FITTED WITH CONNECTORS', u: ['NO'] },
    '9031900000': { d: 'PARTS FOR MEASURING OR CHECKING INSTRUMENTS', u: ['KG'] },
    '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['KG'] },
    '8541410000': { d: 'LIGHT-EMITTING DIODES', u: ['NO'] },
  })
  const revision = diffScheduleB(BASE, next)
  const library = [
    item({ partNumber: 'SHAFT-1', exportCode: '8483.10.5000', description: 'Drive shaft' }),
    item({ partNumber: 'PSU-1', exportCode: '8504.40.4000', description: 'Power supply' }),
  ]
  const render = (affected = affectedParts(revision, library), libraryLoaded = true) =>
    renderChangeLog(revision, affected, { source: next.source, libraryLoaded })

  it('puts the actionable worklist above the full revision', () => {
    const log = render()
    expect(log.indexOf('affected by this revision')).toBeLessThan(log.indexOf('The revision in full'))
  })

  it('names each affected part with what to do about it', () => {
    const log = render()
    expect(log).toContain('| SHAFT-1 | Drive shaft | 8483.10.5000 | Code retired')
    expect(log).toContain('| PSU-1 | Power supply | 8504.40.4000 | Unit of quantity changed')
  })

  it('writes codes in the punctuated form the forms use', () => {
    expect(render()).toContain('8541.41.0000')
    expect(render()).not.toContain('8541410000')
  })

  it('shows before and after for a redefined code', () => {
    const log = render()
    expect(log).toContain('| 8504.40.4000 | Unit of quantity | NO | KG |')
    expect(log).toMatch(/\| 9031\.90\.0000 \| Description \| PARTS AND ACCESSORIES.*\| PARTS FOR MEASURING.*\|/)
  })

  it('says so plainly when no part is affected, rather than leaving an empty section', () => {
    expect(render([])).toContain('None. No part in the item master is classified under a code this revision changed.')
  })

  it('distinguishes "no library loaded" from "no parts affected"', () => {
    const log = render([], false)
    expect(log).toContain('No item library was loaded')
    expect(log).not.toContain('None. No part')
  })

  it('carries the counts and the source in the header', () => {
    const log = render()
    expect(log).toContain('# Schedule B revision 2026-01-15 → 2026-07-01')
    expect(log).toContain('1 added · 1 retired · 2 redefined · 1 unchanged')
    expect(log).toContain('census.gov')
  })

  it('omits a section that has no rows', () => {
    const addOnly = diffScheduleB(BASE, payload('2026-07-01', { ...BASE.codes, '8541410000': { d: 'LED', u: ['NO'] } }))
    const log = renderChangeLog(addOnly, [], { source: next.source, libraryLoaded: true })
    expect(log).toContain('### Added (1)')
    expect(log).not.toContain('### Retired')
    expect(log).not.toContain('### Redefined')
  })
})

describe('renderAffectedCsv', () => {
  const next = payload('2026-07-01', { ...BASE.codes, '8504404000': { d: 'STATIC CONVERTERS, POWER SUPPLIES', u: ['KG'] } })
  delete (next.codes as Record<string, unknown>)['8483105000']
  const revision = diffScheduleB(BASE, next)

  it('emits one row per part with the before and after', () => {
    const csv = renderAffectedCsv(
      affectedParts(revision, [
        item({ partNumber: 'SHAFT-1', exportCode: '8483.10.5000', description: 'Drive shaft' }),
        item({ partNumber: 'PSU-1', exportCode: '8504.40.4000', description: 'Power supply' }),
      ]),
    )
    const rows = csv.split('\n')
    expect(rows[0]).toBe('Part Number,Item Description,Code,Change,Was,Now,Action')
    expect(rows[1]).toContain('SHAFT-1,Drive shaft,8483.10.5000,retired,KG,(retired)')
    expect(rows[2]).toContain('PSU-1,Power supply,8504.40.4000,unit,NO,KG')
  })

  it('quotes a description containing a comma', () => {
    const csv = renderAffectedCsv(
      affectedParts(revision, [item({ partNumber: 'P', exportCode: '8483.10.5000', description: 'Shaft, drive, long' })]),
    )
    expect(csv).toContain('"Shaft, drive, long"')
  })

  it('is just a header when nothing is affected', () => {
    expect(renderAffectedCsv([]).split('\n')).toHaveLength(1)
  })
})

describe('changeLogFileName', () => {
  it('is dated by the incoming revision so refreshes never overwrite each other', () => {
    const revision = diffScheduleB(BASE, payload('2026-07-01', BASE.codes))
    expect(changeLogFileName(revision)).toBe('schedule-b-changes-2026-07-01.md')
    expect(changeLogFileName(revision, 'csv')).toBe('schedule-b-changes-2026-07-01.csv')
  })
})
