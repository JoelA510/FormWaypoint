/**
 * The part of the store that can be exercised without a database.
 *
 * Nothing in the test environment provides IndexedDB, so what is covered here is the
 * decision the deletion path turns on: whether a round of clears counts as nothing having
 * happened, or as some of it having happened. The screen says opposite things about the two.
 */
import { describe, expect, it } from 'vitest'
import { CLEARABLE_STORES, clearOutcome } from './local-store'

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
