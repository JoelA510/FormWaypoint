/**
 * Carrier adapter contract.
 *
 * Everything carrier-specific lives behind this interface: field names, defaults, value
 * formatting, row capacity, and how a form encodes a checkbox. The CIPL parser and the
 * reconciliation engine know nothing about any particular forwarder, so adding DHL or
 * Kuehne+Nagel later means writing one adapter, not touching the pipeline.
 *
 * The two shipped adapters already differ in ways that justify the indirection:
 * Nippon Express uses eight sets of per-cell fields and keeps cents, while CEVA uses one
 * multiline field per column and files whole dollars.
 */
import type { SLILine } from '../domain/types'

export type ConsigneeType = 'DIRECT_CONSUMER' | 'GOVERNMENT_ENTITY' | 'RESELLER' | 'OTHER'
export type TransportMode = 'AIR' | 'OCEAN' | 'TRUCK' | 'RAIL'
export type FreightTerms = 'PREPAID' | 'COLLECT'

export interface PartyDraft {
  name: string
  addressLines: string[]
  /** Country/region registration number: EORI in the EU, USCI in China. */
  consigneeId?: string
}

/**
 * The reviewed, approved values for one SLI. Produced by the review screen, consumed by an
 * adapter. Every compliance-controlled field is explicit here rather than inferred at fill
 * time, so that what gets written is exactly what a human signed off.
 */
export interface SliDraft {
  // --- Parties -----------------------------------------------------------
  usppiName: string
  usppiAddressLines: string[]
  usppiZip: string
  usppiEin: string
  usppiContactName: string
  usppiContactPhone: string

  ultimateConsignee: PartyDraft
  intermediateConsignee?: PartyDraft
  consigneeType: ConsigneeType
  partiesRelated: boolean

  // --- Shipment ----------------------------------------------------------
  /** Box 2. Formatted by the adapter. */
  dateOfExportation: string
  /** Nippon box 3 — air waybill / booking number. Never present on the CIPL. */
  transportationReference: string
  /** Nippon box 11 / CEVA box 7. Internal sales-order reference, not on the CIPL. */
  shipmentReference: string
  /** CEVA box 8. Customer purchase orders, which *are* on the CIPL. */
  consigneePo: string
  pointOfOrigin: string
  destinationCountry: string
  mode: TransportMode
  incoterm: string
  namedPlace: string
  freight: FreightTerms
  insured: boolean
  /** Nippon service term, e.g. `DD` for door to door. */
  term: string
  jetpak: boolean
  routedExport: boolean
  hazardous: boolean
  containerized: boolean
  forwardingAgent: string
  specialInstructions: string
  /** CEVA box 23 — free text: piece count, dimensions, gross weight. */
  piecesAndDimensions: string

  // --- Commodities -------------------------------------------------------
  lines: SLILine[]

  // --- Signature block ---------------------------------------------------
  signerName: string
  signerTitle: string
  signerEmail: string
  signerPhone: string
  /** Initials for CEVA's dangerous-goods declaration box. */
  signerInitials: string
}

export interface TemplateVerification {
  ok: boolean
  /** Fields the adapter expects that the loaded PDF does not have. */
  missing: string[]
  /** Total AcroForm fields found. */
  found: number
}

export interface FillResult {
  bytes: Uint8Array
  /** Fields the adapter wrote, for the audit trail. */
  written: Record<string, string>
  /** Non-fatal problems, e.g. a value too long for its field. */
  warnings: string[]
}

export interface CarrierAdapter {
  id: string
  name: string
  /** Revision of the blank form this adapter is written against. */
  templateVersion: string
  /** Path under /public. */
  templateUrl: string
  /** Commodity rows the blank form can hold before a continuation sheet is needed. */
  maxCommodityRows: number
  /**
   * How many references fit in the reference box before the rest are abbreviated.
   *
   * Observed: the Nippon box 11 lists three sales orders then "3 Add'l"; the narrower CEVA
   * box 7 lists one then "3 Add'l".
   */
  maxInlineReferences: number
  supportedModes: TransportMode[]
  /** Controlled values applied when the reviewer does not choose otherwise. */
  defaults: Partial<SliDraft>
  /** Confirms the loaded PDF is the revision this adapter maps. */
  verifyTemplate(templateBytes: Uint8Array): Promise<TemplateVerification>
  fill(templateBytes: Uint8Array, draft: SliDraft): Promise<FillResult>
}
