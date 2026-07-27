/**
 * Joining invoice lines to packing-list lines, and grouping them into SLI commodity rows.
 */
import type { MergedLine, SLILine, SourceLine } from '../types'
import { canonicalUnit, formatScheduleB, normalizeScheduleB } from '../schedule-b'

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
 * legitimately appears on separate order lines (G78495IQ has two `04465-000` cables that
 * must stay distinct until the aggregation step decides to merge them).
 */
export function joinInvoiceToPacking(invoiceLines: SourceLine[], packingLines: SourceLine[]): MergedLine[] {
  const remaining = new Set(packingLines.map((l) => l.id))
  const byItemId = new Map<string, SourceLine>()
  const byOrderSequence = new Map<string, SourceLine>()
  const byOrderLinePart = new Map<string, SourceLine>()

  for (const line of packingLines) {
    if (line.itemId) byItemId.set(line.itemId, line)
    byOrderSequence.set(`${line.orderNumber}|${line.sequence}`, line)
    byOrderLinePart.set(`${line.orderNumber}|${line.lineNumber}|${line.partNumber}`, line)
  }

  return invoiceLines.map((invoice) => {
    let match: SourceLine | undefined
    let joinKey: MergedLine['joinKey'] = 'unmatched'

    if (invoice.itemId && byItemId.has(invoice.itemId)) {
      match = byItemId.get(invoice.itemId)
      joinKey = 'itemId'
    } else if (byOrderSequence.has(`${invoice.orderNumber}|${invoice.sequence}`)) {
      match = byOrderSequence.get(`${invoice.orderNumber}|${invoice.sequence}`)
      joinKey = 'order+sequence'
    } else if (byOrderLinePart.has(`${invoice.orderNumber}|${invoice.lineNumber}|${invoice.partNumber}`)) {
      match = byOrderLinePart.get(`${invoice.orderNumber}|${invoice.lineNumber}|${invoice.partNumber}`)
      joinKey = 'order+line+part'
    }

    if (match) remaining.delete(match.id)

    return {
      ...invoice,
      netWeightKg: match?.netWeightKg,
      grossWeightKg: match?.grossWeightKg,
      measurementM3: match?.measurementM3,
      packingListLineId: match?.id,
      joinKey,
    }
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
   * Whether country of origin joins the grouping key. Off by default: the historical SLIs
   * group purely by classification and D/F, rolling several origins into one row.
   */
  separateByCountry?: boolean
}

/**
 * Group merged lines into the commodity rows that will be written to the form.
 *
 * The key deliberately includes every attribute that is filed *per row*: classification,
 * D/F, and the export-control triplet. Two lines may only share a row when all of those
 * agree, because the row asserts them jointly.
 *
 * Part number is **not** in the key. The completed CEVA shipment K78027EC rolls six
 * distinct part numbers across eight purchase orders into three rows keyed on Schedule B
 * alone, so grouping by part number would produce a form that does not match established
 * practice.
 */
export function aggregateLines(lines: MergedLine[], options: AggregationOptions): SLILine[] {
  const groups = new Map<string, SLILine>()

  for (const line of lines) {
    const sourceCode = normalizeScheduleB(line.classification)
    const code = options.overrides?.[sourceCode] ?? line.classification
    const df = domesticForeign(line.countryOfOrigin)

    const key = [
      normalizeScheduleB(code),
      df,
      options.eccn ?? '',
      options.license ?? '',
      options.sme ?? '',
      canonicalUnit(line.uom) ?? '',
      options.separateByCountry ? line.countryOfOrigin : '',
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
        eccn: options.eccn,
        sme: options.sme,
        license: options.license,
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
    // Ascending by classification, matching the row order on the completed K78027EC form
    // and giving the same shipment the same row order every time it is processed.
    .sort((a, b) => normalizeScheduleB(a.scheduleB).localeCompare(normalizeScheduleB(b.scheduleB)))
}
