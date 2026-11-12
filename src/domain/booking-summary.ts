/**
 * The facts a pickup or booking request asks for, as plain text to copy into an email or a
 * forwarder's portal.
 *
 * Nothing here is sent anywhere: this builds a string, and the person pastes it where they
 * choose (AGENTS.md project rule 3).
 *
 * Every line is either what the document states, what the person entered on the review screen,
 * or the words that say neither exists. A layout that prints no piece count or no gross weight
 * gets "not stated on the document", never a figure worked out from something else: a booking
 * is priced and planned on these, and an invented one is a wrong figure with nothing on its
 * face to show it (project rule 1).
 */
import type { SliDraft } from '../carriers/types'
import type { ShipmentHeader } from './types'
import { kgToLb } from './units'

const NOT_STATED = 'not stated on the document'
const NOT_ENTERED = 'not entered'

/** `4.100 kg (9.0 lb)`, at the places the forms use (ADR 0002), or null for no usable figure. */
function weight(kg: number | null): string | null {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null
  return `${kg.toFixed(3)} kg (${kgToLb(kg).toFixed(1)} lb)`
}

const joined = (values: string[]): string | null => {
  const kept = [...new Set(values.map((v) => v.trim()).filter(Boolean))]
  return kept.length ? kept.join(', ') : null
}

/**
 * The summary, one fact per line, in the order a pickup request is usually read: what the
 * shipment is, where it is going and how, then what is to be collected.
 *
 * `carrier` names who is carrying it when the draft cannot: a shipment keyed into FedEx or UPS
 * borrows a forwarder's adapter as scaffolding for its draft, and that adapter's name in a
 * pickup request would send it to the wrong company.
 */
export function buildBookingSummary(header: ShipmentHeader, draft: SliDraft, carrier?: string): string {
  const pieces = header.cartons != null && Number.isFinite(header.cartons) && header.cartons > 0 ? String(header.cartons) : null
  const purchaseOrders = joined(header.purchaseOrders)
  const entered = draft.piecesAndDimensions
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const lines: string[] = [
    `Invoice: ${header.invoiceNumber.trim() || NOT_STATED}`,
    `Order numbers: ${joined(header.orderNumbers) ?? NOT_STATED}`,
    // Only layouts that print the customer's PO apart from their own order numbers have this.
    ...(purchaseOrders ? [`Customer PO: ${purchaseOrders}`] : []),
    `Shipment reference: ${draft.shipmentReference.trim() || NOT_ENTERED}`,
    `Consignee: ${draft.ultimateConsignee.name.trim() || NOT_STATED}`,
    `Destination: ${draft.destinationCountry.trim() || NOT_STATED}`,
    `Carrier: ${carrier?.trim() || draft.forwardingAgent.trim() || header.vesselAgent?.trim() || NOT_STATED}`,
    `Mode: ${draft.mode}`,
    `Incoterm: ${[draft.incoterm.trim(), draft.namedPlace.trim()].filter(Boolean).join(' ') || NOT_STATED}`,
    `Ship date: ${draft.dateOfExportation.trim() || NOT_STATED}`,
    `Pieces: ${pieces ?? NOT_STATED}`,
    `Gross weight: ${weight(header.totalGrossWeightKg) ?? NOT_STATED}`,
    // What the person typed for the forwarder, dimensions included: the one place those exist.
    entered.length ? 'Pieces and dimensions, as entered:' : `Pieces and dimensions: ${NOT_ENTERED}`,
    ...entered.map((line) => `  ${line}`),
  ]
  return lines.join('\n')
}
