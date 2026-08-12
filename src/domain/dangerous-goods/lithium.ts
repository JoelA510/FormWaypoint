/**
 * Lithium and sodium battery classification for air transport (IATA DGR).
 *
 * This module is the regulatory table, and nothing else. It takes what is knowable about a
 * battery — chemistry, whether it is a cell or a battery, how it travels, and its energy
 * content — and returns the UN number, proper shipping name, packing instruction and section
 * that follow from those facts, together with the limits and hazard communication that
 * section carries.
 *
 * Every figure here is stated in the Labelmaster *Shipping Lithium Batteries — Excepted &
 * Fully Regulated, Multimodal* course materials (Student Guide rev. 02/01/2026 and the
 * Supplemental Appendix rev. 01/01/2025), and each is cited against the figure it came from
 * so it can be re-checked when the DGR is revised. Nothing is interpolated: where the
 * materials state no limit, this module says so rather than inventing one.
 *
 * Two boundaries are worth stating up front, because they are the difference between a tool
 * that helps and one that gets a shipment rejected on the ramp:
 *
 *  - **Air only.** The ground (49 CFR) "medium" band — ion cells >20 and ≤60 Wh, batteries
 *    >100 and ≤300 Wh — does not exist for air, and neither does its packaging relief. A
 *    battery this module calls large is large because it is large *by air*.
 *  - **State and operator variations are not encoded.** IATA 2.8.1 and 2.8.3 let a country
 *    or an airline be more restrictive than the DGR, and they routinely are — the materials
 *    cite UPS 5X-08 requiring a `P.I. 966-II` marking and Saudi Arabia SAG-06 requiring the
 *    consignee's telephone number on every package. No published dataset of those travels
 *    with this app, so it says which ones to look up rather than pretending to have applied
 *    them.
 */

/** What the cells are made of. Determines which energy measure applies. */
export type Chemistry = 'lithium-ion' | 'lithium-metal' | 'sodium-ion'

/**
 * A single encased electrochemical unit, or two or more connected together.
 *
 * The distinction is not cosmetic: the thresholds differ by a factor of five (20 Wh against
 * 100 Wh), and the UN Manual of Tests and Criteria treats a unit sold as a "single cell
 * battery" as a *cell*, whatever the label on it says (Student Guide p. 22).
 */
export type CellOrBattery = 'cell' | 'battery'

/** How the cells travel relative to the equipment they power (Student Guide fig. 2-8). */
export type Configuration = 'standalone' | 'packed-with-equipment' | 'contained-in-equipment'

/**
 * IATA packing instruction section.
 *
 * `null` for PI 976, which has no sections — every standalone sodium ion battery is fully
 * regulated (Student Guide fig. 5-5 note 3, fig. 5-30 note).
 */
export type PackingSection = 'IA' | 'IB' | 'I' | 'II' | null

/** Which aircraft the consignment may travel on. */
export type AircraftLimitation = 'passenger-and-cargo' | 'cargo-aircraft-only'

/**
 * The facts about one battery type that the regulations key on.
 *
 * `wattHours` and `lithiumContentG` are per cell or per battery — whichever `form` says —
 * because that is how every threshold in the DGR is written. Both are nullable and neither
 * is inferred from the other: a watt-hour rating cannot be converted into a lithium content
 * without knowing the cell chemistry and count, and guessing one would silently move a
 * shipment across the Section II boundary.
 */
export interface BatterySpec {
  chemistry: Chemistry
  form: CellOrBattery
  configuration: Configuration
  /** Per cell or per battery, for lithium ion and sodium ion. */
  wattHours: number | null
  /** Per cell or per battery, in grams, for lithium metal. */
  lithiumContentG: number | null
}

/** Whether the energy content puts this battery inside or outside the Section II/IB relief. */
export type EnergyBand = 'small' | 'large' | 'unknown'

/**
 * Air energy thresholds (Student Guide figs. 5-9, 5-10, 5-30, 5-31).
 *
 * Small is *at or below*; large is strictly above. The ground "medium" band is deliberately
 * absent — it does not apply to air, and a value that would be medium by ground is simply
 * large here.
 */
export const AIR_THRESHOLDS = {
  /** Watt-hours, lithium ion and sodium ion. */
  wattHours: { cell: 20, battery: 100 },
  /** Grams of lithium content, lithium metal. */
  lithiumContentG: { cell: 1, battery: 2 },
} as const

/**
 * The state-of-charge ceiling for lithium ion cells and batteries, as a percentage of rated
 * capacity (special provisions A331/A100, Student Guide p. 55).
 */
export const STATE_OF_CHARGE_LIMIT = 30

/**
 * The ceiling of the indicated-capacity alternative, where the entry has one at all.
 *
 * A different figure as well as a different basis: batteries contained in equipment are
 * offered at 30% of rated capacity *or* an indicated battery capacity of 25%, and a reading
 * taken against the alternative has to be measured against the alternative's own number.
 */
export const INDICATED_CAPACITY_LIMIT = 25

/**
 * The watt-hour rating below which the 30% state of charge is advisory rather than mandatory
 * for cells packed with equipment (Student Guide fig. 5-26 note, effective 1 January 2026).
 */
export const SOC_ADVISORY_WH = 2.7

/**
 * Whether a battery's energy content is inside the small-battery relief, by air.
 *
 * Returns `unknown` when the figure that decides it is absent. That is a third answer on
 * purpose. A missing watt-hour rating is not evidence of a small battery, and treating it as
 * one would move a fully regulated shipment onto an air waybill statement and no declaration
 * — the single most consequential mistake this module could make.
 */
export function energyBand(spec: BatterySpec): EnergyBand {
  // Zero and below are unknown too, not the smallest possible battery. No cell is rated at
  // nothing, so the figure is a placeholder or a mistyped field — and read as a rating it
  // is the most permissive answer there is: Section II, no declaration, adequate
  // instruction in place of dangerous goods training, and a check that passes affirming
  // "0 Wh against a 100 Wh threshold". The sibling net-weight check refuses zero for
  // exactly this reason.
  // And anything that is not a finite number at all. `NaN` fails every comparison, so a
  // field parsed from something that was not a figure slipped past a `<= 0` guard and then
  // past `stated <= threshold` — coming out *large*, which is Section IA, a 35 kg ceiling
  // and a check that passes affirming "NaN Wh against a 100 Wh threshold".
  const stated = spec.chemistry === 'lithium-metal' ? spec.lithiumContentG : spec.wattHours
  if (stated == null || !Number.isFinite(stated) || stated <= 0) return 'unknown'
  const threshold =
    spec.chemistry === 'lithium-metal'
      ? AIR_THRESHOLDS.lithiumContentG[spec.form]
      : AIR_THRESHOLDS.wattHours[spec.form]
  return stated <= threshold ? 'small' : 'large'
}

/** The threshold that decided the band, for display beside it. */
export function energyThreshold(spec: BatterySpec): { limit: number; unit: 'Wh' | 'g' } {
  return spec.chemistry === 'lithium-metal'
    ? { limit: AIR_THRESHOLDS.lithiumContentG[spec.form], unit: 'g' }
    : { limit: AIR_THRESHOLDS.wattHours[spec.form], unit: 'Wh' }
}

/** UN number and proper shipping name, by chemistry and configuration (Student Guide fig. 5-4). */
interface Identity {
  unNumber: string
  properShippingName: string
  packingInstruction: number
}

const IDENTITIES: Record<Chemistry, Record<Configuration, Identity>> = {
  'lithium-ion': {
    standalone: { unNumber: 'UN3480', properShippingName: 'Lithium ion batteries', packingInstruction: 965 },
    'packed-with-equipment': {
      unNumber: 'UN3481',
      properShippingName: 'Lithium ion batteries packed with equipment',
      packingInstruction: 966,
    },
    'contained-in-equipment': {
      unNumber: 'UN3481',
      properShippingName: 'Lithium ion batteries contained in equipment',
      packingInstruction: 967,
    },
  },
  'lithium-metal': {
    standalone: { unNumber: 'UN3090', properShippingName: 'Lithium metal batteries', packingInstruction: 968 },
    'packed-with-equipment': {
      unNumber: 'UN3091',
      properShippingName: 'Lithium metal batteries packed with equipment',
      packingInstruction: 969,
    },
    'contained-in-equipment': {
      unNumber: 'UN3091',
      properShippingName: 'Lithium metal batteries contained in equipment',
      packingInstruction: 970,
    },
  },
  'sodium-ion': {
    standalone: { unNumber: 'UN3551', properShippingName: 'Sodium ion batteries', packingInstruction: 976 },
    'packed-with-equipment': {
      unNumber: 'UN3552',
      properShippingName: 'Sodium ion batteries packed with equipment',
      packingInstruction: 977,
    },
    'contained-in-equipment': {
      unNumber: 'UN3552',
      properShippingName: 'Sodium ion batteries contained in equipment',
      packingInstruction: 978,
    },
  },
}

/**
 * The maximum net battery weight one package may hold, in kilograms.
 *
 * `null` means the aircraft type is forbidden outright, not that the limit is unknown; a
 * limit that is genuinely unstated is absent from the table rather than null.
 */
export interface QuantityLimits {
  /** Passenger and cargo aircraft. Null where the entry is forbidden on passenger aircraft. */
  passengerKg: number | null
  /** Cargo aircraft only. */
  cargoKg: number
  /** Where the figures came from, printed beside them on the review screen. */
  source: string
}

/**
 * The full regulatory picture for one battery type travelling by air.
 *
 * This is what the rest of the application consumes: the UI renders it, the assessment
 * engine checks a package against it, and the Shipper's Declaration is written from it.
 */
export interface AirClassification {
  spec: BatterySpec
  unNumber: string
  properShippingName: string
  /** Class 9 for every entry in scope here. Sub-risk and packing group do not apply. */
  hazardClass: '9'
  subsidiaryRisk: null
  packingGroup: null
  packingInstruction: number
  section: PackingSection
  band: EnergyBand
  /**
   * Whether the section is null because nothing has decided it yet, as opposed to because
   * the packing instruction has none.
   *
   * The two read alike and mean opposite things: PI 976 has no sections and is fully
   * regulated, while an unrated battery has a section nobody can name. Exposed rather than
   * re-derived, because "unrated" is not the same question — a package prepared to Section I
   * is unrated and settled, and every consumer that re-derived it from the band alone said
   * otherwise.
   */
  sectionUndetermined: boolean
  /** `965 IB`, `966`, `976` — the wording that goes in DGD box 16. */
  packingInstructionLabel: string
  /** True for Sections I, IA, IB and PI 976; false for Section II. */
  declarationRequired: boolean
  /** Section II is "excepted Class 9"; everything else is fully regulated. */
  fullyRegulated: boolean
  aircraft: AircraftLimitation
  limits: QuantityLimits
  /**
   * UN specification packaging meeting Packing Group II performance is required.
   *
   * False, not true, where the section is undetermined — an unrated battery could be
   * Section IA, which requires it, or Section IB, which A802 excepts. `assess` reads the
   * band alongside this and says neither rather than resolving the ambiguity one way; the
   * flag alone is not the whole answer for such an entry.
   */
  unSpecificationPackagingRequired: boolean
  /** Inner packaging that completely encloses each cell or battery is required. */
  innerPackagingRequired: boolean
  /** The package must be capable of a 1.2 m drop test (Student Guide p. 60). */
  dropTestRequired: boolean
  /** The package must be capable of a 3 m, 24-hour stack test (Student Guide p. 60). */
  stackTestRequired: boolean
  /** The state of charge rule that applies, or null where none does. */
  stateOfCharge: StateOfChargeRule | null
  /** Convenience mirror of `stateOfCharge.indicatedCapacityAlternative`, false where no rule applies. */
  indicatedCapacityAlternative: boolean
  /** Marks and labels the package carries, before the per-consignment exemptions. */
  hazardCommunication: string[]
  /** The training the person preparing this shipment must hold. */
  training: 'dangerous-goods' | 'adequate-instruction'
  /** Special provisions from column M of the List of Dangerous Goods that bear on this entry. */
  specialProvisions: string[]
  /** Human-readable citation of the figure these values were taken from. */
  basis: string
}

export interface StateOfChargeRule {
  limitPercent: number
  /** `must` is a requirement; `should` is a recommendation the materials state as such. */
  strength: 'must' | 'should'
  detail: string
  /**
   * Whether an indicated battery capacity not exceeding 25% is an accepted alternative.
   *
   * True only for batteries contained in equipment. The two-prong standard — 30% of rated
   * design capacity *or* 25% indicated capacity — otherwise belongs to the vehicle entries,
   * which this module does not cover, and reading it onto a standalone or packed-with battery
   * substitutes a fuel-gauge reading for a measurement against rated capacity.
   */
  indicatedCapacityAlternative: boolean
}

/**
 * Section, from configuration and energy band (Student Guide fig. 5-5).
 *
 * Standalone batteries have no Section II at all — the relief for small standalone cells was
 * withdrawn, and what remains is Section IB, which is fully regulated with a declaration and
 * a lower package limit. That asymmetry is the single most misunderstood part of these rules
 * and the reason a "small" battery can still need a Shipper's Declaration.
 */
function sectionFor(
  configuration: Configuration,
  band: EnergyBand,
  chemistry: Chemistry,
  prepareToSectionI: boolean,
): PackingSection {
  // PI 976 has no sections: every standalone sodium ion cell and battery is fully regulated.
  if (chemistry === 'sodium-ion' && configuration === 'standalone') return null
  // A shipper who has prepared to Section I has already answered the only question the band
  // asks of an entry travelling with equipment: small goes to Section I because that is what
  // was prepared, large goes there because that is where it belongs. Reading the band first
  // called that package "section undetermined" and then treated it as one — a 5 kg limit
  // against a real 35 kg allowance, no UN specification packaging demanded where Section I
  // demands it, and a blocking check for a figure that could not change any of it.
  if (configuration !== 'standalone' && prepareToSectionI) return 'I'
  if (band === 'unknown') return null
  if (configuration === 'standalone') return band === 'small' ? 'IB' : 'IA'
  // Section II is a relief with conditions. A shipper who does not meet them — most often
  // the 5 kg net per package ceiling — prepares the same goods to Section I of the same
  // packing instruction instead. Only ever an escalation: it never relieves anything.
  if (band === 'small') return prepareToSectionI ? 'I' : 'II'
  return 'I'
}

/**
 * The two sections an unrated entry could fall in, where they disagree about packaging.
 *
 * Null where they do not, which is most of the time. Batteries *contained in* equipment
 * never take UN specification packaging in any section — the equipment is its own enclosure
 * — so nothing about that requirement is in doubt for them, whatever the rating turns out
 * to be. Standalone is IA against IB, and A802 is the exception that names IB. Packed with
 * equipment is Section I against Section II, and A802 has nothing to do with it: it is
 * written for Sections IB of PI 965 and PI 968 alone.
 *
 * Takes the classification rather than the spec so that "undecided" means the one thing
 * `sectionUndetermined` means. Re-deriving it from the rating alone named two candidate
 * sections for a package prepared to Section I, whose section is not in doubt at all.
 */
export function undecidedPackagingSections(
  classification: AirClassification,
): { pair: string; a802: boolean } | null {
  const spec = classification.spec
  if (!classification.sectionUndetermined) return null
  if (spec.configuration === 'contained-in-equipment') return null
  return spec.configuration === 'standalone'
    ? { pair: 'Section IA requires it and Section IB is expressly excepted from it', a802: true }
    : { pair: 'Section I requires it and Section II does not', a802: false }
}

/**
 * Whether the energy rating changes how this entry is treated at all.
 *
 * Almost always yes: every section boundary and every quantity limit turns on it. The
 * exception is a standalone sodium ion battery, which travels under PI 976 — one packing
 * instruction with no sections and a single 35 kg cargo limit, fully regulated whatever the
 * rating. `sectionFor` short-circuits on that pair before it reads the band, so the
 * classification comes out identical with a rating and without one, and blocking a
 * consignment for want of a figure that changes nothing is a check that cannot be satisfied
 * by doing anything useful.
 */
export function bandDeterminesTreatment(spec: BatterySpec): boolean {
  return !(spec.chemistry === 'sodium-ion' && spec.configuration === 'standalone')
}

/**
 * Package net-quantity limits, by packing instruction and section.
 *
 * Sourced twice over where the materials allow it: the Section I and Section II figures are
 * columns I–L of the List of Dangerous Goods (figs. 5-1, 5-2, 5-3) *and* the per-section
 * requirement tables (figs. 5-26, 5-27, 5-33, 5-34), which agree. The Section IB figures come
 * only from fig. 5-29, because the List of Dangerous Goods defers to the packing instruction
 * for UN3480 and UN3090 ("See 965", "See 968").
 */
function limitsFor(pi: number, section: PackingSection, chemistry: Chemistry): QuantityLimits {
  // Standalone lithium: forbidden on passenger aircraft in every section.
  if (pi === 965 || pi === 968) {
    // A null section here means the energy band is unknown, and the two sections it could
    // be carry very different ceilings — 10 kg or 2.5 kg under Section IB against 35 kg
    // under Section IA. Standalone batteries have no choice between them: the rating
    // decides it. So the lower figure is stated, the same conservative reading the
    // packaging section takes, rather than an allowance three times too generous that
    // turns out not to be this battery's. `dg.rating` blocks until the rating is entered,
    // and the figure becomes the section's own when it is.
    if (section === 'IB' || section === null) {
      const base = 'Student Guide fig. 5-29 (PI 965 / PI 968 Section IB)'
      return {
        passengerKg: null,
        cargoKg: pi === 965 ? 10 : 2.5,
        source:
          section === 'IB'
            ? base
            : `${base} — the lower of the two sections this could be, pending the ` +
              (pi === 965 ? 'watt-hour' : 'lithium content') +
              ' rating',
      }
    }
    return {
      passengerKg: null,
      cargoKg: 35,
      source: pi === 965 ? 'Student Guide fig. 5-33 (PI 965 Section IA)' : 'Student Guide fig. 5-34 (PI 968 Section IA)',
    }
  }
  // Standalone sodium ion: PI 976, forbidden on passenger aircraft, 35 kg cargo.
  if (pi === 976) {
    return { passengerKg: null, cargoKg: 35, source: 'Student Guide fig. 5-3 (UN3551, columns I–L)' }
  }
  // Packed with / contained in, Section II: 5 kg net per package on *either* aircraft
  // type. The Section II tables state a single 5 kg ceiling with no cargo relief (figs.
  // 5-26 and 5-27) — the 35 kg figure belongs to Section I on a cargo aircraft, and a
  // shipper who needs more than 5 kg in one package prepares to Section I.
  if (section === 'II') {
    return {
      passengerKg: 5,
      cargoKg: 5,
      // The lithium tables and the sodium tables are different figures in the materials,
      // and this string is printed beside the limit for someone re-checking it against the
      // DGR — pointing a sodium shipper at the lithium table would send them to the wrong
      // page of their own course notes.
      source:
        chemistry === 'sodium-ion'
          ? 'Student Guide figs. 5-30 and 5-31 (PI 977 / PI 978 Section II — 5 kg net per package on either aircraft)'
          : 'Student Guide figs. 5-26 and 5-27 (Section II — 5 kg net per package on either aircraft)',
    }
  }
  // A null section this far down means the energy band is unknown — PI 976 was answered
  // above, and every remaining instruction has both a Section I and a Section II. So the
  // lower of the two candidates is stated, exactly as the standalone branch does: reading
  // Section I's 35 kg cargo allowance to an unrated package showed a 20 kg box passing
  // against a ceiling that may turn out to be 5 kg.
  if (section === null) {
    return {
      passengerKg: 5,
      cargoKg: 5,
      // Named for the chemistry in hand, like the Section II branch above it: the sodium
      // tables are different figures in the materials, and pointing a sodium shipper at
      // the lithium pages sends them to the wrong part of their own course notes.
      source:
        (chemistry === 'sodium-ion'
          ? 'Student Guide figs. 5-30 and 5-31 (PI 977 / PI 978 Section II)'
          : 'Student Guide figs. 5-26 and 5-27 (Section II)') +
        ' — the lower of the two sections this could be, pending the rating',
    }
  }
  // Packed with / contained in, Section I: 5 kg passenger, 35 kg cargo.
  return {
    passengerKg: 5,
    cargoKg: 35,
    source: 'Student Guide figs. 5-1 to 5-3, columns I–L (Section I)',
  }
}

/**
 * The state of charge rule for this entry.
 *
 * Three cases, and the materials are careful about which verb each one takes:
 *
 *  - standalone lithium ion — **must not** exceed 30% (A331, Student Guide p. 55);
 *  - packed with equipment — **must** not exceed 30% from 1 January 2026, except that cells
 *    rated at or below 2.7 Wh **should** not (fig. 5-26 note);
 *  - contained in equipment — **should** not exceed 30%, or an indicated capacity of 25%
 *    (fig. 5-27 note).
 *
 * Lithium metal has no state of charge; it is not rechargeable.
 */
function stateOfChargeFor(spec: BatterySpec): StateOfChargeRule | null {
  if (spec.chemistry === 'lithium-metal') return null
  if (spec.configuration === 'standalone') {
    // Named for the chemistry in hand rather than hard-coded to lithium ion. Special
    // provision A331 appears in column M against UN3551 as well as UN3480, so a standalone
    // sodium ion battery carries the same limit — and a rule that told a sodium shipper
    // about "lithium ion cells" would read as though it had been applied to the wrong entry.
    const chemistry = spec.chemistry === 'sodium-ion' ? 'Standalone sodium ion' : 'Standalone lithium ion'
    return {
      limitPercent: STATE_OF_CHARGE_LIMIT,
      strength: 'must',
      indicatedCapacityAlternative: false,
      detail:
        `${chemistry} cells and batteries must be offered at a state of charge not exceeding 30% of ` +
        'rated capacity. Above 30% may only be shipped with the approval of the State of Origin and the State ' +
        'of the Operator, under the written conditions those authorities establish (special provision A331).',
    }
  }
  if (spec.chemistry === 'sodium-ion') return null
  if (spec.configuration === 'packed-with-equipment') {
    // A rating of zero is not a rating, here as in `energyBand`: read literally it put the
    // mandatory 30% state of charge below the 2.7 Wh threshold and downgraded it to advice,
    // under a line that said "Rated at 0 Wh, at or below the 2.7 Wh threshold".
    // Cells only. The relief is written against a cell's watt-hour rating, and read across
    // to a battery it demoted the whole state-of-charge group — the figure, its basis and
    // its provenance — from blocking to advice, so a declaration could be generated for a
    // pack nobody had measured. A battery assembled from cells that each qualify is still
    // a battery.
    const advisory =
      spec.form === 'cell' && spec.wattHours != null && spec.wattHours > 0 && spec.wattHours <= SOC_ADVISORY_WH
    return {
      limitPercent: STATE_OF_CHARGE_LIMIT,
      strength: advisory ? 'should' : 'must',
      // Deliberately false. The 25% indicated-capacity alternative is written against
      // batteries *contained in* equipment, and reading it across to packed-with is a
      // documented misreading that merges two rules into one sentence.
      indicatedCapacityAlternative: false,
      detail: advisory
        ? `Rated at ${spec.wattHours} Wh, at or below the 2.7 Wh threshold, so from 1 January 2026 a state of ` +
          'charge not exceeding 30% of rated capacity is recommended rather than required.'
        : 'From 1 January 2026 lithium ion cells and batteries packed with equipment must be offered at a state ' +
          'of charge not exceeding 30% of rated capacity. There is no indicated-capacity alternative for this ' +
          'branch. Above 30% needs approval from the State of Origin and the State of the Operator.',
    }
  }
  return {
    limitPercent: STATE_OF_CHARGE_LIMIT,
    strength: 'should',
    indicatedCapacityAlternative: true,
    detail:
      'Lithium ion cells and batteries contained in equipment should be offered at a state of charge not ' +
      'exceeding 30% of rated capacity, or an indicated battery capacity not exceeding 25%.',
  }
}

/**
 * The wording every battery-mark line starts with.
 *
 * A constant because `assess.ts` filters the mark out of a package's hazard communication
 * when the two-package exemption applies, and it does so by matching this prefix. Two
 * copies of the string would let a rewording here silently break the exemption there —
 * nothing types against prose.
 */
export const BATTERY_MARK_PREFIX = 'Lithium battery mark'

/**
 * Marks and labels for a package prepared to this section.
 *
 * The per-consignment exemptions are *not* applied here — whether the battery mark may be
 * left off a package of equipment depends on how many packages are in the consignment, which
 * this function cannot see. `assess.ts` applies them.
 */
function hazardCommunicationFor(
  section: PackingSection,
  aircraft: AircraftLimitation,
  id: Identity,
  /**
   * Whether the section is null because nothing has decided it yet, as opposed to because
   * the packing instruction has none.
   *
   * The two null sections are not the same answer. PI 976 genuinely has no sections and its
   * packages are marked as Sections I and IA are; an unrated battery could still turn out to
   * be Section IB, which carries the lithium battery mark as well as the label. The limit
   * for that case is already stated conservatively, and the marks list has to agree — the
   * panel is read while the box is being made up, and a mark that turns out to be needed is
   * a mark applied after the box was closed.
   */
  sectionUndetermined: boolean,
): string[] {
  const marks = ['Shipper and consignee name and address']

  if (section === 'II') {
    // Excepted Class 9: the battery mark is the whole of the hazard communication.
    return [...marks, `${BATTERY_MARK_PREFIX} bearing ${id.unNumber}`]
  }

  marks.push(`${id.unNumber} and proper shipping name mark ("${id.properShippingName}")`)
  marks.push('Class 9 lithium battery hazard label')
  if (aircraft === 'cargo-aircraft-only') marks.push('Cargo Aircraft Only label, on the same surface as the Class 9 label')
  // Section IB alone carries both the Class 9 label and the lithium battery mark (fig. 5-28);
  // Sections I and IA carry the label without the mark (figs. 5-32, 5-33, 5-34).
  if (section === 'IB' || sectionUndetermined) marks.push(`${BATTERY_MARK_PREFIX} bearing ${id.unNumber}`)
  marks.push('Net quantity mark, where multiple non-identical packages are offered in the consignment')
  return marks
}

/**
 * Special provisions from column M that bear on a lithium or sodium battery air shipment.
 *
 * A working subset, not the column verbatim: these are the ones that change what a shipper
 * does. The rest of column M is reproduced in the Supplemental Appendix and still has to be
 * read for every shipment, which is why the assessment engine says so.
 */
function specialProvisionsFor(spec: BatterySpec, unSpecificationRequired: boolean): string[] {
  const provisions = ['A154 — damaged or defective cells and batteries are forbidden for transport by air']
  if (spec.configuration === 'standalone') {
    // A331 is a state of charge provision, so it reaches only the rechargeable chemistries.
    // The passenger-aircraft approval is not: every standalone battery is forbidden on
    // passenger aircraft and every one of them has a provision naming the approval that
    // relieves it — A201 for lithium metal, A334 for lithium ion and sodium ion. Nesting
    // the second inside the first left UN3090 with no passenger provision at all, under a
    // blocking check that cites both by number.
    if (spec.chemistry === 'lithium-metal') {
      provisions.push('A201 — state approval required to carry standalone lithium metal batteries on passenger aircraft')
    } else {
      provisions.push('A331 — state approval required above 30% state of charge')
      provisions.push('A334 — state approval required to carry standalone batteries on passenger aircraft')
    }
    provisions.push('A183 — waste batteries for recycling or disposal are forbidden without competent authority approval')
  }
  // Listed for exactly the entries the packaging check holds to it. Gating this on the
  // section while the check gated on something wider let a blocking check cite a provision
  // the entry's own list did not carry.
  // A802 is written for lithium. A standalone sodium ion battery travels under PI 976, whose
  // packaging requirement is its own — listing A802 against it cited a provision that does
  // not mention the entry, which is the mismatch this line was corrected for once already.
  if (unSpecificationRequired && spec.chemistry !== 'sodium-ion') {
    provisions.push('A802 — UN specification packaging meeting Packing Group II performance is required')
  }
  provisions.push('A99 — an exception to the 35 kg limit needs competent authority approval')
  // A181 governs a package holding batteries both packed with and contained in equipment,
  // so it belongs to UN3481 and UN3091 alone. Pushed unconditionally, it sat in the column M
  // list of every standalone entry — invisible until this list started printing.
  if (spec.configuration !== 'standalone') {
    provisions.push(
      'A181 — a package holding both packed-with and contained-in batteries is described as packed with equipment',
    )
  }
  if (spec.chemistry === 'sodium-ion') {
    provisions.push('A228 — sodium ion cells with an aqueous alkali electrolyte travel as UN2795, not UN3551/UN3552')
  }
  return provisions
}

/**
 * Classifies one battery type for air transport.
 *
 * Total, by construction: every combination of chemistry, form and configuration produces an
 * answer, including the one where the energy content is unknown. In that case the section is
 * `null`, `declarationRequired` is true and the limits are the fully regulated ones — the
 * conservative reading, with the assessment engine raising a blocking check that says the
 * rating has to be supplied before anything can be generated.
 */
export function classifyForAir(
  spec: BatterySpec,
  options: {
    /**
     * Prepare small packed-with or contained-in batteries to Section I rather than
     * Section II — the route for a package over the Section II 5 kg ceiling. Recorded by
     * the shipper, never inferred: see `BatteryEntry.prepareToSectionI`.
     */
    prepareToSectionI?: boolean
  } = {},
): AirClassification {
  const id = IDENTITIES[spec.chemistry][spec.configuration]
  const stateOfCharge = stateOfChargeFor(spec)
  const band = energyBand(spec)
  const section = sectionFor(spec.configuration, band, spec.chemistry, options.prepareToSectionI ?? false)
  // A null section because nothing has decided it yet, as opposed to because the packing
  // instruction has none. PI 976 is the second; an unrated battery is the first.
  const sectionUndetermined = section === null && band === 'unknown' && bandDeterminesTreatment(spec)
  const limits = limitsFor(id.packingInstruction, section, spec.chemistry)

  // Standalone cells and batteries of every chemistry are cargo aircraft only. Everything
  // else may go on a passenger aircraft up to 5 kg.
  const aircraft: AircraftLimitation =
    limits.passengerKg === null ? 'cargo-aircraft-only' : 'passenger-and-cargo'

  const isSectionII = section === 'II'
  // Section I and IA are the fully regulated sections that demand performance packaging;
  // IB is fully regulated but takes a strong rigid outer packaging instead.
  //
  // A null section is *not* a lesser case: PI 976 has none at all and every standalone
  // sodium ion battery under it is fully regulated, and an unknown energy band is read
  // conservatively as fully regulated too. Treating those as though Section IB's A802
  // exception covered them let them skip the packaging check entirely, under a message
  // citing an exception written for two other packing instructions.
  // PI 976's null section is fully regulated and takes performance packaging. An *unrated*
  // entry's null section is not the same answer: its two candidates are Section IA, which
  // requires the packaging, and Section IB or II, which A802 excepts — and the quantity
  // limit for that same entry is already stated as the lower candidate. Demanding the mark
  // as well would have the two halves of one classification assuming different sections,
  // and would block on a fact nobody can settle until the rating is entered, which
  // `dg.energy` is already blocking for.
  const performancePackagingSection =
    section === 'IA' || section === 'I' || (section === null && !sectionUndetermined)
  // Equipment is its own enclosure, so contained-in never takes performance packaging.
  const unSpecificationPackaging = performancePackagingSection && spec.configuration !== 'contained-in-equipment'

  return {
    spec,
    unNumber: id.unNumber,
    properShippingName: id.properShippingName,
    hazardClass: '9',
    subsidiaryRisk: null,
    packingGroup: null,
    packingInstruction: id.packingInstruction,
    section,
    band,
    sectionUndetermined,
    packingInstructionLabel: section ? `${id.packingInstruction} ${section}` : String(id.packingInstruction),
    declarationRequired: !isSectionII,
    fullyRegulated: !isSectionII,
    aircraft,
    limits,
    // Only the standalone and packed-with instructions at Section I/IA demand UN specification
    // packaging; contained-in equipment takes a strong rigid outer packaging in every section.
    unSpecificationPackagingRequired: unSpecificationPackaging,
    // Equipment is not placed in an inner packaging — the equipment itself is the enclosure.
    innerPackagingRequired: spec.configuration !== 'contained-in-equipment',
    // The 1.2 m drop applies to standalone and packed with; the 3 m stack applies to all
    // three (Student Guide p. 60), except that the stack test is not applied to sodium ion.
    //
    // Both are capability standards for packaging that is *not* performance-tested. Where UN
    // specification packaging is required, the Packing Group II test regime supersedes them,
    // and restating them there would read as two separate obligations on one box.
    dropTestRequired: !unSpecificationPackaging && spec.configuration !== 'contained-in-equipment',
    stackTestRequired: !unSpecificationPackaging && spec.chemistry !== 'sodium-ion',
    stateOfCharge,
    indicatedCapacityAlternative: stateOfCharge?.indicatedCapacityAlternative ?? false,
    hazardCommunication: hazardCommunicationFor(
      section,
      aircraft,
      id,
      sectionUndetermined,
    ),
    training: isSectionII ? 'adequate-instruction' : 'dangerous-goods',
    specialProvisions: specialProvisionsFor(spec, unSpecificationPackaging),
    basis: section
      ? `PI ${id.packingInstruction} Section ${section} · ${limits.source}`
      : `PI ${id.packingInstruction} · ${limits.source}`,
  }
}

/**
 * The air waybill handling-information statement this entry requires.
 *
 * Two families, and they are not interchangeable. A fully regulated consignment points the
 * operator at the declaration that travels with it; a Section II consignment has no
 * declaration, so the statement *is* the notification, and it names the packing instruction
 * so the operator knows what it is accepting (Student Guide figs. 5-23 to 5-25, 5-38).
 *
 * The fully regulated wording has accepted variants, and the course materials use both:
 * "Dangerous goods as per associated Shipper's Declaration" (figs. 5-29, 5-33, 5-34) and
 * "Dangerous Goods as per associated DGD" (p. 71), each with "Cargo Aircraft Only" or "CAO"
 * appended where that applies. Neither is more correct than the other, which is why
 * `FULLY_REGULATED_STATEMENT_VARIANTS` exists rather than a second hard-coded string: an
 * operator that requires a particular form of words is the only thing that narrows it, and no
 * variation data ships with this application.
 */
export function airWaybillStatement(
  classification: AirClassification,
  /**
   * The aircraft type the *consignment* is offered on, where known. The CAO annotation
   * follows the declaration, and a fully regulated consignment offered cargo-aircraft-only
   * by choice strikes the passenger box on its declaration — so the AWB statement carries
   * the annotation whether the restriction is inherent to the goods or chosen. Section II
   * statements never carry it: excepted packages are not restricted to cargo aircraft.
   */
  consignmentAircraft?: AircraftLimitation,
): string {
  const { section, packingInstruction, spec, aircraft } = classification
  if (section === 'II') {
    const chemistry =
      spec.chemistry === 'lithium-ion' ? 'Lithium ion' : spec.chemistry === 'lithium-metal' ? 'Lithium metal' : 'Sodium ion'
    return `${chemistry} batteries in compliance with Section II of PI${packingInstruction}`
  }
  const cargoOnly = aircraft === 'cargo-aircraft-only' || consignmentAircraft === 'cargo-aircraft-only'
  return cargoOnly
    ? 'Dangerous goods as per associated Shipper’s Declaration — Cargo Aircraft Only'
    : 'Dangerous goods as per associated Shipper’s Declaration'
}

/**
 * One statement covering several Section II entries.
 *
 * The DGR allows the compliance statements to be combined where a consignment holds packages
 * prepared to more than one Section II packing instruction, provided the combined statement
 * still identifies the battery types and instructions involved (Student Guide fig. 5-24).
 * Written as separate sentences rather than a merged clause, because a reader has to be able
 * to match each instruction to its chemistry.
 */
export function combinedSectionIIStatement(classifications: AirClassification[]): string {
  const statements = [...new Set(classifications.filter((c) => c.section === 'II').map((c) => airWaybillStatement(c)))]
  return statements.join('. ')
}

/**
 * Equally accepted wordings for the fully regulated air waybill statement.
 *
 * Offered rather than chosen between. A shipper matching an operator's preferred form of
 * words needs to know that the alternatives exist; a shipper who has no such requirement can
 * use the first.
 */
export function fullyRegulatedStatementVariants(aircraft: AircraftLimitation): string[] {
  const cargoOnly = aircraft === 'cargo-aircraft-only'
  return [
    `Dangerous goods as per associated Shipper’s Declaration${cargoOnly ? ' — Cargo Aircraft Only' : ''}`,
    `Dangerous Goods as per associated DGD${cargoOnly ? ' — Cargo Aircraft Only' : ''}`,
    ...(cargoOnly ? ['Dangerous Goods as per associated DGD — CAO'] : []),
  ]
}

/** Human labels, kept beside the codes so the UI and the reports cannot drift apart. */
export const CHEMISTRY_LABELS: Record<Chemistry, string> = {
  'lithium-ion': 'Lithium ion',
  'lithium-metal': 'Lithium metal',
  'sodium-ion': 'Sodium ion',
}

export const CONFIGURATION_LABELS: Record<Configuration, string> = {
  standalone: 'Standalone — batteries alone, no equipment',
  'packed-with-equipment': 'Packed with equipment — in the box, not installed',
  'contained-in-equipment': 'Contained in equipment — installed in what they power',
}

export const FORM_LABELS: Record<CellOrBattery, string> = {
  cell: 'Cell',
  battery: 'Battery',
}
