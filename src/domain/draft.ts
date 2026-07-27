/**
 * Assembles the reviewable draft: reconciled commodity rows plus the controlled values a
 * CIPL cannot supply.
 *
 * The split matters. Anything derived from the shipment documents is traceable and can be
 * checked automatically. Everything else — the USPPI profile, the internal sales-order
 * reference, the consignee's EORI, the export-control triplet — comes from the saved
 * profile or from the person filing, and is marked as such on the review screen.
 */
import type { CarrierAdapter, ConsigneeType, SliDraft, TransportMode } from '../carriers/types'
import type { Reconciliation } from './types'
import { resolveDestinationCountry } from './reconcile'

/** Stable facts about the exporter. Saved locally and reused across shipments. */
export interface CompanyProfile {
  usppiName: string
  usppiAddressLines: string[]
  usppiZip: string
  usppiEin: string
  contactName: string
  contactPhone: string
  pointOfOrigin: string
  signerName: string
  signerTitle: string
  signerEmail: string
  signerPhone: string
  signerInitials: string
}

/**
 * Per-shipment values that are not on the CIPL.
 *
 * `shipmentReference` deserves a note: on every historical example it is an internal sales
 * order number (`SO 13310965`, `13370794`) that appears nowhere in the CIPL. It cannot be
 * extracted and must be supplied — which is why it is here and not in the parser.
 */
export interface ShipmentSettings {
  transportationReference: string
  shipmentReference: string
  mode: TransportMode
  consigneeType: ConsigneeType
  partiesRelated: boolean
  consigneeId: string
  term: string
  insured: boolean
  jetpak: boolean
  routedExport: boolean
  hazardous: boolean
  containerized: boolean
  specialInstructions: string
  namedPlace: string
  /** Free text for CEVA box 23; dimensions are not on the CIPL. */
  piecesAndDimensions: string

  /**
   * Export-control triplet, applied to every commodity row.
   *
   * These start empty by design. A CIPL contains no ECCN, and "no ECCN on the invoice"
   * is not evidence that a commodity is EAR99 — nor does EAR99 by itself establish NLR.
   * They are a classification decision the filer makes and must be entered explicitly,
   * which is why they live here rather than in the carrier defaults.
   */
  eccn: string
  sme: string
  license: string
}

export const EMPTY_PROFILE: CompanyProfile = {
  usppiName: '',
  usppiAddressLines: [],
  usppiZip: '',
  usppiEin: '',
  contactName: '',
  contactPhone: '',
  pointOfOrigin: '',
  signerName: '',
  signerTitle: '',
  signerEmail: '',
  signerPhone: '',
  signerInitials: '',
}

export function defaultShipmentSettings(adapter: CarrierAdapter): ShipmentSettings {
  const d = adapter.defaults
  return {
    transportationReference: '',
    shipmentReference: '',
    mode: d.mode ?? 'AIR',
    consigneeType: d.consigneeType ?? 'RESELLER',
    partiesRelated: d.partiesRelated ?? false,
    consigneeId: '',
    term: d.term ?? 'DD',
    insured: d.insured ?? false,
    jetpak: d.jetpak ?? false,
    routedExport: d.routedExport ?? false,
    hazardous: d.hazardous ?? false,
    containerized: d.containerized ?? false,
    specialInstructions: '',
    namedPlace: '',
    piecesAndDimensions: '',
    // Deliberately blank — see the note on ShipmentSettings.
    eccn: '',
    sme: '',
    license: '',
  }
}

/**
 * Both forms ask box 6 / box 4a for a *complete* name and address, and an international
 * address without a country is not complete. The CIPL's consigned-to block is inconsistent
 * about it — vendorA2 ends "China" while vendorA1 ends "Bangalore, KARNATAKA 562123" and
 * vendorA3 ends "'s-Hertogenbosch NA 5234" — so the country is appended when it is missing
 * and left alone when it is already there.
 *
 * It duplicates the country-of-ultimate-destination box on purpose. That box is a coded
 * data element for the export declaration; this one is the delivery address the forwarder
 * actually routes on.
 */
export function withDestinationCountry(addressLines: string[], country: string | null): string[] {
  const lines = addressLines.filter((line) => line.trim())
  if (!country) return lines
  const needle = country.trim().toLowerCase()
  const alreadyThere = lines.some((line) => {
    const normalised = line.trim().toLowerCase()
    return normalised === needle || normalised.endsWith(` ${needle}`) || normalised.endsWith(`,${needle}`)
  })
  return alreadyThere ? lines : [...lines, country]
}

export function buildDraft(
  reconciliation: Reconciliation,
  profile: CompanyProfile,
  settings: ShipmentSettings,
  adapter: CarrierAdapter,
): SliDraft {
  const { header, sliLines } = reconciliation
  const destinationCountry = resolveDestinationCountry(header)

  return {
    usppiName: profile.usppiName,
    usppiAddressLines: profile.usppiAddressLines,
    usppiZip: profile.usppiZip,
    usppiEin: profile.usppiEin,
    usppiContactName: profile.contactName,
    usppiContactPhone: profile.contactPhone,

    ultimateConsignee: {
      name: header.consignedTo.name,
      addressLines: withDestinationCountry(header.consignedTo.lines, destinationCountry),
      consigneeId: settings.consigneeId || undefined,
    },
    consigneeType: settings.consigneeType,
    partiesRelated: settings.partiesRelated,

    // Box 2 takes the invoice date, not the later "on or about" sailing date — that is what
    // all three historical shipments do.
    dateOfExportation: header.invoiceDate,
    transportationReference: settings.transportationReference,
    shipmentReference: settings.shipmentReference,
    consigneePo: summariseReferences(header.orderNumbers),
    pointOfOrigin: profile.pointOfOrigin || (adapter.defaults.pointOfOrigin ?? ''),
    destinationCountry: destinationCountry ?? '',
    mode: settings.mode,
    incoterm: header.incoterm ?? '',
    namedPlace: settings.namedPlace,
    freight: header.freightTerms ?? adapter.defaults.freight ?? 'COLLECT',
    insured: settings.insured,
    term: settings.term,
    jetpak: settings.jetpak,
    routedExport: settings.routedExport,
    hazardous: settings.hazardous,
    containerized: settings.containerized,
    forwardingAgent: adapter.defaults.forwardingAgent ?? adapter.name,
    specialInstructions: settings.specialInstructions,
    piecesAndDimensions: settings.piecesAndDimensions || describePackages(reconciliation),

    lines: sliLines,

    signerName: profile.signerName,
    signerTitle: profile.signerTitle,
    signerEmail: profile.signerEmail,
    signerPhone: profile.signerPhone,
    signerInitials: profile.signerInitials,
  }
}

/**
 * Both forms have a single-line reference box, and the historical examples abbreviate a long
 * list as `<first>, N Add'l` rather than truncating it. Reproduced here.
 */
export function summariseReferences(references: string[]): string {
  if (!references.length) return ''
  if (references.length === 1) return references[0]
  return `${references[0]}, ${references.length - 1} Add'l`
}

/** Package summary from the packing list. Dimensions are not on the CIPL and stay manual. */
function describePackages(reconciliation: Reconciliation): string {
  const { header } = reconciliation
  const parts: string[] = []
  if (header.cartons) parts.push(`${header.cartons} carton${header.cartons === 1 ? '' : 's'}`)
  if (header.totalGrossWeightKg != null) {
    const lbs = header.totalGrossWeightKg / 0.4536
    parts.push(`${lbs.toFixed(0)} lbs / ${header.totalGrossWeightKg.toFixed(3)} Kg gross`)
  }
  return parts.join('\r')
}
