import { describe, expect, it } from 'vitest'
import { scheduleBIsStale } from '.'

/**
 * The revision calendar this models: Census reissues the concordance effective each
 * 1 January and 1 July. Stale means "generated before the most recent of those boundaries".
 */
describe('scheduleBIsStale', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

  it('is fresh when generated after the most recent boundary', () => {
    expect(scheduleBIsStale('2026-07-27', at('2026-07-28'))).toBe(false)
    expect(scheduleBIsStale('2026-01-15', at('2026-03-01'))).toBe(false)
    // Generated exactly on the boundary counts as that revision.
    expect(scheduleBIsStale('2026-07-01', at('2026-12-31'))).toBe(false)
  })

  it('goes stale the moment a January or July boundary passes', () => {
    // Generated late June, checked late July: the 1 July revision has superseded it.
    expect(scheduleBIsStale('2026-06-15', at('2026-07-28'))).toBe(true)
    // Generated in December, checked in the new year.
    expect(scheduleBIsStale('2025-12-20', at('2026-03-01'))).toBe(true)
  })

  it('handles early January, when the latest boundary is 1 January of this year', () => {
    expect(scheduleBIsStale('2025-12-31', at('2026-01-02'))).toBe(true)
    expect(scheduleBIsStale('2026-01-01', at('2026-01-02'))).toBe(false)
    // Generated the previous July and still within its window until 1 January passed.
    expect(scheduleBIsStale('2025-07-10', at('2025-12-31'))).toBe(false)
  })

  it('treats an unreadable date as stale, not as fresh', () => {
    expect(scheduleBIsStale('', at('2026-07-28'))).toBe(true)
    expect(scheduleBIsStale('not a date', at('2026-07-28'))).toBe(true)
  })
})
