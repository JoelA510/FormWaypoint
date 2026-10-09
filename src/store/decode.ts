/**
 * What comes back out of IndexedDB, checked before the app uses it.
 *
 * Records are written by earlier builds of this app, and with an updater every release reads
 * what the last one wrote. A read used to be a type cast, so a record missing a field, or
 * holding a weight that is not a number, went straight into render code: a profile without a
 * signer name crashed the review screen, and a stored `NaN` weight passed the weights check
 * (`NaN <= 0` is false) and printed `NaN` in box 26.
 *
 * So each record is checked on the way out. A field the app can do without is defaulted; a
 * weight that is not a positive number is dropped (the part then blocks for want of a weight,
 * which is the safe outcome); a record without its key, or not an object at all, is left out.
 * Anything repaired or left out is written to the local error log with the store it came from.
 * The stored data is not changed.
 */
import { EMPTY_PROFILE, type CompanyProfile } from '../domain/draft'
import type { ItemLibraryEntry } from '../domain/item-library'
import { logError } from '../lib/error-log'
import type { ConsigneeRecord, DgConsignmentRecord, OverrideRecord, PartOverrideRecord, ShipmentRecord } from './local-store'

type Raw = Record<string, unknown>

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const nonEmptyText = (value: unknown): value is string => isText(value) && value.trim() !== ''

/** A weight is a positive, finite number of kilograms, or nothing. */
export function decodeWeight(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function report(store: string, left: number, repaired: number): void {
  if (!left && !repaired) return
  logError(
    'error',
    new Error(
      `Saved ${store} records did not match what this version expects: ${left} left out, ${repaired} repaired. ` +
        'The stored data was not changed.',
    ),
  )
}

/**
 * Decodes every record in one store. `decodeOne` returns the record to use, `null` to leave it
 * out, and says whether it had to repair it.
 */
function decodeAll<T>(store: string, raws: unknown[], decodeOne: (raw: Raw) => { record: T | null; repaired: boolean }): T[] {
  let left = 0
  let repaired = 0
  const records: T[] = []
  for (const raw of raws) {
    const result = isObject(raw) ? decodeOne(raw) : { record: null, repaired: false }
    if (!result.record) left++
    else {
      records.push(result.record)
      if (result.repaired) repaired++
    }
  }
  report(store, left, repaired)
  return records
}

export function decodeProfile(raw: unknown): CompanyProfile | null {
  if (raw == null) return null
  if (!isObject(raw)) {
    report('profile', 1, 0)
    return null
  }
  let repaired = false
  const profile = { ...EMPTY_PROFILE }
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof CompanyProfile)[]) {
    const value = raw[key]
    if (key === 'usppiAddressLines') {
      if (Array.isArray(value) && value.every(isText)) profile.usppiAddressLines = value
      else repaired = true
    } else if (isText(value)) {
      profile[key] = value
    } else {
      repaired = true
    }
  }
  report('profile', 0, repaired ? 1 : 0)
  return profile
}

export const decodePartOverrides = (raws: unknown[]): PartOverrideRecord[] =>
  decodeAll('part weight', raws, (raw) => {
    if (!nonEmptyText(raw.partNumber)) return { record: null, repaired: false }
    const netWeightKg = decodeWeight(raw.netWeightKg)
    const repaired = raw.netWeightKg != null && netWeightKg == null
    return {
      record: {
        ...(raw as unknown as PartOverrideRecord),
        netWeightKg,
        description: isText(raw.description) ? raw.description : '',
        exportCode: isText(raw.exportCode) ? raw.exportCode : undefined,
      },
      repaired: repaired || !isText(raw.description),
    }
  })

export const decodeItems = (raws: unknown[]): ItemLibraryEntry[] =>
  decodeAll('item library', raws, (raw) => {
    if (!nonEmptyText(raw.partNumber)) return { record: null, repaired: false }
    const netWeightKg = decodeWeight(raw.netWeightKg)
    const text = (key: string) => (isText(raw[key]) ? (raw[key] as string) : '')
    const repaired =
      (raw.netWeightKg != null && netWeightKg == null) ||
      ['displayPartNumber', 'description', 'exportCode', 'importCode'].some((key) => !isText(raw[key]))
    return {
      record: {
        ...(raw as unknown as ItemLibraryEntry),
        displayPartNumber: text('displayPartNumber') || raw.partNumber,
        description: text('description'),
        exportCode: text('exportCode'),
        importCode: text('importCode'),
        netWeightKg,
      },
      repaired,
    }
  })

export const decodeOverrides = (raws: unknown[]): OverrideRecord[] =>
  decodeAll('classification override', raws, (raw) => ({
    record: nonEmptyText(raw.sourceCode) && nonEmptyText(raw.approvedCode) ? (raw as unknown as OverrideRecord) : null,
    repaired: false,
  }))

export const decodeConsignees = (raws: unknown[]): ConsigneeRecord[] =>
  decodeAll('consignee', raws, (raw) => ({
    record: nonEmptyText(raw.name) ? (raw as unknown as ConsigneeRecord) : null,
    repaired: false,
  }))

export const decodeShipments = (raws: unknown[]): ShipmentRecord[] =>
  decodeAll('shipment history', raws, (raw) => ({
    record: nonEmptyText(raw.id) && isText(raw.processedAt) ? (raw as unknown as ShipmentRecord) : null,
    repaired: false,
  }))

export const decodeDgConsignments = (raws: unknown[]): DgConsignmentRecord[] =>
  decodeAll('dangerous goods consignment', raws, (raw) => ({
    record:
      nonEmptyText(raw.id) && isText(raw.preparedAt) && isText(raw.retainUntil) && isObject(raw.consignment)
        ? (raw as unknown as DgConsignmentRecord)
        : null,
    repaired: false,
  }))
