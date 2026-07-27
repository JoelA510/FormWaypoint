import type { CarrierAdapter } from './types'
import { createNipponExpressAdapter, type NipponOptions } from './nippon-express/adapter'
import { createCevaAdapter } from './ceva/adapter'

export type CarrierId = 'nippon-express' | 'ceva'

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
export function detectCarrier(vesselAgent: string | null | undefined): CarrierId | null {
  const text = (vesselAgent ?? '').toLowerCase()
  if (!text) return null
  if (text.includes('nippon')) return 'nippon-express'
  if (text.includes('ceva')) return 'ceva'
  return null
}

export * from './types'
