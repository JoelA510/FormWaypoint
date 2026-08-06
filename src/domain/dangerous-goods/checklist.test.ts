import { describe, expect, it } from 'vitest'
import { assess } from './assess'
import { buildChecklist } from './checklist'
import { retainUntil } from './dgd'
import { emptyConsignment, emptyEntry, type BatteryEntry, type DgConsignment, type DgPackage } from './types'
import type { BatterySpec } from './lithium'

function entry(id: string, spec: Partial<BatterySpec>, overrides: Partial<BatteryEntry> = {}): BatteryEntry {
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
    netWeightKgPerPackage: 1,
    testSummaryOnFile: true,
    wattHourMarkedOnCase: true,
    stateOfChargePercent: 25,
    ...overrides,
  }
}

function pkg(id: string, entries: BatteryEntry[], overrides: Partial<DgPackage> = {}): DgPackage {
  return { id, packagingType: 'Fibreboard box', count: 1, unSpecificationMark: '', entries, overpackId: null, ...overrides }
}

function consignment(packages: DgPackage[], overrides: Partial<DgConsignment> = {}): DgConsignment {
  return {
    ...emptyConsignment(),
    shipper: { name: 'Acme Exports', addressLines: ['1 Harbour Way'] },
    consignee: { name: 'Southern Distribution', addressLines: ['15 Rockwell Lane'] },
    airportOfDeparture: 'Los Angeles',
    airportOfDestination: 'Las Vegas',
    emergencyContactName: 'CHEMTREC',
    emergencyContactPhone: '1-800-424-9300',
    signerName: 'J. Alvarez',
    signerDate: '2026-08-06',
    operator: 'UPS',
    stateVariationsChecked: true,
    operatorVariationsChecked: true,
    packages,
    ...overrides,
  }
}

describe('the package checklist', () => {
  it('lists the marks a Section IB package carries, as things to tick off', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })])])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')

    expect(markdown).toContain('- [ ] Class 9 lithium battery hazard label')
    expect(markdown).toContain('- [ ] Lithium battery mark bearing UN3480')
    expect(markdown).toContain('- [ ] Cargo Aircraft Only label, on the same surface as the Class 9 label')
    expect(markdown).toContain('UN3480, Lithium ion batteries')
    expect(markdown).toContain('PI 965 IB')
  })

  it('is the whole deliverable for a Section II consignment, and says so', () => {
    const shipment = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 1.5,
          countPerPackage: 3,
        }),
      ]),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')

    expect(markdown).toContain('Not required — every package is Section II')
    expect(markdown).toContain('“Lithium ion batteries in compliance with Section II of PI967”')
    expect(markdown).toContain('adequate instruction')
    expect(markdown).not.toContain('Two signed copies')
  })

  it('records the exemption rather than silently dropping the mark', () => {
    const shipment = consignment([
      pkg(
        'p1',
        [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
            netWeightKgPerPackage: 1,
            countPerPackage: 2,
          }),
        ],
        { count: 2 },
      ),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('*Battery mark not required:*')
  })

  it('names the operator in the variations reminder', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])])
    expect(buildChecklist(shipment, assess(shipment), '2026-08-06')).toContain('Operator variations (IATA 2.8.3) read for UPS')
  })

  it('calls out UN specification packaging with its marking', () => {
    const shipment = consignment([
      pkg('p1', [entry('e1', { wattHours: 500 }, { netWeightKgPerPackage: 20 })], {
        unSpecificationMark: '4G/Y25/S/26/USA/+D02390',
      }),
    ])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('UN specification packaging `4G/Y25/S/26/USA/+D02390`')
    expect(markdown).toContain('Packing Group II')
  })

  it('carries the failing checks through, so a half-prepared consignment says what is missing', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: null })])])
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('## Outstanding')
    expect(markdown).toContain('energy content stated')
  })

  it('escapes a pipe in a shipper-supplied value rather than splitting the table', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], {
      consignee: { name: 'Acme | Distribution', addressLines: ['1 Road'] },
    })
    const markdown = buildChecklist(shipment, assess(shipment), '2026-08-06')
    expect(markdown).toContain('| Consignee | Acme \\| Distribution |')
  })
})

describe('the retention date', () => {
  it('is two years on, in local time', () => {
    expect(retainUntil(new Date(2026, 7, 6))).toBe('2028-08-06')
    expect(retainUntil(new Date(2026, 0, 1))).toBe('2028-01-01')
  })

  it('does not slip a day for a shipment prepared in the afternoon west of Greenwich', () => {
    // 21:00 on the 6th in UTC-7 is the 7th in UTC; the date on the shelf label is the 6th.
    expect(retainUntil(new Date(2026, 7, 6, 21, 30))).toBe('2028-08-06')
  })
})
