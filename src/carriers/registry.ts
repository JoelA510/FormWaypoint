import type { CarrierAdapter } from './types'
import { createNipponExpressAdapter, type NipponOptions } from './nippon-express/adapter'
import { createCevaAdapter } from './ceva/adapter'

export type CarrierId = 'nippon-express' | 'ceva'

/**
 * Carriers handled by keying their desktop software instead of filling a form.
 *
 * FedEx and UPS both publish an SLI, but in practice neither is used: the shipment is typed
 * into Ship Manager or WorldShip and the paper form never comes out. Treating them as real
 * choices matters because the alternative is what the app used to do — quietly fall back to
 * Nippon Express when a CIPL named FedEx, offering to fill the wrong forwarder's form.
 */
export type KeyedCarrierId = 'fedex' | 'ups'
export type ShipmentCarrierId = CarrierId | KeyedCarrierId

export const KEYED_CARRIERS: Record<KeyedCarrierId, { label: string; application: string }> = {
  fedex: { label: 'FedEx', application: 'FedEx Ship Manager' },
  ups: { label: 'UPS', application: 'UPS WorldShip' },
}

export function isKeyedCarrier(id: ShipmentCarrierId): id is KeyedCarrierId {
  return id === 'fedex' || id === 'ups'
}

export interface CarrierOptions {
  nipponExpress?: NipponOptions
}

/** Every carrier the tool can generate a form for. */
export function getAdapters(options: CarrierOptions = {}): CarrierAdapter[] {
  return [createNipponExpressAdapter(options.nipponExpress), createCevaAdapter()]
}

export function getAdapter(id: CarrierId, options: CarrierOptions = {}): CarrierAdapter {
  const adapter = getAdapters(options).find((a) => a.id === id)
  if (!adapter) throw new Error(`No carrier adapter registered for "${id}".`)
  return adapter
}

/**
 * Which forwarder a CIPL names, so the right carrier is preselected.
 * The CIPL's "VESSEL AGENT OR AIR LINES" field carries it.
 */
export function detectCarrier(vesselAgent: string | null | undefined): ShipmentCarrierId | null {
  const text = (vesselAgent ?? '').toLowerCase()
  if (!text) return null
  if (text.includes('nippon')) return 'nippon-express'
  if (text.includes('ceva')) return 'ceva'
  if (text.includes('fedex') || text.includes('federal express')) return 'fedex'
  // Word-bounded: 'ups' is three letters that sit inside ordinary words — "Groups",
  // "Supship" — and a match there silently preselects UPS and swaps its keying defaults in.
  if (/\bups\b/.test(text) || text.includes('united parcel')) return 'ups'
  return null
}

export * from './types'
