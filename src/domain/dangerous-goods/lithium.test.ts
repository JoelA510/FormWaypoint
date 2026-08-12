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
  undecidedPackagingSections,
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

  it('does not read a zero rating as the smallest possible battery', () => {
    // No cell is rated at nothing, so the figure is a placeholder or a mistyped field —
    // and read as a rating it is the most permissive answer there is: Section II, no
    // declaration, and adequate instruction in place of dangerous goods training.
    expect(energyBand(spec({ wattHours: 0 }))).toBe('unknown')
    expect(energyBand(spec({ chemistry: 'lithium-metal', lithiumContentG: 0 }))).toBe('unknown')
    expect(energyBand(spec({ wattHours: -1 }))).toBe('unknown')
    // And a real small rating is still small.
    expect(energyBand(spec({ form: 'cell', wattHours: 0.5 }))).toBe('small')
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

  it('does not read a rating of zero as being under the 2.7 Wh advisory threshold', () => {
    // Read literally, zero put the mandatory 30% state of charge below the threshold and
    // downgraded it to advice, under a line reading "Rated at 0 Wh, at or below the 2.7 Wh
    // threshold" — for a battery whose rating nobody had entered.
    const rule = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 0 })).stateOfCharge
    expect(rule).toMatchObject({ strength: 'must' })
    expect(rule!.detail).not.toContain('Rated at 0 Wh')
  })

  it('is a requirement for cells packed with equipment above 2.7 Wh, and advice at or below', () => {
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', form: 'cell', wattHours: 20 })).stateOfCharge)
      .toMatchObject({ strength: 'must' })
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', form: 'cell', wattHours: 2.7 })).stateOfCharge)
      .toMatchObject({ strength: 'should' })
  })

  it('does not read the 2.7 Wh relief across to a battery', () => {
    // The relief is written against a cell's watt-hour rating. Read across, it demoted the
    // whole state-of-charge group — the figure, its basis and its provenance — from
    // blocking to advice, so a declaration could be generated for a pack nobody measured.
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', form: 'battery', wattHours: 2.7 })).stateOfCharge)
      .toMatchObject({ strength: 'must' })
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

  it('asks for the battery mark, because Section IB is one of the two it could be', () => {
    // The limit is already stated conservatively for this case; the marks have to agree.
    // The panel is read while the box is being made up, and a mark that turns out to be
    // needed is a mark applied after the box was closed.
    const marks = classifyForAir(spec({ wattHours: null })).hazardCommunication.join(' ')
    expect(marks).toContain('Lithium battery mark')

    // PI 976's null section is a different answer: it has no sections at all, and its
    // packages are marked as Sections I and IA are.
    const sodium = classifyForAir(spec({ chemistry: 'sodium-ion', wattHours: null })).hazardCommunication.join(' ')
    expect(sodium).not.toContain('Lithium battery mark')
  })

  it('does not demand UN specification packaging for a section nothing has decided', () => {
    // The two candidates are Section IA, which requires it, and Section IB, which A802
    // excepts — and the quantity limit for the same entry is already stated as the lower
    // candidate. Demanding the mark as well had the two halves of one classification
    // assuming different sections, and blocked on a fact `dg.energy` is already blocking
    // for.
    expect(classifyForAir(spec({ wattHours: null })).unSpecificationPackagingRequired).toBe(false)
    // PI 976's null section is a different answer: fully regulated, and it does require it.
    expect(
      classifyForAir(spec({ chemistry: 'sodium-ion', wattHours: null })).unSpecificationPackagingRequired,
    ).toBe(true)
    // And a rated large battery still requires it.
    expect(classifyForAir(spec({ wattHours: 500 })).unSpecificationPackagingRequired).toBe(true)
  })

  it('states the lower candidate for equipment too, not the Section I cargo allowance', () => {
    // Every instruction for batteries with equipment has both a Section I and a Section II,
    // so an unrated package could be either. Reading Section I's 35 kg to it showed a 20 kg
    // box passing against a ceiling that may turn out to be 5 kg.
    const packed = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: null }))
    expect(packed.limits).toMatchObject({ passengerKg: 5, cargoKg: 5 })
    expect(packed.limits.source).toContain('pending')

    // And a sodium entry is pointed at the sodium tables, not the lithium ones.
    const sodium = classifyForAir(
      spec({ chemistry: 'sodium-ion', configuration: 'packed-with-equipment', wattHours: null }),
    )
    expect(sodium.limits.source).toContain('5-30')

    // A rated one still gets its own section's figures.
    expect(classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 300 })).limits).toMatchObject({
      passengerKg: 5,
      cargoKg: 35,
    })
  })

  it('states the lower of the two limits it could be, not the Section IA allowance', () => {
    // A standalone battery has no choice of section: the rating decides between IB and IA,
    // and their ceilings differ by three and a half times. Quoting 35 kg would pass a 20 kg
    // package against an allowance that turns out not to be its own, citing a section
    // nothing had established.
    const ion = classifyForAir(spec({ wattHours: null }))
    expect(ion.limits.cargoKg).toBe(10)
    expect(ion.limits.source).toContain('pending')

    const metal = classifyForAir(spec({ chemistry: 'lithium-metal', lithiumContentG: null }))
    expect(metal.limits.cargoKg).toBe(2.5)
  })
})

describe('a rating that is not a figure', () => {
  it('is unknown, not the largest band', () => {
    // NaN fails every comparison, so it slipped past the `<= 0` guard and then past
    // `stated <= threshold` — coming out large, which is Section IA, a 35 kg ceiling and a
    // check that passes affirming "NaN Wh against a 100 Wh threshold".
    expect(energyBand(spec({ wattHours: Number.NaN }))).toBe('unknown')
    expect(energyBand(spec({ chemistry: 'lithium-metal', lithiumContentG: Number.NaN }))).toBe('unknown')
    expect(classifyForAir(spec({ wattHours: Number.NaN })).sectionUndetermined).toBe(true)
  })
})

describe('the special provisions listed against an entry', () => {
  it('gives every standalone battery its passenger-aircraft provision', () => {
    // Both are forbidden on passenger aircraft and both have a provision naming the
    // approval that relieves it. Lithium metal carried none, under a blocking check that
    // cites A201 and A334 by number.
    const metal = classifyForAir(spec({ chemistry: 'lithium-metal', lithiumContentG: 1 })).specialProvisions
    expect(metal.some((p) => p.startsWith('A201'))).toBe(true)
    // A331 is a state of charge provision; lithium metal is not rechargeable.
    expect(metal.some((p) => p.startsWith('A331'))).toBe(false)

    const ion = classifyForAir(spec({ wattHours: 95 })).specialProvisions
    expect(ion.some((p) => p.startsWith('A334'))).toBe(true)
    expect(ion.some((p) => p.startsWith('A331'))).toBe(true)
  })

  it('does not put a passenger-aircraft approval against equipment, which may fly', () => {
    const equipment = classifyForAir(
      spec({ configuration: 'contained-in-equipment', wattHours: 90 }),
    ).specialProvisions
    expect(equipment.some((p) => p.startsWith('A201') || p.startsWith('A334'))).toBe(false)
  })

  it('keeps A181 off a standalone entry, which cannot hold equipment', () => {
    // A181 describes a package holding batteries both packed with and contained in
    // equipment. Pushed against every entry, it sat in the column M list of UN3480.
    const standalone = classifyForAir(spec({ wattHours: 95 })).specialProvisions
    expect(standalone.some((p) => p.startsWith('A181'))).toBe(false)

    const packedWith = classifyForAir(
      spec({ configuration: 'packed-with-equipment', wattHours: 95 }),
    ).specialProvisions
    expect(packedWith.some((p) => p.startsWith('A181'))).toBe(true)
  })

  it('does not cite A802 against a sodium ion battery, which A802 does not mention', () => {
    // A802 is written for lithium. Standalone sodium ion travels under PI 976, whose
    // packaging requirement stands on its own.
    const sodium = classifyForAir(
      spec({ chemistry: 'sodium-ion', wattHours: 60 }),
    )
    expect(sodium.unSpecificationPackagingRequired).toBe(true)
    expect(sodium.specialProvisions.some((p) => p.startsWith('A802'))).toBe(false)

    const lithium = classifyForAir(spec({ wattHours: 500 }))
    expect(lithium.unSpecificationPackagingRequired).toBe(true)
    expect(lithium.specialProvisions.some((p) => p.startsWith('A802'))).toBe(true)
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

describe('the Section I route for a heavy package of small batteries', () => {
  it('escalates Section II to Section I when the shipper records it, restoring the 35 kg cargo allowance', () => {
    const small = spec({ configuration: 'packed-with-equipment', wattHours: 96 })
    expect(classifyForAir(small).packingInstructionLabel).toBe('966 II')

    const escalated = classifyForAir(small, { prepareToSectionI: true })
    expect(escalated.packingInstructionLabel).toBe('966 I')
    expect(escalated.limits).toMatchObject({ passengerKg: 5, cargoKg: 35 })
    // Section I is fully regulated: a declaration, the Class 9 label and DG training.
    expect(escalated.declarationRequired).toBe(true)
    expect(escalated.fullyRegulated).toBe(true)
    expect(escalated.training).toBe('dangerous-goods')
    expect(escalated.unSpecificationPackagingRequired).toBe(true)
  })

  it('never relieves anything — a large battery stays Section I, a standalone stays IB', () => {
    const large = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: 300 }), {
      prepareToSectionI: true,
    })
    expect(large.packingInstructionLabel).toBe('966 I')
    // Standalone has no Section II to escalate from; the flag leaves it where it was.
    const standalone = classifyForAir(spec({ wattHours: 95 }), { prepareToSectionI: true })
    expect(standalone.packingInstructionLabel).toBe('965 IB')
    expect(standalone.limits.cargoKg).toBe(10)
  })

  it('settles the section for an unrated package prepared to Section I, because both bands lead there', () => {
    // Reading the band first returned a null section for an entry whose section is not in
    // doubt: small goes to Section I because that is what was prepared, large goes there
    // because that is where it belongs. The classification then read as an *undetermined*
    // one — the 5 kg Section II ceiling in place of a 35 kg allowance, no UN specification
    // packaging demanded where Section I demands it, and a blocking rating check for a
    // figure that could not change any of it.
    const unrated = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: null }), {
      prepareToSectionI: true,
    })
    expect(unrated.section).toBe('I')
    expect(unrated.sectionUndetermined).toBe(false)
    expect(unrated.limits).toMatchObject({ passengerKg: 5, cargoKg: 35 })
    expect(unrated.unSpecificationPackagingRequired).toBe(true)
    expect(unrated.specialProvisions.some((p) => p.startsWith('A802'))).toBe(true)
    expect(undecidedPackagingSections(unrated)).toBeNull()

    // Without the flag the same entry is genuinely undecided, and says so.
    const undecided = classifyForAir(spec({ configuration: 'packed-with-equipment', wattHours: null }))
    expect(undecided.sectionUndetermined).toBe(true)
    expect(undecidedPackagingSections(undecided)).not.toBeNull()

    // Standalone has no Section II to escalate from, so the flag settles nothing there.
    expect(classifyForAir(spec({ wattHours: null }), { prepareToSectionI: true }).sectionUndetermined).toBe(true)
  })

  it('cites the sodium tables for a sodium ion Section II entry, not the lithium ones', () => {
    const sodium = classifyForAir(spec({ chemistry: 'sodium-ion', configuration: 'contained-in-equipment', wattHours: 50 }))
    expect(sodium.packingInstructionLabel).toBe('978 II')
    expect(sodium.limits.source).toContain('5-30')
    expect(sodium.limits.source).not.toContain('5-26')
  })
})
