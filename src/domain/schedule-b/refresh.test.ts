import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DATASET_FILE, loadInstalledDataset, refreshScheduleB } from './refresh'
import { ConcordanceError } from './parse-concordance'
import type { RawPayload } from '.'
import type { DesktopBridge } from '../../desktop'
import type { ItemLibraryEntry } from '../item-library'

/** A concordance body wide enough to pass the sanity floor. */
function concordance(overrides: Record<string, { d: string; u: string }> = {}, count = 5200): string {
  const row = (code: string, d: string, u: string) => code.padEnd(10, ' ') + d.padEnd(160, ' ') + u
  const lines = Array.from({ length: count }, (_, i) => row(String(1000000000 + i), `COMMODITY ${i}`, 'NO'))
  for (const [code, entry] of Object.entries(overrides)) lines.push(row(code, entry.d, entry.u))
  return lines.join('\n')
}

/** The dataset that body parses to, so a diff against it comes out empty. */
function datasetFor(body: string, generatedAt: string): RawPayload {
  const codes: RawPayload['codes'] = {}
  for (const line of body.split('\n')) {
    const code = line.slice(0, 10).trim()
    if (!/^\d{10}$/.test(code)) continue
    codes[code] = { d: line.slice(10, 170).replace(/\s+/g, ' ').trim(), u: line.slice(170).trim().split(/\s+/).filter(Boolean) }
  }
  return { source: 'x', generatedAt, count: Object.keys(codes).length, codes }
}

const item = (partNumber: string, exportCode: string): ItemLibraryEntry => ({
  partNumber,
  displayPartNumber: partNumber,
  description: 'a part',
  exportCode,
  importCode: '',
  netWeightKg: 1,
  source: 'ItemStore.xlsx',
  importedAt: '2026-07-28T00:00:00.000Z',
})

function fakeBridge(body: string) {
  const files = new Map<string, string>()
  const bridge: DesktopBridge = {
    fetchConcordance: vi.fn(async () => body),
    writeDataFile: vi.fn(async (name: string, contents: string) => {
      files.set(name, contents)
      return `/data/${name}`
    }),
    readDataFile: vi.fn(async (name: string) => files.get(name) ?? null),
    dataDir: vi.fn(async () => '/data'),
  }
  return { bridge, files }
}

describe('refreshScheduleB', () => {
  const BASE_BODY = concordance({ '8483105000': { d: 'TRANSMISSION SHAFTS AND CRANKS', u: 'KG' } })
  const installed = datasetFor(BASE_BODY, '2026-01-15')

  it('writes nothing when the concordance has not moved', async () => {
    const { bridge, files } = fakeBridge(BASE_BODY)
    const result = await refreshScheduleB({
      bridge,
      installed,
      items: [],
      libraryLoaded: true,
      today: '2026-07-28',
    })

    expect(result.revision.empty).toBe(true)
    expect(result.written).toEqual([])
    expect(files.size).toBe(0)
    expect(bridge.writeDataFile).not.toHaveBeenCalled()
  })

  it('writes the log and the CSV before it replaces the dataset', async () => {
    // 8483105000 is gone from this body — a retirement, against a part that uses it.
    const { bridge, files } = fakeBridge(concordance())
    const result = await refreshScheduleB({
      bridge,
      installed,
      items: [item('SHAFT-1', '8483.10.5000')],
      libraryLoaded: true,
      today: '2026-07-28',
    })

    expect(result.written).toEqual([
      'schedule-b-changes-2026-07-28.md',
      'schedule-b-changes-2026-07-28.csv',
      DATASET_FILE,
    ])
    // The order is the safety property: a crash mid-refresh must never leave a swapped
    // dataset with no record of what moved.
    expect(result.written.indexOf(DATASET_FILE)).toBe(result.written.length - 1)
    expect(files.get('schedule-b-changes-2026-07-28.md')).toContain('SHAFT-1')
    expect(files.get('schedule-b-changes-2026-07-28.csv')).toContain('SHAFT-1')
  })

  it('skips the CSV when no part is affected, but still writes the log', async () => {
    const { bridge } = fakeBridge(concordance())
    const result = await refreshScheduleB({
      bridge,
      installed,
      items: [item('UNRELATED', '8544.42.0000')],
      libraryLoaded: true,
      today: '2026-07-28',
    })

    expect(result.affected).toEqual([])
    expect(result.written).toEqual(['schedule-b-changes-2026-07-28.md', DATASET_FILE])
  })

  it('records that no library was loaded, rather than implying nothing was affected', async () => {
    const { bridge, files } = fakeBridge(concordance())
    await refreshScheduleB({ bridge, installed, items: [], libraryLoaded: false, today: '2026-07-28' })
    expect(files.get('schedule-b-changes-2026-07-28.md')).toContain('No item library was loaded')
  })

  it('leaves the installed dataset alone when the download is not the concordance', async () => {
    const { bridge, files } = fakeBridge('<html>503 Service Unavailable</html>')
    await expect(
      refreshScheduleB({ bridge, installed, items: [], libraryLoaded: true, today: '2026-07-28' }),
    ).rejects.toBeInstanceOf(ConcordanceError)
    expect(files.size).toBe(0)
    expect(bridge.writeDataFile).not.toHaveBeenCalled()
  })

  it('propagates a failed download without writing anything', async () => {
    const { bridge, files } = fakeBridge('')
    bridge.fetchConcordance = vi.fn(async () => {
      throw new Error('census.gov unreachable')
    })
    await expect(
      refreshScheduleB({ bridge, installed, items: [], libraryLoaded: true, today: '2026-07-28' }),
    ).rejects.toThrow('census.gov unreachable')
    expect(files.size).toBe(0)
  })

  it('reports where the files went', async () => {
    const { bridge } = fakeBridge(concordance())
    const result = await refreshScheduleB({
      bridge,
      installed,
      items: [],
      libraryLoaded: true,
      today: '2026-07-28',
    })
    expect(result.directory).toBe('/data')
  })
})

describe('loadInstalledDataset', () => {
  const bundled: RawPayload = { source: 'bundled', generatedAt: '2026-07-27', count: 1, codes: { '1': { d: 'x', u: [] } } }
  let fallback: () => Promise<RawPayload>

  beforeEach(() => {
    fallback = vi.fn(async () => bundled)
  })

  it('prefers a dataset a previous refresh wrote', async () => {
    const { bridge, files } = fakeBridge('')
    const refreshed: RawPayload = { ...bundled, source: 'refreshed', generatedAt: '2027-01-05' }
    files.set(DATASET_FILE, JSON.stringify(refreshed))

    expect(await loadInstalledDataset(bridge, fallback)).toEqual(refreshed)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back to the bundled dataset when nothing has been written yet', async () => {
    const { bridge } = fakeBridge('')
    expect(await loadInstalledDataset(bridge, fallback)).toBe(bundled)
  })

  it('falls back rather than crashing on a corrupted file', async () => {
    const { bridge, files } = fakeBridge('')
    files.set(DATASET_FILE, '{ this is not json')
    expect(await loadInstalledDataset(bridge, fallback)).toBe(bundled)
  })

  it('falls back when the stored file holds no codes', async () => {
    const { bridge, files } = fakeBridge('')
    files.set(DATASET_FILE, JSON.stringify({ source: 'x', generatedAt: 'y', count: 0, codes: {} }))
    expect(await loadInstalledDataset(bridge, fallback)).toBe(bundled)
  })
})
