/**
 * Local persistence.
 *
 * Everything stays on this machine. There is no server in this application: documents are
 * parsed in the browser and forms are generated in the browser, so shipment data never
 * crosses the network.
 *
 * The `LocalStore` interface is the seam for packaging this as a desktop app later — a
 * Tauri build swaps the IndexedDB implementation for one backed by files on disk without
 * touching any calling code.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { CompanyProfile, ShipmentSettings } from '../domain/draft'
import type { CheckResult, SLILine } from '../domain/types'

const DB_NAME = 'formwaypoint'
const DB_VERSION = 3

/** Saved per consignee so the values that are not on the CIPL only get typed once. */
export interface ConsigneeRecord {
  /** Consignee name exactly as the CIPL prints it — the lookup key. */
  name: string
  /** EORI (EU) or USCI (China) registration number. */
  consigneeId: string
  consigneeType: ShipmentSettings['consigneeType']
  partiesRelated: boolean
  /** Country of ultimate destination, for layouts whose address block omits it. */
  destinationCountry: string
  lastUsed: string
}

/**
 * A classification change a reviewer approved, with the reason they gave.
 *
 * Deliberately explicit: the tool never learns a classification from a historical form. One
 * of the sample shipments was filed with a code that does not describe the goods, and a
 * system that quietly adopted it would repeat the error on every future shipment.
 */
export interface OverrideRecord {
  /** Normalised code as printed on the CIPL. */
  sourceCode: string
  /** Normalised code to file instead. */
  approvedCode: string
  reason: string
  approvedBy: string
  approvedAt: string
}

/**
 * Net weight of one unit of a part.
 *
 * The `vendor-b` CIPL format prints no weights at all, so box 26 has to come from
 * somewhere. Entered once per part and reused, which is why this is reference data rather
 * than shipment data. Never inferred: an unknown part blocks generation instead of
 * defaulting to zero.
 */
export interface PartWeightRecord {
  partNumber: string
  netWeightKg: number
  /** Description as last seen, purely to make the saved list readable. */
  description: string
  updatedAt: string
}

/** One processed shipment, kept for autofill and as an audit trail. */
export interface ShipmentRecord {
  /**
   * `${invoiceNumber}@${processedAt}`.
   *
   * Keyed per run, not per invoice: regenerating a shipment after correcting an ECCN must
   * add a record, not replace the earlier one. An audit trail that overwrites its own
   * history is worse than none. It also keeps shipments whose invoice number could not be
   * parsed from all collapsing onto the empty-string key.
   */
  id: string
  invoiceNumber: string
  processedAt: string
  carrierId: string
  fileName: string
  consigneeName: string
  destinationCountry: string
  totalQuantity: number
  totalValueUsd: number
  totalNetWeightKg: number
  lines: SLILine[]
  checks: CheckResult[]
  settings: ShipmentSettings
}

export interface LocalStore {
  getProfile(): Promise<CompanyProfile | null>
  saveProfile(profile: CompanyProfile): Promise<void>

  getConsignee(name: string): Promise<ConsigneeRecord | null>
  saveConsignee(record: ConsigneeRecord): Promise<void>
  listConsignees(): Promise<ConsigneeRecord[]>

  listOverrides(): Promise<OverrideRecord[]>
  saveOverride(record: OverrideRecord): Promise<void>
  deleteOverride(sourceCode: string): Promise<void>

  listPartWeights(): Promise<PartWeightRecord[]>
  savePartWeight(record: PartWeightRecord): Promise<void>
  deletePartWeight(partNumber: string): Promise<void>

  listShipments(limit?: number): Promise<ShipmentRecord[]>
  saveShipment(record: ShipmentRecord): Promise<void>

  /** Removes everything. Exposed in the UI so a shared machine can be wiped. */
  clearAll(): Promise<void>
}

type Schema = IDBPDatabase<unknown>

let dbPromise: Promise<Schema> | null = null

function db(): Promise<Schema> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (!database.objectStoreNames.contains('profile')) database.createObjectStore('profile')
        if (!database.objectStoreNames.contains('consignees')) {
          database.createObjectStore('consignees', { keyPath: 'name' })
        }
        if (!database.objectStoreNames.contains('overrides')) {
          database.createObjectStore('overrides', { keyPath: 'sourceCode' })
        }
        // v3 adds per-part weights, needed by formats that print none.
        if (!database.objectStoreNames.contains('partWeights')) {
          database.createObjectStore('partWeights', { keyPath: 'partNumber' })
        }
        // v1 keyed shipments on invoiceNumber, which silently overwrote re-runs. v2 keys
        // on a per-run id; the old store is dropped rather than migrated because it only
        // ever held the most recent attempt per invoice.
        if (!database.objectStoreNames.contains('shipments')) {
          const shipments = database.createObjectStore('shipments', { keyPath: 'id' })
          shipments.createIndex('processedAt', 'processedAt')
          shipments.createIndex('invoiceNumber', 'invoiceNumber')
        } else if (oldVersion < 2) {
          // v1 keyed on invoiceNumber, which silently overwrote re-runs. Rebuild on the
          // per-run id; the old store only ever held the latest attempt per invoice.
          database.deleteObjectStore('shipments')
          const shipments = database.createObjectStore('shipments', { keyPath: 'id' })
          shipments.createIndex('processedAt', 'processedAt')
          shipments.createIndex('invoiceNumber', 'invoiceNumber')
        }
      },
    })
  }
  return dbPromise
}

export const indexedDbStore: LocalStore = {
  async getProfile() {
    return (await (await db()).get('profile', 'current')) ?? null
  },
  async saveProfile(profile) {
    await (await db()).put('profile', profile, 'current')
  },

  async getConsignee(name) {
    if (!name) return null
    return (await (await db()).get('consignees', name)) ?? null
  },
  async saveConsignee(record) {
    await (await db()).put('consignees', record)
  },
  async listConsignees() {
    return (await (await db()).getAll('consignees')) as ConsigneeRecord[]
  },

  async listOverrides() {
    return (await (await db()).getAll('overrides')) as OverrideRecord[]
  },
  async saveOverride(record) {
    await (await db()).put('overrides', record)
  },
  async deleteOverride(sourceCode) {
    await (await db()).delete('overrides', sourceCode)
  },

  async listPartWeights() {
    return (await (await db()).getAll('partWeights')) as PartWeightRecord[]
  },
  async savePartWeight(record) {
    await (await db()).put('partWeights', record)
  },
  async deletePartWeight(partNumber) {
    await (await db()).delete('partWeights', partNumber)
  },

  async listShipments(limit = 50) {
    const all = (await (await db()).getAll('shipments')) as ShipmentRecord[]
    return all.sort((a, b) => b.processedAt.localeCompare(a.processedAt)).slice(0, limit)
  },
  async saveShipment(record) {
    await (await db()).put('shipments', record)
  },

  async clearAll() {
    const database = await db()
    await Promise.all(
      ['profile', 'consignees', 'overrides', 'shipments', 'partWeights'].map((name) => database.clear(name)),
    )
  },
}

/** Per-part weights in the shape the reconciliation engine expects. */
export function partWeightsToMap(records: PartWeightRecord[]): Record<string, number> {
  return Object.fromEntries(records.map((r) => [r.partNumber, r.netWeightKg]))
}

/** Overrides in the shape the reconciliation engine expects. */
export function overridesToMap(records: OverrideRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((r) => [r.sourceCode, r.approvedCode]))
}
