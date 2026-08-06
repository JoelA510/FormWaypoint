/**
 * Assessing a prepared air consignment against the rules its contents attract.
 *
 * The classification module says what a battery *is*. This one says whether what has been
 * built around it is acceptable: whether the package is inside its net quantity limit, on an
 * aircraft type the goods may travel on, in packaging the section demands, with the marks
 * the consignment size leaves it needing.
 *
 * Everything comes back as `CheckResult`, the same type the CIPL reconciliation produces, so
 * the review screen renders both the same way and the generation gate is one rule in one
 * place: no blocking check may be failing.
 *
 * Three things this deliberately does not do:
 *
 *  - **It does not decide anything the shipper must decide.** Whether the batteries are
 *    sound, whether the test summary exists, whether the state of charge is inside 30% —
 *    these are answered by a person and checked here, never inferred from silence.
 *  - **It does not apply state or operator variations.** It says which ones to read, names
 *    the operator if one was entered, and refuses to generate until someone confirms they
 *    have. An airline variation that forbids what the DGR allows is the most common reason a
 *    correctly prepared lithium shipment is turned away at the counter.
 *  - **It does not sign anything.** A typewritten signature is not acceptable, and the
 *    declaration certifies acts — packing, marking, labelling — that happened away from this
 *    screen.
 */
import type { CheckResult } from '../types'
import {
  airWaybillStatement,
  classifyForAir,
  CHEMISTRY_LABELS,
  energyThreshold,
  type AircraftLimitation,
  type AirClassification,
} from './lithium'
import type { BatteryEntry, DgConsignment, DgPackage } from './types'

export interface EntryAssessment {
  entry: BatteryEntry
  packageId: string
  classification: AirClassification
}

export interface PackageAssessment {
  pkg: DgPackage
  entries: EntryAssessment[]
  /** Net battery weight in **one** package, summed over its entries. */
  netWeightKg: number
  /** Marks and labels this package must carry, after the consignment-level exemptions. */
  hazardCommunication: string[]
  /** Why the battery mark may be omitted, or null when it must be applied. */
  batteryMarkExemption: string | null
  /** True when any entry in this package is fully regulated. */
  declarationRequired: boolean
}

export interface DgAssessment {
  packages: PackageAssessment[]
  /** One per distinct classification in the consignment, in first-seen order. */
  classifications: AirClassification[]
  /** The least restrictive aircraft type the contents permit. */
  requiredAircraft: AircraftLimitation
  /** True when any package needs a Shipper's Declaration. */
  declarationRequired: boolean
  /** Statements for the air waybill's handling information box, deduplicated. */
  airWaybillStatements: string[]
  checks: CheckResult[]
  canGenerate: boolean
  totals: {
    /** Physical packages, counting a run of identical ones once each. */
    packages: number
    /** Net battery weight across the whole consignment. */
    netWeightKg: number
  }
}

/** Rounds a kilogram figure the way the rest of the app does, to three places. */
function kg(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** A stable identity for "the same regulatory entry", for grouping DGD lines and limits. */
export function classificationKey(classification: AirClassification): string {
  return `${classification.unNumber}|${classification.properShippingName}|${classification.packingInstructionLabel}`
}

/**
 * How many physical packages of this description the consignment holds.
 *
 * `count` is per overpack for a package that sits in one, so the consignment total — which is
 * the number the declaration states and the number the two-package marking exemption is
 * measured against — is the product of the two. Getting this wrong under-counts a
 * multiple-overpack consignment and would exempt packages that need marking.
 */
export function packageCountInConsignment(pkg: DgPackage, consignment: DgConsignment): number {
  const overpack = pkg.overpackId ? consignment.overpacks.find((o) => o.id === pkg.overpackId) : null
  return Math.max(0, pkg.count) * Math.max(1, overpack?.count ?? 1)
}

export function assess(consignment: DgConsignment): DgAssessment {
  const checks: CheckResult[] = []
  const packages: PackageAssessment[] = []
  const byKey = new Map<string, AirClassification>()

  const totalPackages = consignment.packages.reduce(
    (sum, p) => sum + packageCountInConsignment(p, consignment),
    0,
  )

  for (const pkg of consignment.packages) {
    const entries: EntryAssessment[] = pkg.entries.map((entry) => ({
      entry,
      packageId: pkg.id,
      classification: classifyForAir(entry.spec),
    }))
    for (const { classification } of entries) {
      const key = classificationKey(classification)
      if (!byKey.has(key)) byKey.set(key, classification)
    }

    const netWeightKg = kg(entries.reduce((sum, e) => sum + (e.entry.netWeightKgPerPackage ?? 0), 0))
    const exemption = batteryMarkExemption(entries, totalPackages)

    packages.push({
      pkg,
      entries,
      netWeightKg,
      hazardCommunication: packageHazardCommunication(entries, consignment.aircraft, exemption),
      batteryMarkExemption: exemption,
      declarationRequired: entries.some((e) => e.classification.declarationRequired),
    })
  }

  const classifications = [...byKey.values()]
  const declarationRequired = packages.some((p) => p.declarationRequired)
  const requiredAircraft: AircraftLimitation = classifications.some(
    (c) => c.aircraft === 'cargo-aircraft-only',
  )
    ? 'cargo-aircraft-only'
    : 'passenger-and-cargo'

  checks.push(...structureChecks(consignment))
  for (const assessment of packages) {
    checks.push(...entryChecks(assessment))
    checks.push(...packageChecks(assessment, consignment))
  }
  checks.push(...consignmentChecks(consignment, packages, classifications, requiredAircraft, declarationRequired))

  return {
    packages,
    classifications,
    requiredAircraft,
    declarationRequired,
    airWaybillStatements: [...new Set(classifications.map(airWaybillStatement))],
    checks,
    canGenerate: checks.length > 0 && checks.every((c) => c.severity !== 'blocking' || c.passed),
    totals: {
      packages: totalPackages,
      netWeightKg: kg(
        packages.reduce((sum, p) => sum + p.netWeightKg * packageCountInConsignment(p.pkg, consignment), 0),
      ),
    },
  }
}

/** The consignment has to describe something before any of it can be checked. */
function structureChecks(consignment: DgConsignment): CheckResult[] {
  const entryCount = consignment.packages.reduce((sum, p) => sum + p.entries.length, 0)
  return [
    {
      id: 'dg.structure',
      severity: 'blocking',
      title: 'The consignment describes at least one package of batteries',
      detail: entryCount
        ? `${consignment.packages.length} package description${consignment.packages.length === 1 ? '' : 's'} holding ` +
          `${entryCount} battery type${entryCount === 1 ? '' : 's'}.`
        : 'Add a package and describe the cells or batteries in it.',
      passed: entryCount > 0,
    },
  ]
}

/** Everything that is true or false about one battery type, regardless of its package. */
function entryChecks(assessment: PackageAssessment): CheckResult[] {
  const checks: CheckResult[] = []

  for (const { entry, classification } of assessment.entries) {
    const ref = `${assessment.pkg.id}/${entry.id}`
    const name = entry.description || `${CHEMISTRY_LABELS[entry.spec.chemistry]} ${entry.spec.form}`

    // --- Condition -------------------------------------------------------
    // Two of the four values here end the shipment. They are checked first because no other
    // finding matters once the goods are forbidden.
    checks.push({
      id: `dg.condition.${ref}`,
      severity: 'blocking',
      title: `${name}: sound cells and batteries`,
      detail:
        entry.condition === 'sound'
          ? 'Declared undamaged, not defective, and not being sent for recycling or disposal.'
          : entry.condition === 'damaged-or-defective'
            ? 'Damaged or defective cells and batteries are forbidden for transport by air (special provision ' +
              'A154). There is no packing instruction that permits them; they move by ground or vessel under ' +
              'their own provisions, or not at all.'
            : entry.condition === 'for-recycling-or-disposal'
              ? 'Waste batteries sent for recycling or disposal are forbidden for transport by air without ' +
                'competent authority approval (special provision A183).'
              : 'Prototype and low-production cells and batteries travel by air only under an approval issued by ' +
                'the State of Origin and the State of the Operator, which this workflow does not produce.',
      passed: entry.condition === 'sound',
      refs: [ref],
    })

    // --- Energy content --------------------------------------------------
    const threshold = energyThreshold(entry.spec)
    const stated =
      entry.spec.chemistry === 'lithium-metal' ? entry.spec.lithiumContentG : entry.spec.wattHours
    checks.push({
      id: `dg.energy.${ref}`,
      severity: 'blocking',
      title: `${name}: energy content stated`,
      detail:
        classification.band === 'unknown'
          ? `Every threshold in the packing instructions turns on this figure. Enter the ` +
            `${threshold.unit === 'Wh' ? 'watt-hour rating' : 'lithium content'} per ` +
            `${entry.spec.form}; a battery whose rating is unknown cannot be shown to be inside the ` +
            'Section II or Section IB relief, and nothing is assumed on its behalf.'
          : `${stated} ${threshold.unit} per ${entry.spec.form}, against a ${threshold.limit} ${threshold.unit} ` +
            `threshold — ${classification.band === 'small' ? 'small' : 'large'} by air, ` +
            (classification.section ? `PI ${classification.packingInstructionLabel}.` : `PI ${classification.packingInstruction}.`),
      passed: classification.band !== 'unknown',
      refs: [ref],
    })

    // --- UN 38.3 test summary --------------------------------------------
    // The classification itself rests on this. A cell that cannot be shown to have passed
    // 38.3 is not a lithium battery for transport purposes; it is an untested cell, which
    // travels under approval or not at all.
    checks.push({
      id: `dg.test-summary.${ref}`,
      severity: 'blocking',
      title: `${name}: UN 38.3 test summary available`,
      detail: entry.buttonCellsInEquipment
        ? 'Button cells installed in equipment, including circuit boards, are excepted from the test summary ' +
          'requirement.'
        : entry.testSummaryOnFile
          ? 'The manufacturer or distributor has made the test summary available, as required for cells and ' +
            'batteries manufactured on or after 1 January 2008.'
          : 'Manufacturers and subsequent distributors must make a UN 38.3 test summary available, and the ' +
            'classification depends on it. Obtain it before the shipment is offered.',
      passed: entry.buttonCellsInEquipment || entry.testSummaryOnFile,
      refs: [ref],
    })

    // --- Watt-hour marking -----------------------------------------------
    // A battery, not a cell: the requirement is written against the battery case. Lithium
    // metal is rated in grams of lithium and carries no equivalent marking.
    const needsWhMark = entry.spec.form === 'battery' && entry.spec.chemistry !== 'lithium-metal'
    if (needsWhMark) {
      checks.push({
        id: `dg.wh-mark.${ref}`,
        severity: 'blocking',
        title: `${name}: watt-hour rating marked on the battery case`,
        detail: entry.wattHourMarkedOnCase
          ? 'The rating is marked on the outside of the case, as the general requirements demand.'
          : 'The watt-hour rating must be marked on the outside of the battery case. This is a general ' +
            'requirement of the packing instructions, not a package marking, so it cannot be satisfied by ' +
            'anything applied to the box.',
        passed: entry.wattHourMarkedOnCase,
        refs: [ref],
      })
    }

    // --- State of charge -------------------------------------------------
    const soc = classification.stateOfCharge
    if (soc) {
      const value = entry.stateOfChargePercent
      if (value == null) {
        checks.push({
          id: `dg.soc.${ref}`,
          severity: soc.strength === 'must' ? 'blocking' : 'warning',
          title: `${name}: state of charge established`,
          detail:
            `${soc.detail} It has not been stated for these cells, so it cannot be shown to be inside the ` +
            `${soc.limitPercent}% limit.`,
          passed: false,
          refs: [ref],
        })
      } else {
        const within = value <= soc.limitPercent
        checks.push({
          id: `dg.soc.${ref}`,
          severity: soc.strength === 'must' ? 'blocking' : 'warning',
          title: `${name}: state of charge within ${soc.limitPercent}%`,
          detail: within ? soc.detail : `${soc.detail} These cells are stated at ${value}%.`,
          passed: within,
          expected: `≤ ${soc.limitPercent}%`,
          actual: `${value}%`,
          refs: [ref],
        })
      }
    }

    // --- Net battery weight ----------------------------------------------
    checks.push({
      id: `dg.net-weight.${ref}`,
      severity: 'blocking',
      title: `${name}: net battery weight per package stated`,
      detail:
        entry.netWeightKgPerPackage == null
          ? 'Enter the net weight of the cells or batteries of this type in one package. This is the weight of ' +
            'the batteries themselves — not the equipment they are packed with or installed in, and not the ' +
            'gross weight of the package, which is what the packing instruction limits are measured against.'
          : `${entry.netWeightKgPerPackage} kg of batteries per package.`,
      passed: entry.netWeightKgPerPackage != null,
      refs: [ref],
    })
  }

  return checks
}

/** Everything that depends on how the package was built. */
function packageChecks(assessment: PackageAssessment, consignment: DgConsignment): CheckResult[] {
  const checks: CheckResult[] = []
  const { pkg, entries } = assessment
  const label = `${pkg.count} × ${pkg.packagingType || 'package'}`
  const usingPassenger = consignment.aircraft === 'passenger-and-cargo'

  // --- Aircraft type -----------------------------------------------------
  const forbiddenOnPassenger = entries.filter((e) => e.classification.aircraft === 'cargo-aircraft-only')
  if (forbiddenOnPassenger.length) {
    checks.push({
      id: `dg.aircraft.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: aircraft type`,
      detail: usingPassenger
        ? `${forbiddenOnPassenger.map((e) => e.classification.unNumber).join(', ')} may not be carried as cargo ` +
          'on a passenger aircraft. Offer the consignment as cargo aircraft only, or an exemption has to be ' +
          'requested from the States concerned (special provisions A201 and A334).'
        : 'Standalone cells and batteries are cargo aircraft only, and the consignment is offered as such.',
      passed: !usingPassenger,
      refs: [pkg.id],
    })
  }

  // --- Net quantity per package ------------------------------------------
  // Grouped by regulatory entry, because that is what the limit is written against: two
  // different UN numbers in one box each get their own allowance.
  const groups = new Map<string, { classification: AirClassification; weight: number }>()
  for (const { entry, classification } of entries) {
    const key = classificationKey(classification)
    const group = groups.get(key)
    const weight = entry.netWeightKgPerPackage ?? 0
    if (group) group.weight += weight
    else groups.set(key, { classification, weight })
  }

  for (const [key, { classification, weight }] of groups) {
    const limit = usingPassenger ? classification.limits.passengerKg : classification.limits.cargoKg
    // A forbidden aircraft type is reported by the check above; repeating it as a quantity
    // failure would say the same thing twice in different words.
    if (limit == null) continue
    checks.push({
      id: `dg.limit.${pkg.id}.${key}`,
      severity: 'blocking',
      title: `${label}: ${classification.unNumber} within the package limit`,
      detail:
        kg(weight) <= limit
          ? `${kg(weight)} kg of ${classification.unNumber} per package, against ${limit} kg for ` +
            `PI ${classification.packingInstructionLabel} on ${usingPassenger ? 'passenger and cargo aircraft' : 'cargo aircraft'}. ` +
            `Source: ${classification.limits.source}.`
          : `${kg(weight)} kg of ${classification.unNumber} per package exceeds the ${limit} kg net quantity ` +
            `limit for PI ${classification.packingInstructionLabel}. Split the batteries across more packages, or ` +
            (classification.limits.cargoKg > limit
              ? 'offer the consignment as cargo aircraft only.'
              : 'seek the competent authority approval special provision A99 describes.'),
      passed: kg(weight) <= limit,
      expected: `≤ ${limit} kg`,
      actual: `${kg(weight)} kg`,
      refs: [pkg.id],
    })
  }

  // --- Combined contents -------------------------------------------------
  // Special provision A181 governs a package holding both packed-with and contained-in
  // batteries: the *total* mass is what the column limits apply to, and the package and the
  // shipping paper are both described as packed with equipment.
  const configurations = new Set(entries.map((e) => e.entry.spec.configuration))
  if (configurations.has('packed-with-equipment') && configurations.has('contained-in-equipment')) {
    const lowest = Math.min(
      ...[...groups.values()].map((g) => (usingPassenger ? (g.classification.limits.passengerKg ?? Infinity) : g.classification.limits.cargoKg)),
    )
    checks.push({
      id: `dg.a181.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: total mass under special provision A181`,
      detail:
        assessment.netWeightKg <= lowest
          ? `This package holds batteries both packed with and contained in equipment. Under special provision ` +
            `A181 the total mass of ${assessment.netWeightKg} kg is what the column limits apply to, and it is ` +
            `within ${lowest} kg. The package and the shipping paper must both describe it as *packed with ` +
            `equipment*.`
          : `This package holds batteries both packed with and contained in equipment. Under special provision ` +
            `A181 the limits apply to the total mass, which is ${assessment.netWeightKg} kg against ${lowest} kg.`,
      passed: assessment.netWeightKg <= lowest,
      expected: `≤ ${lowest} kg`,
      actual: `${assessment.netWeightKg} kg`,
      refs: [pkg.id],
    })
  }

  // --- Packaging ---------------------------------------------------------
  const needsUnSpec = entries.some((e) => e.classification.unSpecificationPackagingRequired)
  if (needsUnSpec) {
    checks.push({
      id: `dg.un-packaging.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: UN specification packaging`,
      detail: pkg.unSpecificationMark.trim()
        ? `Marked ${pkg.unSpecificationMark.trim()}. It must meet Packing Group II performance (special ` +
          'provision A802), and the manufacturer’s closure instructions must be followed and all supplied ' +
          'components used.'
        : 'This section requires UN specification packaging meeting Packing Group II performance. Enter the ' +
          'specification marking from the box — a strong outer packaging is not sufficient here.',
      passed: Boolean(pkg.unSpecificationMark.trim()),
      refs: [pkg.id],
    })
  } else {
    checks.push({
      id: `dg.packaging.${pkg.id}`,
      severity: 'info',
      title: `${label}: strong rigid outer packaging`,
      detail:
        'This section does not require UN specification packaging, but the package must still be a strong, ' +
        'rigid outer packaging' +
        (entries.some((e) => e.classification.dropTestRequired) ? ', capable of a 1.2 m drop test' : '') +
        (entries.some((e) => e.classification.stackTestRequired)
          ? ' and of a 3 m stack test held for 24 hours'
          : '') +
        '. The capability is a property of the design, so it is proved once per design, not per box.',
      passed: true,
      refs: [pkg.id],
    })
  }

  // --- Shared packaging on the declaration -------------------------------
  if (groups.size > 1 && assessment.declarationRequired) {
    checks.push({
      id: `dg.shared-packaging.${pkg.id}`,
      severity: 'warning',
      title: `${label}: more than one entry in one package`,
      detail:
        `This package holds ${groups.size} separate dangerous goods entries, so it produces ${groups.size} lines ` +
        'on the declaration. The number and type of packaging is stated against the first of them and the ' +
        'others carry the net quantity alone, which is what the generated declaration does. Confirm the ' +
        'wording against the packing instructions before it is signed — the training materials work only the ' +
        'one-entry-per-package case.',
      passed: false,
      refs: [pkg.id],
    })
  }

  // --- Battery mark exemption --------------------------------------------
  if (assessment.batteryMarkExemption) {
    checks.push({
      id: `dg.battery-mark.${pkg.id}`,
      severity: 'info',
      title: `${label}: battery mark not required`,
      detail: assessment.batteryMarkExemption,
      passed: true,
      refs: [pkg.id],
    })
  }

  return checks
}

/** Everything that is a property of the consignment as a whole. */
function consignmentChecks(
  consignment: DgConsignment,
  packages: PackageAssessment[],
  classifications: AirClassification[],
  requiredAircraft: AircraftLimitation,
  declarationRequired: boolean,
): CheckResult[] {
  const checks: CheckResult[] = []

  // --- Variations --------------------------------------------------------
  // Blocking, and cheap to satisfy. No published dataset of state and operator variations
  // travels with this application, so the only honest handling is to refuse to produce
  // anything until a person confirms they have read the ones that apply.
  const variationsConfirmed = consignment.stateVariationsChecked && consignment.operatorVariationsChecked
  checks.push({
    id: 'dg.variations',
    severity: 'blocking',
    title: 'State and operator variations checked',
    detail: variationsConfirmed
      ? `Confirmed for ${consignment.operator || 'the operating airline'} and for the states of origin, transit ` +
        'and destination.'
      : 'A state (IATA 2.8.1) or an operator (IATA 2.8.3) may impose requirements more restrictive than the ' +
        'DGR, and lithium batteries attract more of them than any other entry — UPS 5X-08 requires the ' +
        'packing instruction and section to be marked on Section II packages, and Saudi Arabia SAG-06 requires ' +
        'the consignee’s telephone number on every package. This application holds no variation data and cannot ' +
        'apply them. Read the ones that apply and confirm.',
    passed: variationsConfirmed,
  })

  // --- Aircraft ----------------------------------------------------------
  checks.push({
    id: 'dg.aircraft',
    severity: 'info',
    title: 'Aircraft limitation',
    detail:
      requiredAircraft === 'cargo-aircraft-only'
        ? 'The contents restrict this consignment to cargo aircraft only. The Cargo Aircraft Only label goes on ' +
          'the same surface as the Class 9 label, and the passenger aircraft box on the declaration is struck out.'
        : consignment.aircraft === 'cargo-aircraft-only'
          ? 'The contents would permit a passenger aircraft, and the consignment is being offered as cargo ' +
            'aircraft only. The lower passenger limits do not apply, and the Cargo Aircraft Only label is required.'
          : 'The contents permit carriage on passenger and cargo aircraft, within the 5 kg per package limit.',
    passed: true,
  })

  // --- Declaration fields ------------------------------------------------
  if (declarationRequired) {
    const missing = missingDeclarationFields(consignment)
    checks.push({
      id: 'dg.declaration-fields',
      severity: 'blocking',
      title: 'Shipper’s Declaration is complete',
      detail: missing.length
        ? `Still needed: ${missing.join(', ')}. Airport names are entered in full — a declaration does not take ` +
          'airport codes.'
        : 'Every box the shipper is responsible for has a value. The signature is left for a person; a ' +
          'typewritten signature is not acceptable.',
      passed: missing.length === 0,
    })

    checks.push({
      id: 'dg.emergency-contact',
      severity: 'warning',
      title: '24-hour emergency contact',
      detail:
        consignment.emergencyContactName.trim() && consignment.emergencyContactPhone.trim()
          ? `${consignment.emergencyContactName.trim()} on ${consignment.emergencyContactPhone.trim()}, in the ` +
            'additional handling information box.'
          : 'The handling information box carries the 24-hour emergency response telephone number, together ' +
            'with the registrant it belongs to. It is required for a shipment moving within or from the United ' +
            'States, and expected by most operators everywhere else.',
      passed: Boolean(consignment.emergencyContactName.trim() && consignment.emergencyContactPhone.trim()),
    })

    checks.push({
      id: 'dg.retention',
      severity: 'info',
      title: 'Keep a copy for 24 months',
      detail:
        'A copy of the Shipper’s Declaration must be retained for a minimum of two years and be accessible at ' +
        'the shipment location, on paper or electronically, on request. Generating the declaration here records ' +
        'the consignment on this machine; that record is not a substitute for the signed copy.',
      passed: true,
    })

    checks.push({
      id: 'dg.erg',
      severity: 'info',
      title: 'Attach the emergency response information',
      detail:
        'One copy of the ERG page for each declaration. The materials also recommend offering four to five ' +
        'complete, signed copies of the declaration itself; two is the minimum handed to the operator.',
      passed: true,
    })
  } else {
    checks.push({
      id: 'dg.declaration-fields',
      severity: 'info',
      title: 'No Shipper’s Declaration required',
      detail:
        'Every package in this consignment is prepared to Section II, which is excepted Class 9: no declaration, ' +
        'no airline dangerous goods handling fee, and adequate instruction rather than full dangerous goods ' +
        'training. The air waybill statement and the battery mark carry the whole of the hazard communication, ' +
        'so both have to be right.',
      passed: true,
    })
  }

  // --- Air waybill -------------------------------------------------------
  const statements = [...new Set(classifications.map(airWaybillStatement))]
  if (statements.length) {
    checks.push({
      id: 'dg.awb-statement',
      severity: 'info',
      title: 'Air waybill handling information',
      detail:
        statements.length === 1
          ? `The air waybill must carry: “${statements[0]}”.`
          : `The air waybill must carry each of: ${statements.map((s) => `“${s}”`).join('; ')}. Section II ` +
            'statements may be combined into one, provided the combined wording still identifies the battery ' +
            'types and packing instructions.',
      passed: true,
    })
  }

  // --- Mixed chemistry ---------------------------------------------------
  for (const assessment of packages) {
    const chemistries = new Set(assessment.entries.map((e) => e.entry.spec.chemistry))
    if (chemistries.has('lithium-ion') && chemistries.has('lithium-metal')) {
      checks.push({
        id: `dg.mixed-chemistry.${assessment.pkg.id}`,
        severity: 'info',
        title: `${assessment.pkg.packagingType || 'Package'}: lithium ion and lithium metal together`,
        detail:
          'A package may hold both, and each is declared under its own UN number. Note the separate case ' +
          'special provision A213 covers: a single *battery* built from both primary lithium metal cells and ' +
          'rechargeable lithium ion cells is assigned to UN3090 or UN3091, not to UN3480 or UN3481. Special ' +
          'provision A181 covers a package holding packed-with and contained-in batteries together.',
        passed: true,
        refs: [assessment.pkg.id],
      })
    }
  }

  // --- Overpacks ---------------------------------------------------------
  const used = consignment.overpacks.filter((o) =>
    consignment.packages.some((p) => p.overpackId === o.id),
  )
  if (used.length) {
    const unmarked = used.filter((o) => o.count > 1 && !o.marks.trim())
    checks.push({
      id: 'dg.overpack',
      severity: unmarked.length ? 'blocking' : 'info',
      title: 'Overpacks',
      detail: unmarked.length
        ? 'An overpack offered as one of several identical overpacks must carry its own identification mark, ' +
          'and that mark must appear on the declaration. Give each one a mark such as #A001.'
        : `${used.length} overpack${used.length === 1 ? '' : ' description'}${used.length === 1 ? '' : 's'} in ` +
          'use. The words “Overpack used” go on the declaration immediately after the entries for the packages ' +
          'inside it, and every mark and label required on those packages is reproduced on the outside of the ' +
          'overpack unless it stays visible through it.',
      passed: unmarked.length === 0,
    })
  }

  return checks
}

/**
 * Whether this package may travel without the lithium battery mark, and why.
 *
 * Only two exemptions exist, and the second one is a *consignment* rule wearing a package
 * rule's clothes: a box of two laptops is exempt only while the whole consignment is two
 * boxes or fewer. Add a third box and all three need marking, which is exactly the mistake
 * the exemption invites.
 */
function batteryMarkExemption(entries: EntryAssessment[], totalPackagesInConsignment: number): string | null {
  // The exemption is written against small batteries contained in equipment. A fully
  // regulated package carries the Class 9 label regardless, so there is nothing to exempt.
  const relevant = entries.filter(
    (e) => e.classification.section === 'II' && e.entry.spec.configuration === 'contained-in-equipment',
  )
  if (!relevant.length || relevant.length !== entries.length) return null

  if (relevant.every((e) => e.entry.buttonCellsInEquipment)) {
    return 'The package contains only button cells installed in equipment, including circuit boards, which are ' +
      'excepted from the battery mark.'
  }

  // Button cells installed in equipment do not count towards the four-cell/two-battery limit.
  const counted = relevant.filter((e) => !e.entry.buttonCellsInEquipment)
  if (counted.some((e) => e.entry.countPerPackage == null)) return null

  const cells = counted
    .filter((e) => e.entry.spec.form === 'cell')
    .reduce((sum, e) => sum + (e.entry.countPerPackage ?? 0), 0)
  const batteries = counted
    .filter((e) => e.entry.spec.form === 'battery')
    .reduce((sum, e) => sum + (e.entry.countPerPackage ?? 0), 0)

  if (cells <= 4 && batteries <= 2 && totalPackagesInConsignment <= 2) {
    return (
      `${batteries} batter${batteries === 1 ? 'y' : 'ies'} and ${cells} cell${cells === 1 ? '' : 's'} contained ` +
      `in equipment, in a consignment of ${totalPackagesInConsignment} package` +
      `${totalPackagesInConsignment === 1 ? '' : 's'} — no more than four cells or two batteries per package, and ` +
      'no more than two packages, so the battery mark is not required. Add a third package to the consignment ' +
      'and every package needs marking, including these.'
    )
  }
  return null
}

/** The marks and labels one package must actually carry. */
function packageHazardCommunication(
  entries: EntryAssessment[],
  aircraft: DgConsignment['aircraft'],
  exemption: string | null,
): string[] {
  const marks = new Set<string>()
  for (const { classification } of entries) {
    for (const mark of classification.hazardCommunication) {
      // The classification lists the Cargo Aircraft Only label only where the goods force it.
      // A shipper who *chooses* cargo aircraft only still has to apply it.
      if (mark.startsWith('Lithium battery mark') && exemption) continue
      marks.add(mark)
    }
  }
  if (aircraft === 'cargo-aircraft-only' && entries.some((e) => e.classification.fullyRegulated)) {
    marks.add('Cargo Aircraft Only label, on the same surface as the Class 9 label')
  }
  return [...marks]
}

/** Boxes the shipper is responsible for that are still empty. */
export function missingDeclarationFields(consignment: DgConsignment): string[] {
  const missing: string[] = []
  if (!consignment.shipper.name.trim()) missing.push('shipper name')
  if (!consignment.shipper.addressLines.filter((l) => l.trim()).length) missing.push('shipper address')
  if (!consignment.consignee.name.trim()) missing.push('consignee name')
  if (!consignment.consignee.addressLines.filter((l) => l.trim()).length) missing.push('consignee address')
  if (!consignment.airportOfDeparture.trim()) missing.push('airport of departure')
  if (!consignment.airportOfDestination.trim()) missing.push('airport of destination')
  if (!consignment.signerName.trim()) missing.push('name of signatory')
  if (!consignment.signerDate.trim()) missing.push('date')
  return missing
}
