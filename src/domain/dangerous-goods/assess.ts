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
  bandDeterminesTreatment,
  energyThreshold,
  INDICATED_CAPACITY_LIMIT,
  type AircraftLimitation,
  type AirClassification,
} from './lithium'
import {
  ARTICLE_LEVEL_PHRASES,
  PROHIBITED_CO_PACKED_CLASSES,
  type BatteryEntry,
  type DgConsignment,
  type DgPackage,
  type StateOfChargeBasis,
} from './types'

/** The three bases named as they are on screen, so a failing check quotes what was picked. */
const SOC_BASIS_NAMES: Record<StateOfChargeBasis, string> = {
  'rated-capacity': 'rated capacity',
  'rated-design-capacity': 'rated design capacity',
  'indicated-capacity': 'indicated capacity',
}

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
 * Special provision A181, applied to the entries a package puts on the declaration.
 *
 * A package holding batteries both packed with equipment and contained in equipment *is*
 * described as packed with equipment — the package and the shipping paper alike, which is
 * what the `dg.a181` check tells the shipper. Printing the contained-in entry as its own
 * line contradicted that in the one place it is read: two entries on the paper, one of
 * them naming a description the provision says does not apply to this package.
 *
 * Only the description changes. The batteries are the same batteries and their mass is the
 * same mass — it lands on the packed-with line, which is where A181 puts the total.
 *
 * It lives beside the checks rather than beside the renderer because both need it and they
 * must not disagree: the shared-packaging warning counts the lines the declaration prints,
 * and counting them before this ran claimed a second line the paper does not have.
 */
export function applyA181(entries: EntryAssessment[]): EntryAssessment[] {
  // Matched per UN number, not once for the package. A box holding UN3481 packed with
  // equipment beside UN3091 in both configurations has two provisions to apply, and
  // resolving a single target relabelled the lithium ion entry and left the lithium metal
  // one printing the description A181 says does not apply to it.
  const packedWithByUn = new Map<string, EntryAssessment>()
  for (const e of entries) {
    if (e.entry.spec.configuration === 'packed-with-equipment' && !packedWithByUn.has(e.classification.unNumber)) {
      packedWithByUn.set(e.classification.unNumber, e)
    }
  }
  if (!packedWithByUn.size) return entries

  return entries.map((e) => {
    if (e.entry.spec.configuration !== 'contained-in-equipment') return e
    const packedWith = packedWithByUn.get(e.classification.unNumber)
    if (!packedWith) return e
    // Never onto a laxer classification. A181 changes a description, not a regulatory
    // treatment, and relabelling a fully regulated contained-in entry with a Section II
    // packed-with one took the Class 9 label and the UN and proper shipping name mark off
    // the marks list for a box that needs them. `dg.mixed-regulation` refuses such a
    // package — but the marks are read while it is being packed, before anyone has reached
    // the checks.
    if (e.classification.fullyRegulated && !packedWith.classification.fullyRegulated) return e
    return { ...e, classification: packedWith.classification }
  })
}

/**
 * The UN numbers in a package that A181 speaks about, with the entries it gathers under
 * each: the ones held both packed with and contained in equipment.
 *
 * Per UN number, because that is the scope of the provision. A box holding UN3481 in both
 * configurations beside a standalone UN3480 line has one A181 total, and the standalone
 * line is no part of it — summing the whole package failed consignments that comply.
 */
function a181Groups(entries: EntryAssessment[]): Map<string, EntryAssessment[]> {
  const byUn = new Map<string, EntryAssessment[]>()
  for (const e of entries) {
    const configuration = e.entry.spec.configuration
    if (configuration !== 'packed-with-equipment' && configuration !== 'contained-in-equipment') continue
    const group = byUn.get(e.classification.unNumber)
    if (group) group.push(e)
    else byUn.set(e.classification.unNumber, [e])
  }
  for (const [un, group] of byUn) {
    const both =
      group.some((e) => e.entry.spec.configuration === 'packed-with-equipment') &&
      group.some((e) => e.entry.spec.configuration === 'contained-in-equipment')
    if (!both) byUn.delete(un)
  }
  return byUn
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
  // No overpack is a multiplier of one. An overpack whose count is *zero* is not: the panel
  // stores zero for a cleared box so `dg.overpack-count` can refuse it, and flooring it back
  // to one undid that here — four packages read as two, and the two-package battery mark
  // exemption came off the marks list at the packing bench, above the checks that refuse it.
  const multiplier = overpack ? Math.max(0, overpack.count) : 1
  return Math.max(0, pkg.count) * multiplier
}

/**
 * How a package description is named in a check title.
 *
 * The consignment total, not the per-overpack count. The declaration line, the checklist
 * heading and the consignment totals all state the product of the package count and its
 * overpack count; a check title reading "2 × Fibreboard box" beside a declaration reading
 * "6 Fibreboard box" — both reproduced in the same checklist — reads as two different
 * packages rather than one described twice.
 */
function packageLabel(pkg: DgPackage, consignment: DgConsignment): string {
  return `${packageCountInConsignment(pkg, consignment)} × ${pkg.packagingType || 'package'}`
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
      classification: classifyForAir(entry.spec, { prepareToSectionI: entry.prepareToSectionI }),
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
      // Through `applyA181`, like the declaration, the checklist and the shared-packaging
      // count. The marks go on the box, and a box holding one UN number both packed with
      // and contained in equipment carries the packed-with name — which is what `dg.a181`
      // instructs and what the declaration prints. Built from the raw entries, this list
      // asked for both proper shipping names on the same package.
      hazardCommunication: packageHazardCommunication(applyA181(entries), consignment, pkg, exemption),
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

/** The consignment has to describe something before any of it can be checked. */
function structureChecks(consignment: DgConsignment): CheckResult[] {
  const entryCount = consignment.packages.reduce((sum, p) => sum + p.entries.length, 0)
  // Whole packages only. The number input has no step, and "1.5 Fibreboard box x 1 kg" is
  // not a consignment anyone can present at a counter.
  const empty = consignment.packages.filter((p) => !Number.isInteger(p.count) || p.count < 1)
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
        ? `${empty.map((p) => p.packagingType || 'a package').join(', ')} — a count that is not a whole number ` +
          'of packages would put “0 Fibreboard box x 7 kg”, or half a box, on the declaration and put the ' +
          'batteries it describes wrongly into the consignment total. Remove the description, or say how many ' +
          'there are.'
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
    // Blocking only where the figure decides something. A standalone sodium ion battery is
    // classified identically with and without a rating — PI 976 has no sections and one
    // limit — so refusing to generate for want of it stopped a consignment on a field that
    // could not change the answer, under a message citing reliefs PI 976 does not have.
    const bandMatters = bandDeterminesTreatment(entry.spec)
    const unrated = classification.band === 'unknown'
    checks.push({
      id: `dg.energy.${ref}`,
      severity: bandMatters ? 'blocking' : 'info',
      title: `${name}: energy content stated`,
      detail: !unrated
        ? `${stated} ${threshold.unit} per ${entry.spec.form}, against a ${threshold.limit} ${threshold.unit} ` +
          `threshold — ${classification.band === 'small' ? 'small' : 'large'} by air, ` +
          (classification.section
            ? `PI ${classification.packingInstructionLabel}.`
            : `PI ${classification.packingInstruction}.`)
        : bandMatters
          ? `Every threshold in the packing instructions turns on this figure. Enter the ` +
            `${threshold.unit === 'Wh' ? 'watt-hour rating' : 'lithium content'} per ` +
            `${entry.spec.form}; a battery whose rating is unknown cannot be shown to be inside the ` +
            'Section II or Section IB relief, and nothing is assumed on its behalf. Take it from the datasheet ' +
            'or the test summary, not from a previous air waybill.'
          : `PI ${classification.packingInstruction} has no sections and one quantity limit, so these cells are ` +
            'fully regulated at the same limit whatever their rating and nothing here waits on the figure. ' +
            'Record it anyway: the datasheet value belongs in the file, and an operator or a state variation ' +
            'may ask for it.',
      passed: !unrated || !bandMatters,
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
        // Zero is refused alongside blank. It is not a lighter package: it is the net
        // quantity box of the declaration reading "1 Fibreboard box x 0 kg", and every
        // limit in the assessment measured against a weight that describes no batteries.
        entry.netWeightKgPerPackage == null || entry.netWeightKgPerPackage <= 0
          ? 'Enter the net weight of the cells or batteries of this type in one package. This is the weight of ' +
            'the batteries themselves — not the equipment they are packed with or installed in, and not the ' +
            'gross weight of the package, which is what the packing instruction limits are measured against.'
          : `${entry.netWeightKgPerPackage} kg of batteries per package.`,
      passed: entry.netWeightKgPerPackage != null && entry.netWeightKgPerPackage > 0,
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
  // The exception is written against button cells *installed in equipment* — the phrase is
  // the whole of it. A loose button cell is an ordinary standalone cell and needs its
  // summary like any other; reading the flag without the configuration let a UN3480
  // consignment generate with nothing on file at all. `batteryMarkExemption`, the other
  // rule keyed on this flag, has always required the configuration.
  if (entry.buttonCellsInEquipment && entry.spec.configuration === 'contained-in-equipment') {
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

  // The indicated-capacity alternative belongs to batteries contained in equipment, and to
  // the vehicle entries. Applying it to a standalone or packed-with battery reads a 25% rule
  // onto a 30%-of-rated-capacity limit, which is the error this check exists to catch.
  const indicatedAllowed = classification.indicatedCapacityAlternative
  const onIndicated = entry.stateOfChargeBasis === 'indicated-capacity'
  // Measured against the alternative, checked against the alternative. It is a different
  // number as well as a different basis — 30% of rated capacity *or* an indicated capacity
  // of 25% — and holding an indicated reading to the 30% figure passed cells at 28% that
  // the basis they were measured on caps five points lower.
  const limitPercent = onIndicated && indicatedAllowed ? INDICATED_CAPACITY_LIMIT : rule.limitPercent

  const value = entry.stateOfChargePercent
  if (value == null) {
    checks.push({
      id: `dg.soc.${ref}`,
      severity,
      title: `${name}: state of charge established`,
      detail:
        `${rule.detail} It has not been stated for these cells, so it cannot be shown to be inside the ` +
        `${limitPercent}% limit. Measure it — never infer it from voltage, storage time, display bars, or ` +
        'the fact that a battery is new.',
      passed: false,
      refs: [ref],
    })
    return checks
  }

  const within = value <= limitPercent
  checks.push({
    id: `dg.soc.${ref}`,
    severity,
    title: `${name}: state of charge within ${limitPercent}%`,
    detail: within ? rule.detail : `${rule.detail} These cells are stated at ${value}%.`,
    passed: within,
    expected: `≤ ${limitPercent}%`,
    actual: `${value}%`,
    refs: [ref],
  })

  // Rated *design* capacity is not the basis any of these rules is written against either:
  // it belongs to the vehicle entries. Checking only for the indicated-capacity case let it
  // through in silence, under a check whose own text says one basis satisfies the entry.
  const basisAccepted = entry.stateOfChargeBasis === 'rated-capacity' || (onIndicated && indicatedAllowed)
  if (entry.stateOfChargeBasis == null) {
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
  } else if (!basisAccepted) {
    checks.push({
      id: `dg.soc-basis.${ref}`,
      // The rule's own strength, like the missing-basis branch beside it. Hardcoding this
      // blocking made a recorded-but-wrong basis harder to clear than no basis at all:
      // picking the wrong item from the dropdown stopped an advisory entry generating,
      // while clearing it back to "not recorded" — strictly less information — did not.
      severity,
      title: `${name}: state of charge measured against rated capacity`,
      detail:
        `The limit for this entry is ${rule.limitPercent}% of *rated capacity*` +
        (indicatedAllowed
          ? `, or an indicated battery capacity not exceeding ${INDICATED_CAPACITY_LIMIT}%. A rated *design* ` +
            'capacity is neither of them — that basis belongs to the vehicle entries.'
          : ', and the alternative of an indicated battery capacity not exceeding ' +
            `${INDICATED_CAPACITY_LIMIT}% does not apply to it — that alternative belongs to batteries ` +
            'contained in equipment and to the vehicle entries. Neither an indicated-capacity nor a rated ' +
            'design capacity reading can demonstrate this limit.') +
        ' Measure against rated capacity.',
      passed: false,
      expected: indicatedAllowed ? 'rated capacity, or indicated capacity' : 'rated capacity',
      actual: SOC_BASIS_NAMES[entry.stateOfChargeBasis],
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
  const label = packageLabel(pkg, consignment)
  const usingPassenger = consignment.aircraft === 'passenger-and-cargo'

  // --- Aircraft type -----------------------------------------------------
  const forbiddenOnPassenger = entries.filter((e) => e.classification.aircraft === 'cargo-aircraft-only')
  const passengerProvisions = [
    ...new Set(
      forbiddenOnPassenger.map((e) => (e.entry.spec.chemistry === 'lithium-metal' ? 'A201' : 'A334')),
    ),
  ].sort()
  if (forbiddenOnPassenger.length) {
    checks.push({
      id: `dg.aircraft.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: aircraft type`,
      // Naming the provisions these entries actually carry, not both of them. A201 belongs
      // to lithium metal and A334 to lithium ion and sodium ion, and citing the pair
      // pointed a UN3480 consignment at the lithium metal provision — the same mismatch
      // between a check and an entry's own list that A802 was corrected for.
      detail: usingPassenger
        ? `${forbiddenOnPassenger.map((e) => e.classification.unNumber).join(', ')} may not be carried as cargo ` +
          'on a passenger aircraft. Offer the consignment as cargo aircraft only, or an exemption has to be ' +
          `requested from the States concerned (special provision${passengerProvisions.length === 1 ? '' : 's'} ` +
          `${passengerProvisions.join(' and ')}). If the routing on offer is a passenger aircraft, it is the ` +
          'wrong routing.'
        : 'Standalone cells and batteries are cargo aircraft only, and the consignment is offered as such.',
      passed: !usingPassenger,
      refs: [pkg.id],
    })
  }

  // --- Net quantity per package ------------------------------------------
  // Grouped by regulatory entry, because that is what the limit is written against: two
  // different UN numbers in one box each get their own allowance.
  //
  // Through `applyA181` first, like the declaration, the checklist, the marks list and the
  // shared-packaging count. Left on the raw entries, this was the last reader still
  // partitioning a package differently from the paper it produces: a box holding one UN
  // number both packed with and contained in equipment showed two quantity rows passing at
  // 3 kg each while the declaration printed one line of 6 kg.
  const merged = applyA181(entries)
  const groups = groupByClassification(merged)
  const mergedByEntry = new Map(merged.map((e) => [e.entry.id, e.classification]))

  for (const [key, { classification, weightKg: weight }] of groups) {
    const instructionLimit = usingPassenger ? classification.limits.passengerKg : classification.limits.cargoKg
    // A forbidden aircraft type is reported by the check above; repeating it as a quantity
    // failure would say the same thing twice in different words.
    if (instructionLimit == null) continue
    // Computed rather than asserted: `instructionLimit` is known finite by the guard above,
    // so the minimum of the two is a number without anything having to claim it is one.
    const limit = Math.min(instructionLimit, pkg.packagingAuthorizationLimitKg ?? Infinity)
    const authorizationBinds = limit < instructionLimit
    // Whether the A99 note below will actually be raised. Computed here so the remedy text
    // can point at it only when it exists: A99 relieves the 35 kg cargo aircraft maximum,
    // so an entry that does not carry that allowance — a Section IB or Section II package,
    // or anything on a passenger booking — gets no note, and must not be sent looking for
    // one.
    const a99Applies =
      kg(weight) > A99_THRESHOLD_KG &&
      !authorizationBinds &&
      !usingPassenger &&
      classification.limits.cargoKg >= A99_THRESHOLD_KG
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
                    // costs — but only where it would actually help. Section I relieves
                    // nothing on a passenger aircraft (5 kg either way), and above 35 kg it
                    // does not fit either, so in both cases splitting is the only answer and
                    // offering Section I would send someone to do UN-specification packaging
                    // work for a package that still will not go.
                    // Over 35 kg is decided first: no route this branch could offer — not
                    // Section I, not a change of aircraft — reaches it, so a remedy naming
                    // a 35 kg allowance would be wrong on a passenger booking too.
                    (kg(weight) > A99_THRESHOLD_KG
                      ? 'Split the batteries across more packages. Section I of the same packing instruction ' +
                        'allows 35 kg on a cargo aircraft, which this package is over as well' +
                        (a99Applies
                          ? '; beyond that is special provision A99, which is not a paperwork step — see the A99 ' +
                            'note below.'
                          : '. Beyond 35 kg on a cargo aircraft the only route is special provision A99, which ' +
                            'takes approval from two authorities.')
                      : usingPassenger
                        ? 'Split the batteries across more packages. Section I would not help here: its passenger ' +
                          'aircraft allowance is the same 5 kg. Offering the consignment as cargo aircraft only ' +
                          'and preparing this package to Section I would raise it to 35 kg.'
                        : 'Either split the batteries across more packages, or prepare this package to Section I ' +
                          `of PI ${classification.packingInstruction}, where the cargo aircraft allowance is ` +
                          '35 kg. Section I is not a paperwork switch: it means UN specification packaging, the ' +
                          'Class 9 label, a Shipper’s Declaration and full dangerous goods training. Record it ' +
                          'against the battery entry once it is true of the box.')
                  : classification.limits.cargoKg > limit
                    ? 'Split the batteries across more packages, or offer the consignment as cargo aircraft only.'
                    : kg(weight) > A99_THRESHOLD_KG
                      ? a99Applies
                        ? 'Split the batteries across more packages. The alternative is special provision A99, ' +
                          'which is not a paperwork step — see the A99 note below.'
                        : 'Split the batteries across more packages. Special provision A99 relieves the 35 kg ' +
                          'cargo aircraft maximum, not this entry’s own lower ceiling, so it is not an ' +
                          'alternative here.'
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
    // provision actually names, not on merely being over the section's own ceiling — and
    // on the entry already carrying the full 35 kg cargo allowance. A99 relieves the cargo
    // aircraft maximum; raising it for a Section II package (5 kg either way) or on a
    // passenger booking would point at an approval that does not apply, when the answer is
    // Section I or a cargo aircraft first.
    if (a99Applies) {
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
  // Judged on entries whose energy band is known. An entry with no rating is
  // conservatively fully regulated, and counting it here would report a packing conflict
  // when the real defect is the unentered watt-hour figure — which `dg.energy` is already
  // blocking on, in the words that fix it.
  //
  // Keyed on the band rather than on `section`, because a null section does not mean
  // "undetermined": PI 976 has no sections at all, and every standalone sodium ion battery
  // under it is fully regulated. Excluding those would let one share a package with
  // Section II goods and produce a declaration that omits half the box.
  //
  // Which is why an unstated rating is not enough to exclude one either. A standalone
  // sodium ion battery is classified the same with a rating and without, so `dg.energy`
  // does not block it — and dropping it here on the missing figure alone reopened exactly
  // the hole this filter's second sentence describes.
  const classified = entries.filter(
    (e) => e.classification.band !== 'unknown' || !bandDeterminesTreatment(e.entry.spec),
  )
  const declared = classified.filter((e) => e.classification.declarationRequired)
  if (declared.length && declared.length < classified.length) {
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

  // --- The packaging's own ceiling ---------------------------------------
  // The instruction limits above are per regulatory entry — two UN numbers in one box each
  // get their own allowance — but a tested design type holds what it was proved to hold,
  // whatever is inside it. Applied per entry only, a box authorized for 6 kg passes twice
  // at 5 kg apiece and travels with 10 kg in it.
  const authorization = pkg.packagingAuthorizationLimitKg
  if (authorization != null && entries.length) {
    const within = assessment.netWeightKg <= authorization
    checks.push({
      id: `dg.package-authorization.${pkg.id}`,
      severity: 'blocking',
      title: `${label}: total net weight within the packaging’s authorization`,
      detail: within
        ? `${assessment.netWeightKg} kg of batteries in a package authorized for ${authorization} kg. The ` +
          'per-entry allowances above are regulatory maxima; this is what this design type was tested to hold.'
        : `${assessment.netWeightKg} kg of batteries in a package authorized for ${authorization} kg. Each entry ` +
          'may be inside its own allowance and the package still over its tested weight — the design type ' +
          'holds what it was proved to hold, whatever the mix inside it.',
      passed: within,
      expected: `≤ ${authorization} kg`,
      actual: `${assessment.netWeightKg} kg`,
      refs: [pkg.id],
    })
  }

  // --- Combined contents -------------------------------------------------
  // Special provision A181 governs a package holding both packed-with and contained-in
  // batteries: the *total* mass is what the column limits apply to, and the package and the
  // shipping paper are both described as packed with equipment.
  // Not raised for a package already held for mixing Section II with fully regulated
  // goods. A181 says how a permissible package of both configurations is described; saying
  // it about a package the previous check is refusing gives two blocking instructions that
  // point opposite ways — describe it as packed with equipment, and take it apart.
  const mixesRegulation = declared.length > 0 && declared.length < classified.length
  if (!mixesRegulation) {
    // Over every entry, not just the classified ones, because `applyA181` merges every
    // entry: an unrated contained-in line is folded into its packed-with neighbour on the
    // declaration, the checklist and the shared-packaging count, and filtering it out here
    // left that merged mass measured against nothing. `dg.energy` blocks the shipment
    // either way, but the preview and the check list must not describe different packages.
    for (const [unNumber, combined] of a181Groups(entries)) {
      // Raised only where the merge did not happen — `applyA181` declines to relabel a
      // fully regulated entry onto a Section II one, and that is the case A181's total has
      // to be stated for. Where it did merge, `dg.limit` above measures the same mass
      // against the same ceiling, and saying it again in other words is noise.
      const packedWith = combined.find((e) => e.entry.spec.configuration === 'packed-with-equipment')
      const allMerged =
        packedWith != null &&
        combined
          .filter((e) => e.entry.spec.configuration === 'contained-in-equipment')
          .every(
            (e) =>
              classificationKey(mergedByEntry.get(e.entry.id) ?? e.classification) ===
              classificationKey(packedWith.classification),
          )
      if (allMerged) continue

      const total = kg(combined.reduce((sum, e) => sum + (e.entry.netWeightKgPerPackage ?? 0), 0))
      // The instruction limit of the entries A181 gathers, and only those. The packaging's
      // own authorization is not folded in here: it is measured against the whole package,
      // batteries of every UN number in it, by `dg.package-authorization` above. Capping
      // this total with it as well would report one failure as two, and would state a
      // ceiling for these batteries that is not theirs.
      const lowest = Math.min(
        ...combined.map((e) =>
          usingPassenger ? (e.classification.limits.passengerKg ?? Infinity) : e.classification.limits.cargoKg,
        ),
      )
      checks.push({
        id: `dg.a181.${pkg.id}.${unNumber}`,
        severity: 'blocking',
        title: `${label}: ${unNumber} total mass under special provision A181`,
        detail:
          total <= lowest
            ? `This package holds ${unNumber} batteries both packed with and contained in equipment. Under ` +
              `special provision A181 their total mass of ${total} kg is what the column limits apply to, and ` +
              `it is within ${lowest} kg. The package and the shipping paper must both describe them as ` +
              `*packed with equipment*, and both rule sets apply — not the more permissive one.`
            : `This package holds ${unNumber} batteries both packed with and contained in equipment. Under ` +
              `special provision A181 the limits apply to their total mass, which is ${total} kg against ` +
              `${lowest} kg.`,
        passed: total <= lowest,
        expected: `≤ ${lowest} kg`,
        actual: `${total} kg`,
        refs: [pkg.id],
      })
    }
  }

  // --- Weights -----------------------------------------------------------
  checks.push(weightChecks(assessment, consignment))

  // --- Co-packing --------------------------------------------------------
  checks.push({
    id: `dg.co-pack.${pkg.id}`,
    severity: 'blocking',
    title: `${label}: nothing packed with it that may not be`,
    detail: pkg.coPackedWithProhibitedClass
      ? 'Cells and batteries must not be packed in the same outer packaging with ' +
        `${PROHIBITED_CO_PACKED_CLASSES.join(', ')}. Repack the other goods separately.`
      : // The list's own length is not a fact about this box. Interpolated, it read "No
        // 5-way conflict declared" on every compliant package — a number describing the
        // regulation, printed as though it described the packing.
        'Nothing prohibited declared in the same outer packaging. The prohibited list is exactly: ' +
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
    const packagingCapabilities = [
      entries.some((e) => e.classification.dropTestRequired) ? 'a 1.2 m drop test' : '',
      entries.some((e) => e.classification.stackTestRequired) ? 'a 3 m stack test held for 24 hours' : '',
    ].filter(Boolean)
    checks.push({
      id: `dg.packaging.${pkg.id}`,
      severity: 'info',
      title: `${label}: strong rigid outer packaging`,
      detail:
        'This section does not require UN specification packaging' +
        // Cited only where it is the reason. A802's exception is written for Section IB of
        // PI 965 and PI 968; a Section II package is outside the requirement for its own
        // reasons, and naming A802 there reads as though an exception had been applied to
        // it that never mentions it.
        (entries.some((e) => e.classification.section === 'IB')
          ? ' — special provision A802 expressly excepts Section IB of PI 965 and PI 968 —'
          : '') +
        ' but the package must still be a strong, rigid outer packaging' +
        // Joined rather than concatenated. Written as two independent clauses, a package
        // needing the stack test but not the drop test read "...outer packaging and of a
        // 3 m stack test", which is the commonest excepted shipment there is — batteries
        // contained in equipment, Section II.
        (packagingCapabilities.length ? `, capable of ${packagingCapabilities.join(' and of ')}` : '') +
        '. The capability is a property of the design and may be demonstrated by testing, assessment or ' +
        'experience, so it is established once per design rather than per box.',
      passed: true,
      refs: [pkg.id],
    })
  }

  // --- Shared packaging on the declaration -------------------------------
  // Counted the way the declaration builds its lines, by the same two functions in the same
  // order: Section II entries are excluded from it, and A181 folds a contained-in entry
  // into the packed-with line of its UN number. Counting the raw groups instead claimed a
  // second line for a package that prints exactly one.
  const declaredGroups = groupByClassification(
    applyA181(entries.filter((e) => e.classification.declarationRequired)),
  ).size
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
function weightChecks(assessment: PackageAssessment, consignment: DgConsignment): CheckResult {
  const { pkg, netWeightKg } = assessment
  const label = packageLabel(pkg, consignment)
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
      // A package with no entries in it is not an excepted package — it is an empty
      // description, which `dg.structure` is already holding the consignment on. Saying
      // "the Section II packages carry no Class 9 label" when there are none names goods
      // that are not in the consignment.
      packages.some((p) => p.entries.length > 0 && !p.declarationRequired),
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
        // Named the way every other package check names one. In a consignment holding two
        // descriptions of the same packaging type, a bare "Fibreboard box:" cannot be
        // attributed to either of them.
        title: `${packageLabel(assessment.pkg, consignment)}: lithium ion and lithium metal together`,
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
  checks.push(...overpackChecks(consignment, packages))

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
    // Which box is struck out follows the *booking*, because that is what the renderer
    // draws from and what the declaration therefore says. Written from the goods alone,
    // this told the shipper the passenger box was struck out while the preview beside it
    // struck the cargo box — the reverse, on the one consignment where the two differ.
    (offeredAircraft === 'cargo-aircraft-only'
      ? 'The passenger aircraft box on the declaration is struck out, and the Cargo Aircraft Only label goes on ' +
        'the same surface as the Class 9 label'
      : 'The declaration will strike out the cargo aircraft box while the goods may not travel that way, which ' +
        'is what the aircraft type check against each package is refusing; offer the consignment as cargo ' +
        'aircraft only. The Cargo Aircraft Only label goes on the same surface as the Class 9 label') +
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
function overpackChecks(consignment: DgConsignment, packages: PackageAssessment[]): CheckResult[] {
  const used = consignment.overpacks.filter((o) => consignment.packages.some((p) => p.overpackId === o.id))
  if (!used.length) return []

  const checks: CheckResult[] = []
  const unmarked = used.filter((o) => !o.marks.trim())
  // An overpack holding nothing but excepted Section II packages has no entry on the
  // declaration — there is no declaration line for goods the declaration does not cover —
  // so the identifier cannot be repeated there and it would be wrong to ask for it. The
  // mark still goes on the physical overpack, which the marks list already calls for.
  const declaredIds = new Set(
    packages.filter((p) => p.declarationRequired).map((p) => p.pkg.overpackId).filter(Boolean),
  )
  const onDeclaration = used.filter((o) => declaredIds.has(o.id))

  checks.push({
    id: 'dg.overpack-identifier',
    severity: 'blocking',
    title: 'Every overpack carries an identification mark',
    detail: unmarked.length
      ? 'Each overpack needs its own identifier — #A001, #A002 — marked on the physical overpack' +
        (onDeclaration.length
          ? ' and repeated identically in the declaration entry, with the battery net quantity assigned to that ' +
            'identifier. Identifiers that do not match between the box and the paper is the single most frequent ' +
            'cause of a correction cycle on these shipments.'
          : '. These overpacks hold only excepted Section II packages, so no declaration entry states them; the ' +
            'mark on the box is the whole of it.')
      : `${used.length} overpack description${used.length === 1 ? '' : 's'}, each identified. ` +
        (onDeclaration.length
          ? 'The identifier on the box and the identifier on the declaration must read the same.'
          : 'These hold only excepted Section II packages, so the identifier appears on the box alone — there is ' +
            'no declaration entry to match it against.'),
    passed: unmarked.length === 0,
  })

  // Held to the same rule as a package description's own count, and for the same reason:
  // the consignment total is the product of the two, so a fractional or zero overpack count
  // reaches the declaration as "1.5 Fibreboard box" and "Overpack used x 1.5", and reaches
  // the two-package battery mark exemption as a fractional number of packages.
  const miscounted = used.filter((o) => !Number.isInteger(o.count) || o.count < 1)
  checks.push({
    id: 'dg.overpack-count',
    severity: 'blocking',
    title: 'Every overpack description covers at least one whole overpack',
    detail: miscounted.length
      ? `${miscounted.map((o) => o.marks.trim() || 'an overpack').join(', ')} — the number of packages on the ` +
        'declaration is the package count multiplied by the overpack count, so a count that is not a whole ' +
        'number of overpacks misstates every quantity that follows from it. Say how many there are.'
      : `${used.length} overpack description${used.length === 1 ? '' : 's'}, each covering a whole number of ` +
        'overpacks.',
    passed: miscounted.length === 0,
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
  // A count of zero is unstated data, not a satisfied allowance. A package holding a
  // kilogram of batteries whose count nobody typed would otherwise be handed the exception
  // on the strength of a number that describes nothing.
  if (counted.some((e) => e.entry.countPerPackage == null || e.entry.countPerPackage < 1)) return null

  const cells = counted
    .filter((e) => e.entry.spec.form === 'cell')
    .reduce((sum, e) => sum + (e.entry.countPerPackage ?? 0), 0)
  const batteries = counted
    .filter((e) => e.entry.spec.form === 'battery')
    .reduce((sum, e) => sum + (e.entry.countPerPackage ?? 0), 0)

  // The exception is written "no more than four cells **or** two batteries" — one allowance
  // or the other, for a package holding one form or the other. It says nothing about a
  // package holding both, and reading the two allowances as additive would exempt four
  // cells *and* two batteries in one box on the strength of a permission that was never
  // given. The asymmetry decides it: an unnecessary battery mark costs a label, a missing
  // one is an undeclared package, so a mixed package is not offered the exception.
  const withinAllowance = batteries === 0 ? cells <= 4 : cells === 0 && batteries <= 2
  // A positive count, not merely one at or below two. Zero packages is not a consignment of
  // two of them, and an exemption measured against a number nobody has stated is not an
  // exemption — the counts it rests on are held by `dg.package-count` and
  // `dg.overpack-count`, and until those pass this says nothing.
  if (withinAllowance && totalPackagesInConsignment >= 1 && totalPackagesInConsignment <= 2) {
    const contents =
      batteries === 0
        ? `${cells} cell${cells === 1 ? '' : 's'}`
        : `${batteries} batter${batteries === 1 ? 'y' : 'ies'}`
    return (
      `${contents} contained in equipment, in a consignment of ${totalPackagesInConsignment} package` +
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
