/**
 * The data model for a dangerous goods air consignment.
 *
 * Deliberately shaped like the shipment rather than like the form. A consignment holds
 * packages, a package holds one or more battery types, and packages may sit in an overpack —
 * which is the order the goods are actually assembled in, and the order the person filling
 * this in has them on the bench. The Shipper's Declaration is derived from that shape in
 * `dgd.ts`; nothing here knows what a box on the form is called.
 *
 * The vocabulary is IATA's, from the Labelmaster course materials:
 *
 *   package      the packaging and its contents — the outside package
 *   consignment  one or more packages accepted by an operator from one shipper at one time
 *                and at one address, receipted for in one lot, moving to one consignee at
 *                one destination address
 *   overpack     an enclosure used by a single consignor to consolidate or protect packages
 *
 * The distinction between a package and a consignment is not pedantry: the net quantity
 * limits are per *package*, while the exemption that lets a box of laptops travel with no
 * battery mark at all is per *consignment*. Getting them the wrong way round produces a
 * package that is either over-marked or unmarked, and only one of those is safe.
 *
 * Several fields here exist because they are the things that have actually gone wrong on real
 * consignments rather than because a form asks for them — the tested-article scope of a UN
 * 38.3 summary, three weights that must never be derived from one another, the operating
 * carrier as distinct from the forwarder, and a state of charge that is measured rather than
 * asserted.
 */
import type { BatterySpec } from './lithium'

/**
 * The condition of the cells or batteries.
 *
 * Not a footnote. Two of these four values make the shipment forbidden by air outright, and
 * the field exists so that the answer is recorded rather than assumed — a shipper who never
 * had to state that the batteries are sound has never had to think about whether they are.
 */
export type BatteryCondition =
  /** Undamaged, not being sent for disposal. The only condition air transport accepts. */
  | 'sound'
  /** Forbidden by air — special provision A154. Highway, rail or vessel only. */
  | 'damaged-or-defective'
  /** Forbidden by air without competent authority approval — special provision A183. */
  | 'for-recycling-or-disposal'
  /** Prototypes and low production runs, which travel under approval, not this workflow. */
  | 'prototype-or-preproduction'

/**
 * What a UN 38.3 test summary covers, and what is actually in the box.
 *
 * These are the same vocabulary on purpose, because the check is that they match. A cell is
 * not a module, a module is not the pack assembled from four of them, and a pack is not the
 * equipment it is installed in. Each is a separate article with its own tested type.
 */
export type ArticleLevel = 'cell' | 'module' | 'battery-pack' | 'equipment'

/**
 * How a state of charge figure was arrived at.
 *
 * The basis is not decoration. Two different standards exist and they are not
 * interchangeable: 30% of *rated capacity* is the mandatory limit for standalone cells and
 * for cells packed with equipment, while the alternative of an *indicated battery capacity*
 * not exceeding 25% belongs to batteries contained in equipment — and to the vehicle entries,
 * which this workflow does not cover. A figure read off a fuel gauge cannot satisfy a limit
 * written against rated capacity, however close the numbers look.
 */
export type StateOfChargeBasis = 'rated-capacity' | 'rated-design-capacity' | 'indicated-capacity'

/**
 * Whether the equipment a battery is installed in or packed with is a *vehicle*.
 *
 * A blocking question rather than an inference. A vehicle is a self-propelled apparatus
 * designed to carry one or more persons or goods, and where the answer is yes the consignment
 * leaves this workflow entirely: it travels under UN3556, UN3557 or UN3558 by air, with a
 * different entry, packing instruction, marks and declaration wording. An autonomous mobile
 * robot sits precisely on the boundary — self-propelled, designed to carry goods — and the
 * published examples of "vehicle" run well past road vehicles to wheelchairs, lawn tractors
 * and construction machinery while the examples of "equipment" include lawnmowers and
 * cleaning machines. That is a determination a qualified person makes and records, not one an
 * application computes at classification time from a product name.
 */
export type VehicleDetermination = 'not-a-vehicle' | 'is-a-vehicle' | 'not-determined'

/** One battery type inside one package. */
export interface BatteryEntry {
  id: string
  /** What decides the classification. */
  spec: BatterySpec
  /** The goods as the shipper describes them, for the review screen. Never filed. */
  description: string
  /**
   * What is physically in the box, at the level the tested type is established for.
   *
   * Distinct from `spec.form`, which is the regulatory cell-or-battery distinction the
   * watt-hour thresholds are written against. A pack assembled from four modules is a
   * *battery* for the thresholds and a *battery-pack* here, and its modules are a different
   * article at both.
   */
  articleLevel: ArticleLevel
  /**
   * Net weight of the cells or batteries of this type in **one** package, in kilograms.
   *
   * Net battery weight, not the weight of the package: the limits in every packing
   * instruction are on the batteries themselves, and for equipment shipments the difference
   * is most of the parcel. The workbook makes the point explicitly — the 5 kg limit under
   * PI 967 Section II is the weight of the batteries, not the devices and not the box.
   */
  netWeightKgPerPackage: number | null
  /** How many cells or batteries of this type are in one package. */
  countPerPackage: number | null
  /**
   * Button cells installed in equipment, including on circuit boards.
   *
   * Carried because two rules turn on it: such cells need no test summary made available,
   * and they are not counted towards the four-cell limit that decides whether a package of
   * equipment must carry the battery mark.
   */
  buttonCellsInEquipment: boolean
  /**
   * Prepared to Section I although the batteries are small enough for Section II.
   *
   * Section II is a relief with conditions, and the 5 kg net per package ceiling is one of
   * them; a consignment that does not meet them is prepared to Section I of the same
   * packing instruction, where the cargo aircraft allowance is 35 kg. That is the route for
   * a heavy package of small batteries — and it is a decision, not an inference. Section I
   * means UN specification packaging, the Class 9 label, a Shipper's Declaration and full
   * dangerous goods training, none of which this application can observe. So it is recorded
   * here by the person who packed the box, and left false until they say otherwise.
   */
  prepareToSectionI: boolean

  // --- UN 38.3 qualification -------------------------------------------
  /**
   * The article the available test summary covers, or null when there is none.
   *
   * The single most consequential field on this record, and the quietest failure in the set:
   * a module-level summary held against an assembled multi-module pack looks like
   * qualification right up until an airline asks. A battery must be of a type proved to meet
   * subsection 38.3 *irrespective of whether the cells it is composed of are of a tested
   * type*, so coverage of the parts is not coverage of the whole.
   */
  testSummaryScope: ArticleLevel | null
  /** Where the summary is held — report number, document reference, link. */
  testSummaryReference: string

  // --- State of charge --------------------------------------------------
  /** State of charge as a percentage. Null when not established. */
  stateOfChargePercent: number | null
  /** Which capacity the percentage is measured against. */
  stateOfChargeBasis: StateOfChargeBasis | null
  /** The device or method used. A state of charge is measured, never inferred. */
  stateOfChargeMethod: string
  /** `YYYY-MM-DD`. A measurement without a date is not evidence of the state at tender. */
  stateOfChargeMeasuredAt: string
  stateOfChargeMeasuredBy: string

  /**
   * Whether the watt-hour rating is marked on the outside of the battery case.
   *
   * Required for lithium ion batteries manufactured after 31 December 2011 and a general
   * requirement of the packing instructions, so it is a condition of the classification
   * rather than a marking task the packer can pick up later.
   */
  wattHourMarkedOnCase: boolean
  condition: BatteryCondition
  /**
   * For batteries with equipment: whether that equipment is a vehicle.
   *
   * Irrelevant to a standalone battery, which is UN3480 or UN3090 whatever the machine it
   * will eventually power turns out to be.
   */
  vehicleDetermination: VehicleDetermination
}

/** One package, or a run of identical packages, in the consignment. */
export interface DgPackage {
  id: string
  /**
   * The packaging as it will be described on the declaration — `Fibreboard box`, `Wooden
   * box`, `Fibre drum`. Free text because it is filed as text, and because a description
   * chosen from a list is a description nobody checked.
   */
  packagingType: string
  /**
   * How many identical packages of this description there are.
   *
   * Per overpack when this package is in one, and per consignment when it is not. That
   * reading is what makes "Overpack used x 2" describe two overpacks with the same contents
   * rather than two overpacks between which some number of boxes has been divided — and the
   * declaration's own package count, which is the total across every overpack, is derived
   * from the two numbers rather than typed.
   */
  count: number
  /**
   * The UN specification marking on the box, where one is used —
   * `4G/Y25/S/26/USA/+D02390`. Empty for a strong outer packaging, which carries no such mark.
   */
  unSpecificationMark: string
  /**
   * A net quantity ceiling the packaging authorization itself imposes, below the packing
   * instruction's maximum.
   *
   * The packing instruction states the regulatory ceiling; the tested design type states what
   * this particular box was proved to hold, and it is frequently the lower of the two. Null
   * means the packing instruction figure governs.
   */
  packagingAuthorizationLimitKg: number | null

  // --- Three weights, none derived from another -------------------------
  /**
   * The whole package on a scale, in kilograms.
   *
   * Carried so it can be reconciled against the weight the forwarder puts on the air waybill,
   * and so it is visibly *not* the dangerous goods net quantity. These are different numbers
   * and they will not match; treating them as one is a recurring cause of resubmission.
   */
  grossWeightKg: number | null
  /** The equipment in the package, excluding its batteries. Zero for a standalone shipment. */
  equipmentNetWeightKg: number | null

  /**
   * Whether this package also holds dangerous goods that may not travel with lithium
   * batteries.
   *
   * PI 965 names them exactly: Class 1 explosives other than Division 1.4S, Division 2.1
   * flammable gases, Class 3 flammable liquids, Division 4.1 flammable solids, and Division
   * 5.1 oxidizers. Division 1.4S is expressly permitted, which is the part most often got
   * wrong in the restrictive direction.
   */
  coPackedWithProhibitedClass: boolean

  entries: BatteryEntry[]
  /** The overpack these packages travel in, if any. */
  overpackId: string | null
}

/**
 * An overpack, and how many identical ones there are.
 *
 * `count` is what separates the three cases the declaration handles differently: one
 * overpack gets "Overpack used"; several identical ones get "Overpack used x N" together
 * with their identification marks and the total quantity per overpack; several with
 * different contents are listed separately, which here means separate overpack records.
 */
export interface Overpack {
  id: string
  /**
   * The identification marks applied to the overpacks, e.g. `#A001, #A002`.
   *
   * All of them, in one field, because all of them are listed on the declaration and there
   * is nothing to be gained by making the shipper enter them one control at a time. Required
   * for every overpack rather than only for multiples: the identifier is what ties a physical
   * box to a declaration entry, and identifiers that do not match between the two is the
   * single most frequent correction cycle on these shipments.
   */
  marks: string
  count: number
  /**
   * Whether the required marks and labels on the packages inside stay visible through the
   * overpack.
   *
   * When they do not, they are reproduced on the outside. Shrink wrap usually leaves them
   * visible; a crate does not.
   */
  innerMarksVisible: boolean
  /** Whether this overpack also holds packages of dangerous goods lithium may not travel with. */
  coPackedWithProhibitedClass: boolean
}

export interface DgParty {
  name: string
  addressLines: string[]
}

/**
 * Everything needed to prepare and declare one air consignment.
 *
 * The signature block is present but the signature is not, and never will be: a typewritten
 * signature is not acceptable on a Shipper's Declaration, and the person signing is
 * certifying under penalty that the packing, marking and labelling were actually done.
 */
export interface DgConsignment {
  shipper: DgParty
  consignee: DgParty
  /** The air waybill this declaration is attached to. Often supplied by the forwarder. */
  airWaybillNumber: string
  /** The shipper's own reference. Optional on the form and optional here. */
  shippersReference: string
  /** Full airport or city name. Codes are not accepted on the declaration. */
  airportOfDeparture: string
  airportOfDestination: string
  /**
   * The aircraft the consignment is prepared for.
   *
   * A choice, within what the goods allow: a consignment that *may* travel on a passenger
   * aircraft can still be offered as cargo aircraft only, and often is. The assessment
   * refuses the reverse.
   */
  aircraft: 'passenger-and-cargo' | 'cargo-aircraft-only'
  /** 24-hour emergency response provider and number, for the handling information box. */
  emergencyContactName: string
  emergencyContactPhone: string
  /** Anything else the operator needs to know, appended to the handling information box. */
  additionalHandlingInformation: string
  signerName: string
  signerTitle: string
  /** Where the declaration is signed. Optional on the form. */
  signerPlace: string
  /** `YYYY-MM-DD`. Rendered in the form's own format at fill time. */
  signerDate: string
  packages: DgPackage[]
  overpacks: Overpack[]

  // --- Who is actually carrying it --------------------------------------
  /**
   * The freight forwarder arranging the movement.
   *
   * Books the space, coordinates the dangerous goods review, issues the house air waybill —
   * and is not the airline. Operator variations do not attach here.
   */
  forwarder: string
  /**
   * The airline whose aircraft the consignment flies on.
   *
   * This is what operator variations attach to, and it is routinely not known at the point
   * the paperwork is prepared. It comes off the booking confirmation or the master air
   * waybill, never from the forwarder's name and never from the routing.
   */
  operatingCarrier: string
  /** Where the operating carrier was read from — booking confirmation, MAWB. */
  operatingCarrierSource: string
  /** The reviewer confirms they have read the applicable variations; the app cannot. */
  stateVariationsChecked: boolean
  operatorVariationsChecked: boolean
}

export const EMPTY_PARTY: DgParty = { name: '', addressLines: [] }

export function emptyConsignment(): DgConsignment {
  return {
    shipper: EMPTY_PARTY,
    consignee: EMPTY_PARTY,
    airWaybillNumber: '',
    shippersReference: '',
    airportOfDeparture: '',
    airportOfDestination: '',
    aircraft: 'cargo-aircraft-only',
    emergencyContactName: '',
    emergencyContactPhone: '',
    additionalHandlingInformation: '',
    signerName: '',
    signerTitle: '',
    signerPlace: '',
    signerDate: '',
    packages: [],
    overpacks: [],
    forwarder: '',
    operatingCarrier: '',
    operatingCarrierSource: '',
    stateVariationsChecked: false,
    operatorVariationsChecked: false,
  }
}

export function emptyEntry(id: string): BatteryEntry {
  return {
    id,
    spec: {
      chemistry: 'lithium-ion',
      form: 'battery',
      configuration: 'standalone',
      wattHours: null,
      lithiumContentG: null,
    },
    description: '',
    articleLevel: 'battery-pack',
    netWeightKgPerPackage: null,
    countPerPackage: null,
    buttonCellsInEquipment: false,
    prepareToSectionI: false,
    testSummaryScope: null,
    testSummaryReference: '',
    stateOfChargePercent: null,
    stateOfChargeBasis: null,
    stateOfChargeMethod: '',
    stateOfChargeMeasuredAt: '',
    stateOfChargeMeasuredBy: '',
    wattHourMarkedOnCase: false,
    condition: 'sound',
    vehicleDetermination: 'not-determined',
  }
}

export function emptyPackage(id: string, entryId: string): DgPackage {
  return {
    id,
    packagingType: 'Fibreboard box',
    count: 1,
    unSpecificationMark: '',
    packagingAuthorizationLimitKg: null,
    grossWeightKg: null,
    equipmentNetWeightKg: null,
    coPackedWithProhibitedClass: false,
    entries: [emptyEntry(entryId)],
    overpackId: null,
  }
}

export function emptyOverpack(id: string): Overpack {
  return { id, marks: '', count: 1, innerMarksVisible: false, coPackedWithProhibitedClass: false }
}

/**
 * Ids for the things a person adds on screen.
 *
 * A counter rather than anything derived from content: two identical packages are two
 * packages, and they have to stay distinguishable while one of them is being edited.
 */
let sequence = 0
export const nextDgId = (prefix: string): string => `${prefix}${(sequence += 1)}`

/**
 * A consignment with one empty package, ready to be filled in.
 *
 * Lives here rather than beside the screen that uses it because it is held *above* that
 * screen: the dangerous goods tab unmounts whenever the standard flow is shown, and a
 * half-entered consignment represents measured, weighed, looked-up work that should not
 * evaporate because someone glanced at the other tab.
 */
export function newConsignment(): DgConsignment {
  return { ...emptyConsignment(), packages: [emptyPackage(nextDgId('pkg-'), nextDgId('ent-'))] }
}

/**
 * The dangerous goods a lithium battery package may not share an outer packaging — or an
 * overpack — with, as PI 965 Sections IA and IB name them.
 *
 * Reproduced in full because the list is short, specific, and usually recalled wrong in both
 * directions: Division 1.4S is *permitted*, and Divisions 4.2, 4.3, 5.2, Class 8 and Division
 * 2.2 do not appear in it.
 */
/**
 * Article levels as sentence fragments, for check details and the printed checklist.
 *
 * Distinct from the dropdown labels on screen, which are titles rather than phrases: "the
 * summary covers a module; an assembled battery pack is in the box" only reads if the words
 * carry their articles.
 */
export const ARTICLE_LEVEL_PHRASES: Record<ArticleLevel, string> = {
  cell: 'a cell',
  module: 'a module',
  'battery-pack': 'an assembled battery pack',
  equipment: 'equipment containing cells or batteries',
}

export const PROHIBITED_CO_PACKED_CLASSES = [
  'Class 1 explosives, other than Division 1.4S',
  'Division 2.1 flammable gases',
  'Class 3 flammable liquids',
  'Division 4.1 flammable solids',
  'Division 5.1 oxidizers',
] as const
