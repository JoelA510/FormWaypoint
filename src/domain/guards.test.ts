import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCipl } from './cipl'
import { hasFixtures, readFixture } from '../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from './schedule-b'
import { reconcile, resolveDestinationCountry, joinInvoiceToPacking } from './reconcile'
import { applyCarrierDefaults, buildDraft, checkDraft, defaultShipmentSettings, EMPTY_PROFILE, type CompanyProfile } from './draft'
import { getAdapter } from '../carriers/registry'
import { formatDateMMDDYYYY, parseLooseDate } from '../carriers/form-utils'
import type { ParsedCipl, ShipmentHeader, SourceLine } from './types'

/**
 * Guard rails. Each test here pins a way the tool could produce a plausible-looking but
 * wrong form — the failure modes are silent by nature, so they need explicit coverage.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const COMPLETE_PROFILE: CompanyProfile = {
  usppiName: 'Omron Robotics and Safety Technologies, Inc.',
  usppiAddressLines: ['4225 Hacienda Drive'],
  usppiZip: '94588',
  usppiEin: '94-2900635',
  contactName: 'Joel Abraham',
  contactPhone: '+19252453400',
  pointOfOrigin: 'California',
  signerName: 'Joel Abraham',
  signerTitle: 'Logistics Specialist',
  signerEmail: 'joel.abraham@omron.com',
  signerPhone: '925-245-8170',
  signerInitials: 'JA',
}

let parsed: ParsedCipl
let scheduleB: ScheduleBIndex

beforeAll(async () => {
  // Every suite in this file is gated on the shipment documents, but this hook is not
  // gated by them skipping. Without the guard, adding one test that needs no fixture
  // would fail the whole file wherever the documents are absent.
  if (!hasFixtures()) return
  parsed = await parseCipl('G78495IQ', readFixture('G78495IQ'))
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(HERE, '../../public/data/schedule-b.json'), 'utf8')),
  )
}, 60_000)

// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('a form nobody signed for cannot be generated', () => {
  const nippon = getAdapter('nippon-express')

  it('blocks on an empty exporter profile', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const settings = defaultShipmentSettings(nippon)
    const draft = buildDraft(result, EMPTY_PROFILE, settings, nippon)

    // The document side reconciles perfectly — that must not be enough on its own.
    expect(result.canGenerate).toBe(true)

    const profileCheck = checkDraft(draft, nippon).find((c) => c.id === 'profile-complete')
    expect(profileCheck?.severity).toBe('blocking')
    expect(profileCheck?.passed).toBe(false)
    expect(profileCheck?.detail).toMatch(/USPPI name/)
    expect(profileCheck?.detail).toMatch(/USPPI EIN/)
    expect(profileCheck?.detail).toMatch(/Signer name/)
  })

  it('passes once the profile is filled in', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const draft = buildDraft(result, COMPLETE_PROFILE, defaultShipmentSettings(nippon), nippon)
    const checks = checkDraft(draft, nippon)
    expect(checks.filter((c) => c.severity === 'blocking' && !c.passed)).toEqual([])
  })

  it('blocks an unparseable date of exportation rather than writing it through', () => {
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const draft = {
      ...buildDraft(result, COMPLETE_PROFILE, defaultShipmentSettings(nippon), nippon),
      dateOfExportation: 'sometime next week',
    }
    const check = checkDraft(draft, nippon).find((c) => c.id === 'export-date')
    expect(check?.severity).toBe('blocking')
    expect(check?.passed).toBe(false)
  })

  it('blocks a transport mode the form has no box for', () => {
    const ceva = getAdapter('ceva')
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const draft = { ...buildDraft(result, COMPLETE_PROFILE, defaultShipmentSettings(ceva), ceva), mode: 'TRUCK' as const }
    const check = checkDraft(draft, ceva).find((c) => c.id === 'mode-supported')
    expect(check?.severity).toBe('blocking')
    expect(check?.passed).toBe(false)
    expect(check?.detail).toMatch(/AIR, OCEAN/)
  })
})

describe.skipIf(!hasFixtures())('switching carriers', () => {
  it('applies the new carrier defaults instead of carrying the old ones over', () => {
    const nippon = getAdapter('nippon-express')
    const ceva = getAdapter('ceva')

    const onNippon = { ...defaultShipmentSettings(nippon), mode: 'TRUCK' as const, jetpak: true, containerized: true }
    const onCeva = applyCarrierDefaults(onNippon, ceva)

    // CEVA has no truck column; leaving TRUCK set would file the shipment as air.
    expect(onCeva.mode).toBe('AIR')
    expect(onCeva.jetpak).toBe(false)
    expect(onCeva.containerized).toBe(false)
  })

  it('keeps what the person typed', () => {
    const ceva = getAdapter('ceva')
    const previous = {
      ...defaultShipmentSettings(getAdapter('nippon-express')),
      shipmentReference: 'SO 13310965',
      consigneeId: 'NL008305535',
      eccn: 'EAR99',
      license: 'NLR',
      specialInstructions: 'FOB SFO',
    }
    const next = applyCarrierDefaults(previous, ceva)
    expect(next.shipmentReference).toBe('SO 13310965')
    expect(next.consigneeId).toBe('NL008305535')
    expect(next.eccn).toBe('EAR99')
    expect(next.license).toBe('NLR')
    expect(next.specialInstructions).toBe('FOB SFO')
  })
})

describe.skipIf(!hasFixtures())('dates', () => {
  it('reads the wordings these documents actually use', () => {
    expect(parseLooseDate('July 20, 2026')).toEqual([2026, 7, 20])
    expect(parseLooseDate('Jul 20, 2026')).toEqual([2026, 7, 20])
    expect(parseLooseDate('Sept 3, 2026')).toEqual([2026, 9, 3])
    expect(parseLooseDate('2026-07-20')).toEqual([2026, 7, 20])
    expect(formatDateMMDDYYYY('July 20, 2026')).toBe('07-20-2026')
    // The omron-shipment CIPL abbreviates the year, and box 2 needs all four digits.
    expect(parseLooseDate('07/22/26')).toEqual([2026, 7, 22])
    expect(formatDateMMDDYYYY('07/22/26')).toBe('07-22-2026')
  })

  it('rejects impossible dates rather than writing them to the form', () => {
    // Day-first input read as MM/DD would otherwise yield month 25.
    expect(parseLooseDate('25/12/2026')).toBeNull()
    expect(parseLooseDate('02/30/2026')).toBeNull()
    expect(parseLooseDate('Smarch 3, 2026')).toBeNull()
    expect(parseLooseDate('')).toBeNull()
  })
})

describe.skipIf(!hasFixtures())('country of ultimate destination', () => {
  it('never accepts a postal line as a country', () => {
    const header = {
      ...parsed.headers.FC,
      dischargePort: null,
      // The real consignee block ends here, and it is not a country.
      consignedTo: { name: 'X', lines: ['Bangalore, KARNATAKA 562123'], country: null },
    } as ShipmentHeader
    expect(resolveDestinationCountry(header)).toBeNull()
  })

  it('falls back to the consignee block only when it holds a real country name', () => {
    const header = {
      ...parsed.headers.FC,
      dischargePort: 'Shanghai',
      consignedTo: { name: 'X', lines: ['253 Ai Du Road', 'China'], country: null },
    } as ShipmentHeader
    expect(resolveDestinationCountry(header)).toBe('China')
  })

  it('blocks generation when no country can be established', () => {
    const nippon = getAdapter('nippon-express')
    const result = reconcile(parsed, scheduleB, CONTROLLED)
    const draft = { ...buildDraft(result, COMPLETE_PROFILE, defaultShipmentSettings(nippon), nippon), destinationCountry: '' }
    const check = checkDraft(draft, nippon).find((c) => c.id === 'destination-country')
    expect(check?.severity).toBe('blocking')
    expect(check?.passed).toBe(false)
  })
})

describe.skipIf(!hasFixtures())('invoice-to-packing-list join', () => {
  const packingLine = (over: Partial<SourceLine>): SourceLine => ({
    id: 'p1',
    documentSet: 'FC',
    documentKind: 'PACKING_LIST',
    page: 1,
    orderNumber: 'PO1',
    sequence: '1',
    lineNumber: '0001',
    itemId: 'ITEM1',
    partNumber: 'PART1',
    model: '',
    description: '',
    commodityGroup: '',
    countryOfOrigin: 'Japan',
    classification: '8544.42.0000',
    quantity: 1,
    uom: 'PCS',
    netWeightKg: 5,
    ...over,
  })

  it('never lets two invoice lines claim the same packing line', () => {
    // Both invoice lines resolve to the same order+sequence; only one packing line exists.
    const invoice = [
      packingLine({ id: 'i1', documentKind: 'INVOICE', itemId: '', netWeightKg: undefined }),
      packingLine({ id: 'i2', documentKind: 'INVOICE', itemId: '', netWeightKg: undefined }),
    ]
    const packing = [packingLine({ id: 'p1', netWeightKg: 5 })]

    const merged = joinInvoiceToPacking(invoice, packing)
    expect(merged).toHaveLength(2)
    // 5 kg total, not 10 — double-claiming would overstate the shipment weight.
    expect(merged.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)).toBe(5)
    expect(merged[1].joinKey).toBe('unmatched')
  })

  it('keeps both packing lines when two share a weaker key', () => {
    const invoice = [
      packingLine({ id: 'i1', documentKind: 'INVOICE', itemId: 'ITEM1', netWeightKg: undefined }),
      packingLine({ id: 'i2', documentKind: 'INVOICE', itemId: 'ITEM2', netWeightKg: undefined }),
    ]
    const packing = [
      packingLine({ id: 'p1', itemId: 'ITEM1', netWeightKg: 5 }),
      packingLine({ id: 'p2', itemId: 'ITEM2', netWeightKg: 7 }),
    ]
    const merged = joinInvoiceToPacking(invoice, packing)
    expect(merged.map((l) => l.netWeightKg)).toEqual([5, 7])
    expect(merged.every((l) => l.joinKey === 'itemId')).toBe(true)
  })
})

describe.skipIf(!hasFixtures())('reconciliation cannot fail open', () => {
  it('blocks when the packing-list weight total could not be read', () => {
    const withoutWeights: ParsedCipl = {
      ...parsed,
      headers: { ...parsed.headers, FC: { ...parsed.headers.FC, totalNetWeightKg: null } },
    }
    const result = reconcile(withoutWeights, scheduleB, CONTROLLED)
    const check = result.checks.find((c) => c.id === 'total-weight')
    // The check must still be present and failing, not silently absent.
    expect(check).toBeDefined()
    expect(check?.severity).toBe('blocking')
    expect(check?.passed).toBe(false)
    expect(result.canGenerate).toBe(false)
  })

  it('reports an unreadable document instead of throwing', () => {
    const empty: ParsedCipl = {
      fileName: 'not-a-cipl.pdf',
      format: 'omron-fc-tp1',
      providesWeights: true,
      pageCount: 1,
      availableSets: [],
      headers: {},
      lines: [],
      warnings: [],
    }
    const result = reconcile(empty, scheduleB, CONTROLLED)
    expect(result.canGenerate).toBe(false)
    expect(result.checks.find((c) => c.id === 'header-readable')?.passed).toBe(false)
  })
})

describe.skipIf(!hasFixtures())('source line identity', () => {
  it('distinguishes every physical line', () => {
    const ids = parsed.lines.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Line number and lot id are part of the key, not just order + sequence.
    expect(ids[0].split(':')).toHaveLength(6)
  })
})
