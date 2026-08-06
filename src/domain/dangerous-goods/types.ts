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
  /** Forbidden by air — special provision A154. */
  | 'damaged-or-defective'
  /** Forbidden by air without competent authority approval — special provision A183. */
  | 'for-recycling-or-disposal'
  /** Prototypes and low production runs, which travel under state approval, not this workflow. */
  | 'prototype-or-preproduction'

/** One battery type inside one package. */
export interface BatteryEntry {
  id: string
  /** What decides the classification. */
  spec: BatterySpec
  /** The goods as the shipper describes them, for the review screen. Never filed. */
  description: string
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
  /** State of charge as a percentage of rated capacity. Null when not established. */
  stateOfChargePercent: number | null
  /** Whether the UN 38.3 test summary for this cell or battery type is on file. */
  testSummaryOnFile: boolean
  /**
   * Whether the watt-hour rating is marked on the outside of the battery case.
   *
   * Required for lithium ion batteries and a general requirement of the Section II and IB
   * packing instructions, so it is a condition of the classification rather than a marking
   * task the packer can pick up later.
   */
  wattHourMarkedOnCase: boolean
  condition: BatteryCondition
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
   * is nothing to be gained by making the shipper enter them one control at a time.
   */
  marks: string
  count: number
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
  /** The operating airline, so the variation reminder can name it. */
  operator: string
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
    operator: '',
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
    netWeightKgPerPackage: null,
    countPerPackage: null,
    buttonCellsInEquipment: false,
    stateOfChargePercent: null,
    testSummaryOnFile: false,
    wattHourMarkedOnCase: false,
    condition: 'sound',
  }
}

export function emptyPackage(id: string, entryId: string): DgPackage {
  return {
    id,
    packagingType: 'Fibreboard box',
    count: 1,
    unSpecificationMark: '',
    entries: [emptyEntry(entryId)],
    overpackId: null,
  }
}
