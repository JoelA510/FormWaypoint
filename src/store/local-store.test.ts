/**
 * The part of the store that can be exercised without a database.
 *
 * Nothing in the test environment provides IndexedDB, so what is covered here is the
 * decision the deletion path turns on: whether a round of clears counts as nothing having
 * happened, or as some of it having happened. The screen says opposite things about the two.
 */
import { describe, expect, it } from 'vitest'
import {
  CLEARABLE_STORES,
  clearOutcome,
  mergePartOverride,
  overrideOriginStatus,
  type PartOverrideRecord,
} from './local-store'

const settled = (rejected: number[]): PromiseSettledResult<unknown>[] =>
  CLEARABLE_STORES.map((_, i) =>
    rejected.includes(i)
      ? { status: 'rejected' as const, reason: new Error('store unavailable') }
      : { status: 'fulfilled' as const, value: undefined },
  )

describe('the outcome of clearing the machine', () => {
  it('reports nothing remaining when every store went', () => {
    expect(clearOutcome(settled([]))).toEqual({ remaining: [], failure: null })
  })

  it('names what is left rather than failing the whole call', () => {
    // Under a single `Promise.all` one store rejecting failed the call, and the caller
    // reported it as "Nothing was deleted" — over five stores that had just been erased.
    const outcome = clearOutcome(settled([2]))
    expect(outcome.failure).toBeNull()
    expect(outcome.remaining).toEqual(['the classification overrides'])
  })

  it('fails the call only when nothing at all was deleted', () => {
    const outcome = clearOutcome(settled(CLEARABLE_STORES.map((_, i) => i)))
    expect(outcome.failure).toBeInstanceOf(Error)
    expect(outcome.failure!.message).toBe('store unavailable')
    expect(outcome.remaining).toHaveLength(CLEARABLE_STORES.length)
  })

  it('does not offer to delete the retention records', () => {
    // The two-year obligation is the one thing this button does not touch, and a store
    // added to the list later must not quietly join it.
    expect(CLEARABLE_STORES.map(([name]) => name)).not.toContain('dgConsignments')
  })
})

describe('what is kept about a part after a change', () => {
  const NOW = '2026-11-12T00:00:00.000Z'
  const entry = {
    originStatus: 'D' as const,
    originStatusReason: 'Assembled and tested in the United States',
    originStatusBy: 'Pat Example',
    originStatusAt: NOW,
  }

  it('keeps a D/F entered against a part that has no weight, code or wording', () => {
    // The common case: the part needs nothing else. Counted as empty, the record was deleted
    // in the same write that made it, and the entry never took effect.
    expect(mergePartOverride(undefined, '20000-0001', 'Widget', entry, NOW)).toEqual({
      partNumber: '20000-0001',
      description: 'Widget',
      netWeightKg: null,
      ...entry,
      updatedAt: NOW,
    })
  })

  it('keeps the weight and the code when the D/F is cleared, and the D/F when the code is', () => {
    const held: PartOverrideRecord = {
      partNumber: '20000-0001', description: 'Widget', netWeightKg: 1.2, exportCode: '8544420000',
      reason: 'Reclassified', enteredBy: 'Pat Example', ...entry, updatedAt: '2026-10-01T00:00:00.000Z',
    }
    const cleared = mergePartOverride(
      held, '20000-0001', '', { originStatus: undefined, originStatusReason: '', originStatusBy: '', originStatusAt: '' }, NOW,
    )
    expect(cleared).toMatchObject({ netWeightKg: 1.2, exportCode: '8544420000', reason: 'Reclassified' })
    expect(cleared?.originStatus).toBeUndefined()

    const codeCleared = mergePartOverride({ ...held, netWeightKg: null }, '20000-0001', '', { exportCode: '', reason: '', enteredBy: '' }, NOW)
    expect(codeCleared).toMatchObject({ originStatus: 'D', originStatusReason: entry.originStatusReason })
  })

  it('drops a record once its only field is cleared', () => {
    const held: PartOverrideRecord = { partNumber: '20000-0001', description: 'Widget', netWeightKg: null, ...entry, updatedAt: NOW }
    expect(mergePartOverride(held, '20000-0001', '', { originStatus: undefined }, NOW)).toBeNull()
  })

  it('hands the reconciliation only D and F, keyed by the normalised part number', () => {
    const records = [
      { partNumber: 'ab-100', description: '', netWeightKg: null, originStatus: 'D', updatedAt: NOW },
      { partNumber: 'AB-200', description: '', netWeightKg: 2, updatedAt: NOW },
      { partNumber: 'AB-300', description: '', netWeightKg: null, originStatus: 'X', updatedAt: NOW },
    ] as unknown as PartOverrideRecord[]
    expect(overrideOriginStatus(records)).toEqual({ 'AB-100': 'D' })
  })
})
