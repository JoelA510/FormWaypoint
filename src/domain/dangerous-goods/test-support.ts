/**
 * Builders for dangerous goods test fixtures.
 *
 * Three suites need the same "everything the shipper is responsible for is already answered"
 * consignment, so that a test can change one fact and see one check move. Keeping the
 * builders here rather than copying them means a new required field appears in one place —
 * and the suites that should have failed because of it actually do.
 */
import { emptyConsignment, emptyEntry, emptyOverpack, emptyPackage } from './types'
import type { BatteryEntry, DgConsignment, DgPackage, Overpack } from './types'
import type { BatterySpec } from './lithium'

/** A battery entry with every gate satisfied, so a test only has to break the one it means to. */
export function entry(id: string, spec: Partial<BatterySpec>, overrides: Partial<BatteryEntry> = {}): BatteryEntry {
  return {
    ...emptyEntry(id),
    spec: {
      chemistry: 'lithium-ion',
      form: 'battery',
      configuration: 'standalone',
      wattHours: null,
      lithiumContentG: null,
      ...spec,
    },
    articleLevel: 'battery-pack',
    netWeightKgPerPackage: 1,
    testSummaryScope: 'battery-pack',
    testSummaryReference: 'TR-2026-0041',
    wattHourMarkedOnCase: true,
    stateOfChargePercent: 25,
    stateOfChargeBasis: 'rated-capacity',
    stateOfChargeMethod: 'BMS readout',
    stateOfChargeMeasuredAt: '2026-08-05',
    stateOfChargeMeasuredBy: 'R. Okafor',
    vehicleDetermination: 'not-a-vehicle',
    ...overrides,
  }
}

export function pkg(id: string, entries: BatteryEntry[], overrides: Partial<DgPackage> = {}): DgPackage {
  return {
    ...emptyPackage(id, `${id}-e`),
    entries,
    grossWeightKg: 30,
    equipmentNetWeightKg: 0,
    ...overrides,
  }
}

export function overpack(id: string, overrides: Partial<Overpack> = {}): Overpack {
  return { ...emptyOverpack(id), marks: '#A001', ...overrides }
}

/** A consignment whose non-battery boxes are all filled in, so only the goods are under test. */
export function consignment(packages: DgPackage[], overrides: Partial<DgConsignment> = {}): DgConsignment {
  return {
    ...emptyConsignment(),
    shipper: { name: 'Acme Exports', addressLines: ['1 Harbour Way', 'Long Beach, CA 90802', 'USA'] },
    consignee: { name: 'Southern Distribution', addressLines: ['15 Rockwell Lane', 'Las Vegas, NV 78654', 'USA'] },
    airportOfDeparture: 'Los Angeles',
    airportOfDestination: 'Las Vegas',
    emergencyContactName: 'CHEMTREC',
    emergencyContactPhone: '1-800-424-9300 / +1-703-527-3887',
    signerName: 'J. Alvarez',
    signerDate: '2026-08-06',
    forwarder: 'Nippon Express USA',
    operatingCarrier: 'UPS Airlines',
    operatingCarrierSource: 'booking confirmation',
    stateVariationsChecked: true,
    operatorVariationsChecked: true,
    packages,
    ...overrides,
  }
}
