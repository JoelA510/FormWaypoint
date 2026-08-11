/**
 * Assessing a prepared air consignment against the rules its contents attract.
 *
 * The classification module says what a battery *is*. This one says whether what has been
 * built around it is acceptable: whether the package is inside its net quantity limit, on an
 * aircraft type the goods may travel on, in packaging the section demands, with the marks
 * the consignment size leaves it needing, qualified by a test summary that covers the article
 * actually in the box.
 *
 * Everything comes back as `CheckResult`, the same type the CIPL reconciliation produces, so
 * the review screen renders both the same way and the generation gate is one rule in one
 * place: no blocking check may be failing.
 *
 * Three things this deliberately does not do:
 *
 *  - **It does not decide anything the shipper must decide.** Whether the batteries are
 *    sound, whether the test summary covers the assembled pack, whether the equipment is a
 *    vehicle, what the state of charge measured — these are answered by a person and checked
 *    here, never inferred from silence.
 *  - **It does not apply state or operator variations.** It says which ones to read, names
 *    the operating carrier if one has been resolved, and refuses to generate until someone
 *    confirms they have. An airline variation that forbids what the DGR allows is the most
 *    common reason a correctly prepared lithium shipment is turned away at the counter.
 *  - **It does not sign anything.** A typewritten signature is not acceptable, and the
 *    declaration certifies acts — packing, marking, labelling — that happened away from this
 *    screen.
 */
import type { CheckResult } from '../types'
import {
  airWaybillStatement,
  BATTERY_MARK_PREFIX,
  classifyForAir,
  CHEMISTRY_LABELS,
  energyThreshold,
  type AircraftLimitation,
  type AirClassification,
} from './lithium'
import {
  ARTICLE_LEVEL_PHRASES,
  PROHIBITED_CO_PACKED_CLASSES,
  type BatteryEntry,
  type DgConsignment,
  type DgPackage,
} from './types'

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
  /** The net quantity ceiling actually in force — the lower of the PI figure and the box's own. */
  effectiveLimitKg: number | null
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
    /** Gross weight across the whole consignment, where every package states one. */
    grossWeightKg: number | null
  }
}

/** Rounds a kilogram figure the way the rest of the app does, to three places. */
function kg(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * The mass above which special provision A99 is the only route by air.
 *
 * A99 permits a lithium or sodium ion battery or battery assembly to exceed **35 kg** on a
 * cargo aircraft when approved. It has nothing to say about a package that merely exceeds a
 * lower sectional limit — a 12 kg package of small standalone cells is over the 10 kg Section
 * IB ceiling and is not an A99 case, and pointing a shipper at a two-authority approval when
 * the answer is a second box costs months for nothing.
 */
const A99_THRESHOLD_KG = 35

/** A stable identity for "the same regulatory entry", for grouping DGD lines and limits. */
export function classificationKey(classification: AirClassification): string {
  return `${classification.unNumber}|${classification.properShippingName}|${classification.packingInstructionLabel}`
}

/**
 * A package's entries partitioned into regulatory entries, with the net battery weight of
 * each. This is the partition the per-entry quantity limits are measured against *and* the
 * partition the declaration prints one line per — one function, so the line the checks
 * validated is always the line that prints.
 */
export function groupByClassification(
  entries: EntryAssessment[],
): Map<string, { classification: AirClassification; weightKg: number }> {
  const groups = new Map<string, { classification: AirClassification; weightKg: number }>()
  for (const { entry, classification } of entries) {
    const key = classificationKey(classification)
    const group = groups.get(key)
    const weight = entry.netWeightKgPerPackage ?? 0
    if (group) group.weightKg += weight
    else groups.set(key, { classification, weightKg: weight })
  }
  return groups
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
  const usingPassenger = consignment.aircraft === 'passenger-and-cargo'

  for (const pkg of consignment.packages) {
    const entries: EntryAssessment[] = pkg.entries.map((entry) => ({
      entry,
      packageId: pkg.id,
      classification: classifyForAir(entry.spec, { prepareToSectionI: entry.prepareToSectionI }),
    }))
    for (const { classification } of entries) {
      const key = classificationKey(classification)
      if (!byKey.has(key)) byKey.set(key, classification)
    }

    const netWeightKg = kg(entries.reduce((sum, e) => sum + (e.entry.netWeightKgPerPackage ?? 0), 0))
    const exemption = batteryMarkExemption(entries, totalPackages)
    const instructionLimit = entries.length
      ? Math.min(
          ...entries.map((e) =>
            usingPassenger ? (e.classification.limits.passengerKg ?? Infinity) : e.classification.limits.cargoKg,
          ),
        )
      : Infinity

    packages.push({
      pkg,
      entries,
      netWeightKg,
      effectiveLimitKg: effectiveLimit(instructionLimit, pkg.packagingAuthorizationLimitKg),
      hazardCommunication: packageHazardCommunication(entries, consignment, pkg, exemption),
      batteryMarkExemption: exemption,
      declarationRequired: entries.some((e) => e.classification.declarationRequired),
    })
  }

  const classifications = [...byKey.values()]
  const declarationRequired = packages.some((p) => p.declarationRequired)
  const requiredAircraft: AircraftLimitation = classifications.some((c) => c.aircraft === 'cargo-aircraft-only')
    ? 'cargo-aircraft-only'
    : 'passenger-and-cargo'

  // Computed once and passed down: the checks tell the shipper what the air waybill must
  // carry, and the declaration notes and the bench checklist print the same strings. Two
  // copies of the expression is two things to keep in step, and the disagreement would be
  // silent.
  const airWaybillStatements = [
    ...new Set(classifications.map((c) => airWaybillStatement(c, consignment.aircraft))),
  ]

  checks.push(...structureChecks(consignment))
  for (const assessment of packages) {
    checks.push(...entryChecks(assessment))
    checks.push(...packageChecks(assessment, consignment))
  }
  checks.push(
    ...consignmentChecks(consignment, packages, airWaybillStatements, requiredAircraft, declarationRequired),
  )

  const grossStated = packages.every((p) => p.pkg.grossWeightKg != null)

  return {
    packages,
    classifications,
    requiredAircraft,
    declarationRequired,
    airWaybillStatements,
    checks,
    canGenerate: checks.length > 0 && checks.every((c) => c.severity !== 'blocking' || c.passed),
    totals: {
      packages: totalPackages,
      netWeightKg: kg(
        packages.reduce((sum, p) => sum + p.netWeightKg * packageCountInConsignment(p.pkg, consignment), 0),
      ),
      grossWeightKg: grossStated
        ? kg(
            packages.reduce(
              (sum, p) => sum + (p.pkg.grossWeightKg ?? 0) * packageCountInConsignment(p.pkg, consignment),
              0,
            ),
          )
        : null,
    },
  }
}

/**
 * The net quantity ceiling actually in force for a package.
 *
 * The packing instruction states the regulatory maximum; the tested design type states what
 * this box was proved to hold. Where the box's own authorization is lower it governs, because
 * a package filled to the regulatory figure in a container never tested for it is not a
 * compliant package — it is an untested one.
 */
function effectiveLimit(instructionLimitKg: number, authorizationLimitKg: number | null): number | null {
  const candidates = [instructionLimitKg, authorizationLimitKg ?? Infinity].filter((v) => Number.isFinite(v))
  return candidates.length ? Math.min(...candidates) : null
}

/** The consignment has to describe something before any of it can be checked. */
function structureChecks(consignment: DgConsignment): CheckResult[] {
  const entryCount = consignment.packages.reduce((sum, p) => sum + p.entries.length, 0)
  const empty = consignment.packages.filter((p) => p.count < 1)
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
    {
      id: 'dg.package-count',
      severity: 'blocking',
      title: 'Every package description covers at least one package',
      detail: empty.length
        ? `${empty.map((p) => p.packagingType || 'a package').join(', ')} — a count of zero would put “0 ` +
          'Fibreboard box x 7 kg” on the declaration and leave the batteries it describes out of the ' +
          'consignment total. Remove the description, or say how many there are.'
        : 'Each package description states how many identical packages it covers.',
      passed: empty.length === 0,
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
              'A154). There is no packing instruction that permits them. 49 CFR 173.185(f) provides a highway, ' +
              'rail or vessel path under specified packaging; air is closed. A battery that cannot be diagnosed ' +
              'counts as defective.'
            : entry.condition === 'for-recycling-or-disposal'
              ? 'Waste batteries sent for recycling or disposal are forbidden for transport by air without ' +
                'competent authority approval (special provision A183).'
              : 'Prototype and low production run cells and batteries are not of a proved type, so they are fully ' +
                'regulated whatever their watt-hour rating and have no Section II or Section IB pathway. By air ' +
                'they need the approvals special provision A88 describes — from the State of Origin *and* the ' +
                'State of the Operator — which this workflow does not produce. By US ground, 49 CFR 173.185(e) ' +
                'provides a route, on all of its own conditions, with the shipping paper carrying the notation ' +
                '“Transport in accordance with § 173.185(e).”',
      passed: entry.condition === 'sound',
      refs: [ref],
    })

    // --- Energy content --------------------------------------------------
    const threshold = energyThreshold(entry.spec)
    const stated = entry.spec.chemistry === 'lithium-metal' ? entry.spec.lithiumContentG : entry.spec.wattHours
    checks.push({
      id: `dg.energy.${ref}`,
      severity: 'blocking',
      title: `${name}: energy content stated`,
      detail:
        classification.band === 'unknown'
          ? `Every threshold in the packing instructions turns on this figure. Enter the ` +
            `${threshold.unit === 'Wh' ? 'watt-hour rating' : 'lithium content'} per ` +
            `${entry.spec.form}; a battery whose rating is unknown cannot be shown to be inside the ` +
            'Section II or Section IB relief, and nothing is assumed on its behalf. Take it from the datasheet ' +
            'or the test summary, not from a previous air waybill.'
          : `${stated} ${threshold.unit} per ${entry.spec.form}, against a ${threshold.limit} ${threshold.unit} ` +
            `threshold — ${classification.band === 'small' ? 'small' : 'large'} by air, ` +
            (classification.section
              ? `PI ${classification.packingInstructionLabel}.`
              : `PI ${classification.packingInstruction}.`),
      passed: classification.band !== 'unknown',
      refs: [ref],
    })

    // --- UN 38.3 qualification -------------------------------------------
    checks.push(testSummaryCheck(entry, ref, name))

    // --- Vehicle determination -------------------------------------------
    if (entry.spec.configuration !== 'standalone') {
      checks.push(vehicleCheck(entry, ref, name))
    }

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
          ? 'The rating is marked on the outside of the case, as the packing instruction requires of batteries ' +
            'manufactured after 31 December 2011.'
          : 'The watt-hour rating must be marked on the outside of the battery case. This is a general ' +
            'requirement of the packing instructions, not a package marking, so it cannot be satisfied by ' +
            'anything applied to the box.',
        passed: entry.wattHourMarkedOnCase,
        refs: [ref],
      })
    }

    // --- State of charge -------------------------------------------------
    checks.push(...stateOfChargeChecks(entry, classification, ref, name))

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

/**
 * Whether the available test summary covers the article actually being offered.
 *
 * The check the training materials put a note against and every recurring-failure list puts
 * near the top: a module-level summary held against an assembled multi-module pack reads as
 * qualification and is not one. A battery must be of a type proved to meet subsection 38.3
 * irrespective of whether the cells it is composed of are of a tested type, so the summary
 * has to name the assembled article.
 */
function testSummaryCheck(entry: BatteryEntry, ref: string, name: string): CheckResult {
  if (entry.buttonCellsInEquipment) {
    return {
      id: `dg.test-summary.${ref}`,
      severity: 'blocking',
      title: `${name}: UN 38.3 test summary covers this article`,
      detail:
        'Button cells installed in equipment, including circuit boards, are excepted from the requirement to ' +
        'make a test summary available.',
      passed: true,
      refs: [ref],
    }
  }

  const offered = ARTICLE_LEVEL_PHRASES[entry.articleLevel]
  if (entry.testSummaryScope == null) {
    return {
      id: `dg.test-summary.${ref}`,
      severity: 'blocking',
      title: `${name}: UN 38.3 test summary covers this article`,
      detail:
        `No test summary is recorded. Manufacturers and subsequent distributors must make one available for ` +
        `cells and batteries manufactured on or after 1 January 2008, and the classification rests on it. What ` +
        `is being offered is ${offered}, so the summary has to cover that.`,
      passed: false,
      refs: [ref],
    }
  }

  if (entry.testSummaryScope !== entry.articleLevel) {
    return {
      id: `dg.test-summary.${ref}`,
      severity: 'blocking',
      title: `${name}: UN 38.3 test summary covers this article`,
      detail:
        `The summary on file covers ${ARTICLE_LEVEL_PHRASES[entry.testSummaryScope]}; what is going in the box is ` +
        `${offered}. Coverage of the parts is not coverage of the whole — a battery must be of a type proved to ` +
        `meet the tests of the Manual of Tests and Criteria irrespective of whether the cells it is composed of ` +
        `are of a tested type. Obtain a summary for the assembled article, or the article is unqualified and air ` +
        `is closed to it under the ordinary entries.`,
      passed: false,
      expected: offered,
      actual: ARTICLE_LEVEL_PHRASES[entry.testSummaryScope],
      refs: [ref],
    }
  }

  if (!entry.testSummaryReference.trim()) {
    return {
      id: `dg.test-summary.${ref}`,
      severity: 'blocking',
      title: `${name}: UN 38.3 test summary covers this article`,
      detail:
        'The summary covers the right article but has no reference recorded. A summary nobody can retrieve is ' +
        'not one that has been made available; enter the report number or document reference.',
      passed: false,
      refs: [ref],
    }
  }

  return {
    id: `dg.test-summary.${ref}`,
    severity: 'blocking',
    title: `${name}: UN 38.3 test summary covers this article`,
    detail: `${entry.testSummaryReference.trim()} covers ${offered}, which is what is being offered.`,
    passed: true,
    refs: [ref],
  }
}

/**
 * Whether the equipment is a vehicle, which takes the consignment out of this workflow.
 *
 * Blocking on `not-determined` rather than assuming equipment. The training materials treat a
 * battery installed in a machine as UN3481 contained in equipment, and for an ordinary
 * appliance that is right; for a self-propelled apparatus designed to carry goods it may not
 * be, and a misdeclared UN number is a substantive rejection rather than a formatting one.
 */
function vehicleCheck(entry: BatteryEntry, ref: string, name: string): CheckResult {
  const passed = entry.vehicleDetermination === 'not-a-vehicle'
  return {
    id: `dg.vehicle.${ref}`,
    severity: 'blocking',
    title: `${name}: the equipment is not a vehicle`,
    detail:
      entry.vehicleDetermination === 'not-a-vehicle'
        ? 'Recorded as equipment rather than a vehicle, so the lithium battery entries apply.'
        : entry.vehicleDetermination === 'is-a-vehicle'
          ? 'A vehicle — a self-propelled apparatus designed to carry persons or goods — is a different entry ' +
            'entirely, and this workflow does not prepare it. By air it travels as UN3556 (lithium ion battery ' +
            'powered), UN3557 (lithium metal) or UN3558 (sodium ion), under special provision A185. Note that ' +
            'the United States has not adopted those entries into 49 CFR, where a battery-powered vehicle is ' +
            'still UN3171 — so the same machine has one identity by air and another by US ground.'
          : 'A vehicle is a self-propelled apparatus designed to carry one or more persons or goods. Published ' +
            'examples run well past road vehicles — wheelchairs, lawn tractors, agricultural and construction ' +
            'machinery — while the examples of equipment include lawnmowers and cleaning machines. A ' +
            'self-propelled machine that carries goods sits on that boundary, and the answer is a recorded ' +
            'determination by a qualified person, not something this application infers from a product name.',
    passed,
    refs: [ref],
  }
}

/**
 * State of charge, as measured evidence rather than an assertion.
 *
 * Two things are checked and they fail differently. The *basis* has to be the one the rule is
 * written against: 30% of rated capacity for standalone cells and for cells packed with
 * equipment, where a reading off an indicated-capacity gauge cannot satisfy it. The
 * *provenance* — method, date, who — is what makes the figure evidence at all.
 */
function stateOfChargeChecks(
  entry: BatteryEntry,
  classification: AirClassification,
  ref: string,
  name: string,
): CheckResult[] {
  const rule = classification.stateOfCharge
  if (!rule) return []
  const mandatory = rule.strength === 'must'
  const severity = mandatory ? 'blocking' : 'warning'
  const checks: CheckResult[] = []

  const value = entry.stateOfChargePercent
  if (value == null) {
    checks.push({
      id: `dg.soc.${ref}`,
      severity,
      title: `${name}: state of charge established`,
      detail:
        `${rule.detail} It has not been stated for these cells, so it cannot be shown to be inside the ` +
        `${rule.limitPercent}% limit. Measure it — never infer it from voltage, storage time, display bars, or ` +
        'the fact that a battery is new.',
      passed: false,
      refs: [ref],
    })
    return checks
  }

  const within = value <= rule.limitPercent
  checks.push({
    id: `dg.soc.${ref}`,
    severity,
    title: `${name}: state of charge within ${rule.limitPercent}%`,
    detail: within ? rule.detail : `${rule.detail} These cells are stated at ${value}%.`,
    passed: within,
    expected: `≤ ${rule.limitPercent}%`,
    actual: `${value}%`,
    refs: [ref],
  })

  // The indicated-capacity alternative belongs to batteries contained in equipment, and to
  // the vehicle entries. Applying it to a standalone or packed-with battery reads a 25% rule
  // onto a 30%-of-rated-capacity limit, which is the error this check exists to catch.
  const indicatedAllowed = classification.indicatedCapacityAlternative
  if (entry.stateOfChargeBasis === 'indicated-capacity' && !indicatedAllowed) {
    checks.push({
      id: `dg.soc-basis.${ref}`,
      severity: 'blocking',
      title: `${name}: state of charge measured against rated capacity`,
      detail:
        'The limit for this entry is 30% of *rated capacity*, and the alternative of an indicated battery ' +
        'capacity not exceeding 25% does not apply to it — that alternative belongs to batteries contained in ' +
        'equipment and to the vehicle entries. An indicated-capacity reading cannot demonstrate this limit; ' +
        'measure against rated capacity.',
      passed: false,
      expected: 'rated capacity',
      actual: 'indicated capacity',
      refs: [ref],
    })
  } else if (entry.stateOfChargeBasis == null) {
    checks.push({
      id: `dg.soc-basis.${ref}`,
      severity,
      title: `${name}: state of charge basis recorded`,
      detail:
        'A percentage without a basis does not say what it is a percentage of. Record whether it was measured ' +
        'against rated capacity, rated design capacity, or an indicated battery capacity — the three are not ' +
        'interchangeable and only one of them satisfies this entry.',
      passed: false,
      refs: [ref],
    })
  }

  const provenance = [
    [entry.stateOfChargeMethod, 'the measuring device or method'],
    [entry.stateOfChargeMeasuredAt, 'the date measured'],
    [entry.stateOfChargeMeasuredBy, 'who measured it'],
  ]
    .filter(([value]) => !value.trim())
    .map(([, label]) => label)

  checks.push({
    id: `dg.soc-evidence.${ref}`,
    severity,
    title: `${name}: state of charge is measured evidence`,
    detail: provenance.length
      ? `Still needed: ${provenance.join(', ')}. A state of charge that cannot be attributed to a measurement is ` +
        'an assertion, and it is the assertion rather than the number that fails when an inspector asks how it ' +
        'was arrived at.'
      : `Measured by ${entry.stateOfChargeMeasuredBy.trim()} on ${entry.stateOfChargeMeasuredAt.trim()} using ` +
        `${entry.stateOfChargeMethod.trim()}.`,
    passed: provenance.length === 0,
    refs: [ref],
  })

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
          'requested from the States concerned (special provisions A201 and A334). If the routing on offer is a ' +
          'passenger aircraft, it is the wrong routing.'
        : 'Standalone cells and batteries are cargo aircraft only, and the consignment is offered as such.',
      passed: !usingPassenger,
      refs: [pkg.id],
    })
  }

  // --- Net quantity per package ------------------------------------------
  // Grouped by regulatory entry, because that is what the limit is written against: two
  // different UN numbers in one box each get their own allowance.
  const groups = groupByClassification(entries)

  for (const [key, { classification, weightKg: weight }] of groups) {
    const instructionLimit = usingPassenger ? classification.limits.passengerKg : classification.limits.cargoKg
    // A forbidden aircraft type is reported by the check above; repeating it as a quantity
    // failure would say the same thing twice in different words.
    if (instructionLimit == null) continue
    // Computed rather than asserted: `instructionLimit` is known finite by the guard above,
    // so the minimum of the two is a number without anything having to claim it is one.
    const limit = Math.min(instructionLimit, pkg.packagingAuthorizationLimitKg ?? Infinity)
    const authorizationBinds = limit < instructionLimit
    checks.push({
      id: `dg.limit.${pkg.id}.${key}`,
      severity: 'blocking',
      title: `${label}: ${classification.unNumber} within the package limit`,
      detail:
        kg(weight) <= limit
          ? `${kg(weight)} kg of ${classification.unNumber} per package, against ${limit} kg` +
            (authorizationBinds
              ? ` — the packaging authorization's own ceiling, below the ${instructionLimit} kg the packing ` +
                'instruction allows.'
              : ` for PI ${classification.packingInstructionLabel} on ` +
                `${usingPassenger ? 'passenger and cargo aircraft' : 'cargo aircraft'}. ` +
                `Source: ${classification.limits.source}.`)
          : `${kg(weight)} kg of ${classification.unNumber} per package exceeds the ${limit} kg limit` +
            (authorizationBinds
              ? " imposed by this packaging's own authorization. A larger outer packaging is not the remedy — " +
                'split the batteries across more packages, or use a design type tested for the weight.'
              : ` for PI ${classification.packingInstructionLabel}. ` +
                (classification.section === 'II'
                  ? // Section II is a relief with conditions, and its 5 kg ceiling is one of
                    // them; the same goods over it are prepared to Section I of the same
                    // packing instruction. Named as the real alternative it is, with what it
                    // costs, rather than leaving "split it" as the only way out of a package
                    // the regulations do allow.
                    'Either split the batteries across more packages, or prepare this package to Section I of PI ' +
                    `${classification.packingInstruction}, where the cargo aircraft allowance is 35 kg. Section I ` +
                    'is not a paperwork switch: it means UN specification packaging, the Class 9 label, a ' +
                    'Shipper’s Declaration and full dangerous goods training. Record it against the battery entry ' +
                    'once it is true of the box.'
                  : classification.limits.cargoKg > limit
                    ? 'Split the batteries across more packages, or offer the consignment as cargo aircraft only.'
                    : kg(weight) > A99_THRESHOLD_KG
                      ? 'Split the batteries across more packages. The alternative is special provision A99, ' +
                        'which is not a paperwork step — see the A99 note below.'
                      : 'Split the batteries across more packages. This is below the 35 kg mark, so special ' +
                        'provision A99 is not an alternative here.')),
      passed: kg(weight) <= limit,
      expected: `≤ ${limit} kg`,
      actual: `${kg(weight)} kg`,
      refs: [pkg.id],
    })

    // A99 is reachable by any sufficiently heavy battery, qualified or not, and it is the
    // step people underestimate: two approvals, only one of which the shipper can obtain,
    // and carriers that refuse approved shipments outright. It is gated on the 35 kg the
    // provision actually names, not on merely being over the section's own ceiling.
    if (kg(weight) > A99_THRESHOLD_KG && !authorizationBinds && classification.limits.cargoKg <= limit) {
      checks.push({
        id: `dg.a99.${pkg.id}.${key}`,
        severity: 'warning',
        title: `${label}: over 35 kg means special provision A99`,
        detail:
          'A lithium or sodium ion battery or battery assembly may exceed 35 kg on a cargo aircraft when ' +
          'approved, under special provision A99 — and that approval is two approvals, from the appropriate ' +
          'authority of the State of Origin and from the authority of the State of the Operator. In the United ' +
          'States the first is a DOT special permit, which does not waive the operator’s separate need for the ' +
          'second, and the second is not something a shipper can obtain. Published operator variations also ' +
          'refuse carriage of batteries approved under A88 and A99 outright. Confirm a carrier will take the ' +
          'shipment before commissioning approval work, and price the alternatives — splitting into packages at ' +
          'or under the limit, or moving it by ocean or ground — first.',
        passed: false,
        refs: [pkg.id],
      })
    }
  }

  // --- Mixed regulation in one box ---------------------------------------
  // A package holding Section II batteries beside fully regulated ones has no honest
  // declaration: the Section II relief is a property of the *package*, and it does not
  // survive in one that must be prepared fully regulated — while listing a Section II
  // entry on the declaration would declare goods the declaration does not cover, and
  // omitting it would sign a paper that understates what is in the box. The training
  // materials do not work this case, so this workflow refuses it rather than guessing.
  const declared = entries.filter((e) => e.classification.declarationRequired)
  if (declared.length && declared.length < entries.length) {
    checks.push({
      id: `dg.mixed-regulation.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: Section II and fully regulated batteries in one package`,
      detail:
        'This package mixes fully regulated entries with Section II ones, and no declaration this workflow can ' +
        'produce describes it truthfully — the Section II relief does not survive in a fully regulated package, ' +
        'and a Section II entry does not belong on a Shipper’s Declaration. Split the Section II batteries into ' +
        'their own package.',
      passed: false,
      refs: [pkg.id],
    })
  }

  // --- Combined contents -------------------------------------------------
  // Special provision A181 governs a package holding both packed-with and contained-in
  // batteries: the *total* mass is what the column limits apply to, and the package and the
  // shipping paper are both described as packed with equipment.
  const configurations = new Set(entries.map((e) => e.entry.spec.configuration))
  if (configurations.has('packed-with-equipment') && configurations.has('contained-in-equipment')) {
    const lowest = assessment.effectiveLimitKg ?? Infinity
    checks.push({
      id: `dg.a181.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: total mass under special provision A181`,
      detail:
        assessment.netWeightKg <= lowest
          ? `This package holds batteries both packed with and contained in equipment. Under special provision ` +
            `A181 the total mass of ${assessment.netWeightKg} kg is what the column limits apply to, and it is ` +
            `within ${lowest} kg. The package and the shipping paper must both describe it as *packed with ` +
            `equipment*, and both rule sets apply — not the more permissive one.`
          : `This package holds batteries both packed with and contained in equipment. Under special provision ` +
            `A181 the limits apply to the total mass, which is ${assessment.netWeightKg} kg against ${lowest} kg.`,
      passed: assessment.netWeightKg <= lowest,
      expected: `≤ ${lowest} kg`,
      actual: `${assessment.netWeightKg} kg`,
      refs: [pkg.id],
    })
  }

  // --- Weights -----------------------------------------------------------
  checks.push(weightChecks(assessment))

  // --- Co-packing --------------------------------------------------------
  checks.push({
    id: `dg.co-pack.${pkg.id}`,
    severity: 'blocking',
    title: `${label}: nothing packed with it that may not be`,
    detail: pkg.coPackedWithProhibitedClass
      ? 'Cells and batteries must not be packed in the same outer packaging with ' +
        `${PROHIBITED_CO_PACKED_CLASSES.join(', ')}. Repack the other goods separately.`
      : `No ${PROHIBITED_CO_PACKED_CLASSES.length}-way conflict declared. The prohibited list is exactly: ` +
        `${PROHIBITED_CO_PACKED_CLASSES.join('; ')}. Division 1.4S is permitted, and Divisions 4.2, 4.3 and ` +
        '5.2, Class 8 and Division 2.2 do not appear in it.',
    passed: !pkg.coPackedWithProhibitedClass,
    refs: [pkg.id],
  })

  // --- Packaging ---------------------------------------------------------
  const needsUnSpec = entries.some((e) => e.classification.unSpecificationPackagingRequired)
  if (needsUnSpec) {
    checks.push({
      id: `dg.un-packaging.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: UN specification packaging`,
      detail: pkg.unSpecificationMark.trim()
        ? `Marked ${pkg.unSpecificationMark.trim()}. It must meet Packing Group II performance (special ` +
          'provision A802), and the manufacturer’s closure instructions must be followed exactly and every ' +
          'component supplied used — changing the tape, the closure sequence or a component can void the ' +
          'certification. Keep the instruction sheet with the packing record.'
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
        'This section does not require UN specification packaging — special provision A802 expressly excepts ' +
        'Section IB of PI 965 and PI 968 — but the package must still be a strong, rigid outer packaging' +
        (entries.some((e) => e.classification.dropTestRequired) ? ', capable of a 1.2 m drop test' : '') +
        (entries.some((e) => e.classification.stackTestRequired)
          ? ' and of a 3 m stack test held for 24 hours'
          : '') +
        '. The capability is a property of the design and may be demonstrated by testing, assessment or ' +
        'experience, so it is established once per design rather than per box.',
      passed: true,
      refs: [pkg.id],
    })
  }

  // --- Shared packaging on the declaration -------------------------------
  // Counted over the entries the declaration actually prints: Section II entries are
  // excluded from it, so counting them here would claim lines the paper does not have.
  const declaredGroups = [...groups.values()].filter((g) => g.classification.declarationRequired).length
  if (declaredGroups > 1) {
    checks.push({
      id: `dg.shared-packaging.${pkg.id}`,
      severity: 'warning',
      title: `${label}: more than one entry in one package`,
      detail:
        `This package holds ${declaredGroups} separate dangerous goods entries, so it produces ${declaredGroups} lines ` +
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

/**
 * The three weights, kept apart.
 *
 * Gross, equipment net and battery net are three measurements of the same parcel and they
 * will not match. Deriving any of them from the others — battery net from gross minus
 * equipment, most temptingly — is how a declaration ends up stating a quantity nobody
 * weighed. The only arithmetic done here is the sanity check that the parts are not heavier
 * than the whole.
 */
function weightChecks(assessment: PackageAssessment): CheckResult {
  const { pkg, netWeightKg } = assessment
  const label = `${pkg.count} × ${pkg.packagingType || 'package'}`
  const gross = pkg.grossWeightKg
  const equipment = pkg.equipmentNetWeightKg ?? 0

  if (gross == null) {
    return {
      id: `dg.weights.${pkg.id}`,
      severity: 'warning',
      title: `${label}: gross weight recorded`,
      detail:
        'The gross weight is not the dangerous goods net quantity and is not filed on the declaration, but it ' +
        'is what the forwarder’s air waybill weight has to be reconciled against before release. Recording it ' +
        'here is what makes that reconciliation possible; a shipment where the two were assumed to be one ' +
        'number has already had to be corrected after issuance.',
      passed: false,
      refs: [pkg.id],
    }
  }

  const contents = kg(netWeightKg + equipment)
  return {
    id: `dg.weights.${pkg.id}`,
    severity: 'blocking',
    title: `${label}: the three weights are consistent`,
    detail:
      contents <= gross
        ? `Gross ${gross} kg, equipment net ${kg(equipment)} kg, battery net ${netWeightKg} kg. Three separate ` +
          'measurements — the declaration files the battery net quantity, and the air waybill will carry ' +
          'something closer to the gross. They are not expected to match.'
        : `The batteries and equipment together come to ${contents} kg, which is more than the ${gross} kg gross ` +
          'weight of the package they are in. One of the three figures is wrong, and none of them may be ' +
          'derived from the others to make them agree.',
    passed: contents <= gross,
    expected: `≤ ${gross} kg`,
    actual: `${contents} kg`,
    refs: [pkg.id],
  }
}

/** Everything that is a property of the consignment as a whole. */
function consignmentChecks(
  consignment: DgConsignment,
  packages: PackageAssessment[],
  /** The statements `assess` computed, so the check and the assessment cannot disagree. */
  statements: string[],
  requiredAircraft: AircraftLimitation,
  declarationRequired: boolean,
): CheckResult[] {
  const checks: CheckResult[] = []

  // --- Operating carrier -------------------------------------------------
  // The forwarder books the space; the airline carries the box. Operator variations attach to
  // the second, and checking them against the first is a recorded way to be refused at the
  // counter with correct paperwork in hand.
  const carrier = consignment.operatingCarrier.trim()
  checks.push({
    id: 'dg.operating-carrier',
    severity: 'blocking',
    title: 'Operating carrier resolved',
    detail: carrier
      ? `${carrier}${consignment.operatingCarrierSource.trim() ? `, from ${consignment.operatingCarrierSource.trim()}` : ''}` +
        `${consignment.forwarder.trim() ? `, forwarded by ${consignment.forwarder.trim()}` : ''}.`
      : 'The airline whose aircraft this flies on is not the forwarder who booked it, and operator variations ' +
        'attach to the airline. Take it from the booking confirmation or the master air waybill. Many carriers ' +
        'refuse UN3480 Section IA outright or accept it only at designated dangerous goods stations, so this is ' +
        'a question to settle before booking rather than after.',
    passed: Boolean(carrier),
  })

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
      ? `Confirmed for ${carrier || 'the operating airline'} and for the states of origin, transit and ` +
        'destination.'
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
    // The Cargo Aircraft Only label marks goods that may not travel on a passenger
    // aircraft. It follows the declaration: a fully regulated package offered CAO has its
    // passenger box struck out and carries the label, while a Section II package has no
    // declaration and stays permitted on passenger aircraft, so labelling it would
    // misstate what is in the box. Both CAO branches therefore have to say *which*
    // packages — unqualified, "the CAO label goes on" labels the excepted ones too.
    detail: cargoOnlyLabelWording(
      requiredAircraft,
      consignment.aircraft,
      declarationRequired,
      packages.some((p) => !p.declarationRequired),
    ),
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
      title: 'Keep a copy for two years',
      detail:
        'A copy of the shipping paper, or an electronic image of it, must be retained for two years after the ' +
        'material is accepted by the initial carrier — three years for a hazardous waste — accessible at or ' +
        'through the principal place of business, and must include the date of acceptance, for which the airbill ' +
        'date may be used (49 CFR 172.201(e)). IATA states the same two-year minimum for the Declaration. A ' +
        'corporate retention schedule can extend that; it cannot shorten it. Generating the declaration here ' +
        'records the consignment on this machine, which is not a substitute for the signed copy.',
      passed: true,
    })

    checks.push({
      id: 'dg.erg',
      severity: 'info',
      title: 'Attach the emergency response information',
      detail:
        'One copy of the ERG page for each declaration. The materials also recommend offering four to five ' +
        'complete, signed copies of the declaration itself; two is the minimum handed to the operator. Send an ' +
        'electronic draft to the forwarder for review before printing and signing — it is cheaper than a ' +
        'resubmission cycle, and forwarder dangerous goods approval is a distinct step that has taken several ' +
        'business days.',
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
  if (statements.length) {
    checks.push({
      id: 'dg.awb-statement',
      severity: 'info',
      title: 'Air waybill handling information',
      detail:
        (statements.length === 1
          ? `The air waybill must carry: “${statements[0]}”.`
          : `The air waybill must carry each of: ${statements.map((s) => `“${s}”`).join('; ')}. Section II ` +
            'statements may be combined into one, provided the combined wording still identifies the battery ' +
            'types and packing instructions.') +
        (declarationRequired
          ? ' For a fully regulated consignment the wording “Dangerous Goods as per associated DGD” is equally ' +
            'accepted in place of “as per associated Shipper’s Declaration”, and “CAO” in place of “Cargo ' +
            'Aircraft Only”. An operator may require its own form of words; where it does, that governs.'
          : ''),
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
  checks.push(...overpackChecks(consignment))

  return checks
}

/**
 * What the aircraft-limitation check says about the Cargo Aircraft Only label.
 *
 * Split out because the wording turns on three independent facts — whether the goods force
 * cargo aircraft or the shipper chose it, whether anything needs a declaration, and whether
 * excepted packages are travelling alongside — and a nested conditional over all three,
 * inline in the check literal, was where the label's scope got lost.
 */
function cargoOnlyLabelWording(
  requiredAircraft: AircraftLimitation,
  offeredAircraft: AircraftLimitation,
  declarationRequired: boolean,
  hasExceptedPackages: boolean,
): string {
  if (requiredAircraft !== 'cargo-aircraft-only' && offeredAircraft !== 'cargo-aircraft-only') {
    return 'The contents permit carriage on passenger and cargo aircraft, within the 5 kg per package limit.'
  }

  const opening =
    requiredAircraft === 'cargo-aircraft-only'
      ? 'The contents restrict this consignment to cargo aircraft only. '
      : 'The contents would permit a passenger aircraft, and the consignment is being offered as cargo ' +
        'aircraft only. '

  if (!declarationRequired) {
    return (
      opening +
      'These excepted Section II packages remain permitted on passenger aircraft, so the Cargo Aircraft Only ' +
      'label is not applied — the routing is a booking choice, not a property of the goods.'
    )
  }

  return (
    opening +
    'The passenger aircraft box on the declaration is struck out, and the Cargo Aircraft Only label goes on the ' +
    'same surface as the Class 9 label' +
    (hasExceptedPackages
      ? ' — on the fully regulated packages only. The Section II packages in this consignment carry no Class 9 ' +
        'label and no Cargo Aircraft Only label; they remain permitted on passenger aircraft whatever routing ' +
        'the consignment takes.'
      : '.')
  )
}

/**
 * Overpacks, which are where these consignments have most often had to be corrected.
 *
 * Three separate things have to line up and each has failed on its own: the identifier has to
 * exist and be the same on the box and on the declaration, the marks and labels of the
 * packages inside have to be visible or reproduced, and the word OVERPACK has to be on the
 * outside. None of them is a formatting concern.
 */
function overpackChecks(consignment: DgConsignment): CheckResult[] {
  const used = consignment.overpacks.filter((o) => consignment.packages.some((p) => p.overpackId === o.id))
  if (!used.length) return []

  const checks: CheckResult[] = []
  const unmarked = used.filter((o) => !o.marks.trim())

  checks.push({
    id: 'dg.overpack-identifier',
    severity: 'blocking',
    title: 'Every overpack carries an identification mark',
    detail: unmarked.length
      ? 'Each overpack needs its own identifier — #A001, #A002 — marked on the physical overpack and repeated ' +
        'identically in the declaration entry, with the battery net quantity assigned to that identifier. ' +
        'Identifiers that do not match between the box and the paper is the single most frequent cause of a ' +
        'correction cycle on these shipments.'
      : `${used.length} overpack description${used.length === 1 ? '' : 's'}, each identified. The identifier on ` +
        'the box and the identifier on the declaration must read the same.',
    passed: unmarked.length === 0,
  })

  const notVisible = used.filter((o) => !o.innerMarksVisible)
  checks.push({
    id: 'dg.overpack-marks',
    severity: 'info',
    title: 'Overpack marking',
    detail:
      'The word OVERPACK, at least 12 mm high, goes on the outside' +
      (used.some((o) => o.count > 1) ? ', with the count where there is more than one' : '') +
      '. ' +
      (notVisible.length
        ? 'Every mark and label required on the packages inside — the lithium battery mark, the Class 9 label, ' +
          'the Cargo Aircraft Only label, the UN number and proper shipping name — must be reproduced on the ' +
          'exterior, because they are not visible through it.'
        : 'The marks and labels on the packages inside stay visible through it, so they need not be reproduced.') +
      ' An overpack does not create a larger allowance: the per-package limits still bind inside it, and there ' +
      'is no weight limit on the overpack itself.',
    passed: true,
  })

  const conflicted = used.filter((o) => o.coPackedWithProhibitedClass)
  checks.push({
    id: 'dg.overpack-co-pack',
    severity: 'blocking',
    title: 'Nothing in the overpack that may not travel with lithium',
    detail: conflicted.length
      ? 'Packages containing cells or batteries must not be placed in an overpack with packages containing ' +
        `${PROHIBITED_CO_PACKED_CLASSES.join(', ')}. The prohibition applies to the overpack exactly as it ` +
        'applies to the outer packaging.'
      : 'No prohibited packages declared in the overpack. The same list applies here as to the package itself.',
    passed: conflicted.length === 0,
  })

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
    return (
      'The package contains only button cells installed in equipment, including circuit boards, which are ' +
      'excepted from the battery mark.'
    )
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
  consignment: DgConsignment,
  pkg: DgPackage,
  exemption: string | null,
): string[] {
  const marks = new Set<string>()
  for (const { classification } of entries) {
    for (const mark of classification.hazardCommunication) {
      // The classification lists the Cargo Aircraft Only label only where the goods force it.
      // A shipper who *chooses* cargo aircraft only still has to apply it.
      if (mark.startsWith(BATTERY_MARK_PREFIX) && exemption) continue
      marks.add(mark)
    }
  }
  if (consignment.aircraft === 'cargo-aircraft-only' && entries.some((e) => e.classification.fullyRegulated)) {
    marks.add('Cargo Aircraft Only label, on the same surface as the Class 9 label')
  }
  const overpack = pkg.overpackId ? consignment.overpacks.find((o) => o.id === pkg.overpackId) : null
  if (overpack) {
    marks.add('The word OVERPACK on the outside of the overpack, at least 12 mm high')
    if (overpack.marks.trim()) marks.add(`Overpack identification mark (${overpack.marks.trim()})`)
    if (!overpack.innerMarksVisible) {
      marks.add('Every mark and label above reproduced on the outside of the overpack')
    }
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
