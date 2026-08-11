/**
 * Joining invoice lines to packing-list lines, and grouping them into SLI commodity rows.
 */
import type { MergedLine, SLILine, SourceLine } from '../types'
import { canonicalUnit, formatScheduleB, normalizeScheduleB } from '../schedule-b'
import { partKey } from '../part-key'

/** Values that mean "made in the USA" on these documents. */
const US_ORIGINS = new Set(['UNITED STATES', 'UNITED STATES OF AMERICA', 'USA', 'US', 'U.S.', 'U.S.A.'])

/**
 * D = domestic (grown, produced or manufactured in the US), F = foreign goods being
 * re-exported. Derived from the *line's* country of origin, never from the seller or the
 * ship-from location.
 */
export function domesticForeign(countryOfOrigin: string): 'D' | 'F' {
  return US_ORIGINS.has((countryOfOrigin ?? '').trim().toUpperCase()) ? 'D' : 'F'
}

/**
 * The CIPL prints commodity headings inconsistently (`Electrical Conductors` next to
 * `measure equipment`). Only the first letter is touched — rewording is a human decision,
 * and the generated form stays editable so the wording can be adjusted before signing.
 */
function capitaliseFirst(text: string): string {
  const trimmed = (text ?? '').trim()
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  // Nudge before rounding so binary representation error (0.544 + 0.544 = 1.0879999…)
  // does not round the wrong way.
  return Math.round((value + Number.EPSILON * Math.sign(value) * factor) * factor) / factor
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

/**
 * Attach packing-list weights to invoice lines.
 *
 * Matching is by stable identifier in descending order of strength. Description is never
 * used as a key: the same description appears on many lines, and the same part number
 * legitimately appears on separate order lines (vendorA1 has two `04465-000` cables that
 * must stay distinct until the aggregation step decides to merge them).
 */
export function joinInvoiceToPacking(invoiceLines: SourceLine[], packingLines: SourceLine[]): MergedLine[] {
  // Buckets rather than single values: two packing lines can legitimately share a weaker
  // key, and a Map would silently keep only the last one.
  const byItemId = new Map<string, SourceLine[]>()
  const byOrderSequence = new Map<string, SourceLine[]>()
  const byOrderLinePart = new Map<string, SourceLine[]>()

  const push = (map: Map<string, SourceLine[]>, key: string, line: SourceLine) => {
    const bucket = map.get(key)
    if (bucket) bucket.push(line)
    else map.set(key, [line])
  }

  for (const line of packingLines) {
    if (line.itemId) push(byItemId, line.itemId, line)
    push(byOrderSequence, `${line.orderNumber}|${line.sequence}`, line)
    push(byOrderLinePart, `${line.orderNumber}|${line.lineNumber}|${line.partNumber}`, line)
  }

  // The join must be one-to-one. If two invoice lines both claimed the same packing line,
  // its weight would be counted twice while the real partner line went missing — an
  // overstatement that only the weight reconciliation would catch, and only if the
  // packing-list total could be read.
  const claimed = new Set<string>()
  const takeFirstUnclaimed = (bucket: SourceLine[] | undefined): SourceLine | undefined =>
    bucket?.find((line) => !claimed.has(line.id))

  return invoiceLines.map((invoice) => {
    let match: SourceLine | undefined
    let joinKey: MergedLine['joinKey'] = 'unmatched'

    if (invoice.itemId) {
      match = takeFirstUnclaimed(byItemId.get(invoice.itemId))
      if (match) joinKey = 'itemId'
    }
    if (!match) {
      match = takeFirstUnclaimed(byOrderSequence.get(`${invoice.orderNumber}|${invoice.sequence}`))
      if (match) joinKey = 'order+sequence'
    }
    if (!match) {
      match = takeFirstUnclaimed(
        byOrderLinePart.get(`${invoice.orderNumber}|${invoice.lineNumber}|${invoice.partNumber}`),
      )
      if (match) joinKey = 'order+line+part'
    }

    if (match) claimed.add(match.id)

    return {
      ...invoice,
      netWeightKg: match?.netWeightKg,
      grossWeightKg: match?.grossWeightKg,
      measurementM3: match?.measurementM3,
      // Travels with the weights it qualifies: the totals check needs to know a figure was
      // reconstructed from a divided one, and only the packing-list side knows that.
      weightDivisor: match?.weightDivisor,
      packingListLineId: match?.id,
      joinKey,
    }
  })
}

/**
 * Fill in weights for lines the document does not state, from the saved per-part table.
 *
 * Only ever fills gaps: a weight printed on the packing list is never replaced.
 *
 * Part numbers are matched case-insensitively. An imported item master and a CIPL are
 * produced by different systems, and a part that failed to match on letter case alone would
 * block the shipment with no visible reason.
 */
export function applyUnitWeights(lines: MergedLine[], unitWeightsByPart: Record<string, number>): MergedLine[] {
  const byPart = new Map(Object.entries(unitWeightsByPart).map(([part, weight]) => [partKey(part), weight]))
  return lines.map((line) => {
    if (line.netWeightKg != null) return line
    const unit = byPart.get(partKey(line.partNumber))
    if (unit == null) return line
    return { ...line, netWeightKg: roundTo(unit * line.quantity, 3) }
  })
}

/** Packing-list lines that no invoice line claimed — a sign the documents disagree. */
export function unmatchedPackingLines(invoiceLines: MergedLine[], packingLines: SourceLine[]): SourceLine[] {
  const claimed = new Set(invoiceLines.map((l) => l.packingListLineId).filter(Boolean))
  return packingLines.filter((l) => !claimed.has(l.id))
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface AggregationOptions {
  /**
   * Compliance attributes applied to every line. These are controlled values, never
   * inferred from the CIPL — see the carrier adapter defaults.
   */
  eccn: string | null
  sme: string | null
  license: string | null
  /**
   * Classification overrides approved by a reviewer, keyed by normalised source code.
   * Applied before grouping, so an override can merge two previously separate rows.
   */
  overrides?: Record<string, string>
  /**
   * Per-part commodity numbers a reviewer entered, keyed by uppercased part number.
   *
   * Beats `overrides` where both apply. A code override says "this classification is wrong
   * wherever it appears"; this says "this part is classified as X" — and the narrower
   * statement is the one the person made about these goods specifically. Two parts sharing a
   * bad code can therefore be corrected to different codes, which is the common case when
   * one wrong number was copied across an item master.
   */
  codesByPart?: Record<string, string>
  /**
   * Net weight per unit, keyed by part number, used when the document states no weights.
   *
   * The `vendor-b` format prints none at all, so its SLIs have always been filled
   * from figures held outside the document. Supplying them here keeps that explicit: the
   * reconciliation reports the weights as *supplied*, never as proved against the source.
   */
  unitWeightsByPart?: Record<string, number>
}

/**
 * Group merged lines into the commodity rows that will be written to the form.
 *
 * The key deliberately includes every attribute that is filed *per row*: classification,
 * D/F, and the export-control triplet. Two lines may only share a row when all of those
 * agree, because the row asserts them jointly.
 *
 * Part number is **not** in the key. The completed CEVA shipment vendorA3 rolls six
 * distinct part numbers across eight purchase orders into three rows keyed on Schedule B
 * alone, so grouping by part number would produce a form that does not match established
 * practice.
 */
export function aggregateLines(lines: MergedLine[], options: AggregationOptions): SLILine[] {
  const groups = new Map<string, SLILine>()

  for (const line of lines) {
    const sourceCode = normalizeScheduleB(line.classification)
    // Truthiness, not `??`: an empty string in `codesByPart` is "no override", and taking
    // it would group the row under a blank classification and write a blank Schedule B.
    const code =
      options.codesByPart?.[partKey(line.partNumber)] ||
      options.overrides?.[sourceCode] ||
      line.classification
    const df = domesticForeign(line.countryOfOrigin)
    // An export-control value printed on the document is authoritative and beats the
    // blanket value. Filing EAR99 over a stated 5A992.C would be a misdeclaration, and the
    // same holds for a stated license or SME (the `omron-ci` form prints all three per
    // line). All three are part of the grouping key: two lines that differ in export
    // control are not one commodity row.
    const eccn = line.eccn || options.eccn
    const license = line.license || options.license
    const sme = line.sme || options.sme

    // The triplet is keyed case-insensitively: a hand-filled form can spell one
    // classification two ways ('5A992.C' beside '5A992.c'), and those are one commodity
    // row, not two. The row keeps the first spelling seen.
    const key = [
      normalizeScheduleB(code),
      df,
      (eccn ?? '').toUpperCase(),
      (license ?? '').toUpperCase(),
      (sme ?? '').toUpperCase(),
      canonicalUnit(line.uom) ?? '',
    ].join('|')

    const existing = groups.get(key)
    if (existing) {
      existing.sourceLineIds.push(line.id)
      existing.quantity += line.quantity
      existing.weightKg += line.netWeightKg ?? 0
      existing.valueUsd += line.extendedValue ?? 0
      if (!existing.countriesOfOrigin.includes(line.countryOfOrigin)) {
        existing.countriesOfOrigin.push(line.countryOfOrigin)
      }
    } else {
      groups.set(key, {
        sourceLineIds: [line.id],
        domesticForeign: df,
        scheduleB: formatScheduleB(code),
        // The commodity group heading is what the completed SLIs use as the row
        // description; the official Schedule B wording is surfaced alongside it in the
        // review screen rather than substituted here, because only a human can decide
        // whether a code actually describes the goods.
        description: capitaliseFirst(line.commodityGroup || line.description),
        quantity: line.quantity,
        scheduleBUnit: null,
        sourceUom: line.uom,
        weightKg: line.netWeightKg ?? 0,
        valueUsd: line.extendedValue ?? 0,
        eccn,
        sme,
        license,
        countriesOfOrigin: [line.countryOfOrigin],
      })
    }
  }

  return [...groups.values()]
    .map((line) => ({
      ...line,
      quantity: roundTo(line.quantity, 3),
      weightKg: roundTo(line.weightKg, 3),
      valueUsd: roundTo(line.valueUsd, 2),
    }))
    // Ascending by classification, matching the row order on the completed vendorA3 form
    // and giving the same shipment the same row order every time it is processed.
    .sort((a, b) => normalizeScheduleB(a.scheduleB).localeCompare(normalizeScheduleB(b.scheduleB)))
}
