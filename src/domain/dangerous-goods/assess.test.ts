/**
 * Assessment tests.
 *
 * Built around the exercise workbook's own scenarios, so the answers here are answers the
 * course expects a trained shipper to give.
 */
import { describe, expect, it } from 'vitest'
import { consignment, entry, overpack, pkg } from './test-support'
import { assess, packageCountInConsignment } from './assess'

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
    expect(result.totals).toMatchObject({ packages: 2, netWeightKg: 8.5 })
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

  it('holds Section II to 5 kg on a cargo aircraft — the 35 kg relief belongs to Section I', () => {
    const heavy = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 12,
          countPerPackage: 24,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    // The default consignment is cargo aircraft only, and 12 kg would have passed against
    // the mis-transcribed 35 kg figure while being 2.4x over the real Section II ceiling.
    const result = assess(heavy)
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: false, expected: '≤ 5 kg', actual: '12 kg' })
    expect(result.canGenerate).toBe(false)
  })

  it('does not require the CAO label on Section II packages offered cargo-only by choice', () => {
    const result = assess(drills)
    expect(check(result, 'dg.aircraft')!.detail).toContain('label is not applied')
    for (const p of result.packages) {
      expect(p.hazardCommunication.join(' ')).not.toContain('Cargo Aircraft Only')
    }
  })
})

describe('the air waybill statement follows the declaration, not just the goods', () => {
  const regulated = (aircraft: 'passenger-and-cargo' | 'cargo-aircraft-only') =>
    consignment(
      [pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 150 }, { netWeightKgPerPackage: 3 })])],
      { aircraft },
    )

  it('carries the CAO annotation when a passenger-permitted consignment is offered cargo-only', () => {
    // The declaration strikes the passenger box and the packages carry the CAO label, so
    // an AWB statement without the annotation would contradict the paper it points at.
    expect(assess(regulated('cargo-aircraft-only')).airWaybillStatements).toEqual([
      'Dangerous goods as per associated Shipper’s Declaration — Cargo Aircraft Only',
    ])
  })

  it('omits the annotation when the same goods are offered on passenger aircraft', () => {
    expect(assess(regulated('passenger-and-cargo')).airWaybillStatements).toEqual([
      'Dangerous goods as per associated Shipper’s Declaration',
    ])
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
          testSummaryScope: null,
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
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { testSummaryScope: null })])]))
    expect(check(result, 'dg.test-summary')).toMatchObject({ severity: 'blocking', passed: false })
  })

  // The quiet one. A module summary held against the pack assembled from those modules
  // reads as qualification and is not one — a battery must be of a proved type irrespective
  // of whether the cells it is composed of are of a tested type.
  it('blocks a module test summary held against an assembled pack', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { wattHours: 2000 }, { articleLevel: 'battery-pack', testSummaryScope: 'module' }),
        ]),
      ]),
    )
    const summary = check(result, 'dg.test-summary')
    expect(summary).toMatchObject({
      severity: 'blocking',
      passed: false,
      expected: 'an assembled battery pack',
      actual: 'a module',
    })
  })

  it('blocks a summary that covers the right article but cannot be retrieved', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { testSummaryReference: '  ' })])]),
    )
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
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 2 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, { netWeightKgPerPackage: 2.5, countPerPackage: 1 }),
      ]),
    ])
    const result = assess(combined)
    // 2 and 2.5 kg, each inside its own 5 kg Section II allowance...
    expect(result.checks.filter((c) => c.id.startsWith('dg.limit.p1')).every((c) => c.passed)).toBe(true)
    // ...and 4.5 kg in total, inside it too.
    expect(check(result, 'dg.a181')).toMatchObject({ passed: true, actual: '4.5 kg' })
  })

  it('holds the A181 total to the 5 kg Section II ceiling, which has no cargo relief', () => {
    const combined = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3, countPerPackage: 1 }),
      ]),
    ])
    // Each entry is inside its own 5 kg allowance, but under A181 the 6 kg total is what
    // the limit applies to — and on a cargo aircraft the Section II ceiling is still 5 kg.
    expect(check(assess(combined), 'dg.a181')).toMatchObject({ passed: false, actual: '6 kg', expected: '≤ 5 kg' })
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
      { overpacks: [overpack('o1', { marks: '#A001, #A002', count: 2 })] },
    )
    expect(packageCountInConsignment(shipment.packages[0], shipment)).toBe(8)
    expect(assess(shipment).totals).toMatchObject({ packages: 8, netWeightKg: 16 })
  })

  it('blocks unmarked overpacks once there is more than one', () => {
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 90 })], { count: 1, overpackId: 'o1' })],
      { overpacks: [overpack('o1', { marks: '', count: 3 })] },
    )
    expect(check(assess(shipment), 'dg.overpack')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('says nothing about an overpack no package is in', () => {
    const shipment = consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], {
      overpacks: [overpack('o1', { count: 4 })],
    })
    expect(check(assess(shipment), 'dg.overpack')).toBeUndefined()
  })
})

describe('the operating carrier is not the forwarder', () => {
  it('blocks until the airline is resolved', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], { operatingCarrier: '' }))
    const carrier = check(result, 'dg.operating-carrier')
    expect(carrier).toMatchObject({ severity: 'blocking', passed: false })
    expect(carrier?.detail).toContain('not the forwarder')
  })

  it('is satisfied by the airline, not by naming the forwarder', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], {
        forwarder: 'Nippon Express USA',
        operatingCarrier: '',
      }),
    )
    expect(check(result, 'dg.operating-carrier')).toMatchObject({ passed: false })
  })
})

describe('state of charge as evidence', () => {
  it('rejects an indicated-capacity reading for a standalone battery', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { wattHours: 90 }, { stateOfChargeBasis: 'indicated-capacity' })]),
      ]),
    )
    const basis = check(result, 'dg.soc-basis')
    expect(basis).toMatchObject({ severity: 'blocking', passed: false, expected: 'rated capacity' })
  })

  it('rejects it for a battery packed with equipment too — that branch has no 25% alternative', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, {
            stateOfChargeBasis: 'indicated-capacity',
          }),
        ]),
      ]),
    )
    expect(check(result, 'dg.soc-basis')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('accepts it for a battery contained in equipment, where the alternative does apply', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, {
            countPerPackage: 1,
            stateOfChargeBasis: 'indicated-capacity',
            stateOfChargePercent: 22,
          }),
        ]),
      ]),
    )
    expect(check(result, 'dg.soc-basis')).toBeUndefined()
  })

  it('blocks a mandatory figure that nobody can say how they measured', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { wattHours: 90 }, { stateOfChargeMethod: '', stateOfChargeMeasuredBy: '' }),
        ]),
      ]),
    )
    const evidence = check(result, 'dg.soc-evidence')
    expect(evidence).toMatchObject({ severity: 'blocking', passed: false })
    expect(evidence?.detail).toContain('the measuring device or method')
  })
})

describe('the vehicle question', () => {
  it('blocks equipment nobody has determined either way', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, {
            countPerPackage: 1,
            vehicleDetermination: 'not-determined',
          }),
        ]),
      ]),
    )
    expect(check(result, 'dg.vehicle')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('blocks a vehicle and points at the entries that do apply', () => {
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, {
            countPerPackage: 1,
            vehicleDetermination: 'is-a-vehicle',
          }),
        ]),
      ]),
    )
    const vehicle = check(result, 'dg.vehicle')
    expect(vehicle).toMatchObject({ severity: 'blocking', passed: false })
    expect(vehicle?.detail).toContain('UN3556')
    // And the mode split: the US has not adopted the vehicle entries.
    expect(vehicle?.detail).toContain('UN3171')
  })

  it('never asks it of a standalone battery', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { vehicleDetermination: 'not-determined' })])]),
    )
    expect(check(result, 'dg.vehicle')).toBeUndefined()
  })
})

describe('the three weights', () => {
  it('blocks contents heavier than the package they are in', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { wattHours: 90 }, { netWeightKgPerPackage: 20 })], {
          grossWeightKg: 15,
          equipmentNetWeightKg: 0,
        }),
      ]),
    )
    const weights = check(result, 'dg.weights')
    expect(weights).toMatchObject({ severity: 'blocking', passed: false, expected: '≤ 15 kg', actual: '20 kg' })
  })

  it('warns rather than blocks when no gross weight was recorded', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { grossWeightKg: null })]))
    expect(check(result, 'dg.weights')).toMatchObject({ severity: 'warning', passed: false })
  })

  it('never derives one weight from another', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 4 })], {
          grossWeightKg: 30,
          equipmentNetWeightKg: 18,
        }),
      ]),
    )
    // The declared quantity is the battery net weight alone — not gross, and not gross minus
    // equipment, which would be 12 kg here.
    expect(result.totals.netWeightKg).toBe(4)
    expect(result.totals.grossWeightKg).toBe(30)
  })
})

describe('the packaging authorization', () => {
  it('binds below the packing instruction figure', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 8 })], {
          packagingAuthorizationLimitKg: 6,
        }),
      ]),
    )
    const limit = check(result, 'dg.limit.p1')
    expect(limit).toMatchObject({ severity: 'blocking', passed: false, expected: '≤ 6 kg' })
    expect(limit?.detail).toContain('authorization')
  })

  it('leaves the packing instruction figure in force when it is the lower of the two', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 8 })], {
          packagingAuthorizationLimitKg: 25,
        }),
      ]),
    )
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: true, expected: '≤ 10 kg' })
  })
})

describe('co-packing', () => {
  it('blocks a package sharing an outer packaging with a prohibited class', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { coPackedWithProhibitedClass: true })]),
    )
    expect(check(result, 'dg.co-pack')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('names the list exactly, and says 1.4S is permitted', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 })])]))
    const detail = check(result, 'dg.co-pack')?.detail ?? ''
    expect(detail).toContain('Division 1.4S is permitted')
    expect(detail).toContain('Division 5.1 oxidizers')
    // Not on the list, however often they are added to it.
    expect(detail).toContain('Divisions 4.2, 4.3 and 5.2, Class 8 and Division 2.2 do not appear in it')
  })

  it('applies the same prohibition to an overpack', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { overpackId: 'o1' })], {
        overpacks: [overpack('o1', { coPackedWithProhibitedClass: true })],
      }),
    )
    expect(check(result, 'dg.overpack-co-pack')).toMatchObject({ severity: 'blocking', passed: false })
  })
})

describe('overpack marking', () => {
  it('requires an identifier on a single overpack, not only on multiples', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { overpackId: 'o1' })], {
        overpacks: [overpack('o1', { marks: '', count: 1 })],
      }),
    )
    expect(check(result, 'dg.overpack-identifier')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('puts OVERPACK and the reproduce-marks rule on the package requirements', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { overpackId: 'o1' })], {
        overpacks: [overpack('o1', { innerMarksVisible: false })],
      }),
    )
    const marks = result.packages[0].hazardCommunication
    expect(marks).toContain('The word OVERPACK on the outside of the overpack, at least 12 mm high')
    expect(marks).toContain('Overpack identification mark (#A001)')
    expect(marks).toContain('Every mark and label above reproduced on the outside of the overpack')
  })

  it('drops the reproduce rule when the marks stay visible through it', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 })], { overpackId: 'o1' })], {
        overpacks: [overpack('o1', { innerMarksVisible: true })],
      }),
    )
    expect(
      result.packages[0].hazardCommunication.some((m) => m.startsWith('Every mark and label above reproduced')),
    ).toBe(false)
  })
})

describe('over the limit', () => {
  it('says what A99 actually costs rather than calling it an approval', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 500 }, {
          netWeightKgPerPackage: 68,
        })], { unSpecificationMark: '4G/Y75/S/26/USA/+D02390', grossWeightKg: 90 }),
      ]),
    )
    const a99 = check(result, 'dg.a99')
    expect(a99).toBeDefined()
    expect(a99?.detail).toContain('State of the Operator')
    expect(a99?.detail).toContain('refuse carriage')
  })
})

describe('special provision A99 is about 35 kg, not about being over the limit', () => {
  it('does not offer A99 for a 12 kg package over the 10 kg Section IB ceiling', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 12 })])]),
    )
    // The limit still fails...
    expect(check(result, 'dg.limit.p1')).toMatchObject({ severity: 'blocking', passed: false })
    // ...but the remedy is a second box, not a two-authority approval.
    expect(check(result, 'dg.a99')).toBeUndefined()
    expect(check(result, 'dg.limit.p1')?.detail).toContain('below the 35 kg mark')
  })

  it('offers it once the battery itself is over 35 kg', () => {
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 500 }, {
          netWeightKgPerPackage: 68,
        })], { unSpecificationMark: '4G/Y75/S/26/USA/+D02390', grossWeightKg: 90 }),
      ]),
    )
    expect(check(result, 'dg.a99')).toBeDefined()
  })
})

describe('a package description covering no packages', () => {
  it('blocks, rather than putting "0 Fibreboard box" on the declaration', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 95 })], { count: 0 })]))
    expect(check(result, 'dg.package-count')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })
})

describe('a package mixing Section II with fully regulated batteries', () => {
  const mixed = consignment([
    pkg('p1', [
      entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 1 }),
      entry('e2', { configuration: 'contained-in-equipment', wattHours: 300 }, {
        netWeightKgPerPackage: 3,
        countPerPackage: 1,
      }),
    ]),
  ])

  it('is refused: no declaration this workflow can produce describes it truthfully', () => {
    const result = assess(mixed)
    expect(check(result, 'dg.mixed-regulation.p1')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('counts only the declared entries when warning about shared packaging', () => {
    // One declared entry means one line on the declaration, so there is nothing to warn
    // about — the warning used to fire and claim two lines the paper never had.
    expect(check(assess(mixed), 'dg.shared-packaging.p1')).toBeUndefined()
  })
})

describe('the Section I route out of the 5 kg Section II ceiling', () => {
  const heavy = (prepareToSectionI: boolean) =>
    consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 96 }, {
          netWeightKgPerPackage: 12,
          prepareToSectionI,
        }),
      ], { unSpecificationMark: '4G/Y30/S/26' }),
    ])

  it('names Section I as the alternative rather than leaving "split it" as the only way out', () => {
    const detail = check(assess(heavy(false)), 'dg.limit.p1')!.detail
    expect(detail).toContain('Section I of PI 966')
    expect(detail).toContain('35 kg')
  })

  it('accepts the same package once the shipper records that it was prepared to Section I', () => {
    const result = assess(heavy(true))
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: true, expected: '≤ 35 kg' })
    // And it is fully regulated now: a declaration, and the CAO consignment labels it.
    expect(result.declarationRequired).toBe(true)
    expect(result.packages[0].hazardCommunication.join(' ')).toContain('Class 9')
  })
})

describe('a mixed consignment offered cargo-aircraft-only', () => {
  const mixed = consignment([
    pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })]),
    pkg('p2', [
      entry('e2', { configuration: 'contained-in-equipment', wattHours: 76 }, {
        netWeightKgPerPackage: 1.5,
        countPerPackage: 3,
        stateOfChargePercent: 20,
      }),
    ]),
  ])

  it('scopes the CAO label to the fully regulated packages', () => {
    const result = assess(mixed)
    // Exactly the consignment-level check, not the per-package `dg.aircraft.p1`.
    const detail = result.checks.find((c) => c.id === 'dg.aircraft')!.detail
    expect(detail).toContain('fully regulated packages only')
    // And the marks agree: the Section II box carries neither label.
    const sectionII = result.packages.find((p) => !p.declarationRequired)!
    expect(sectionII.hazardCommunication.join(' ')).not.toContain('Cargo Aircraft Only')
    expect(sectionII.hazardCommunication.join(' ')).not.toContain('Class 9')
  })
})
