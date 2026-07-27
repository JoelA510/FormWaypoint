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
import { parseLooseDate } from '../carriers/form-utils'
import type { CheckResult, Reconciliation } from './types'
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
  /**
   * Overrides for values the document may not supply.
   *
   * The `vendor-b` layout prints no Incoterm and often no country (its consignee
   * block can end at a postal line), so both have to be enterable. Empty means "use what
   * the document says"; a value here always wins.
   */
  destinationCountry: string
  incoterm: string
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
    destinationCountry: '',
    incoterm: '',
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
  const destinationCountry = settings.destinationCountry.trim() || resolveDestinationCountry(header)

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
    // Prefilled from the sales orders where the document actually carries them, and only
    // there: a layout that prints the *customer's* PO as its order number has no sales
    // order to offer, and guessing one would be worse than leaving the box empty.
    // Shipment vendorB2 was filed with a stale reference carried over from a previous form —
    // exactly the transcription this removes.
    shipmentReference:
      settings.shipmentReference ||
      (header.purchaseOrders.length
        ? summariseReferences(header.orderNumbers, adapter.maxInlineReferences)
        : ''),
    // The consignee's *purchase* orders. Layouts that print them separately from the
    // sales order supply `purchaseOrders`; where the two are the same column (FC/TP1), the
    // order numbers already are the customer's POs. Filing vendor's own sales order in a box
    // labelled "Consignee PO#" would be wrong on both counts.
    consigneePo: summariseReferences(
      header.purchaseOrders.length ? header.purchaseOrders : header.orderNumbers,
      adapter.maxInlineReferences,
    ),
    pointOfOrigin: profile.pointOfOrigin || (adapter.defaults.pointOfOrigin ?? ''),
    destinationCountry: destinationCountry ?? '',
    mode: settings.mode,
    incoterm: settings.incoterm.trim() || header.incoterm || '',
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
export function summariseReferences(references: string[], maxInline = 1): string {
  if (!references.length) return ''
  const shown = references.slice(0, Math.max(1, maxInline))
  const remaining = references.length - shown.length
  return remaining > 0 ? `${shown.join(', ')}, ${remaining} Add'l` : shown.join(', ')
}

/**
 * Carrier defaults, reapplied when the forwarder changes.
 *
 * Only fields the *adapter* owns are reset. Anything the person typed — references,
 * consignee id, instructions, and the export-control triplet — is theirs and survives the
 * switch. The transport mode is additionally clamped, because CEVA's form has no truck or
 * rail column and a stale `TRUCK` would otherwise be filed as air.
 */
export function applyCarrierDefaults(previous: ShipmentSettings, adapter: CarrierAdapter): ShipmentSettings {
  const defaults = defaultShipmentSettings(adapter)
  return {
    ...defaults,
    transportationReference: previous.transportationReference,
    shipmentReference: previous.shipmentReference,
    consigneeId: previous.consigneeId,
    consigneeType: previous.consigneeType,
    partiesRelated: previous.partiesRelated,
    hazardous: previous.hazardous,
    routedExport: previous.routedExport,
    insured: previous.insured,
    specialInstructions: previous.specialInstructions,
    namedPlace: previous.namedPlace,
    destinationCountry: previous.destinationCountry,
    incoterm: previous.incoterm,
    piecesAndDimensions: previous.piecesAndDimensions,
    eccn: previous.eccn,
    sme: previous.sme,
    license: previous.license,
    mode: adapter.supportedModes.includes(previous.mode) ? previous.mode : (defaults.mode ?? 'AIR'),
  }
}

/**
 * Checks over the assembled draft rather than the source document.
 *
 * `reconcile` can only prove what the CIPL says. These cover the other half — the fields a
 * person supplies — because a form whose totals reconcile perfectly but whose USPPI name,
 * EIN and signer block are blank is not a form anyone should be able to download.
 */
export function checkDraft(draft: SliDraft, adapter: CarrierAdapter): CheckResult[] {
  const checks: CheckResult[] = []

  const required: [string, string][] = [
    ['USPPI name', draft.usppiName],
    ['USPPI EIN', draft.usppiEin],
    ['ZIP code', draft.usppiZip],
    ['Point of origin', draft.pointOfOrigin],
    ['Signer name', draft.signerName],
    ['Signer title', draft.signerTitle],
  ]
  const missing = required.filter(([, value]) => !value?.trim()).map(([label]) => label)

  checks.push({
    id: 'profile-complete',
    severity: 'blocking',
    title: 'Exporter profile is complete',
    detail: missing.length
      ? `Not set: ${missing.join(', ')}. These identify the party certifying the declaration and cannot be left blank.`
      : 'Every identifying field the form requires is present.',
    passed: missing.length === 0,
  })

  checks.push({
    id: 'destination-country',
    severity: 'blocking',
    title: 'Country of ultimate destination established',
    detail: draft.destinationCountry
      ? `Filing "${draft.destinationCountry}".`
      : 'Neither the discharge port nor the consignee address yields a country name. Enter it before filing — ' +
        'a postal line must not be used here.',
    passed: Boolean(draft.destinationCountry),
  })

  const dateOk = parseLooseDate(draft.dateOfExportation) !== null
  checks.push({
    id: 'export-date',
    severity: 'blocking',
    title: 'Date of exportation is a real date',
    detail: dateOk
      ? `Filing ${draft.dateOfExportation}.`
      : `"${draft.dateOfExportation || '(blank)'}" could not be read as a date, so it would be written to the ` +
        'form unformatted. Correct it before filing.',
    passed: dateOk,
  })

  const modeOk = adapter.supportedModes.includes(draft.mode)
  checks.push({
    id: 'mode-supported',
    severity: 'blocking',
    title: 'Transport mode is on this form',
    detail: modeOk
      ? `${draft.mode} is supported by the ${adapter.name} form.`
      : `${draft.mode} has no box on the ${adapter.name} form (it supports ${adapter.supportedModes.join(', ')}). ` +
        'Choose a supported mode or a different carrier.',
    passed: modeOk,
  })

  checks.push({
    id: 'shipment-reference',
    severity: 'warning',
    title: 'Shipment reference supplied',
    detail: draft.shipmentReference
      ? `Filing "${draft.shipmentReference}".`
      : 'Empty. The reference identifies this filing and must be unique for five years; it is not on the CIPL.',
    passed: Boolean(draft.shipmentReference),
  })

  return checks
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
