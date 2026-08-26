/**
 * Dividing one figure among several rows so the parts total the whole.
 *
 * Two things in this application do it — the keying sheet sharing a commodity row's whole
 * figure across the rows it prints, and the reconciliation sharing a hand-entered figure over
 * the invoice lines beneath a row — and both must land on the same answer for the same
 * numbers. Two implementations with two tie rules is how one shipment comes to be divided two
 * ways, which is the failure this application exists to catch rather than commit.
 */

/**
 * `shares`, each rounded down to a whole multiple of `step`, with the remainder handed out a
 * step at a time so the result totals `target` exactly.
 *
 * Largest remainder: the step goes to whichever share lost the most in the rounding, ties to
 * the earlier one, so the same figures settle the same way every time. Where the rounded
 * shares overshoot — which they can, because `target` is rounded from its own sum and the
 * shares from theirs — steps are taken back from the shares that lost the least, and never
 * from one that has nothing left to give.
 *
 * `step` is a positive multiple of the precision the figures are held at; pass `1` to divide
 * into whole units.
 */
export function largestRemainder(shares: number[], target: number, step = 1): number[] {
  if (!shares.length) return []
  const units = shares.map((share) => Math.floor(share / step))
  const wanted = Math.round(target / step)
  let left = wanted - units.reduce((sum, value) => sum + value, 0)

  const byRemainder = shares
    .map((share, index) => ({ index, lost: share / step - Math.floor(share / step) }))
    .sort((a, b) => b.lost - a.lost || a.index - b.index)

  // Bounded by two passes: one hands out at most a step per share, and the sort order means a
  // second pass only ever runs where the totals disagree by more than the rounding, which is
  // the caller's business to have prevented rather than this loop's to absorb.
  const order = left > 0 ? byRemainder : [...byRemainder].reverse()
  for (let taken = 0; left !== 0 && taken < order.length * 2; taken++) {
    const at = order[taken % order.length].index
    // Never below nothing: a share cannot owe the row goods.
    if (left < 0 && units[at] === 0) continue
    units[at] += left > 0 ? 1 : -1
    left += left > 0 ? -1 : 1
  }
  return units.map((count) => count * step)
}

/**
 * Decimal places enough to state the *smallest* of `shares` as something rather than nothing,
 * but never fewer than `floor` nor more than nine.
 *
 * A hand-entered weight of one gramme shared over several invoice lines cannot be held at the
 * three places a kilogram figure is normally kept: all but one share round to zero, and a
 * zero net weight on a line carrying goods is the thing the blocking weight check exists to
 * refuse — which it cannot, because it tests for a figure's absence rather than for zero. So
 * the precision follows the figures rather than the convention.
 *
 * Asked of the smallest share and not of an even one: the shares are proportional to what
 * each line already holds, so the smallest can be a small fraction of the average and is the
 * one that vanishes first.
 */
export function placesFor(shares: number[], floor: number): number {
  const positive = shares.filter((share) => share > 0)
  if (!positive.length) return floor
  const smallest = Math.min(...positive)
  for (let places = floor; places < 9; places++) {
    if (Math.round(smallest * 10 ** places) > 0) return places
  }
  return 9
}
