import { describe, expect, it } from 'vitest'
import { parseCipl } from '../cipl'
import { reconcile } from '../reconcile'
import { buildSyntheticCipl, simpleShipment, type SyntheticCipl, type SyntheticLine } from '../../test/synthetic/cipl'
import type { ParsedCipl, Reconciliation } from '../types'
import { applyCiplSeed, ciplSeed, type CiplSeed, type FigureOffer } from './cipl-seed'
import { emptyEntry, newConsignment, type DgConsignment } from './types'

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }
const CONSIGNEE = { name: 'Example Consignee B.V.', addressLines: ['1 Example Street', 'Exampleton 1000', 'Netherlands'] }

/** One battery part over four lines in one carton: the shape the feature was asked for. */
function batteryLine(n: number, over: Partial<SyntheticLine> = {}): SyntheticLine {
  return {
    order: `0000000${n}OP0010`,
    sequence: '1',
    lineNumber: '0001',
    itemId: `1BB00000${n}`,
    partNumber: '20000-0001',
    model: 'MODEL-BATT',
    description: 'BACKUP BATTERY PACK',
    commodityGroup: 'Primary Batteries, Lithium.',
    country: 'Japan',
    classification: '8506.50.0000',
    quantity: 3,
    unitPrice: 200,
    netWeightKg: 0.531,
    grossWeightKg: 0.584,
    carton: '0001',
    ...over,
  }
}

function batteryShipment(over: Partial<SyntheticCipl> = {}): SyntheticCipl {
  return simpleShipment({
    invoiceNumber: 'S0000042',
    cartons: 1,
    dischargePort: 'Amsterdam, Netherlands',
    lines: [1, 2, 3, 4].map((n) => batteryLine(n)),
    ...over,
  })
}

async function seedOf(spec: SyntheticCipl, mutate?: (r: Reconciliation) => Reconciliation): Promise<CiplSeed> {
  const parsed: ParsedCipl = await parseCipl('synthetic.pdf', await buildSyntheticCipl(spec))
  const reconciliation = reconcile(parsed, null, CONTROLLED)
  return ciplSeed(parsed, mutate ? mutate(reconciliation) : reconciliation, CONSIGNEE)
}

const value = (offer: FigureOffer) => offer.value
const why = (offer: FigureOffer) => (offer.value === null ? offer.why : null)

let counter = 0
const newId = (prefix: string) => `${prefix}t${(counter += 1)}`

describe('what a CIPL offers the dangerous goods consignment', () => {
  it('offers the count and the summed net weight of a one-carton part, exactly as the CIPL totals them', async () => {
    const seed = await seedOf(batteryShipment())
    expect(seed.parts).toHaveLength(1)
    const [part] = seed.parts
    expect(value(part.count)).toBe(12)
    expect(part.count).toMatchObject({ label: '12 PCS' })
    expect(value(part.netWeightKg)).toBe(2.124)
    expect(part.description).toBe('20000-0001 BACKUP BATTERY PACK (CIPL heading: Primary Batteries, Lithium.)')
  })

  it('rounds the summed weight to the places the packing list prints, not binary noise', async () => {
    const seed = await seedOf(
      batteryShipment({ lines: [batteryLine(1, { netWeightKg: 0.1 }), batteryLine(2, { netWeightKg: 0.2 })] }),
    )
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(value(seed.parts[0].netWeightKg)).toBe(0.3)
  })

  it('offers no weight for a line the packing list did not weigh, whatever reconciliation filled in', async () => {
    // A packing-list gap is filled from the item library during reconciliation; that figure
    // sits on the merged line and is not the document's.
    const seed = await seedOf(batteryShipment(), (r) => ({
      ...r,
      mergedLines: r.mergedLines.map((l, i) => (i === 0 ? { ...l, packingListLineId: undefined } : l)),
    }))
    expect(value(seed.parts[0].netWeightKg)).toBeNull()
    expect(why(seed.parts[0].netWeightKg)).toMatch(/no net weight for every line/)
  })

  it('carries the consignee it was given, the invoice number, and the route only as text', async () => {
    const seed = await seedOf(batteryShipment())
    expect(seed.consignee).toEqual(CONSIGNEE)
    expect(seed.shippersReference).toBe('S0000042')
    expect(seed.source).toEqual({ fileName: 'synthetic.pdf', invoiceNumber: 'S0000042' })
    expect(seed.routeHint).toEqual({ shippedFrom: 'San Francisco', dischargePort: 'Amsterdam, Netherlands' })
  })

  it('offers no per-package figure when the CIPL spans two cartons, and says why', async () => {
    const seed = await seedOf(batteryShipment({ cartons: 2 }))
    for (const part of seed.parts) {
      expect(value(part.count)).toBeNull()
      expect(value(part.netWeightKg)).toBeNull()
      expect(why(part.count)).toMatch(/2 cartons/)
    }
  })

  it('offers no weight when the weights did not reconcile to the packing-list total', async () => {
    const seed = await seedOf(batteryShipment(), (r) => ({
      ...r,
      checks: r.checks.map((c) => (c.id === 'total-weight' ? { ...c, passed: false } : c)),
    }))
    expect(value(seed.parts[0].netWeightKg)).toBeNull()
    expect(why(seed.parts[0].netWeightKg)).toMatch(/do not reconcile/)
    expect(value(seed.parts[0].count)).toBe(12)
  })

  it('offers no count when the quantities did not reconcile to the invoice total', async () => {
    const seed = await seedOf(batteryShipment(), (r) => ({
      ...r,
      checks: r.checks.map((c) => (c.id === 'total-quantity' ? { ...c, passed: false } : c)),
    }))
    expect(value(seed.parts[0].count)).toBeNull()
  })

  it('offers nothing once a figure was entered over the document', async () => {
    const seed = await seedOf(batteryShipment(), (r) => ({
      ...r,
      enteredFigures: [{ rowKey: 'x', field: 'quantity', was: 12, now: 10 }],
    }))
    expect(value(seed.parts[0].count)).toBeNull()
    expect(value(seed.parts[0].netWeightKg)).toBeNull()
    expect(why(seed.parts[0].count)).toMatch(/entered over the document/)
  })

  it('never offers a supplied weight as the document’s', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(batteryShipment()))
    const seed = ciplSeed({ ...parsed, providesWeights: false }, reconcile(parsed, null, CONTROLLED), CONSIGNEE)
    expect(value(seed.parts[0].netWeightKg)).toBeNull()
    expect(why(seed.parts[0].netWeightKg)).toMatch(/states no weights/)
  })

  it('offers no count for a quantity that is not a count of items', async () => {
    const parsed = await parseCipl('synthetic.pdf', await buildSyntheticCipl(batteryShipment()))
    const reconciliation = reconcile(parsed, null, CONTROLLED)
    const inKg = { ...reconciliation, mergedLines: reconciliation.mergedLines.map((l) => ({ ...l, uom: 'KG' })) }
    const seed = ciplSeed(parsed, inKg, CONSIGNEE)
    expect(value(seed.parts[0].count)).toBeNull()
    expect(why(seed.parts[0].count)).toMatch(/in KG, not a count/)
  })

  it('keeps one entry per part, in document order, when several parts share the carton', async () => {
    const seed = await seedOf(
      batteryShipment({
        lines: [batteryLine(1), batteryLine(2, { partNumber: '20000-0002', netWeightKg: 0.2, quantity: 1 }), batteryLine(3)],
      }),
    )
    expect(seed.parts.map((p) => [p.partNumber, value(p.count), value(p.netWeightKg)])).toEqual([
      ['20000-0001', 6, 1.062],
      ['20000-0002', 1, 0.2],
    ])
  })
})

describe('filling the consignment from the seed', () => {
  /** Every field the CIPL must never reach, read off a consignment for comparison. */
  const untouchable = (c: DgConsignment) => ({
    shipper: c.shipper,
    airWaybillNumber: c.airWaybillNumber,
    airportOfDeparture: c.airportOfDeparture,
    airportOfDestination: c.airportOfDestination,
    aircraft: c.aircraft,
    emergency: [c.emergencyContactName, c.emergencyContactPhone],
    signer: [c.signerName, c.signerTitle, c.signerPlace, c.signerDate],
    overpacks: c.overpacks,
    packages: c.packages.map((p) => ({ ...p, entries: undefined, id: undefined })),
    entries: c.packages.flatMap((p) => p.entries.map((e) => ({ ...e, id: undefined, description: undefined }))),
  })

  it('sets the consignee and reference, adds one entry per part, and touches nothing a classification turns on', async () => {
    const seed = await seedOf(batteryShipment())
    const before = newConsignment()
    const { consignment, notes, links } = applyCiplSeed(before, seed, newId)

    expect(consignment.consignee).toEqual(CONSIGNEE)
    expect(consignment.shippersReference).toBe('S0000042')
    const [entry] = consignment.packages[0].entries
    expect(entry.description).toContain('20000-0001')
    expect(links).toEqual({ [entry.id]: '20000-0001' })
    // Count and weight are offers, not fills.
    expect(entry.countPerPackage).toBeNull()
    expect(entry.netWeightKgPerPackage).toBeNull()
    expect(untouchable(consignment)).toEqual(untouchable(before))
    expect(entry).toEqual({ ...emptyEntry(entry.id), description: entry.description })
    expect(notes.join(' ')).toMatch(/Set the consignee/)
  })

  it('keeps a consignee and reference already typed, and says so', async () => {
    const seed = await seedOf(batteryShipment())
    const typed = {
      ...newConsignment(),
      consignee: { name: 'Someone Else', addressLines: ['Elsewhere'] },
      shippersReference: 'MY-REF',
    }
    const { consignment, notes } = applyCiplSeed(typed, seed, newId)
    expect(consignment.consignee).toEqual(typed.consignee)
    expect(consignment.shippersReference).toBe('MY-REF')
    expect(notes).toContain('Kept the consignee already entered, which differs from the CIPL’s.')
    expect(notes).toContain('Kept the shipper’s reference already entered.')
  })

  it('leaves a package someone has started alone', async () => {
    const seed = await seedOf(batteryShipment())
    const started = newConsignment()
    started.packages[0].entries[0] = { ...started.packages[0].entries[0], countPerPackage: 4 }
    const { consignment, notes, links } = applyCiplSeed(started, seed, newId)
    expect(consignment.packages).toEqual(started.packages)
    expect(links).toEqual({})
    expect(notes).toContain('Added no battery entries: the packages already hold entries.')
  })

  it('adds no entries for a multi-carton CIPL', async () => {
    const seed = await seedOf(batteryShipment({ cartons: 2 }))
    const before = newConsignment()
    const { consignment, notes } = applyCiplSeed(before, seed, newId)
    expect(consignment.packages).toEqual(before.packages)
    expect(notes.join(' ')).toMatch(/2 cartons/)
    // The parties still fill: carton count says nothing about who the goods are for.
    expect(consignment.consignee).toEqual(CONSIGNEE)
  })

  it('is idempotent: a second fill changes nothing and reports nothing as kept', async () => {
    const seed = await seedOf(batteryShipment())
    const once = applyCiplSeed(newConsignment(), seed, newId)
    const twice = applyCiplSeed(once.consignment, seed, newId)
    expect(twice.consignment).toEqual(once.consignment)
    expect(twice.notes).toEqual(['Added no battery entries: the packages already hold entries.'])
  })
})
