/**
 * Assessment tests.
 *
 * Built around the exercise workbook's own scenarios, so the answers here are answers the
 * course expects a trained shipper to give.
 */
import { describe, expect, it } from 'vitest'
import { assess, packageCountInConsignment } from './assess'
import { emptyConsignment, emptyEntry, type BatteryEntry, type DgConsignment, type DgPackage } from './types'
import type { BatterySpec } from './lithium'

/** A battery entry with everything the shipper is responsible for already answered. */
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

/** A consignment whose non-battery boxes are all filled in, so only the goods are under test. */
function consignment(packages: DgPackage[], overrides: Partial<DgConsignment> = {}): DgConsignment {
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
    stateVariationsChecked: true,
    operatorVariationsChecked: true,
    packages,
    ...overrides,
  }
}

function check(result: ReturnType<typeof assess>, idPrefix: string) {
  return result.checks.find((c) => c.id.startsWith(idPrefix))
}

describe('the workbook Section IB consignment', () => {
  // Workbook Unit 5 question 11: two fibreboard boxes prepared to Section IB — 7 kg of
  // UN3480 in one and 1.5 kg of UN3090 in the other.
  const shipment = consignment([
    pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })]),
    pkg('p2', [
      entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1.5 }, { netWeightKgPerPackage: 1.5, wattHourMarkedOnCase: false }),
    ]),
  ])

  it('needs a declaration and is cargo aircraft only', () => {
    const result = assess(shipment)
    expect(result.declarationRequired).toBe(true)
    expect(result.requiredAircraft).toBe('cargo-aircraft-only')
    expect(result.totals).toEqual({ packages: 2, netWeightKg: 8.5 })
  })

  it('passes every blocking check', () => {
    const result = assess(shipment)
    const failing = result.checks.filter((c) => c.severity === 'blocking' && !c.passed)
    expect(failing.map((c) => c.id)).toEqual([])
    expect(result.canGenerate).toBe(true)
  })

  it('classifies the two boxes under PI 965 IB and PI 968 IB', () => {
    const result = assess(shipment)
    expect(result.classifications.map((c) => c.packingInstructionLabel)).toEqual(['965 IB', '968 IB'])
  })

  it('asks for one air waybill statement, naming cargo aircraft only', () => {
    const result = assess(shipment)
    expect(result.airWaybillStatements).toEqual([
      'Dangerous goods as per associated Shipper’s Declaration — Cargo Aircraft Only',
    ])
  })

  it('refuses the same shipment on a passenger aircraft', () => {
    const result = assess({ ...shipment, aircraft: 'passenger-and-cargo' })
    expect(check(result, 'dg.aircraft.p1')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('blocks 3 kg of lithium metal in one box, which is over the 2.5 kg Section IB limit', () => {
    const heavier = consignment([
      pkg('p2', [
        entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1.5 }, { netWeightKgPerPackage: 3, wattHourMarkedOnCase: false }),
      ]),
    ])
    const result = assess(heavier)
    const limit = check(result, 'dg.limit.p2')
    expect(limit).toMatchObject({ severity: 'blocking', passed: false, expected: '≤ 2.5 kg', actual: '3 kg' })
  })
})

describe('the workbook power drills', () => {
  // Workbook Unit 5 question 10: one package, three drills, each battery 76 Wh and 0.5 kg,
  // contained in the equipment.
  const drills = consignment([
    pkg('p1', [
      entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
        netWeightKgPerPackage: 1.5,
        countPerPackage: 3,
        stateOfChargePercent: 20,
      }),
    ]),
  ])

  it('needs no declaration', () => {
    const result = assess(drills)
    expect(result.declarationRequired).toBe(false)
    expect(check(result, 'dg.declaration-fields')).toMatchObject({ severity: 'info', passed: true })
  })

  it('needs the battery mark, because three batteries is more than two', () => {
    const result = assess(drills)
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
  })

  it('asks for the Section II air waybill statement naming PI 967', () => {
    expect(assess(drills).airWaybillStatements).toEqual([
      'Lithium ion batteries in compliance with Section II of PI967',
    ])
  })

  it('measures the 5 kg limit against the batteries, not the 5 kg package', () => {
    const result = assess(drills)
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: true, actual: '1.5 kg' })
  })
})

describe('the battery mark exemption for equipment', () => {
  const laptops = (packages: number) =>
    consignment([
      pkg(
        'p1',
        [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
            netWeightKgPerPackage: 1,
            countPerPackage: 2,
            stateOfChargePercent: 20,
          }),
        ],
        { count: packages },
      ),
    ])

  it('exempts two batteries per package in a consignment of two packages', () => {
    const result = assess(laptops(2))
    expect(result.packages[0].batteryMarkExemption).toContain('no more than two packages')
    expect(result.packages[0].hazardCommunication.some((m) => m.startsWith('Lithium battery mark'))).toBe(false)
  })

  it('withdraws the exemption once the consignment reaches three packages', () => {
    const result = assess(laptops(3))
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
  })

  it('exempts button cells installed in equipment whatever the count', () => {
    const boards = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', form: 'cell', wattHours: 0.5 }, {
          netWeightKgPerPackage: 0.2,
          countPerPackage: 400,
          buttonCellsInEquipment: true,
          testSummaryOnFile: false,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    const result = assess(boards)
    expect(result.packages[0].batteryMarkExemption).toContain('button cells')
    // And the test summary requirement does not reach them either.
    expect(check(result, 'dg.test-summary')).toMatchObject({ passed: true })
  })

  it('does not exempt a package the consignment size disqualifies even at two batteries', () => {
    // Three separate package descriptions, two batteries each: five packages in total.
    const mixed = consignment([
      pkg('a', [entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, { netWeightKgPerPackage: 1, countPerPackage: 2, stateOfChargePercent: 20 })], { count: 2 }),
      pkg('b', [entry('e2', { configuration: 'contained-in-equipment', wattHours: 86 }, { netWeightKgPerPackage: 1, countPerPackage: 2, stateOfChargePercent: 20 })], { count: 3 }),
    ])
    const result = assess(mixed)
    expect(result.packages.every((p) => p.batteryMarkExemption === null)).toBe(true)
  })
})

describe('goods that may not fly at all', () => {
  it('blocks damaged or defective batteries, citing A154', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { condition: 'damaged-or-defective' })])]),
    )
    const condition = check(result, 'dg.condition')
    expect(condition).toMatchObject({ severity: 'blocking', passed: false })
    expect(condition?.detail).toContain('A154')
    expect(result.canGenerate).toBe(false)
  })

  it('blocks waste batteries sent for recycling, citing A183', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { condition: 'for-recycling-or-disposal' })])]),
    )
    expect(check(result, 'dg.condition')?.detail).toContain('A183')
  })
})

describe('what the shipper has to establish', () => {
  it('blocks an unstated watt-hour rating rather than assuming the relief', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: null })])]))
    expect(check(result, 'dg.energy')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('blocks a missing UN 38.3 test summary', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { testSummaryOnFile: false })])]))
    expect(check(result, 'dg.test-summary')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('blocks an unmarked battery case for lithium ion, and does not ask it of lithium metal', () => {
    const ion = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { wattHourMarkedOnCase: false })])]))
    expect(check(ion, 'dg.wh-mark')).toMatchObject({ severity: 'blocking', passed: false })

    const metal = assess(
      consignment([
        pkg('p1', [entry('e1', { chemistry: 'lithium-metal', lithiumContentG: 1 }, { wattHourMarkedOnCase: false })]),
      ]),
    )
    expect(check(metal, 'dg.wh-mark')).toBeUndefined()
  })

  it('blocks a standalone battery above 30% state of charge', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { stateOfChargePercent: 55 })])]))
    expect(check(result, 'dg.soc')).toMatchObject({ severity: 'blocking', passed: false, actual: '55%' })
  })

  it('warns, rather than blocks, where the state of charge is only recommended', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, { stateOfChargePercent: 80, countPerPackage: 1 }),
        ]),
      ]),
    )
    expect(check(result, 'dg.soc')).toMatchObject({ severity: 'warning', passed: false })
    expect(result.canGenerate).toBe(true)
  })

  it('blocks a missing net battery weight', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { netWeightKgPerPackage: null })])]))
    expect(check(result, 'dg.net-weight')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('blocks UN specification packaging that has not been identified', () => {
    const large = assess(consignment([pkg('p1', [entry('e1', { wattHours: 500 })])]))
    expect(check(large, 'dg.un-packaging')).toMatchObject({ severity: 'blocking', passed: false })

    const marked = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 500 })], { unSpecificationMark: '4G/Y25/S/26/USA/+D02390' })]),
    )
    expect(check(marked, 'dg.un-packaging')).toMatchObject({ passed: true })
  })

  it('blocks until the state and operator variations have been read', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], { operatorVariationsChecked: false }),
    )
    expect(check(result, 'dg.variations')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('blocks a declaration with an empty box the shipper owns', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], { airportOfDestination: '' }))
    const fields = check(result, 'dg.declaration-fields')
    expect(fields).toMatchObject({ severity: 'blocking', passed: false })
    expect(fields?.detail).toContain('airport of destination')
  })

  it('blocks an empty consignment', () => {
    expect(assess(consignment([])).canGenerate).toBe(false)
  })
})

describe('packages holding more than one entry', () => {
  it('gives each UN number its own allowance, and applies A181 to the total', () => {
    const combined = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3, countPerPackage: 1 }),
      ]),
    ])
    const result = assess(combined)
    // 3 kg each, both inside their own 35 kg cargo allowance...
    expect(result.checks.filter((c) => c.id.startsWith('dg.limit.p1')).every((c) => c.passed)).toBe(true)
    // ...and 6 kg in total, inside it too.
    expect(check(result, 'dg.a181')).toMatchObject({ passed: true, actual: '6 kg' })
  })

  it('blocks a combined package whose total mass exceeds the lowest limit', () => {
    const heavy = consignment(
      [
        pkg('p1', [
          entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3 }),
          entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3, countPerPackage: 1 }),
        ]),
      ],
      { aircraft: 'passenger-and-cargo' },
    )
    const result = assess(heavy)
    expect(check(result, 'dg.a181')).toMatchObject({ severity: 'blocking', passed: false, expected: '≤ 5 kg' })
  })

  it('warns that the packaging description belongs against the first entry only', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { wattHours: 90 }, { netWeightKgPerPackage: 3 }),
          entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, { netWeightKgPerPackage: 1, wattHourMarkedOnCase: false }),
        ]),
      ]),
    )
    expect(check(result, 'dg.shared-packaging')).toMatchObject({ severity: 'warning', passed: false })
  })
})

describe('overpacks', () => {
  it('counts packages across identical overpacks', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 90 }, { netWeightKgPerPackage: 2 })], { count: 4, overpackId: 'o1' })],
      { overpacks: [{ id: 'o1', marks: '#A001, #A002', count: 2 }] },
    )
    expect(packageCountInConsignment(shipment.packages[0], shipment)).toBe(8)
    expect(assess(shipment).totals).toEqual({ packages: 8, netWeightKg: 16 })
  })

  it('blocks unmarked overpacks once there is more than one', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 90 })], { count: 1, overpackId: 'o1' })],
      { overpacks: [{ id: 'o1', marks: '', count: 3 }] },
    )
    expect(check(assess(shipment), 'dg.overpack')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('says nothing about an overpack no package is in', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], {
      overpacks: [{ id: 'o1', marks: '', count: 4 }],
    })
    expect(check(assess(shipment), 'dg.overpack')).toBeUndefined()
  })
})
