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
const DB_VERSION = 1

/** Saved per consignee so the values that are not on the CIPL only get typed once. */
export interface ConsigneeRecord {
  /** Consignee name exactly as the CIPL prints it — the lookup key. */
  name: string
  /** EORI (EU) or USCI (China) registration number. */
  consigneeId: string
  consigneeType: ShipmentSettings['consigneeType']
  partiesRelated: boolean
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

/** One processed shipment, kept for autofill and as an audit trail. */
export interface ShipmentRecord {
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
      upgrade(database) {
        if (!database.objectStoreNames.contains('profile')) database.createObjectStore('profile')
        if (!database.objectStoreNames.contains('consignees')) {
          database.createObjectStore('consignees', { keyPath: 'name' })
        }
        if (!database.objectStoreNames.contains('overrides')) {
          database.createObjectStore('overrides', { keyPath: 'sourceCode' })
        }
        if (!database.objectStoreNames.contains('shipments')) {
          const store = database.createObjectStore('shipments', { keyPath: 'invoiceNumber' })
          store.createIndex('processedAt', 'processedAt')
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
      ['profile', 'consignees', 'overrides', 'shipments'].map((name) => database.clear(name)),
    )
  },
}

/** Overrides in the shape the reconciliation engine expects. */
export function overridesToMap(records: OverrideRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((r) => [r.sourceCode, r.approvedCode]))
}

/** In-memory implementation used by tests and by a strict no-persistence mode. */
export function createMemoryStore(): LocalStore {
  let profile: CompanyProfile | null = null
  const consignees = new Map<string, ConsigneeRecord>()
  const overrides = new Map<string, OverrideRecord>()
  const shipments = new Map<string, ShipmentRecord>()

  return {
    async getProfile() {
      return profile
    },
    async saveProfile(next) {
      profile = next
    },
    async getConsignee(name) {
      return consignees.get(name) ?? null
    },
    async saveConsignee(record) {
      consignees.set(record.name, record)
    },
    async listConsignees() {
      return [...consignees.values()]
    },
    async listOverrides() {
      return [...overrides.values()]
    },
    async saveOverride(record) {
      overrides.set(record.sourceCode, record)
    },
    async deleteOverride(sourceCode) {
      overrides.delete(sourceCode)
    },
    async listShipments(limit = 50) {
      return [...shipments.values()].sort((a, b) => b.processedAt.localeCompare(a.processedAt)).slice(0, limit)
    },
    async saveShipment(record) {
      shipments.set(record.invoiceNumber, record)
    },
    async clearAll() {
      profile = null
      consignees.clear()
      overrides.clear()
      shipments.clear()
    },
  }
}
