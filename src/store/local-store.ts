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
import { localDate } from '../lib/report'
import type { CompanyProfile, ShipmentSettings } from '../domain/draft'
import type { ItemLibraryEntry } from '../domain/item-library'
import type { KeyingOptions } from '../carriers/keying-sheet/options'
import type { DgConsignment } from '../domain/dangerous-goods/types'
import type { CheckResult, SLILine } from '../domain/types'
import { partKey } from '../domain/part-key'

const DB_NAME = 'formwaypoint'
const DB_VERSION = 5

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
 *   - **`netWeightKg`** — the `vendor-b` CIPL format prints no weights at all, so
 *     box 26 has to come from somewhere. Never inferred: an unknown part blocks generation
 *     instead of defaulting to zero.
 *   - **`exportCode`** — the commodity number to file for this part instead of the one the
 *     document prints. Narrower than an `OverrideRecord`, which redirects a code wherever it
 *     appears; this says nothing about other parts sharing that code.
 *   - **`sliDescription`** — the wording to key into a carrier's commodity record. The CIPL
 *     prints whatever the ERP holds, which is often a group heading (`Elect. Apparatus,
 *     Other`) or an internal code (`SA34-F1`). The app will not compose a better one — a
 *     commodity description is part of what is being declared — but it will remember the
 *     operator's, so it is written once and reused on every future shipment of that part.
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
  /**
   * Commodity wording for a carrier's own software. Distinct from `description` below,
   * which is only ever what the document last called this part.
   */
  sliDescription?: string
  /** Why this code, required with one. Empty for a weight-only record. */
  reason?: string
  enteredBy?: string
  /** Description as last seen, purely to make the saved list readable. */
  description: string
  updatedAt: string
}

/** The fields of a part's record that a caller may set. */
export type PartOverridePatch = Partial<
  Pick<PartOverrideRecord, 'netWeightKg' | 'exportCode' | 'sliDescription' | 'reason' | 'enteredBy'>
>

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

/**
 * One dangerous goods consignment, kept because the regulations say to keep it.
 *
 * Every other record in this store is here for convenience — so a weight is typed once, so a
 * consignee's EORI is remembered. This one is here because a copy of the Shipper's
 * Declaration must be retained for a minimum of two years and be producible, at the shipment
 * location, on an authorised official's request. `retainUntil` is that date, computed once at
 * preparation rather than derived on the fly, so a record still says how long it is owed even
 * if the rule around it changes.
 *
 * The record is not the declaration. The declaration is the signed paper; this is what was
 * declared, what was checked, and what the checks said — the thing that answers "why was this
 * shipment prepared this way" when the paper alone cannot.
 */
export interface DgConsignmentRecord {
  /** `${air waybill or reference or 'consignment'}@${preparedAt}`, keyed per run like shipments. */
  id: string
  preparedAt: string
  /**
   * Two years on from preparation, as `YYYY-MM-DD` — the *earliest* the obligation can end.
   * The rule runs from acceptance by the initial carrier, which is on or after preparation,
   * so this date is a floor and the UI labels it "at least".
   */
  retainUntil: string
  airWaybillNumber: string
  shippersReference: string
  consigneeName: string
  airportOfDeparture: string
  airportOfDestination: string
  aircraft: DgConsignment['aircraft']
  /** False for a consignment that was entirely Section II and produced no declaration. */
  declarationRequired: boolean
  /** Distinct UN numbers, for the history list. */
  unNumbers: string[]
  /** Distinct packing instructions and sections, e.g. `965 IB`. */
  packingInstructions: string[]
  packages: number
  netWeightKg: number
  /** Everything that was entered, so the declaration can be reproduced exactly. */
  consignment: DgConsignment
  checks: CheckResult[]
}

export interface LocalStore {
  getProfile(): Promise<CompanyProfile | null>
  saveProfile(profile: CompanyProfile): Promise<void>

  /**
   * How the keying sheet was last laid out.
   *
   * A preference, not shipment data — it belongs to this machine and this operator, and is
   * kept only so somebody who works one way is not made to re-pick it every shipment. Stored
   * loosely typed because `withDefaults` is what decides whether a saved value still means
   * anything; a set held here can outlive the column names it mentions.
   */
  getKeyingOptions(): Promise<Partial<KeyingOptions> | null>
  saveKeyingOptions(options: KeyingOptions): Promise<void>

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

  listDgConsignments(limit?: number): Promise<DgConsignmentRecord[]>
  saveDgConsignment(record: DgConsignmentRecord): Promise<void>

  /**
   * Removes everything except the dangerous goods consignment records. Exposed in the UI so
   * a shared machine can be wiped.
   *
   * The carve-out is the point, not an oversight. Every other store holds convenience data;
   * `dgConsignments` holds the evidence behind a two-year retention obligation, and this
   * used to delete it under a confirmation dialog that read as though it were kept. Records
   * past their `retainUntil` date are owed nothing and are dropped.
   *
   * Resolves with the stores that could *not* be cleared, described the way the UI names
   * them; an empty array means everything went. Rejects only where nothing was deleted at
   * all, which is the one case the caller may report as "nothing was deleted". Clearing six
   * stores under a single `Promise.all` gave no way to tell the two apart: one store
   * rejecting left the other five gone and the caller told the user their data was intact.
   */
  clearAll(): Promise<string[]>
}

type Schema = IDBPDatabase<unknown>

/**
 * How long a caller waits on an open that another tab is blocking, before being told.
 *
 * Bounded rather than terminal. The other tab may close at any moment and the open completes
 * when it does, so the request is left running and only the wait is cut short — an
 * unbounded wait is the failure this replaces, and giving up on the database entirely would
 * be the opposite mistake.
 */
const BLOCKED_GRACE_MS = 4000

const SUPERSEDED_MESSAGE =
  'Another tab has opened a newer version of this application, which needed the local database. This tab is ' +
  'now working without it — nothing typed here is being saved. Reload the page.'

const BLOCKED_MESSAGE =
  'Another tab has this application open on an older version and is holding the local database, so it cannot ' +
  'be upgraded. Close the other tabs and reload this one.'

/** The handle, once one has been obtained; every later call is served straight from it. */
let handle: Schema | null = null
/** The in-flight open, and the bounded wait callers get on it. */
let opening: { database: Promise<Schema>; wait: Promise<Schema> } | null = null
/**
 * Set when a newer version in another tab took the database away from this one.
 *
 * Terminal, deliberately. This tab is running the old code and can only ever ask for the old
 * version, which the browser now refuses — reopening would fail with a `VersionError` on
 * every call for the life of the page, and the writes that swallow their errors would go on
 * disappearing in silence. Saying so once is the only honest answer.
 */
let superseded = false

/**
 * The open database, opened once.
 *
 * Wrapped rather than handed straight back from `openDB` because of what happens when the
 * version changes under a browser that already has this app open somewhere else. IndexedDB
 * will not upgrade while an older connection is live: the new tab's open request goes to
 * `blocked` and stays pending *forever*. Memoized, that pending promise is every store call
 * in the application, so the panels sit empty and the Generate buttons stay disabled with
 * nothing said — the `finally` that clears `busy` never runs.
 *
 * Both sides of that are handled, and they are not symmetrical. Being blocked is temporary
 * and self-healing: the wait is bounded, the open is left running, and the first call after
 * it completes is served normally. Being *superseded* is not: that tab's code is a version
 * behind and there is nothing it can do but say so.
 */
function db(): Promise<Schema> {
  if (superseded) return Promise.reject(new Error(SUPERSEDED_MESSAGE))
  // Served from the handle once there is one, so a caller that gave up waiting on a blocked
  // open does not keep failing after the block clears.
  if (handle) return Promise.resolve(handle)

  if (!opening) {
    let giveUp: (reason: Error) => void = () => {}
    const abandoned = new Promise<never>((_, reject) => {
      giveUp = reject
    })
    const database = openDB(DB_NAME, DB_VERSION, {
      blocked() {
        setTimeout(() => giveUp(new Error(BLOCKED_MESSAGE)), BLOCKED_GRACE_MS)
      },
      blocking(_current, _blocked, event) {
        // This tab is the old one. Letting go is what unblocks the other; holding on would
        // leave it waiting on a connection nobody is going to use again.
        superseded = true
        handle = null
        opening = null
        ;(event.target as IDBDatabase | null)?.close()
      },
      terminated() {
        handle = null
        opening = null
      },
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
        // v5 adds dangerous goods consignments, which are kept to satisfy the two-year
        // retention rule rather than for autofill.
        if (!database.objectStoreNames.contains('dgConsignments')) {
          const dg = database.createObjectStore('dgConsignments', { keyPath: 'id' })
          dg.createIndex('preparedAt', 'preparedAt')
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
    const current = { database, wait: Promise.race([database, abandoned]) }
    opening = current
    database.then(
      (opened) => {
        // Kept even if `blocking` fired while the open was in flight: that tab is
        // superseded and must not go on using a connection the newer one is waiting for.
        if (superseded) opened.close()
        else handle = opened
      },
      () => {
        if (opening === current) opening = null
      },
    )
    // The bounded wait rejects on its own schedule; nothing else may treat that as an
    // unhandled failure.
    current.wait.catch(() => {})
  }
  return opening.wait
}

export const indexedDbStore: LocalStore = {
  async getProfile() {
    return (await (await db()).get('profile', 'current')) ?? null
  },
  async getKeyingOptions() {
    return (await (await db()).get('profile', 'keyingOptions')) ?? null
  },
  async saveKeyingOptions(options) {
    await (await db()).put('profile', options, 'keyingOptions')
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
    if (merged.netWeightKg == null && !merged.exportCode?.trim() && !merged.sliDescription?.trim()) {
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

  /**
   * Every record, newest first, unless a caller asks for fewer.
   *
   * Uncapped by default on purpose, unlike the shipment history beside it. This list is the
   * evidence behind a two-year retention obligation, and a silent ceiling on the one screen
   * that exists to say what must be kept is the same failure as deleting them: a
   * consignment still inside its window simply was not there. Two years of them is a few
   * hundred rows.
   */
  async listDgConsignments(limit) {
    const all = (await (await db()).getAll('dgConsignments')) as DgConsignmentRecord[]
    const newestFirst = all.sort((a, b) => b.preparedAt.localeCompare(a.preparedAt))
    return limit == null ? newestFirst : newestFirst.slice(0, limit)
  },
  async saveDgConsignment(record) {
    await (await db()).put('dgConsignments', record)
  },

  async clearAll() {
    const database = await db()
    // Settled rather than all-or-nothing, so what actually happened can be reported. The
    // stores are independent and one refusing does not put the others back.
    const outcome = clearOutcome(await Promise.allSettled(CLEARABLE_STORES.map(([name]) => database.clear(name))))
    if (outcome.failure) throw outcome.failure
    const remaining = outcome.remaining
    // Dangerous goods records inside their retention window stay — see the interface note.
    //
    // And a failure sweeping the expired ones does not fail the call. The six stores above
    // are already gone by this point, and the caller reports a rejection as "nothing was
    // deleted" — telling someone their data is intact after it has been erased is worse
    // than leaving a handful of out-of-window records behind for the next sweep.
    try {
      const today = localDate()
      const records = (await database.getAll('dgConsignments')) as DgConsignmentRecord[]
      await Promise.all(
        records.filter((r) => r.retainUntil < today).map((r) => database.delete('dgConsignments', r.id)),
      )
    } catch {
      // Retried the next time this runs; nothing here is owed deletion on a schedule.
    }
    return remaining
  },
}

/**
 * The stores "remove everything from this machine" empties, with the wording the UI uses for
 * each. `dgConsignments` is deliberately absent — see the interface note.
 */
export const CLEARABLE_STORES: readonly (readonly [string, string])[] = [
  ['profile', 'the exporter profile'],
  ['consignees', 'the saved consignees'],
  ['overrides', 'the classification overrides'],
  ['shipments', 'the shipment history'],
  ['partWeights', 'the per-part weights'],
  ['items', 'the item library'],
]

/**
 * What a round of store clears amounts to: which are still there, and whether the call
 * failed outright.
 *
 * A partial failure and a total one are different events and the screen says different
 * things about them, so the distinction is drawn here rather than left to a rejection that
 * cannot carry it. Separated from the IndexedDB call so it can be tested at all — nothing in
 * the test environment provides a database.
 */
export function clearOutcome(
  results: readonly PromiseSettledResult<unknown>[],
): { remaining: string[]; failure: Error | null } {
  const remaining = CLEARABLE_STORES.filter((_, i) => results[i]?.status === 'rejected').map(([, label]) => label)
  if (remaining.length < CLEARABLE_STORES.length) return { remaining, failure: null }
  const first = results.find((r) => r.status === 'rejected')
  return {
    remaining,
    failure:
      first?.status === 'rejected' && first.reason instanceof Error
        ? first.reason
        : new Error('this machine’s stored data could not be reached'),
  }
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

/** Commodity wording the operator saved, keyed by uppercased part number. */
export function overrideDescriptions(records: PartOverrideRecord[]): Record<string, string> {
  return Object.fromEntries(
    records
      .filter((r) => r.sliDescription?.trim())
      .map((r) => [partKey(r.partNumber), (r.sliDescription as string).trim()]),
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
