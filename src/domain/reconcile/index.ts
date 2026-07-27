/**
 * Turns a parsed CIPL into carrier-ready commodity rows, and proves the result adds up.
 *
 * The reconciliation checks are the safety net for the whole tool: if the generated rows do
 * not sum back to the totals printed on the source document, something was dropped,
 * double-counted, or misread, and the form must not be produced.
 */
import type {
  CheckResult,
  DocumentSet,
  MergedLine,
  ParsedCipl,
  Reconciliation,
  SLILine,
  ShipmentHeader,
  SourceLine,
} from '../types'
import { checkClassification, type ScheduleBIndex } from '../schedule-b'
import {
  aggregateLines,
  applyUnitWeights,
  joinInvoiceToPacking,
  roundTo,
  unmatchedPackingLines,
  type AggregationOptions,
} from './lines'

export * from './lines'

/** Tolerance for comparing a sum of rounded lines against a printed document total. */
const MONEY_TOLERANCE = 0.01
const WEIGHT_TOLERANCE = 0.001

export interface ReconcileOptions extends AggregationOptions {
  /** Maximum commodity rows the target form can hold. */
  maxRows?: number
  /** Overrides which document set is used. Defaults to the USD set. */
  forceSet?: DocumentSet
}

/**
 * Choose the controlling document set.
 *
 * Omron CIPLs carry the same goods twice: `FC` priced in USD and `TP1` priced in the
 * destination currency. Box 31 of the SLI is "value at the port of export in US dollars",
 * so the USD set is the only correct source. Picking TP1 because it appears later in the
 * file, or summing both, would misstate the shipment.
 */
export function selectDocumentSet(parsed: ParsedCipl, force?: DocumentSet): { set: DocumentSet; reason: string } {
  if (force && parsed.availableSets.includes(force)) {
    return { set: force, reason: `Manually selected the ${force} document set.` }
  }

  const usdSet = parsed.availableSets.find((set) => parsed.headers[set]?.documentCurrency === 'USD')
  if (usdSet) {
    const other = parsed.availableSets.filter((s) => s !== usdSet)
    const otherDesc = other
      .map((s) => `${s} (${parsed.headers[s]?.documentCurrency || 'unknown currency'})`)
      .join(', ')
    return {
      set: usdSet,
      reason: other.length
        ? `Using the ${usdSet} set because it is priced in USD. ${otherDesc} describes the same goods and is excluded.`
        : `Using the ${usdSet} set, priced in USD.`,
    }
  }

  const fallback = parsed.availableSets[0] ?? 'FC'
  return {
    set: fallback,
    reason: `No USD-priced document set was found. Falling back to ${fallback} (${parsed.headers[fallback]?.documentCurrency || 'unknown currency'}); box 31 requires US dollars, so this needs manual conversion.`,
  }
}

/**
 * A country name, as opposed to a postal line.
 *
 * The consignee block's last line is usually `Bangalore, KARNATAKA 562123` — writing that
 * into box 7 would file a city and postcode as the country of ultimate destination, so
 * anything containing digits or a comma is rejected rather than passed through.
 */
function isPlausibleCountry(value: string | null | undefined): value is string {
  const text = (value ?? '').trim()
  return text.length >= 2 && text.length <= 56 && !/\d/.test(text) && !text.includes(',')
}

/**
 * Destination country for SLI box 7, or null when the documents do not establish one.
 *
 * The discharge port is the primary source because the consignee address block frequently
 * omits the country entirely (K78027EC ends at `'s-Hertogenbosch NA 5234`). Returning null
 * is deliberate: a blank box a reviewer is told about beats a wrong one they are not.
 */
export function resolveDestinationCountry(header: ShipmentHeader): string | null {
  if (header.dischargePort?.includes(',')) {
    const country = header.dischargePort.split(',').pop()?.trim()
    if (isPlausibleCountry(country)) return country
  }
  const lastLine = header.consignedTo.lines.at(-1)?.trim()
  return isPlausibleCountry(lastLine) ? lastLine : null
}

/**
 * Stand-in used only when no document set could be read at all, so that `reconcile` reports
 * the failure as a check instead of throwing on an undefined header.
 */
const UNREADABLE_HEADER: ShipmentHeader = {
  invoiceNumber: '',
  invoiceDate: '',
  onOrAboutDate: null,
  soldTo: { name: '', lines: [], country: null },
  consignedTo: { name: '', lines: [], country: null },
  notifyTo: null,
  shippedFrom: null,
  dischargePort: null,
  vesselAgent: null,
  orderNumbers: [],
  tradeTerms: null,
  incoterm: null,
  freightTerms: null,
  cartons: null,
  documentCurrency: '',
  totalQuantity: 0,
  totalValue: 0,
  totalNetWeightKg: null,
  totalGrossWeightKg: null,
  totalMeasurementM3: null,
}

export function reconcile(parsed: ParsedCipl, index: ScheduleBIndex | null, options: ReconcileOptions): Reconciliation {
  const { set, reason } = selectDocumentSet(parsed, options.forceSet)
  // `selectDocumentSet` falls back to a set name when nothing was recognised, so the header
  // for it may genuinely not exist. Report that rather than dereferencing undefined.
  const header = parsed.headers[set] ?? UNREADABLE_HEADER
  const headerReadable = Boolean(parsed.headers[set])

  const invoiceLines = parsed.lines.filter((l) => l.documentSet === set && l.documentKind === 'INVOICE')
  const packingLines = parsed.lines.filter((l) => l.documentSet === set && l.documentKind === 'PACKING_LIST')

  const joined = joinInvoiceToPacking(invoiceLines, packingLines)
  // Formats that print no weights get them from the saved per-part table instead.
  const mergedLines = options.unitWeightsByPart
    ? applyUnitWeights(joined, options.unitWeightsByPart)
    : joined
  const sliLines = aggregateLines(mergedLines, options)

  if (index) {
    for (const line of sliLines) {
      line.scheduleBUnit = index.lookup(line.scheduleB)?.units[0] ?? null
    }
  }

  const checks: CheckResult[] = [
    { id: 'set-selection', severity: 'info', title: 'Controlling document set', detail: reason, passed: true },
    {
      id: 'header-readable',
      severity: 'blocking',
      title: 'Shipment header was read',
      detail: headerReadable
        ? `Header read from the ${set} document set.`
        : `No header could be read for the ${set} set, so there are no document totals to reconcile against. ` +
          'This file is probably not the Omron CIPL layout.',
      passed: headerReadable,
    },
    ...totalsChecks(header, mergedLines, sliLines, parsed.providesWeights),
    ...lineageChecks(mergedLines, packingLines, sliLines),
    ...classificationChecks(sliLines, mergedLines, index),
    ...exportControlChecks(options),
    ...sourceEccnChecks(sliLines, mergedLines),
    ...capacityCheck(sliLines, options.maxRows),
  ]

  return {
    selectedSet: set,
    header,
    mergedLines,
    sliLines,
    checks,
    canGenerate: checks.every((c) => c.severity !== 'blocking' || c.passed),
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function totalsChecks(
  header: ShipmentHeader,
  merged: MergedLine[],
  sliLines: SLILine[],
  providesWeights: boolean,
): CheckResult[] {
  const results: CheckResult[] = []

  const quantity = roundTo(sliLines.reduce((s, l) => s + l.quantity, 0), 3)
  results.push({
    id: 'total-quantity',
    severity: 'blocking',
    title: 'Quantities reconcile to the invoice total',
    detail:
      quantity === header.totalQuantity
        ? 'Every piece on the invoice is accounted for exactly once.'
        : 'The generated rows do not sum to the invoice total. A line was dropped, duplicated, or misread.',
    passed: quantity === header.totalQuantity,
    expected: String(header.totalQuantity),
    actual: String(quantity),
  })

  const value = roundTo(sliLines.reduce((s, l) => s + l.valueUsd, 0), 2)
  const valueOk = Math.abs(value - header.totalValue) <= MONEY_TOLERANCE
  results.push({
    id: 'total-value',
    severity: 'blocking',
    title: 'Values reconcile to the invoice total',
    detail: valueOk
      ? `Rows total ${value.toFixed(2)} ${header.documentCurrency}, matching the invoice.`
      : `Rows total ${value.toFixed(2)} but the invoice states ${header.totalValue.toFixed(2)} ${header.documentCurrency}.`,
    passed: valueOk,
    expected: header.totalValue.toFixed(2),
    actual: value.toFixed(2),
  })

  // This check must never quietly disappear. If the packing-list total could not be read
  // there is nothing to reconcile weights against, and that absence is itself a blocking
  // problem — an unverified weight is not the same as a verified one.
  const weight = roundTo(sliLines.reduce((s, l) => s + l.weightKg, 0), 3)
  if (!providesWeights) {
    // A format that prints no weights cannot have them proved against it. Say so plainly
    // rather than reporting a reconciliation that did not happen; the per-line
    // `weights-present` check below is what actually guards the output here.
    results.push({
      id: 'total-weight',
      severity: 'info',
      title: 'Weights come from the saved per-part table',
      detail:
        'This document states no weights, so there is nothing to reconcile against. Rows total ' +
        `${weight.toFixed(3)} kg from the per-part figures — confirm them before filing.`,
      passed: true,
      actual: weight.toFixed(3),
    })
  } else if (header.totalNetWeightKg == null) {
    results.push({
      id: 'total-weight',
      severity: 'blocking',
      title: 'Weights reconcile to the packing list total',
      detail:
        'No net-weight total could be read from the packing list, so the row weights cannot be proved against ' +
        `the source document. Rows currently total ${weight.toFixed(3)} kg.`,
      passed: false,
      expected: 'a packing-list net total',
      actual: 'not found',
    })
  } else {
    const weightOk = Math.abs(weight - header.totalNetWeightKg) <= WEIGHT_TOLERANCE
    results.push({
      id: 'total-weight',
      severity: 'blocking',
      title: 'Weights reconcile to the packing list total',
      detail: weightOk
        ? `Rows total ${weight.toFixed(3)} kg net, matching the packing list.`
        : `Rows total ${weight.toFixed(3)} kg but the packing list states ${header.totalNetWeightKg.toFixed(3)} kg.`,
      passed: weightOk,
      expected: header.totalNetWeightKg.toFixed(3),
      actual: weight.toFixed(3),
    })
  }

  const missingWeights = merged.filter((l) => l.netWeightKg == null)
  results.push({
    id: 'weights-present',
    severity: 'blocking',
    title: 'Every invoice line has a packing-list weight',
    detail: missingWeights.length
      ? `No packing-list match for ${missingWeights.length} line(s): ${missingWeights.map((l) => `${l.orderNumber}/${l.sequence}`).join(', ')}. ` +
        'A blank weight must not be filed as zero.'
      : 'All invoice lines matched a packing-list line.',
    passed: missingWeights.length === 0,
    refs: missingWeights.map((l) => l.id),
  })

  return results
}

function lineageChecks(merged: MergedLine[], packingLines: SourceLine[], sliLines: SLILine[]): CheckResult[] {
  const results: CheckResult[] = []

  const contributing = sliLines.flatMap((l) => l.sourceLineIds)
  const counts = new Map<string, number>()
  for (const id of contributing) counts.set(id, (counts.get(id) ?? 0) + 1)

  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  const dropped = merged.filter((l) => !counts.has(l.id)).map((l) => l.id)

  results.push({
    id: 'line-coverage',
    severity: 'blocking',
    title: 'Each source line maps to exactly one generated row',
    detail:
      !duplicated.length && !dropped.length
        ? `${merged.length} source line(s) rolled into ${sliLines.length} row(s), with full traceability.`
        : [
            dropped.length ? `${dropped.length} source line(s) contributed to no row.` : '',
            duplicated.length ? `${duplicated.length} source line(s) were counted more than once.` : '',
          ]
            .filter(Boolean)
            .join(' '),
    passed: !duplicated.length && !dropped.length,
    refs: [...dropped, ...duplicated],
  })

  const orphans = unmatchedPackingLines(merged, packingLines)
  results.push({
    id: 'packing-orphans',
    severity: 'warning',
    title: 'No packing-list line is left over',
    detail: orphans.length
      ? `${orphans.length} packing-list line(s) had no matching invoice line: ${orphans.map((l) => `${l.orderNumber}/${l.sequence}`).join(', ')}.`
      : 'Invoice and packing list describe the same set of lines.',
    passed: orphans.length === 0,
    refs: orphans.map((l) => l.id),
  })

  // Guards against the FC/TP1 duplicate being pulled in from both sets at once.
  const sets = new Set(merged.map((l) => l.documentSet))
  results.push({
    id: 'single-document-set',
    severity: 'blocking',
    title: 'Only one document set contributed',
    detail:
      sets.size <= 1
        ? 'Rows were built from a single currency set, so nothing is double-counted.'
        : `Rows draw on ${[...sets].join(' and ')} simultaneously. FC and TP1 describe the same goods.`,
    passed: sets.size <= 1,
  })

  return results
}

function classificationChecks(
  sliLines: SLILine[],
  merged: MergedLine[],
  index: ScheduleBIndex | null,
): CheckResult[] {
  if (!index) {
    return [
      {
        id: 'schedule-b-unavailable',
        severity: 'warning',
        title: 'Schedule B validation did not run',
        detail: 'The Census commodity dataset could not be loaded, so codes were not verified as active.',
        passed: false,
      },
    ]
  }

  const byId = new Map(merged.map((l) => [l.id, l]))

  return sliLines.flatMap((line, i) => {
    // Judge the classification against everything the CIPL says about these goods — the
    // group heading *and* each contributing line's own description. A row headed
    // "Power Supply" whose lines read "ASSY, J3 MOTOR" is plainly an electric motor, and
    // looking only at the heading would flag a correct code.
    const sourceText = [
      line.description,
      ...line.sourceLineIds.map((id) => byId.get(id)?.description ?? ''),
    ]
      .filter(Boolean)
      .join(' ')

    return checkClassification({ code: line.scheduleB, sourceText, sourceUom: line.sourceUom, ref: `row-${i + 1}` }, index)
  })
}

/**
 * The export-control triplet is a decision, not an extraction.
 *
 * A CIPL never carries an ECCN. Treating its absence as EAR99, or EAR99 as automatically
 * meaning NLR, is precisely the inference an export-compliance tool must not make, so these
 * are surfaced as an unanswered question rather than filled in.
 */
function exportControlChecks(options: ReconcileOptions): CheckResult[] {
  const missing = [
    ['ECCN / EAR99 / USML category', options.eccn],
    ['SME', options.sme],
    ['Licence, exception or NLR', options.license],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label)

  return [
    {
      id: 'export-control',
      severity: 'warning',
      title: 'Export-control classification supplied',
      detail: missing.length
        ? `Not yet set: ${missing.join(', ')}. These are not on the CIPL and are never inferred — ` +
          'an absent ECCN does not establish EAR99, and EAR99 does not by itself establish NLR.'
        : `Every row will be filed as ${options.eccn} / SME ${options.sme} / ${options.license}, as entered.`,
      passed: missing.length === 0,
    },
  ]
}

/**
 * Rows whose ECCN came from the CIPL rather than from the blanket value.
 *
 * Surfaced because the substitution runs the other way in the historical data: shipment
 * 278515 states `ECCN: 5A992.C` against its T20 pendant kit, and the SLI filed for it says
 * EAR99. A stated ECCN is a classification the exporter already made, so it wins — but the
 * reviewer is told, because it changes what is being declared.
 */
function sourceEccnChecks(sliLines: SLILine[], merged: MergedLine[]): CheckResult[] {
  const byId = new Map(merged.map((l) => [l.id, l]))
  const stated = sliLines.flatMap((line, i) => {
    const sourceEccn = line.sourceLineIds.map((id) => byId.get(id)?.eccn).find(Boolean)
    return sourceEccn ? [{ row: i + 1, scheduleB: line.scheduleB, eccn: sourceEccn }] : []
  })

  if (!stated.length) return []

  return [
    {
      id: 'eccn-from-document',
      severity: 'warning',
      title: 'The CIPL states an ECCN for some rows',
      detail:
        stated
          .map((s) => `Row ${s.row} (${s.scheduleB}) will be filed as ${s.eccn}, as printed on the CIPL`)
          .join('; ') +
        '. A stated ECCN is not EAR99 — confirm it before signing.',
      passed: false,
      refs: stated.map((s) => `row-${s.row}`),
    },
  ]
}

function capacityCheck(sliLines: SLILine[], maxRows?: number): CheckResult[] {
  if (!maxRows) return []
  const fits = sliLines.length <= maxRows
  return [
    {
      id: 'row-capacity',
      severity: 'blocking',
      title: 'Commodity rows fit the form',
      detail: fits
        ? `${sliLines.length} of ${maxRows} available rows used.`
        : `This shipment needs ${sliLines.length} rows but the form holds ${maxRows}. It must be split across ` +
          'continuation sheets before filing.',
      passed: fits,
      expected: `<= ${maxRows}`,
      actual: String(sliLines.length),
    },
  ]
}
