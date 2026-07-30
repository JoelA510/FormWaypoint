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
import type { ItemLibraryEntry } from '../domain/item-library'
import type { CheckResult, SLILine } from '../domain/types'
import { partKey } from '../domain/part-key'

const DB_NAME = 'formwaypoint'
const DB_VERSION = 4

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
 * What a person entered by hand about one part, kept and reused.
 *
 * Two fields, for two different reasons the item master cannot answer:
 *
 *   - **`netWeightKg`** — the `omron-shipment` CIPL format prints no weights at all, so
 *     box 26 has to come from somewhere. Never inferred: an unknown part blocks generation
 *     instead of defaulting to zero.
 *   - **`exportCode`** — the commodity number to file for this part instead of the one the
 *     document prints. Narrower than an `OverrideRecord`, which redirects a code wherever it
 *     appears; this says nothing about other parts sharing that code.
 *
 * A weight is a measurement and needs no justification. A code is a classification decision,
 * so `reason` and `enteredBy` are required alongside one and are carried into the item-master
 * worklist — an override nobody can account for later is indistinguishable from a typo.
 *
 * Stored under the object store still named `partWeights`. Renaming it would mean migrating
 * saved rows for no functional gain; a record written before codes existed simply has none,
 * which reads correctly as "weight entered, code untouched".
 */
export interface PartOverrideRecord {
  partNumber: string
  /** Null when only the code was overridden. */
  netWeightKg: number | null
  /** Normalised ten digits, or absent when only the weight was entered. */
  exportCode?: string
  /** Why this code, required with one. Empty for a weight-only record. */
  reason?: string
  enteredBy?: string
  /** Description as last seen, purely to make the saved list readable. */
  description: string
  updatedAt: string
}

/** The fields of a part's record that a caller may set. */
export type PartOverridePatch = Partial<Pick<PartOverrideRecord, 'netWeightKg' | 'exportCode' | 'reason' | 'enteredBy'>>

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

  listPartOverrides(): Promise<PartOverrideRecord[]>
  /**
   * Merges a patch into one part's record, reading and writing in a single transaction.
   *
   * A patch rather than a whole record, and merged here rather than by the caller, because
   * the two fields are edited by two controls in the same table row. A blur and a click land
   * within a few milliseconds of each other, and a caller merging against its own React state
   * would have the second write built from a snapshot taken before the first landed — sending
   * back `netWeightKg: null` and silently erasing the weight just typed.
   */
  savePartOverride(partNumber: string, description: string, patch: PartOverridePatch): Promise<void>
  deletePartOverride(partNumber: string): Promise<void>

  listItems(): Promise<ItemLibraryEntry[]>
  /** Replaces the whole library — a refreshed extract of the same item master. */
  replaceItems(entries: ItemLibraryEntry[]): Promise<void>
  /** Adds to the library, the incoming row winning on a part already held. */
  mergeItems(entries: ItemLibraryEntry[]): Promise<void>
  clearItems(): Promise<void>

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
        // v4 adds the imported item master.
        if (!database.objectStoreNames.contains('items')) {
          database.createObjectStore('items', { keyPath: 'partNumber' })
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

  async listPartOverrides() {
    return (await (await db()).getAll('partWeights')) as PartOverrideRecord[]
  },
  async savePartOverride(partNumber, description, patch) {
    const tx = (await db()).transaction('partWeights', 'readwrite')
    const held = (await tx.store.getAll()) as PartOverrideRecord[]
    // Matched on the normalised part number, not the stored key: a part whose casing differs
    // between two documents is one part and must not become two rows.
    const existing = held.find((r) => partKey(r.partNumber) === partKey(partNumber))
    const merged: PartOverrideRecord = {
      ...existing,
      partNumber: existing?.partNumber ?? partNumber,
      description: description || existing?.description || '',
      netWeightKg: existing?.netWeightKg ?? null,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    // A record with neither field left says nothing, and would put an empty row in the
    // item-master worklist.
    if (merged.netWeightKg == null && !merged.exportCode?.trim()) {
      if (existing) await tx.store.delete(existing.partNumber)
    } else {
      await tx.store.put(merged)
    }
    await tx.done
  },
  async deletePartOverride(partNumber) {
    const tx = (await db()).transaction('partWeights', 'readwrite')
    const held = (await tx.store.getAll()) as PartOverrideRecord[]
    const existing = held.find((r) => partKey(r.partNumber) === partKey(partNumber))
    if (existing) await tx.store.delete(existing.partNumber)
    await tx.done
  },

  async listItems() {
    return (await (await db()).getAll('items')) as ItemLibraryEntry[]
  },
  async replaceItems(entries) {
    // One transaction: a library half-replaced by a failed write would silently mix two
    // item masters, and the weights it supplies go straight onto a customs form.
    const tx = (await db()).transaction('items', 'readwrite')
    await tx.store.clear()
    await Promise.all(entries.map((entry) => tx.store.put(entry)))
    await tx.done
  },
  async mergeItems(entries) {
    const tx = (await db()).transaction('items', 'readwrite')
    await Promise.all(entries.map((entry) => tx.store.put(entry)))
    await tx.done
  },
  async clearItems() {
    await (await db()).clear('items')
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
      ['profile', 'consignees', 'overrides', 'shipments', 'partWeights', 'items'].map((name) => database.clear(name)),
    )
  },
}

/**
 * The store the application talks to.
 *
 * This assignment is the entire desktop seam: a Tauri build replaces it with a
 * file-backed `LocalStore` and no calling code changes, because nothing outside this
 * module names an implementation.
 */
export const localStore: LocalStore = indexedDbStore

/** Manually entered weights in the shape the reconciliation engine expects. */
export function overrideWeights(records: PartOverrideRecord[]): Record<string, number> {
  return Object.fromEntries(
    records.filter((r) => r.netWeightKg != null).map((r) => [partKey(r.partNumber), r.netWeightKg as number]),
  )
}

/**
 * Manually entered commodity numbers, keyed by uppercased part number.
 *
 * A record with no code is skipped rather than mapped to an empty string: an empty code
 * would look like an override to a blank classification and wipe out what the document says.
 */
export function overrideCodes(records: PartOverrideRecord[]): Record<string, string> {
  return Object.fromEntries(
    records
      .filter((r) => r.exportCode?.trim())
      .map((r) => [partKey(r.partNumber), (r.exportCode as string).trim()]),
  )
}

/** Overrides in the shape the reconciliation engine expects. */
export function overridesToMap(records: OverrideRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((r) => [r.sourceCode, r.approvedCode]))
}
