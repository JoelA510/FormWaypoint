/**
 * What the CIPL loaded in Standard Shipping can offer the dangerous goods consignment.
 *
 * One way only, and only on request (ADR 0004). The CIPL states parties, references, parts,
 * quantities and the goods' weights; it does not state a chemistry, an energy content, a
 * configuration or anything else a classification turns on, and nothing here sets one.
 *
 * The two dangerous goods figures it can state — how many of a part are in the box, and what
 * they weigh — are *offered*, never filled: each needs a person's click, field by field, and is
 * offered only where the reconciliation proved it against the CIPL's printed totals. Anywhere
 * else the offer carries the reason there is none, so the field is left blank for a reason the
 * person can read rather than one they have to guess.
 */
import type { ParsedCipl, Reconciliation } from '../types'
import { distinctParts, partKey } from '../part-key'
import { canonicalUnit } from '../schedule-b'
import { roundPrecise } from '../units'
import { emptyEntry, type DgConsignment, type DgParty } from './types'

/** A figure the person may copy into a field, or why there is none. */
export type FigureOffer = { value: number; label: string } | { value: null; why: string }

export interface SeedPart {
  partNumber: string
  /** Part number, description and commodity heading as the CIPL prints them. Never filed. */
  description: string
  count: FigureOffer
  netWeightKg: FigureOffer
}

export interface CiplSeed {
  source: { fileName: string; invoiceNumber: string }
  consignee: DgParty
  shippersReference: string
  /** Shown beside the airport fields, never filled: a shipping city is not a departure airport. */
  routeHint: { shippedFrom: string | null; dischargePort: string | null }
  cartons: number | null
  /**
   * The package count to offer the package the CIPL's entries went into. One carton is one
   * package; several cartons say nothing about how many identical packages of one description
   * there are.
   */
  packageCount: FigureOffer
  parts: SeedPart[]
}

/**
 * @param consignee The SLI draft's ultimate consignee, so the destination country a person
 *   confirmed or overrode in Standard Shipping is the one the declaration gets too.
 */
export function ciplSeed(parsed: ParsedCipl, reconciliation: Reconciliation, consignee: DgParty): CiplSeed {
  const { header, mergedLines, checks } = reconciliation
  const passed = (id: string) => checks.some((c) => c.id === id && c.passed)

  // Refusals shared by every part, in the order a person would want them explained.
  const perPackage =
    header.cartons === 1
      ? null
      : header.cartons == null
        ? 'The CIPL states no carton count, so how much of it is in one package is unknown.'
        : `The CIPL states ${header.cartons} cartons and does not say which carton holds which line.`
  const entered = reconciliation.enteredFigures.length
    ? 'Figures were entered over the document in Standard Shipping, so the CIPL no longer proves this one.'
    : null
  const countRefusal =
    perPackage ?? entered ?? (passed('total-quantity') ? null : 'The CIPL’s quantities do not reconcile to its printed total.')
  const weightRefusal =
    perPackage ??
    entered ??
    (!parsed.providesWeights
      ? 'This CIPL layout states no weights; the weights in Standard Shipping were supplied, not read.'
      : passed('total-weight')
        ? null
        : 'The CIPL’s weights do not reconcile to its packing-list total.')

  // Weights from the packing-list lines themselves, never the merged line's: a line the
  // packing list left unweighted is filled from the item library during reconciliation, and
  // that figure is not the document's.
  const packingById = new Map(
    parsed.lines.filter((l) => l.documentKind === 'PACKING_LIST').map((l) => [l.id, l] as const),
  )

  const parts = distinctParts(mergedLines).map((partNumber): SeedPart => {
    const lines = mergedLines.filter((l) => partKey(l.partNumber) === partKey(partNumber))
    const first = lines[0]
    const description = [first.partNumber, first.description].filter(Boolean).join(' ') +
      (first.commodityGroup ? ` (CIPL heading: ${first.commodityGroup})` : '')

    let count: FigureOffer
    const notCounted = lines.find((l) => canonicalUnit(l.uom) !== 'NO')
    if (countRefusal) count = { value: null, why: countRefusal }
    else if (notCounted) count = { value: null, why: `The CIPL states this part in ${notCounted.uom || 'no unit'}, not a count.` }
    else if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) {
      count = { value: null, why: 'A line of this part has no whole, positive quantity.' }
    } else {
      const value = lines.reduce((sum, l) => sum + l.quantity, 0)
      count = { value, label: `${value} ${first.uom.trim().toUpperCase()}` }
    }

    let netWeightKg: FigureOffer
    const weights = lines.map((l) => (l.packingListLineId ? packingById.get(l.packingListLineId)?.netWeightKg : undefined))
    if (weightRefusal) netWeightKg = { value: null, why: weightRefusal }
    else if (weights.some((w) => w == null)) {
      netWeightKg = { value: null, why: 'The packing list states no net weight for every line of this part.' }
    } else {
      // Rounded once, to the three places the packing list prints, after summing: 0.1 and 0.2
      // sum to 0.30000000000000004 in binary, and that is not a figure anyone typed.
      const value = roundPrecise(weights.reduce((sum: number, w) => sum + (w ?? 0), 0), 3)
      netWeightKg = { value, label: `${value} kg` }
    }

    return { partNumber, description, count, netWeightKg }
  })

  return {
    source: { fileName: parsed.fileName, invoiceNumber: header.invoiceNumber },
    consignee,
    shippersReference: header.invoiceNumber.trim(),
    routeHint: { shippedFrom: header.shippedFrom || null, dischargePort: header.dischargePort || null },
    cartons: header.cartons,
    packageCount:
      header.cartons === 1
        ? { value: 1, label: '1 carton' }
        : {
            value: null,
            why:
              header.cartons == null
                ? 'The CIPL states no carton count.'
                : `The CIPL states ${header.cartons} cartons, not how many identical packages of one description.`,
          },
    parts,
  }
}

export interface AppliedSeed {
  consignment: DgConsignment
  /** One sentence per thing set or left alone, for the status line. */
  notes: string[]
  /** Seeded entry id → part key, so the entry can show that part's figure offers. */
  links: Record<string, string>
}

const isBlankParty = (p: DgParty) => !p.name.trim() && p.addressLines.every((l) => !l.trim())
const sameParty = (a: DgParty, b: DgParty) =>
  a.name.trim() === b.name.trim() &&
  a.addressLines.map((l) => l.trim()).join('\n') === b.addressLines.map((l) => l.trim()).join('\n')

/**
 * Fill the consignment's blank fields from the seed.
 *
 * Blank fields only: a value already there was typed by someone, and the CIPL is not more
 * authoritative than they are. Entries are added only to a consignment that is still the
 * single empty package it started as, so nothing a person built is restructured under them.
 * Count and net weight are never set here; see `FigureOffer`.
 */
export function applyCiplSeed(
  consignment: DgConsignment,
  seed: CiplSeed,
  newId: (prefix: string) => string,
): AppliedSeed {
  const notes: string[] = []
  const links: Record<string, string> = {}
  let next = consignment

  if (isBlankParty(next.consignee)) {
    if (!isBlankParty(seed.consignee)) {
      next = { ...next, consignee: seed.consignee }
      notes.push('Set the consignee.')
    }
  } else if (!sameParty(next.consignee, seed.consignee)) {
    notes.push('Kept the consignee already entered, which differs from the CIPL’s.')
  }

  if (!next.shippersReference.trim()) {
    if (seed.shippersReference) {
      next = { ...next, shippersReference: seed.shippersReference }
      notes.push('Set the shipper’s reference to the invoice number.')
    }
  } else if (next.shippersReference.trim() !== seed.shippersReference) {
    notes.push('Kept the shipper’s reference already entered.')
  }

  const [only] = next.packages
  const untouched =
    next.packages.length === 1 &&
    only.overpackId == null &&
    only.entries.length === 1 &&
    JSON.stringify(only.entries[0]) === JSON.stringify(emptyEntry(only.entries[0].id))
  if (!seed.parts.length) {
    // Nothing to add; a CIPL with no parts has already failed reconciliation loudly.
  } else if (seed.cartons !== 1) {
    notes.push(
      seed.cartons == null
        ? 'Added no battery entries: the CIPL states no carton count.'
        : `Added no battery entries: the CIPL states ${seed.cartons} cartons and not which carton holds which line.`,
    )
  } else if (!untouched) {
    notes.push('Added no battery entries: the packages already hold entries.')
  } else {
    const entries = seed.parts.map((part) => {
      const entry = { ...emptyEntry(newId('ent-')), description: part.description }
      links[entry.id] = partKey(part.partNumber)
      return entry
    })
    next = { ...next, packages: [{ ...only, entries }] }
    notes.push(
      `Added ${entries.length} battery entr${entries.length === 1 ? 'y' : 'ies'}, one per part. ` +
        'Chemistry, energy content and everything else the classification turns on are still yours to answer.',
    )
  }

  return { consignment: next, notes, links }
}
