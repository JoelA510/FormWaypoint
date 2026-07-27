/**
 * Field map for the CEVA Logistics Shipper's Letter of Instructions,
 * form 11201-C3 rev. 8/2023 (`public/templates/ceva-sli.pdf`).
 *
 * Structurally different from the Nippon form in a way the adapter has to respect: the
 * commodity table is **five multiline text fields**, one per column, rather than a grid of
 * per-cell fields. Rows are newline-separated within each field and stay aligned only
 * because every column receives the same number of lines.
 *
 * Note the completed vendorA3 example was filled on rev. 5/14, which had a `DAT` incoterm
 * box that rev. 8/2023 drops and numbered the documents boxes 24/25 rather than 26/27.
 */

export const CEVA_FIELDS = {
  usppi: 'U.S. Principle Party',
  usppiZip: 'ZipCode',
  usppiEin: 'USPPI',
  intermediateConsignee: 'Intermediate Consignee',
  ultimateConsignee: 'Ultimate Consignee',
  shipperRef: 'Shipper Ref',
  consigneePo: 'Consignee PO',
  pointOfOrigin: 'Point of Origin',
  destinationCountry: 'Country of Ultimate',
  inBondNumber: 'In Bond Number',
  insurance: 'Insurance',
  declaredValue: 'Declared Value',
  /** Free-text marker column for the AIR / OCEAN service block. */
  serviceRequested: 'Requested',
  air: 'Air',
  ocean: 'Ocean',
  shipperCarrierContract: 'Shipper/Carrier',
  freightPaymentLocation: 'Location',
  gbl: 'GBL',
  specialInstructions: 'Special Instructions',
  // Commodity table — one multiline field per column.
  df: 'D/F',
  scheduleB: 'Schedule B Number',
  quantity: 'Quantity Schedule B Unit',
  weight: 'Shipping Weight',
  value: 'Value',
  piecesAndDimensions: 'Pieces & Dimensions',
  license: 'License No',
  eccn: 'ECCN',
  dulyAuthorized: 'Duly Authorized',
  signerTitle: 'Title',
  signatureDate: 'Date',
  certificationDate: 'Date2',
  quote: 'Quote',
  /** Box 33 takes the signer's initials as text, not a tick. */
  noDangerousGoods: 'DOES NOT CONTAIN DANGEROUS GOODS',
  hasDangerousGoods: 'DOES CONTAIN DANGEROUS GOODS',
} as const

export const CEVA_CHECKBOXES = {
  related: 'Related',
  nonRelated: 'Non-Related',
  routedExportYes: 'YES',
  routedExportNo: 'NO',
  commercialInvoiceAttached: 'COMMERCIAL INVOICE',
} as const

export const CEVA_CONSIGNEE_TYPE = {
  DIRECT_CONSUMER: 'DIRECT CONSUMER',
  GOVERNMENT_ENTITY: 'GOVERNMENT ENTITY',
  RESELLER: 'RESELLER',
  OTHER: 'OTHER/UNKNOWN',
} as const

/** Incoterm checkbox names. Rev. 8/2023 has no `DAT` box. */
export const CEVA_INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'] as const

export const CEVA_REQUIRED_FIELDS: string[] = [
  CEVA_FIELDS.usppi,
  CEVA_FIELDS.usppiEin,
  CEVA_FIELDS.ultimateConsignee,
  CEVA_FIELDS.destinationCountry,
  CEVA_FIELDS.df,
  CEVA_FIELDS.scheduleB,
  CEVA_FIELDS.quantity,
  CEVA_FIELDS.weight,
  CEVA_FIELDS.value,
  CEVA_FIELDS.license,
]

/**
 * The commodity fields are fixed-height boxes. Beyond this many rows the text overflows the
 * printed table, so the adapter refuses rather than producing a form that looks complete.
 */
export const CEVA_MAX_ROWS = 12
