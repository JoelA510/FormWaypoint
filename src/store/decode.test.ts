// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_PROFILE } from '../domain/draft'
import { readErrorLog } from '../lib/error-log'
import { decodeDgConsignments, decodeItems, decodePartOverrides, decodeProfile, decodeShipments, decodeWeight } from './decode'

beforeEach(() => localStorage.clear())

describe('records read back from storage', () => {
  it('never lets a stored weight that is not a positive number reach a form', () => {
    for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY, '1.2', null, undefined]) {
      expect(decodeWeight(bad)).toBeNull()
    }
    expect(decodeWeight(1.2)).toBe(1.2)
  })

  it('drops a corrupt part weight but keeps the part, so it blocks for want of one', () => {
    const [part] = decodePartOverrides([{ partNumber: 'P-1', netWeightKg: Number.NaN, exportCode: '8544420000' }])
    expect(part).toMatchObject({ partNumber: 'P-1', netWeightKg: null, exportCode: '8544420000', description: '' })
    expect(readErrorLog()[0].message).toMatch(/part weight records .* 0 left out, 1 repaired/)
  })

  it('leaves out records without their key, and anything that is not a record', () => {
    expect(decodePartOverrides([{ netWeightKg: 1 }, 'junk', null, { partNumber: 'P-2', netWeightKg: 2 }])).toEqual([
      { partNumber: 'P-2', netWeightKg: 2, description: '', exportCode: undefined },
    ])
    expect(readErrorLog().at(-1)?.message).toMatch(/3 left out/)
  })

  it('fills a profile written before a field existed, instead of crashing on it', () => {
    const profile = decodeProfile({ usppiName: 'Example Exporter, Inc.', usppiAddressLines: 'not a list' })
    expect(profile).toEqual({ ...EMPTY_PROFILE, usppiName: 'Example Exporter, Inc.' })
    expect(profile?.signerName.trim()).toBe('')
    expect(decodeProfile(undefined)).toBeNull()
  })

  it('reads a well-formed item, history record and DG record unchanged, and logs nothing', () => {
    const item = {
      partNumber: 'P-3', displayPartNumber: 'p-3', description: 'Widget', exportCode: '8544420000',
      importCode: '', netWeightKg: 0.5, source: 'items.xlsx', importedAt: '2026-10-01',
    }
    expect(decodeItems([item])).toEqual([item])
    const shipment = { id: 'S1@2026-10-01', processedAt: '2026-10-01T00:00:00Z' }
    expect(decodeShipments([shipment])).toEqual([shipment])
    const dg = { id: 'D1', preparedAt: '2026-10-01', retainUntil: '2028-10-01', consignment: {} }
    expect(decodeDgConsignments([dg, { id: 'D2' }])).toEqual([dg])
    expect(readErrorLog().map((e) => e.message)).toEqual([expect.stringMatching(/dangerous goods .* 1 left out/)])
  })
})
