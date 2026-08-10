/**
 * Canonical data model for the CIPL -> SLI pipeline.
 *
 * Three layers, deliberately kept separate:
 *
 *   SourceLine  — what a document literally says, with provenance. Never mutated.
 *   SLILine     — what will be written into a carrier form, after grouping.
 *   FieldValue  — any single value bound for a form, carrying where it came from.
 *
 * The separation exists so that every number on a generated SLI can be traced back to a
 * page and a line of the original CIPL, and so that a human override is always
 * distinguishable from an extracted value.
 */

/**
 * Vendor A CIPLs contain the same shipment twice: an `FC` set priced in USD and a `TP1` set
 * priced in the destination currency. Only one may be used, and for a US export
 * declaration it is always the USD one.
 */
export type DocumentSet = 'FC' | 'TP1'

export type DocumentKind = 'INVOICE' | 'PACKING_LIST'

/**
 * CIPL layouts this tool can read. Each has its own parser behind a shared contract.
 *
 * `vendor-a` — the Vendor A invoice/packing-list pair, printed twice (FC in USD,
 *   TP1 in the destination currency), with per-line net and gross weights.
 * `vendor-b` — the SAP-style shipment-banner commercial invoice and master packing
 *   list. Single currency, carries an ECCN column, and **has no weights at all**.
 * `omron-ci` — the in-house Commercial Invoice form (doc 00004-00202): a fixed grid
 *   filled in by hand, read from the .xlsx workbook itself or from a PDF printed from
 *   it. Invoice only — no packing list and no per-line weights — but it is the one
 *   layout that states the full export-control triplet (ECCN, license, SME) per line.
 */
export type CiplFormat = 'vendor-a' | 'vendor-b' | 'omron-ci'

/** Where a value came from. Rendered next to every field on the review screen. */
export type Provenance =
  /** Read directly off the source document. */
  | { kind: 'extracted'; page: number; documentSet: DocumentSet; documentKind: DocumentKind; label?: string }
  /** Computed from other extracted values (a sum, a currency conversion, a D/F derivation). */
  | { kind: 'derived'; rule: string; from: string[] }
  /** A controlled default from a carrier adapter or the company profile. */
  | { kind: 'default'; source: string }
  /** A human typed or changed this. */
  | { kind: 'override'; reason?: string; at: string }
  /** Required, but nothing in the source supplies it. */
  | { kind: 'missing'; expected: string }

export type FieldStatus =
  | 'verified' // extracted and passed validation
  | 'derived' // calculated from verified inputs
  | 'default' // controlled default applied
  | 'override' // human-supplied
  | 'missing' // required and absent
  | 'conflict' // two sources disagree
  | 'invalid' // failed a validation rule
  | 'review' // compliance-controlled, requires explicit human approval

export interface FieldValue<T = string> {
  value: T | null
  provenance: Provenance
  status: FieldStatus
  /** Human-readable explanation shown in the review UI when status is not 'verified'. */
  note?: string
}

/**
 * One merchandise line exactly as it appears on one document set.
 *
 * Invoice lines and packing-list lines are extracted independently and then joined, so
 * value fields and weight fields are both optional on this type: an invoice line has no
 * weight, a packing-list line has no price.
 */
export interface SourceLine {
  /**
   * Stable synthetic id:
   * `${documentSet}:${INV|PKG}:${orderNumber}:${sequence}:${lineNumber}:${itemId}`.
   *
   * Every distinguishing field is included because order + sequence alone can repeat
   * across order lines within one purchase order.
   */
  id: string
  documentSet: DocumentSet
  documentKind: DocumentKind
  page: number

  /**
   * The order this line belongs to.
   *
   * Which order depends on the format: `vendor-a` prints the *customer's* purchase
   * order here, while `vendor-b` prints the vendor's own sales order and carries the
   * customer PO separately in `purchaseOrder`. The distinction matters because the CEVA
   * form has a box for each.
   */
  orderNumber: string
  /** Customer purchase order, when the format prints one separately from `orderNumber`. */
  purchaseOrder?: string
  /** Sequence within the order — distinguishes repeated POs (`4208669164` 1..4). */
  sequence: string
  /** Order line number, e.g. `0001`. */
  lineNumber: string
  /**
   * Per-line lot/item identifier, e.g. `5S1835710`. Unique per physical line across the
   * whole document, which makes it the strongest invoice<->packing-list join key.
   */
  itemId: string

  /** Manufacturer part number, e.g. `04465-000`. */
  partNumber: string
  /** Model / marks code, e.g. `R6A 7833D`. */
  model: string
  description: string
  /** Commodity group heading printed above the line, e.g. `Electrical Conductors`. */
  commodityGroup: string

  /** Per-line country of origin. Drives the D/F indicator. */
  countryOfOrigin: string
  /** Classification as printed on the CIPL. May be Schedule B or US HTS. */
  classification: string
  /**
   * ECCN printed against this line, when the format carries one.
   *
   * Only `vendor-b` does. Where present it is authoritative and must not be replaced
   * by a blanket EAR99 — one sample line is `5A992.C`, and the SLI filed for it says EAR99.
   */
  eccn?: string
  /**
   * License number, exception, or `NLR`, when the document states one per line.
   *
   * Only the `omron-ci` form does. Same rule as `eccn`: a stated value is a
   * classification the exporter already made, so it beats the blanket value.
   */
  license?: string
  /** `Y`/`N` for significant military equipment, when the document states it per line. */
  sme?: string

  quantity: number
  uom: string

  // Invoice-only
  currency?: string
  unitValue?: number
  extendedValue?: number

  // Packing-list-only
  netWeightKg?: number
  grossWeightKg?: number
  measurementM3?: number
  /**
   * Set when the packing list printed this line's figures divided N ways (`(@ / 6)`) and
   * they were multiplied back up.
   *
   * Recorded because the reconstruction cannot be exact: the printed figure is rounded to
   * three decimals before it is divided, so multiplying re-inflates that rounding by a
   * factor of N. The weight reconciliation widens its tolerance to match rather than
   * failing a document that is internally consistent.
   */
  weightDivisor?: number
}

/** A merchandise line with invoice and packing-list data joined together. */
export interface MergedLine extends SourceLine {
  /** id of the packing-list line this was matched to, if any. */
  packingListLineId?: string
  /** Which key produced the match, for display on the review screen. */
  joinKey?: 'itemId' | 'order+sequence' | 'order+line+part' | 'unmatched'
}

/** Header-level shipment facts read off the CIPL. */
export interface ShipmentHeader {
  invoiceNumber: string
  invoiceDate: string
  /** The later "ON OR ABOUT" date. Deliberately *not* used for date of exportation. */
  onOrAboutDate: string | null
  soldTo: PartyAddress
  consignedTo: PartyAddress
  notifyTo: string | null
  shippedFrom: string | null
  dischargePort: string | null
  /** Forwarder named on the CIPL, e.g. `Nippon Express` or `CEVA`. */
  vesselAgent: string | null
  /** Every distinct order number found across the line items, in first-seen order. */
  orderNumbers: string[]
  /**
   * Customer purchase orders, when the format prints them separately from `orderNumbers`.
   * Empty for layouts where `orderNumbers` already are the customer's POs.
   */
  purchaseOrders: string[]
  tradeTerms: string | null
  incoterm: string | null
  freightTerms: 'PREPAID' | 'COLLECT' | null
  cartons: number | null
  documentCurrency: string
  totalQuantity: number
  totalValue: number
  totalNetWeightKg: number | null
  totalGrossWeightKg: number | null
  totalMeasurementM3: number | null
}

export interface PartyAddress {
  name: string
  lines: string[]
  /** Resolved destination country. See `resolveDestinationCountry`. */
  country: string | null
}

/** Everything extracted from one CIPL PDF, both document sets. */
export interface ParsedCipl {
  fileName: string
  format: CiplFormat
  pageCount: number
  /**
   * Whether the document itself states line weights.
   *
   * False for `vendor-b`, which prints none. Weights then have to come from the saved
   * per-part table, and the reconciliation says so rather than implying the figures were
   * proved against the source.
   */
  providesWeights: boolean
  /** Document sets present in the file, in the order encountered. */
  availableSets: DocumentSet[]
  /** Header per document set. */
  headers: Record<string, ShipmentHeader>
  /** Every source line from every set/kind. */
  lines: SourceLine[]
  /**
   * Quantity per part as the document itself totals it, keyed by uppercased part number.
   *
   * Only the `vendor-b` layout publishes this — its master packing list ends with a
   * "SUMMARY INFORMATION" section listing every part and its shipment total. It is the one
   * figure in that format not derived from the same line blocks the parser reads, which
   * makes it the only true cross-check available: a line the parser drops still appears
   * here, and the totals stop agreeing.
   *
   * Absent for layouts that print no such summary.
   */
  partTotals?: Record<string, number>
  /** Non-fatal parse observations surfaced in the UI. */
  warnings: string[]
}

/** A commodity row destined for a carrier form. */
export interface SLILine {
  /** ids of every SourceLine that contributed. Never empty. */
  sourceLineIds: string[]
  /** D (domestic, US origin) or F (foreign). */
  domesticForeign: 'D' | 'F'
  scheduleB: string
  /** Description shown alongside the code. */
  description: string
  quantity: number
  /** Unit of quantity that Schedule B requires for this code (from the Census file). */
  scheduleBUnit: string | null
  /** The UOM the CIPL actually reported the quantity in. */
  sourceUom: string
  weightKg: number
  valueUsd: number
  eccn: string | null
  sme: string | null
  license: string | null
  /** Countries of origin that were rolled into this line. */
  countriesOfOrigin: string[]
}

export type CheckSeverity = 'blocking' | 'warning' | 'info'

/** One reconciliation or compliance check result. */
export interface CheckResult {
  id: string
  severity: CheckSeverity
  title: string
  detail: string
  /** True when the check passed. Failing blocking checks prevent generation. */
  passed: boolean
  /** Values compared, for display. */
  expected?: string
  actual?: string
  /** SLI line indices or source line ids this check refers to. */
  refs?: string[]
}

/** The full result of turning a parsed CIPL into carrier-ready commodity lines. */
export interface Reconciliation {
  selectedSet: DocumentSet
  header: ShipmentHeader
  mergedLines: MergedLine[]
  sliLines: SLILine[]
  checks: CheckResult[]
  /** True when no blocking check failed. */
  canGenerate: boolean
}
