/**
 * Classification tests.
 *
 * The cases are the training materials' own: the figures in Unit 5 of the Student Guide and
 * the scenarios in the exercise workbook, so a failure here means this module and the course
 * it was written from disagree.
 */
import { describe, expect, it } from 'vitest'
import {
  airWaybillStatement,
  classifyForAir,
  combinedSectionIIStatement,
  energyBand,
  type BatterySpec,
} from './lithium'

function spec(partial: Partial<BatterySpec>): BatterySpec {
  return {
    chemistry: 'lithium-ion',
    form: 'battery',
    configuration: 'standalone',
    wattHours: null,
    lithiumContentG: null,
    ...partial,
  }
}

describe('energy bands by air', () => {
  it('puts a 100 Wh battery inside the relief and a 101 Wh battery outside it', () => {
    expect(energyBand(spec({ wattHours: 100 }))).toBe('small')
    expect(energyBand(spec({ wattHours: 100.5 }))).toBe('large')
  })

  it('applies the cell threshold to cells, not the battery threshold', () => {
    expect(energyBand(spec({ form: 'cell', wattHours: 20 }))).toBe('small')
    expect(energyBand(spec({ form: 'cell', wattHours: 60 }))).toBe('large')
  })

  it('does not carry the ground "medium" band into air', () => {
    // 250 Wh is medium by U.S. ground and large by air — workbook Unit 2 question 5.
    expect(energyBand(spec({ wattHours: 250 }))).toBe('large')
    // 75 Wh is a fully regulated *cell* by air and by ground.
    expect(energyBand(spec({ form: 'cell', wattHours: 75 }))).toBe('large')
  })

  it('measures lithium metal in grams', () => {
    expect(energyBand(spec({ chemistry: 'lithium-metal', form: 'cell', lithiumContentG: 1 }))).toBe('small')
    expect(energyBand(spec({ chemistry: 'lithium-metal', form: 'battery', lithiumContentG: 2 }))).toBe('small')
    expect(energyBand(spec({ chemistry: 'lithium-metal', form: 'battery', lithiumContentG: 2.5 }))).toBe('large')
  })

  it('reports an unstated rating as unknown rather than guessing it small', () => {
    expect(energyBand(spec({ wattHours: null }))).toBe('unknown')
    expect(energyBand(spec({ chemistry: 'lithium-metal', lithiumContentG: null }))).toBe('unknown')
  })

  it('does not read a watt-hour rating as a lithium content, or the reverse', () => {
    expect(energyBand(spec({ chemistry: 'lithium-metal', wattHours: 5, lithiumContentG: null }))).toBe('unknown')
    expect(energyBand(spec({ chemistry: 'lithium-ion', wattHours: null, lithiumContentG: 1 }))).toBe('unknown')
  })
})

describe('standalone batteries', () => {
  it('classifies a small lithium ion battery as PI 965 Section IB, cargo aircraft only', () => {
    const c = classifyForAir(spec({ wattHours: 98 }))
    expect(c.unNumber).toBe('UN3480')
    expect(c.properShippingName).toBe('Lithium ion batteries')
    expect(c.packingInstructionLabel).toBe('965 IB')
    expect(c.section).toBe('IB')
    expect(c.aircraft).toBe('cargo-aircraft-only')
    expect(c.limits).toMatchObject({ passengerKg: null, cargoKg: 10 })
    expect(c.declarationRequired).toBe(true)
    expect(c.training).toBe('dangerous-goods')
  })

  it('holds small standalone lithium metal to 2.5 kg per package', () => {
    const c = classifyForAir(spec({ chemistry: 'lithium-metal', lithiumContentG: 1.8 }))
    expect(c.unNumber).toBe('UN3090')
    expect(c.packingInstructionLabel).toBe('968 IB')
    expect(c.limits.cargoKg).toBe(2.5)
  })

  it('has no Section II at all — a small standalone battery still needs a declaration', () => {
    const c = classifyForAir(spec({ wattHours: 10 }))
    expect(c.section).not.toBe('II')
    expect(c.declarationRequired).toBe(true)
    expect(c.fullyRegulated).toBe(true)
  })

  it('classifies a large lithium ion battery as PI 965 Section IA with UN specification packaging', () => {
    const c = classifyForAir(spec({ wattHours: 500 }))
    expect(c.packingInstructionLabel).toBe('965 IA')
    expect(c.unSpecificationPackagingRequired).toBe(true)
    expect(c.limits).toMatchObject({ passengerKg: null, cargoKg: 35 })
  })

  it('treats every standalone sodium ion battery as fully regulated under PI 976, which has no sections', () => {
    const c = classifyForAir(spec({ chemistry: 'sodium-ion', wattHours: 5 }))
    expect(c.unNumber).toBe('UN3551')
    expect(c.packingInstruction).toBe(976)
    expect(c.section).toBeNull()
    expect(c.packingInstructionLabel).toBe('976')
    expect(c.declarationRequired).toBe(true)
    expect(c.limits).toMatchObject({ passengerKg: null, cargoKg: 35 })
  })
})

describe('batteries with equipment', () => {
  it('classifies small batteries packed with equipment as PI 966 Section II, 5 kg either aircraft', () => {
    const c = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 96 }))
    expect(c.unNumber).toBe('UN3481')
    expect(c.properShippingName).toBe('Lithium ion batteries packed with equipment')
    expect(c.packingInstructionLabel).toBe('966 II')
    expect(c.declarationRequired).toBe(false)
    expect(c.fullyRegulated).toBe(false)
    expect(c.training).toBe('adequate-instruction')
    // 5 kg on either aircraft: Section II has no cargo relief — 35 kg is Section I CAO.
    expect(c.limits).toMatchObject({ passengerKg: 5, cargoKg: 5 })
    expect(c.aircraft).toBe('passenger-and-cargo')
  })

  it('classifies the workbook power drills — 76 Wh contained in equipment — as PI 967 Section II', () => {
    const c = classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 76 }))
    expect(c.packingInstructionLabel).toBe('967 II')
    expect(c.declarationRequired).toBe(false)
    expect(c.innerPackagingRequired).toBe(false)
    expect(c.dropTestRequired).toBe(false)
    expect(c.stackTestRequired).toBe(true)
  })

  it('classifies the workbook 300 Wh data backup batteries as PI 967 Section I, fully regulated', () => {
    const c = classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 300 }))
    expect(c.packingInstructionLabel).toBe('967 I')
    expect(c.declarationRequired).toBe(true)
    // Equipment is its own enclosure: no UN specification packaging even at Section I.
    expect(c.unSpecificationPackagingRequired).toBe(false)
    expect(c.limits).toMatchObject({ passengerKg: 5, cargoKg: 35 })
  })

  it('requires UN specification packaging for large batteries packed with equipment', () => {
    const c = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 300 }))
    expect(c.packingInstructionLabel).toBe('966 I')
    expect(c.unSpecificationPackagingRequired).toBe(true)
    // The Packing Group II test regime supersedes the drop and stack capability standards.
    expect(c.dropTestRequired).toBe(false)
    expect(c.stackTestRequired).toBe(false)
  })

  it('maps lithium metal with equipment onto UN3091 and PI 969 / 970', () => {
    expect(
      classifyForAir(spec({ chemistry: 'lithium-metal', configuration: 'packed-with-equipment', lithiumContentG: 1 }))
        .packingInstructionLabel,
    ).toBe('969 II')
    expect(
      classifyForAir(spec({ chemistry: 'lithium-metal', configuration: 'contained-in-equipment', lithiumContentG: 5 }))
        .packingInstructionLabel,
    ).toBe('970 I')
  })
})

describe('state of charge', () => {
  it('is a requirement for standalone lithium ion', () => {
    const rule = classifyForAir(spec({ wattHours: 90 })).stateOfCharge
    expect(rule).toMatchObject({ limitPercent: 30, strength: 'must' })
  })

  it('is a requirement for batteries packed with equipment above 2.7 Wh, and advice at or below', () => {
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 20 })).stateOfCharge)
      .toMatchObject({ strength: 'must' })
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 2.7 })).stateOfCharge)
      .toMatchObject({ strength: 'should' })
  })

  it('is advice for batteries contained in equipment', () => {
    expect(classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 50 })).stateOfCharge)
      .toMatchObject({ strength: 'should' })
  })

  it('does not apply to lithium metal, which is not rechargeable', () => {
    expect(classifyForAir(spec({ chemistry: 'lithium-metal', lithiumContentG: 1 })).stateOfCharge).toBeNull()
  })
})

describe('hazard communication', () => {
  it('gives a Section II package the battery mark and nothing else', () => {
    const c = classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 50 }))
    expect(c.hazardCommunication).toContain('Lithium battery mark bearing UN3481')
    expect(c.hazardCommunication.some((m) => m.includes('Class 9'))).toBe(false)
  })

  it('gives a Section IB package both the Class 9 label and the battery mark', () => {
    const c = classifyForAir(spec({ wattHours: 90 }))
    expect(c.hazardCommunication).toContain('Class 9 lithium battery hazard label')
    expect(c.hazardCommunication).toContain('Lithium battery mark bearing UN3480')
    expect(c.hazardCommunication).toContain('Cargo Aircraft Only label, on the same surface as the Class 9 label')
  })

  it('gives a Section IA package the Class 9 label without the battery mark', () => {
    const c = classifyForAir(spec({ wattHours: 500 }))
    expect(c.hazardCommunication).toContain('Class 9 lithium battery hazard label')
    expect(c.hazardCommunication.some((m) => m.startsWith('Lithium battery mark'))).toBe(false)
  })
})

describe('air waybill statements', () => {
  it('names the packing instruction for Section II', () => {
    expect(airWaybillStatement(classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 90 })))).toBe(
      'Lithium ion batteries in compliance with Section II of PI966',
    )
    expect(
      airWaybillStatement(
        classifyForAir(spec({ chemistry: 'lithium-metal', configuration: 'contained-in-equipment', lithiumContentG: 1 })),
      ),
    ).toBe('Lithium metal batteries in compliance with Section II of PI970')
  })

  it('points at the declaration for everything fully regulated, and says CAO when it is', () => {
    expect(airWaybillStatement(classifyForAir(spec({ wattHours: 90 })))).toBe(
      'Dangerous goods as per associated Shipper’s Declaration — Cargo Aircraft Only',
    )
    expect(airWaybillStatement(classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 300 })))).toBe(
      'Dangerous goods as per associated Shipper’s Declaration',
    )
  })

  it('combines Section II statements and ignores the fully regulated ones', () => {
    const combined = combinedSectionIIStatement([
      classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 90 })),
      classifyForAir(spec({ configuration: 'contained-in-equipment', wattHours: 90 })),
      classifyForAir(spec({ wattHours: 90 })),
    ])
    expect(combined).toBe(
      'Lithium ion batteries in compliance with Section II of PI966. ' +
        'Lithium ion batteries in compliance with Section II of PI967',
    )
  })
})

describe('an unstated rating', () => {
  it('falls to the fully regulated reading rather than the relief', () => {
    const c = classifyForAir(spec({ wattHours: null }))
    expect(c.band).toBe('unknown')
    expect(c.section).toBeNull()
    expect(c.declarationRequired).toBe(true)
    expect(c.fullyRegulated).toBe(true)
  })
})

describe('standalone sodium ion', () => {
  it('carries the 30% limit under A331, named for its own chemistry', () => {
    const rule = classifyForAir(spec({ chemistry: 'sodium-ion', wattHours: 60 })).stateOfCharge
    expect(rule).toMatchObject({ limitPercent: 30, strength: 'must', indicatedCapacityAlternative: false })
    expect(rule?.detail).toContain('sodium ion')
    expect(rule?.detail).not.toContain('lithium ion')
    expect(rule?.detail).toContain('A331')
  })

  it('has no state of charge rule once it travels with equipment', () => {
    expect(
      classifyForAir(spec({ chemistry: 'sodium-ion', configuration: 'packed-with-equipment', wattHours: 60 }))
        .stateOfCharge,
    ).toBeNull()
  })
})
