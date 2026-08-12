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

  it('does not grant the exemption on a fractional consignment', () => {
    // The count inputs take whatever is typed, and 1 + 0.5 sits inside "no more than two"
    // — taking the mark off the list at the packing bench, under wording reading "in a
    // consignment of 1.5 packages".
    const laptop = () =>
      entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
        netWeightKgPerPackage: 1,
        countPerPackage: 2,
        stateOfChargePercent: 20,
      })
    const fractional = consignment([
      pkg('p1', [laptop()], { count: 1 }),
      pkg('p2', [laptop()], { count: 0.5 }),
    ])
    const result = assess(fractional)
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
  })

  it('does not grant the exemption on a count nobody has stated', () => {
    // The panel stores zero for a cleared overpack box so `dg.overpack-count` can refuse
    // it, and flooring that back to one undid it in the multiplier: four packages read as
    // two, and the mark came off the list at the packing bench, above the checks.
    const cleared = consignment(
      [
        pkg(
          'p1',
          [
            entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
              netWeightKgPerPackage: 1,
              countPerPackage: 2,
              stateOfChargePercent: 20,
            }),
          ],
          { count: 2, overpackId: 'o1' },
        ),
      ],
      { overpacks: [overpack('o1', { count: 0 })] },
    )
    const result = assess(cleared)
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
  })

  it('does not read a count of zero as an allowance satisfied', () => {
    // Zero is a number nobody typed, not two batteries fewer than two. The package holds a
    // kilogram of batteries and needs the mark.
    const uncounted = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 86 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 0,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    const result = assess(uncounted)
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
  })

  it('does not add the two allowances together for a package holding cells and batteries', () => {
    // "No more than four cells or two batteries" is one allowance or the other. A box with
    // four cells *and* two batteries in it is outside both readings of the exception, and
    // was being told the mark was not required.
    const both = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', form: 'cell', wattHours: 15 }, {
          netWeightKgPerPackage: 0.4,
          countPerPackage: 4,
          stateOfChargePercent: 20,
        }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 86 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 2,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    const result = assess(both)
    expect(result.packages[0].batteryMarkExemption).toBeNull()
    expect(result.packages[0].hazardCommunication).toContain('Lithium battery mark bearing UN3481')
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

describe('a package whose section nothing has decided', () => {
  it('claims neither packaging answer, because the two candidates disagree', () => {
    // Conservative points opposite ways for the two halves of the same entry: the lower
    // ceiling for the quantity, the stricter requirement for the packaging. Demanding a
    // mark blocks a second time on what `dg.energy` is already blocking for; saying none is
    // needed is a positive permissive claim about a section nothing has decided.
    const unrated = consignment([pkg('p1', [entry('e1', { wattHours: null })])])
    const result = assess(unrated)
    const packaging = check(result, 'dg.packaging')
    expect(packaging).toMatchObject({ severity: 'info', passed: true })
    expect(packaging!.detail).toContain('do not agree')
    expect(packaging!.detail).not.toContain('does not require UN specification packaging')
    expect(check(result, 'dg.un-packaging')).toBeUndefined()
    // And the rating is still what the shipment is held on.
    expect(check(result, 'dg.energy')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('does not raise the question for equipment, which never takes the packaging', () => {
    // Batteries contained in equipment take a strong rigid outer packaging in every
    // section, so nothing about UN specification packaging is in doubt for them whatever
    // the rating turns out to be. Keyed on the band alone, this named two sections the
    // goods cannot be in and withheld the requirement that does apply to them.
    const unrated = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: null }, { countPerPackage: 1 }),
      ]),
    ])
    const packaging = check(assess(unrated), 'dg.packaging')!
    expect(packaging.detail).toContain('strong, rigid outer packaging')
    expect(packaging.detail).not.toContain('do not agree')
  })

  it('names Section I and II for equipment packed beside batteries, and does not cite A802', () => {
    // A802 is written for Section IB of PI 965 and PI 968. The candidates here are Section I
    // and Section II of PI 966, and citing the wrong exception is the mismatch this file has
    // been corrected for twice.
    const unrated = consignment([
      pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: null })]),
    ])
    const packaging = check(assess(unrated), 'dg.packaging')!
    expect(packaging.detail).toContain('Section I requires it and Section II does not')
    expect(packaging.detail).not.toContain('A802')
  })

  it('says which one applies as soon as the rating settles it', () => {
    const large = assess(consignment([pkg('p1', [entry('e1', { wattHours: 500 })])]))
    expect(check(large, 'dg.un-packaging')).toMatchObject({ severity: 'blocking' })

    const small = assess(consignment([pkg('p1', [entry('e1', { wattHours: 95 })])]))
    expect(check(small, 'dg.packaging')!.detail).toContain('A802')
  })
})

describe('a rating that decides nothing', () => {
  it('does not block a standalone sodium ion consignment on a figure PI 976 ignores', () => {
    // PI 976 has no sections and one 35 kg limit: the classification is identical with a
    // rating and without one, so refusing to generate for want of it asked for a field that
    // could not change the answer — under a message citing reliefs PI 976 does not have.
    const unrated = consignment([
      pkg('p1', [entry('e1', { chemistry: 'sodium-ion', wattHours: null })], {
        unSpecificationMark: '4G/Y75/S/26/USA/+D02390',
      }),
    ])
    const energy = check(assess(unrated), 'dg.energy')
    expect(energy).toMatchObject({ severity: 'info', passed: true })
    expect(energy!.detail).not.toContain('Section IB')
    expect(assess(unrated).canGenerate).toBe(true)
  })

  it('still counts the unrated sodium ion line as fully regulated when it shares a box', () => {
    // It does not block on `dg.energy` any more, so it has to be counted here: a UN3551
    // line beside a Section II battery in the same package produces a declaration that
    // omits half the box, which is what `dg.mixed-regulation` exists to refuse.
    const mixed = consignment([
      pkg('p1', [
        entry('e1', { chemistry: 'sodium-ion', wattHours: null }, { netWeightKgPerPackage: 2 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const result = assess(mixed)
    expect(check(result, 'dg.mixed-regulation.p1')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('blocks a rating of zero rather than treating it as a Section II battery', () => {
    // Zero passed as a stated rating: Section II, no declaration, the battery mark alone
    // for hazard communication, and `dg.energy` affirming "0 Wh against a 100 Wh
    // threshold — small by air".
    const zeroed = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 0 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const result = assess(zeroed)
    expect(check(result, 'dg.energy')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('still blocks a standalone lithium ion battery, where every threshold turns on it', () => {
    const unrated = consignment([
      pkg('p1', [entry('e1', { wattHours: null })], { unSpecificationMark: '4G/Y75/S/26/USA/+D02390' }),
    ])
    expect(check(assess(unrated), 'dg.energy')).toMatchObject({ severity: 'blocking', passed: false })
    expect(assess(unrated).canGenerate).toBe(false)
  })
})

describe('the provisions a check cites', () => {
  it('names the passenger-aircraft provision of the chemistry in hand', () => {
    // A201 belongs to lithium metal and A334 to lithium ion; citing the pair pointed a
    // UN3480 consignment at the provision written for the other one.
    const ion = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], { aircraft: 'passenger-and-cargo' }),
    )
    const detail = check(ion, 'dg.aircraft')!.detail
    expect(detail).toContain('A334')
    expect(detail).not.toContain('A201')

    const metal = assess(
      consignment([pkg('p1', [entry('e1', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
        wattHourMarkedOnCase: false,
      })])], { aircraft: 'passenger-and-cargo' }),
    )
    expect(check(metal, 'dg.aircraft')!.detail).toContain('A201')
  })

  it('describes the box the declaration will actually strike out', () => {
    // The renderer strikes whichever box the booking does not select. Written from the
    // goods alone, this told the shipper the passenger box was struck out while the preview
    // beside it struck the cargo box.
    const onPassenger = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 95 })])], { aircraft: 'passenger-and-cargo' }),
    )
    const wording = onPassenger.checks.find((c) => c.id === 'dg.aircraft')!.detail
    expect(wording).not.toContain('The passenger aircraft box on the declaration is struck out')
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

  it('blocks a net battery weight of zero, which is not a lighter package', () => {
    // Zero passed as a stated weight, and every limit in the assessment was then measured
    // against it — the declaration filing "1 Fibreboard box x 0 kg" in box 15.
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { netWeightKgPerPackage: 0 })])]))
    expect(check(result, 'dg.net-weight')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('blocks UN specification packaging that has not been identified', () => {
    const large = assess(consignment([pkg('p1', [entry('e1', { wattHours: 500 })])]))
    expect(check(large, 'dg.un-packaging')).toMatchObject({ severity: 'blocking', passed: false })

    const marked = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 500 })], { unSpecificationMark: '4G/Y25/S/26/USA/+D02390' })]),
    )
    expect(check(marked, 'dg.un-packaging')).toMatchObject({ passed: true })
    expect(check(marked, 'dg.un-packaging')!.detail).toContain('A802')
  })

  it('does not cite A802 to a sodium ion shipper, whose entry does not carry it', () => {
    // PI 976 requires the performance packaging by its own instruction. A802 is written for
    // lithium and `specialProvisionsFor` leaves it off UN3551 for that reason — so the
    // blocking check named a provision the column M list beside it excludes.
    const sodium = assess(
      consignment([
        pkg('p1', [entry('e1', { chemistry: 'sodium-ion', wattHours: 60 })], {
          unSpecificationMark: '4G/Y25/S/26/USA/+D02390',
        }),
      ]),
    )
    const packaging = check(sodium, 'dg.un-packaging')!
    expect(packaging.detail).toContain('Packing Group II performance')
    expect(packaging.detail).not.toContain('A802')
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

  it('counts the place of signing among them, which box 20 asks for beside the date', () => {
    // The box is captioned "Place and Date" and the renderer draws whichever of the two it
    // has, so a blank place printed a bare date under a check affirming that every box the
    // shipper is responsible for had a value.
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 90 })])], { signerPlace: '' }))
    const fields = check(result, 'dg.declaration-fields')
    expect(fields).toMatchObject({ severity: 'blocking', passed: false })
    expect(fields?.detail).toContain('place of signing')
    expect(result.canGenerate).toBe(false)
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
    // A181 makes these one entry, so there is one quantity row and it states the total —
    // the same 4.5 kg the declaration prints, inside the 5 kg Section II allowance.
    const limits = result.checks.filter((c) => c.id.startsWith('dg.limit.p1'))
    expect(limits).toHaveLength(1)
    expect(limits[0]).toMatchObject({ passed: true, actual: '4.5 kg' })
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
    expect(check(assess(combined), 'dg.limit.p1')).toMatchObject({
      passed: false,
      actual: '6 kg',
      expected: '≤ 5 kg',
    })
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
    expect(check(result, 'dg.limit.p1')).toMatchObject({ severity: 'blocking', passed: false, expected: '≤ 5 kg' })
  })

  it('measures the total A181 merges even when one entry has no rating', () => {
    // `applyA181` folds an unrated contained-in line into its packed-with neighbour on the
    // declaration and the checklist. Filtering unrated entries out of the check left that
    // merged mass measured against nothing, so the preview and the checks described two
    // different packages.
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3 }),
          entry('e2', { configuration: 'contained-in-equipment', wattHours: null }, {
            netWeightKgPerPackage: 2.5,
            countPerPackage: 1,
          }),
        ]),
      ]),
    )
    expect(check(result, 'dg.a181')).toMatchObject({ passed: false, actual: '5.5 kg', expected: '≤ 5 kg' })
  })

  it('does not relabel a fully regulated entry with a Section II description', () => {
    // A181 changes a description, not a regulatory treatment. Relabelling took the Class 9
    // label and the UN and proper shipping name mark off the marks list for a box that
    // needs them — and those are read while the box is being packed, before anyone has
    // reached the check that refuses the package.
    const mismatched = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 1 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 300 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ]),
    ])
    const result = assess(mismatched)
    const marks = result.packages[0].hazardCommunication.join(' ')
    expect(marks).toContain('Class 9 lithium battery hazard label')
    expect(marks).toContain('proper shipping name mark')
    expect(check(result, 'dg.mixed-regulation.p1')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('names the packed-with instruction on the air waybill, as the paper does', () => {
    // The air waybill statement is the whole hazard communication for an all-Section II
    // consignment. Built from the raw entries, a package described as packed with equipment
    // everywhere else still named PI 967 on it.
    const combined = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 2 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 2,
          countPerPackage: 1,
        }),
      ]),
    ])
    expect(assess(combined).airWaybillStatements).toEqual([
      'Lithium ion batteries in compliance with Section II of PI966',
    ])
  })

  it('does not gather two different UN numbers into one A181 total', () => {
    // Special provision A181 is written per entry: lithium ion packed with equipment and
    // lithium metal contained in equipment are two entries, each inside its own allowance,
    // and neither is held both ways. Summing the package regardless of UN number blocked
    // this at "6 kg against 5 kg" and nothing could be generated.
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 3 }),
          entry(
            'e2',
            { chemistry: 'lithium-metal', configuration: 'contained-in-equipment', lithiumContentG: 1 },
            { netWeightKgPerPackage: 3, countPerPackage: 1, wattHourMarkedOnCase: false },
          ),
        ]),
      ]),
    )
    expect(check(result, 'dg.a181')).toBeUndefined()
    expect(result.checks.filter((c) => c.id.startsWith('dg.limit.p1')).every((c) => c.passed)).toBe(true)
  })

  it('leaves an unrelated entry out of the A181 total', () => {
    // UN3481 is held both ways, so A181 gathers those two. The lithium metal line beside
    // them is packed with equipment only — no A181 total of its own, and no part of the
    // lithium ion one.
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, { netWeightKgPerPackage: 2 }),
          entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, { netWeightKgPerPackage: 2, countPerPackage: 1 }),
          entry(
            'e3',
            { chemistry: 'lithium-metal', configuration: 'packed-with-equipment', lithiumContentG: 1 },
            { netWeightKgPerPackage: 3, wattHourMarkedOnCase: false },
          ),
        ]),
      ]),
    )
    // The lithium ion pair is one row at their combined 4 kg; the lithium metal line keeps
    // its own, at its own 3 kg.
    const limits = result.checks.filter((c) => c.id.startsWith('dg.limit.p1'))
    expect(limits).toHaveLength(2)
    expect(limits.find((c) => c.id.includes('UN3481'))).toMatchObject({ passed: true, actual: '4 kg' })
    expect(limits.find((c) => c.id.includes('UN3091'))).toMatchObject({ passed: true, actual: '3 kg' })
  })

  it('asks for one proper shipping name mark on a package A181 makes one entry of', () => {
    // The marks go on the box, and A181 says the box is described as packed with
    // equipment. Built from the raw entries, this list asked for both names on the same
    // package while the declaration in the same envelope printed one.
    const result = assess(
      consignment([
        pkg('p1', [
          entry(
            'e1',
            { configuration: 'packed-with-equipment', wattHours: 90 },
            { netWeightKgPerPackage: 2, prepareToSectionI: true },
          ),
          entry(
            'e2',
            { configuration: 'contained-in-equipment', wattHours: 90 },
            { netWeightKgPerPackage: 2, countPerPackage: 1, prepareToSectionI: true },
          ),
        ]),
      ]),
    )
    const names = result.packages[0].hazardCommunication.filter((m) => m.includes('Lithium ion batteries'))
    expect(names.every((m) => !m.includes('contained in equipment'))).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('counts the lines A181 merges as the one line the declaration prints', () => {
    // Prepared to Section I, so both entries are declared. A181 puts them on one line —
    // the warning used to fire and describe a second line the paper does not have.
    const result = assess(
      consignment([
        pkg('p1', [
          entry(
            'e1',
            { configuration: 'packed-with-equipment', wattHours: 90 },
            { netWeightKgPerPackage: 2, prepareToSectionI: true },
          ),
          entry(
            'e2',
            { configuration: 'contained-in-equipment', wattHours: 90 },
            { netWeightKgPerPackage: 2, countPerPackage: 1, prepareToSectionI: true },
          ),
        ]),
      ]),
    )
    expect(check(result, 'dg.shared-packaging')).toBeUndefined()
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

  it('holds an indicated reading to the alternative’s own 25%, not the 30% figure', () => {
    // Contained in equipment is 30% of rated capacity *or* an indicated capacity of 25%.
    // A 28% indicated reading was checked against the number belonging to the other basis.
    const result = assess(
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, {
            countPerPackage: 1,
            stateOfChargeBasis: 'indicated-capacity',
            stateOfChargePercent: 28,
          }),
        ]),
      ]),
    )
    expect(check(result, 'dg.soc')).toMatchObject({ passed: false, expected: '≤ 25%', actual: '28%' })
    // And the same reading at 22% is inside it.
    const lower = assess(
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
    expect(check(lower, 'dg.soc')).toMatchObject({ passed: true, expected: '≤ 25%' })
  })

  it('does not make a recorded wrong basis harder to clear than no basis at all', () => {
    // Contained in equipment is a "should" rule, so both branches warn. Hardcoding the
    // wrong-basis branch blocking meant picking the wrong dropdown item stopped generation
    // while clearing it back to "not recorded" — strictly less information — did not.
    const entryAt = (basis: 'rated-design-capacity' | null) =>
      consignment([
        pkg('p1', [
          entry('e1', { configuration: 'contained-in-equipment', wattHours: 90 }, {
            countPerPackage: 1,
            stateOfChargeBasis: basis,
            stateOfChargePercent: 20,
          }),
        ]),
      ])
    expect(check(assess(entryAt('rated-design-capacity')), 'dg.soc-basis')).toMatchObject({
      severity: 'warning',
      passed: false,
    })
    expect(assess(entryAt('rated-design-capacity')).canGenerate).toBe(true)
    expect(check(assess(entryAt(null)), 'dg.soc-basis')).toMatchObject({ severity: 'warning' })
  })

  it('rejects a rated design capacity, which is not the basis any of these rules names', () => {
    // It belongs to the vehicle entries. Checking only for indicated capacity let it pass
    // in silence, under a check that says one of the three bases satisfies the entry.
    const result = assess(
      consignment([
        pkg('p1', [entry('e1', { wattHours: 90 }, { stateOfChargeBasis: 'rated-design-capacity' })]),
      ]),
    )
    expect(check(result, 'dg.soc-basis')).toMatchObject({
      severity: 'blocking',
      passed: false,
      actual: 'rated design capacity',
    })
  })

  it('still asks for a basis nobody recorded', () => {
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 90 }, { stateOfChargeBasis: null })])]),
    )
    expect(check(result, 'dg.soc-basis')).toMatchObject({ passed: false })
    expect(check(result, 'dg.soc-basis')!.detail).toContain('does not say what it is a percentage of')
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

describe('the count a check title states', () => {
  it('is the consignment total, the same number the declaration prints', () => {
    // 2 boxes per overpack across 3 overpacks is 6 packages. A title reading "2 ×
    // Fibreboard box" beside a declaration line reading "6 Fibreboard box" — both
    // reproduced in the same checklist — reads as two packages, not one described twice.
    const shipment = consignment(
      [pkg('p1', [entry('e1', { wattHours: 95 })], { count: 2, overpackId: 'o1' })],
      { overpacks: [overpack('o1', { marks: '#A001', count: 3 })] },
    )
    const titles = assess(shipment)
      .checks.filter((c) => /\.p1($|\.)/.test(c.id))
      .map((c) => c.title)
    expect(titles.length).toBeGreaterThan(0)
    expect(titles.every((t) => t.startsWith('6 × Fibreboard box'))).toBe(true)
  })
})

describe('a packaging authorization of zero', () => {
  it('is refused on its own terms, not read as a ceiling of nothing', () => {
    // Taken literally it blocked the consignment for ever, under a quantity message reading
    // like a packing problem and naming a remedy that could never clear it.
    const zeroed = consignment([
      pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 7 })], {
        packagingAuthorizationLimitKg: 0,
      }),
    ])
    const result = assess(zeroed)
    expect(check(result, 'dg.package-authorization-stated')).toMatchObject({
      severity: 'blocking',
      passed: false,
    })
    // And the quantity check measures against the packing instruction alone.
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: true, expected: '≤ 10 kg' })
  })
})

describe('a package description covering no packages', () => {
  it('blocks, rather than putting "0 Fibreboard box" on the declaration', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 95 })], { count: 0 })]))
    expect(check(result, 'dg.package-count')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('blocks a fractional count, which is not a number of packages either', () => {
    const result = assess(consignment([pkg('p1', [entry('e1', { wattHours: 95 })], { count: 1.5 })]))
    expect(check(result, 'dg.package-count')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('catches an overpack count of zero, which the totals also multiply', () => {
    // A cleared box coerced to one under-counted the consignment silently: the package
    // total is the product of the two, so six packages read as two, the two-package battery
    // mark exemption was granted, and the mark came off the marks list.
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 95 })], { count: 3, overpackId: 'o1' })], {
        overpacks: [overpack('o1', { count: 0 })],
      }),
    )
    expect(check(result, 'dg.overpack-count')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('holds the overpack count to the same rule, because the totals multiply', () => {
    // The number of packages on the paper is the package count times the overpack count, so
    // half an overpack misstates every quantity that follows from it — and reached the
    // two-package battery mark exemption as a fractional number of packages.
    const result = assess(
      consignment([pkg('p1', [entry('e1', { wattHours: 95 })], { count: 1, overpackId: 'o1' })], {
        overpacks: [overpack('o1', { count: 1.5 })],
      }),
    )
    expect(check(result, 'dg.overpack-count')).toMatchObject({ severity: 'blocking', passed: false })
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

  it('holds an unrated package prepared to Section I to Section I, not to "undetermined"', () => {
    // The rating decides which side of the threshold an entry falls on, and both sides lead
    // to Section I once the shipper has prepared to it. Reading the band first left the
    // package classed as undetermined: a blocking limit check citing a 5 kg ceiling against
    // a real 35 kg allowance, no UN specification packaging demanded, and a blocking rating
    // check for a figure that could change none of it.
    const unrated = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: null }, {
          netWeightKgPerPackage: 20,
          prepareToSectionI: true,
        }),
      ], { unSpecificationMark: '4G/Y30/S/26' }),
    ])
    const result = assess(unrated)
    expect(check(result, 'dg.limit.p1')).toMatchObject({ passed: true, expected: '≤ 35 kg' })
    expect(check(result, 'dg.un-packaging.p1')).toBeDefined()
    expect(check(result, 'dg.packaging.p1')).toBeUndefined()

    // The rating is still worth recording, but it no longer blocks — nothing waits on it.
    const rating = check(result, 'dg.energy')!
    expect(rating.severity).toBe('info')
    expect(rating.detail).toContain('Prepared to Section I')
    expect(rating.detail).not.toContain('has no sections')
  })

  it('still counts an unrated Section I package as classified when it shares a consignment', () => {
    // `dg.mixed-regulation` drops entries nothing has classified. This one is classified,
    // so Section II goods beside it are a genuinely mixed package and must still block.
    // Two UN numbers, so A181 — which is per UN number — does not join them into one.
    const mixedPackage = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: null }, {
          netWeightKgPerPackage: 2,
          prepareToSectionI: true,
        }),
        entry('e2', { chemistry: 'lithium-metal', configuration: 'contained-in-equipment', lithiumContentG: 1 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
          wattHourMarkedOnCase: false,
        }),
      ]),
    ])
    expect(check(assess(mixedPackage), 'dg.mixed-regulation.p1')).toMatchObject({ severity: 'blocking' })
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

describe('edge cases around the mixed-regulation and Section I wording', () => {
  it('does not report a packing conflict for an entry whose energy rating is simply missing', () => {
    // An unrated entry is conservatively fully regulated with no section; pairing it with a
    // Section II entry is a missing figure, not a mixed package.
    const unrated = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 3,
          stateOfChargePercent: 20,
        }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: null }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    const result = assess(unrated)
    expect(check(result, 'dg.mixed-regulation.p1')).toBeUndefined()
    // The real defect is still blocking, in the words that fix it.
    expect(check(result, 'dg.energy.p1/e2')).toMatchObject({ severity: 'blocking', passed: false })
  })

  it('does not call a package A181 makes one entry of a mixture of two sections', () => {
    // A181 makes one fully regulated UN3481 entry of a package holding batteries both
    // packed with and contained in equipment, and the declaration prints exactly one line
    // for it. This check partitioned the raw entries, so it refused to generate the paper
    // every other reader in the file had already agreed on — and told the shipper to split
    // out Section II batteries the merged package does not have.
    // 90 Wh is small, so the packed-with entry is Section I only because it was prepared to
    // it; A181 carries that onto the contained-in entry beside it, which would otherwise be
    // Section II.
    const merged = consignment([
      pkg('p1', [
        entry('e1', { configuration: 'packed-with-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 1,
          prepareToSectionI: true,
        }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 90 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 1,
        }),
      ], { unSpecificationMark: '4G/Y25/S/26/USA/+D02390' }),
    ])
    const result = assess(merged)
    expect(check(result, 'dg.mixed-regulation.p1')).toBeUndefined()
  })

  it('does not offer Section I on a passenger aircraft, where it allows the same 5 kg', () => {
    const passenger = consignment(
      [pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 96 }, { netWeightKgPerPackage: 8 })])],
      { aircraft: 'passenger-and-cargo' },
    )
    const detail = check(assess(passenger), 'dg.limit.p1')!.detail
    expect(detail).toContain('Section I would not help here')
  })

  it('does not offer Section I for a package that would not fit in it either', () => {
    const huge = consignment([
      pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 96 }, { netWeightKgPerPackage: 40 })]),
    ])
    const detail = check(assess(huge), 'dg.limit.p1')!.detail
    expect(detail).toContain('which this package is over as well')
  })

  it('does not describe Section II packages that are not in the consignment', () => {
    const regulated = consignment([pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 2 })])])
    const detail = assess(regulated).checks.find((c) => c.id === 'dg.aircraft')!.detail
    expect(detail).not.toContain('Section II packages')
  })
})

describe('a standalone sodium ion battery is fully regulated even though PI 976 has no sections', () => {
  it('refuses to share a package with Section II goods', () => {
    const mixed = consignment([
      pkg('p1', [
        entry('e1', { chemistry: 'sodium-ion', wattHours: 80 }, { netWeightKgPerPackage: 2 }),
        entry('e2', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 3,
          stateOfChargePercent: 20,
        }),
      ]),
    ])
    const result = assess(mixed)
    // A null section is "this instruction has none", not "undetermined" — the declaration
    // would otherwise list only the UN3551 line and omit the rest of the box.
    expect(check(result, 'dg.mixed-regulation.p1')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })
})

describe('remedies that would not actually help are not offered', () => {
  it('does not offer A99 for a Section II package, whose answer is Section I first', () => {
    const heavy = consignment([
      pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 96 }, { netWeightKgPerPackage: 40 })]),
    ])
    expect(check(assess(heavy), 'dg.a99.p1')).toBeUndefined()
  })

  it('does not offer A99 on a passenger booking, where it is not a relief that applies', () => {
    const heavy = consignment(
      [pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 300 }, { netWeightKgPerPackage: 40 })])],
      { aircraft: 'passenger-and-cargo' },
    )
    expect(check(assess(heavy), 'dg.a99.p1')).toBeUndefined()
  })

  it('still offers A99 where it belongs — over 35 kg at the full cargo allowance', () => {
    const heavy = consignment([
      pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 300 }, { netWeightKgPerPackage: 40 })]),
    ])
    expect(check(assess(heavy), 'dg.a99.p1')).toMatchObject({ severity: 'warning', passed: false })
  })

  it('does not name a 35 kg allowance for a 40 kg Section II package on a passenger booking', () => {
    const heavy = consignment(
      [pkg('p1', [entry('e1', { configuration: 'packed-with-equipment', wattHours: 96 }, { netWeightKgPerPackage: 40 })])],
      { aircraft: 'passenger-and-cargo' },
    )
    const detail = check(assess(heavy), 'dg.limit.p1')!.detail
    expect(detail).toContain('over as well')
    expect(detail).not.toContain('would raise it to 35 kg')
  })
})

describe('an overpack holding only excepted packages', () => {
  const excepted = consignment(
    [
      pkg('p1', [
        entry('e1', { configuration: 'contained-in-equipment', wattHours: 76 }, {
          netWeightKgPerPackage: 1,
          countPerPackage: 3,
          stateOfChargePercent: 20,
        }),
      ], { overpackId: 'o1' }),
    ],
    { overpacks: [overpack('o1')] },
  )

  it('does not ask for an identifier on a declaration that does not exist', () => {
    const detail = assess(excepted).checks.find((c) => c.id === 'dg.overpack-identifier')!.detail
    expect(detail).toContain('no declaration entry to match it against')
  })

  it('still requires the mark on the box itself', () => {
    const marks = assess(excepted).packages[0].hazardCommunication.join(' ')
    expect(marks).toContain('OVERPACK')
    expect(marks).toContain('#A001')
  })
})

describe('the packaging authorization binds the package, not each entry in it', () => {
  it('blocks a box tested for 6 kg holding 5 kg of each of two UN numbers', () => {
    const overfilled = consignment([
      pkg('p1', [
        entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 5 }),
        entry('e2', { chemistry: 'lithium-metal', lithiumContentG: 1 }, {
          netWeightKgPerPackage: 2,
          wattHourMarkedOnCase: false,
        }),
      ], { packagingAuthorizationLimitKg: 6 }),
    ])
    const result = assess(overfilled)
    // Each entry is inside its own allowance — 5 of 10 kg, 2 of 2.5 kg — and the box still
    // holds 7 kg it was never tested for.
    expect(result.checks.filter((c) => c.id.startsWith('dg.limit.p1')).every((c) => c.passed)).toBe(true)
    expect(check(result, 'dg.package-authorization.p1')).toMatchObject({
      severity: 'blocking',
      passed: false,
      expected: '≤ 6 kg',
      actual: '7 kg',
    })
    expect(result.canGenerate).toBe(false)
  })

  it('passes when the total is inside the tested weight', () => {
    const fine = consignment([
      pkg('p1', [entry('e1', { wattHours: 95 }, { netWeightKgPerPackage: 5 })], {
        packagingAuthorizationLimitKg: 6,
      }),
    ])
    expect(check(assess(fine), 'dg.package-authorization.p1')).toMatchObject({ passed: true })
  })
})

describe('the button-cell test-summary exception', () => {
  const buttonCells = (configuration: 'standalone' | 'contained-in-equipment') =>
    consignment([
      pkg('p1', [
        entry('e1', { configuration, wattHours: 95 }, {
          buttonCellsInEquipment: true,
          testSummaryScope: null,
          testSummaryReference: '',
          netWeightKgPerPackage: 2,
          countPerPackage: 2,
          stateOfChargePercent: 20,
        }),
      ]),
    ])

  it('does not except a standalone cell — the exception is for cells installed in equipment', () => {
    const result = assess(buttonCells('standalone'))
    expect(check(result, 'dg.test-summary.p1')).toMatchObject({ severity: 'blocking', passed: false })
    expect(result.canGenerate).toBe(false)
  })

  it('excepts them once they are installed in equipment', () => {
    expect(check(assess(buttonCells('contained-in-equipment')), 'dg.test-summary.p1')).toMatchObject({ passed: true })
  })
})
