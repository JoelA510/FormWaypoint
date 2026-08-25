/**
 * Field map for the Nippon Express USA Shipper's Letter of Instruction,
 * file version 01/04/2022 (`public/templates/nippon-express-sli.pdf`).
 *
 * The names are transcribed verbatim from the blank form's AcroForm dictionary, typos and
 * all — `22.03 sB UNIT1` really does have a lowercase "s", and row 3's Schedule B field is
 * named just `24.02`. That is why this is an explicit table rather than generated names.
 *
 * Important: the *completed* SLIs supplied as examples were filled on an earlier revision
 * whose fields are named differently (`SB1` rather than `22.02 SB1`, and no
 * `4a1 Ultimate CNEE ID` at all). Those documents are useful as expected values, not as a
 * field reference. `verifyTemplate` exists to catch a template swap.
 */

export const NIPPON_HEADER_FIELDS = {
  usppi: '1a. USPPI',
  usppiZip: 'ZIP CODE',
  usppiEin: '1b USPPI IRS NO or ID NO',
  dateOfExportation: '2 DATE OF EXPORTATION',
  transportationReference:
    '3 TRANSPORTATION REFERENCE NO For Ocean Shipment Only Exporting Carrier Booking Number if available',
  consigneeId: '4a1 Ultimate CNEE ID',
  ultimateConsignee: '4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available',
  consigneeTypeOther: '4b5 CNEE TYPE OTHERS',
  intermediateConsignee: '4c INTERMEDIATE CONSIGNEE Complete name  address and contact name  tel if available',
  forwardingAgent: '5a FORWARDING AGENT',
  forwardingAgentEin: '5b FORWARDING AGENTS EIN IRS NO',
  pointOfOrigin: '6 POINT OF ORIGIN OR FTZ NO Must be 7digit Legacy or 9digit ACE format',
  destinationCountry: '7 COUNTRY OF ULTIMATE DESTINATION',
  loadingPier: '8 LOADING PIER Vessel only',
  carrierIdCode: '10 CARRIER IDENTIFICATION CODE',
  shipmentReference: '11 SHIPMENT REFERENCE NO',
  exportingCarrier: '12 EXPORTING CARRIER',
  portOfExport: '13 PORT OF EXPORT',
  entryNumber: '14 ENTRY NUMBER',
  inBondNumber: '15 IN BOND NUMBER',
  portOfUnloading: '17 PORT OF UNLOADING Vessel and Air Only',
  caseMark: '19 CASE MARK Required for Ocean JP Shpts',
  insuredAmount: 'InsuredAmount',
  quote: 'QUOTE#',
  serviceLevel: 'SERVICE LEVEL',
  namedPlace: 'NAMED PLACE/PORT',
  specialHandlingOther: 'SP HANDLING OTHERS',
  customerCode: 'CUSTOMER CODE',
  returnEmail: 'NEU EMAIL ADDRESS TO RETURN SLI CUSTOMER CODE NEU USE ONLY',
  signerTitle: '33c TITLE',
  authentication: '33d AUTHENTICATION When required',
  signerEmail: '33e EMAIL ADDRESS',
  signerPhone: '33f TEL',
  signatureDate: '33g DATE',
} as const

/**
 * Radio groups. Several of these are modelled as one single-option group per choice rather
 * than one group with several options, so "no" is a different field from "yes".
 */
export const NIPPON_RADIOS = {
  insurance: { field: 'INSURANCE', yes: 'YES', no: 'NO' },
  freight: { field: 'FREIGHT', prepaid: 'PP', collect: 'CC' },
  jetpak: { field: 'JETPAK', yes: 'YES', no: 'NO' },
  term: { field: 'TERM' },
  incoterm: { field: 'INCOTERM' },
  partiesRelated: { field: '1c1 PARTIES', option: 'RELATED' },
  partiesNonRelated: { field: '1c2 PARTIES', option: 'NON RELATED' },
  hazmatYes: { field: '16a HAZMAT', option: 'YES' },
  hazmatNo: { field: '16b HAZMAT', option: 'NO' },
  containerYes: { field: '18a CONTAINER', option: 'YES' },
  containerNo: { field: '18b CONTAINER', option: 'NO' },
  routedYes: { field: '20a RET', option: 'YES' },
  routedNo: { field: '20b RET', option: 'NO' },
} as const

export const NIPPON_CONSIGNEE_TYPE = {
  DIRECT_CONSUMER: { field: '4b1 CNEE TYPE', option: 'DIRECT CONSUMER' },
  RESELLER: { field: '4b2 CNEE TYPE', option: 'RESELLER' },
  GOVERNMENT_ENTITY: { field: '4b3 CNEE TYPE', option: 'GOV ENTITY' },
  OTHER: { field: '4b4 CNEE TYPE', option: 'CNEE OTHERS' },
} as const

export const NIPPON_MODE = {
  AIR: { field: '9a MODE', option: 'AIR' },
  TRUCK: { field: '9b MODE', option: 'Truck' },
  OCEAN: { field: '9c MODE', option: 'OCEAN' },
  RAIL: { field: '9d MODE', option: 'Rail' },
} as const

/** Incoterm option names as spelled on the form. `FSA` and `FCP` are the form's spellings. */
export const NIPPON_INCOTERM_OPTIONS = [
  'CIF', 'CIP', 'CFR', 'CPT', 'DAP', 'DDP', 'DPU', 'EXW', 'FSA', 'FCP', 'FOB',
] as const

/** Service term option names. */
export const NIPPON_TERM_OPTIONS = ['DD', 'DP', 'PP', 'PD', 'PC', 'CC', 'CP'] as const

export interface NipponRowFields {
  df: string
  scheduleB: string
  quantity: string
  ddtcUom: string
  weight: string
  volume: string
  eccn: string
  sme: string
  license: string
  value: string
  licenseValue: string
}

/**
 * The eight commodity rows. Column order follows the printed boxes: 22 D/F, 23 Schedule B,
 * 24 quantity, 25 DDTC quantity/UOM, 26 weight, 27 volume, 28 ECCN, 29 SME, 30 licence,
 * 31 value, 32 licence value.
 */
export const NIPPON_ROWS: NipponRowFields[] = [
  {
    df: '22.01 DF1', scheduleB: '22.02 SB1', quantity: '22.03 sB UNIT1', ddtcUom: '22.04 UOM1',
    weight: '22.05 WEIGHT1', volume: '22.06 VOLUME1', eccn: '22.07 ECCN1', sme: '22.08 SME1',
    license: '22.09 LICENSE1', value: '22.10 VALUE1', licenseValue: '22.11 LIC VALUE1',
  },
  {
    df: '23.01 DF2', scheduleB: '23.02 SB2', quantity: '23.03 SB UNI2', ddtcUom: '23.04UOM2',
    weight: '23.05WEIGHT2', volume: '23.06E2', eccn: '23.07ECCN2', sme: '23.08SME2',
    license: '23.09LICENSE2', value: '23.10VALUE2', licenseValue: '23.11LIC VALUE2',
  },
  {
    df: '24.01 DF', scheduleB: '24.02', quantity: '24.03SB UNIT3', ddtcUom: '24.04UOM3',
    weight: '24.05WEIGHT3', volume: '24.06VOLUME3', eccn: '24.07ECCN3', sme: '24.08SME3',
    license: '24.09LICENSE3', value: '24.10VALUE3', licenseValue: '24.11LIC VALUE3',
  },
  {
    df: '25.01 DF', scheduleB: '25.02SB4', quantity: '25.03SB UNIT4', ddtcUom: '25.04UOM4',
    weight: '25.05WEIGHT4', volume: '25.06VOLUME4', eccn: '25.07ECCN4', sme: '25.08SME4',
    license: '25.09LICENSE4', value: '25.10VALUE4', licenseValue: '25.11LIC VALUE4',
  },
  {
    df: '26.01 DF', scheduleB: '26.02SB5', quantity: '26.03SB UNIT5', ddtcUom: '26.04UOM5',
    weight: '26.05WEIGHT5', volume: '26.06VOLUME5', eccn: '26.07 ECCN5', sme: '26.08SME5',
    license: '26.09LICENSE5', value: '26.10VALUE5', licenseValue: '26.11LIC VALUE5',
  },
  {
    df: '27.01 DF6', scheduleB: '27.02 SB6', quantity: '27.03SB UNIT6', ddtcUom: '27.04 UOM6',
    weight: '27.05WEIGHT6', volume: '27.06VOLUME6', eccn: '27.07ECCN6', sme: '27.08SME6',
    license: '27.09LICENSE6', value: '27.10VALUE6', licenseValue: '27.11LIC VALUE6',
  },
  {
    df: '28.01 DF7', scheduleB: '28.02SB7', quantity: '28.03SB UNIT7', ddtcUom: '28.04UOM7',
    weight: '28.05WEIGHT7', volume: '28.06VOLUME7', eccn: '28.07 ECCN7', sme: '28.08SME7',
    license: '28.09LICENSE7', value: '28.10VALUE7', licenseValue: '28.11LIC VALUE7',
  },
  {
    df: '29.01 DF8', scheduleB: '29.02SB8', quantity: '29.03SB UNIT8', ddtcUom: '29.04UOM8',
    weight: '29.05WEIGHT8', volume: '29.06VOLUME8', eccn: '29.07ECCN8', sme: '29.08SME8',
    license: '29.09LICENSE8', value: '29.10VALUE8', licenseValue: '29.11LIC VALUE8',
  },
]

/**
 * The row nodes the commodity fields hang from, one per printed row.
 *
 * This form names its commodity fields hierarchically: `22.02 SB1` is the field `02 SB1`
 * under the node `22`. That makes a page's rows renameable eight nodes at a time — see
 * `paginateForm`, which uses these to give each continuation page commodity rows of its own
 * while every other box stays one field shared across the sheets.
 */
export const NIPPON_ROW_ROOTS: readonly string[] = NIPPON_ROWS.map((row) => row.df.split('.')[0])

/** Fields whose absence means the loaded PDF is not the revision this adapter maps. */
export const NIPPON_REQUIRED_FIELDS: string[] = [
  NIPPON_HEADER_FIELDS.usppi,
  NIPPON_HEADER_FIELDS.usppiEin,
  NIPPON_HEADER_FIELDS.dateOfExportation,
  NIPPON_HEADER_FIELDS.ultimateConsignee,
  NIPPON_HEADER_FIELDS.destinationCountry,
  NIPPON_HEADER_FIELDS.shipmentReference,
  NIPPON_RADIOS.freight.field,
  NIPPON_RADIOS.incoterm.field,
  NIPPON_MODE.AIR.field,
  ...NIPPON_ROWS.flatMap((r) => [r.df, r.scheduleB, r.quantity, r.weight, r.value]),
]
