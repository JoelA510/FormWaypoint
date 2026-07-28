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
import { checkClassification, normalizeScheduleB, screenCode, type ScheduleBIndex } from '../schedule-b'
import type { ItemLibraryEntry } from '../item-library'
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
  /**
   * The imported item master, keyed by uppercased part number.
   *
   * Used to screen the commodity numbers held against the parts on this shipment, and to
   * report where the master and the CIPL disagree. Never used to change a code.
   */
  itemsByPart?: Map<string, ItemLibraryEntry>
}

/**
 * Choose the controlling document set.
 *
 * Omron CIPLs carry the same goods twice: `FC` priced in USD and `TP1` priced in the
 * destination currency. Box 31 of the SLI is "value at the port of export in US dollars",
 * so the USD set is the only correct source. Picking TP1 because it appears later in the
 * file, or summing both, would misstate the shipment.
 */
export function selectDocumentSet(
  parsed: ParsedCipl,
  force?: DocumentSet,
): { set: DocumentSet; reason: string; currency: string } {
  if (force && parsed.availableSets.includes(force)) {
    return {
      set: force,
      reason: `Manually selected the ${force} document set.`,
      currency: parsed.headers[force]?.documentCurrency ?? '',
    }
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
      currency: 'USD',
    }
  }

  const fallback = parsed.availableSets[0] ?? 'FC'
  const currency = parsed.headers[fallback]?.documentCurrency ?? ''
  return {
    set: fallback,
    reason: `No USD-priced document set was found. Falling back to ${fallback} (${currency || 'unknown currency'}); box 31 requires US dollars, so this needs manual conversion.`,
    currency,
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
  purchaseOrders: [],
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
  const { set, reason, currency } = selectDocumentSet(parsed, options.forceSet)
  // `selectDocumentSet` falls back to a set name when nothing was recognised, so the header
  // for it may genuinely not exist. Report that rather than dereferencing undefined.
  const header = parsed.headers[set] ?? UNREADABLE_HEADER
  const headerReadable = Boolean(parsed.headers[set])

  const invoiceLines = parsed.lines.filter((l) => l.documentSet === set && l.documentKind === 'INVOICE')
  const packingLines = parsed.lines.filter((l) => l.documentSet === set && l.documentKind === 'PACKING_LIST')

  const joined = joinInvoiceToPacking(invoiceLines, packingLines)
  // The per-part table stands in only for formats that print no weights. Applying it to a
  // format that does would let a saved figure quietly cover for a line the parser failed to
  // read — turning a loud parse failure into a plausible wrong number.
  const mergedLines =
    !parsed.providesWeights && options.unitWeightsByPart
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
    ...currencyCheck(currency),
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
    ...partCodeChecks(mergedLines, index, options.itemsByPart),
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

/**
 * The controlling set has to be priced in US dollars.
 *
 * Box 31 is "value at the port of export in US dollars", and every figure downstream — the
 * row values, the invoice-total reconciliation, the keying sheets — is carried through as
 * though it already is. Nothing in this tool converts a currency, so a set priced in
 * anything else would be filed at face value in the wrong denomination: a €40,000 shipment
 * declared as $40,000. `selectDocumentSet` already prefers the USD set where one exists, so
 * reaching this at all means none was found.
 *
 * The two failures are told apart on purpose. A stated foreign currency is a fact about the
 * document and blocks; a currency that could not be read is a fact about the parse, and
 * blocking on it would stop a shipment whose figures may be perfectly correct.
 */
function currencyCheck(currency: string): CheckResult[] {
  const code = currency.trim().toUpperCase()
  if (code === 'USD') return []

  return [
    code
      ? {
          id: 'usd-values',
          severity: 'blocking',
          title: 'Commodity values are in US dollars',
          detail:
            `The controlling document set is priced in ${code}. Box 31 requires US dollars and this tool does ` +
            'not convert currencies, so these figures cannot be filed as they stand. Use a USD-priced copy of ' +
            'the invoice.',
          passed: false,
          expected: 'USD',
          actual: code,
        }
      : {
          id: 'usd-values',
          severity: 'warning',
          title: 'Commodity values are in US dollars',
          detail:
            'No currency could be read from the document, so it cannot be confirmed that these values are in ' +
            'US dollars as box 31 requires. Check the invoice before filing.',
          passed: false,
          expected: 'USD',
          actual: 'not stated',
        },
  ]
}

/**
 * Extra rounding the totals check must tolerate because of reconstructed line weights.
 *
 * A packing list that prints a line's figures divided N ways rounds them to three decimals
 * first, so multiplying back up re-inflates that rounding N-fold. Shipment K78541WH prints
 * `(@ / 6) 1.240` for a line whose true weight is 7.438: the arithmetic gives 7.440, and
 * the document's own total is 0.002 kg away — inside the error the division created, and
 * outside the 0.001 kg the check normally allows.
 *
 * Deliberately proportional to the divisor rather than a blanket looser tolerance: a
 * document with no divided lines is still held to the strict figure, so a genuinely dropped
 * or double-counted line still fails.
 */
function reconstructionSlack(merged: MergedLine[]): number {
  return merged.reduce((total, line) => total + (line.weightDivisor ? line.weightDivisor * 0.0005 : 0), 0)
}

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
    const slack = reconstructionSlack(merged)
    const weightOk = Math.abs(weight - header.totalNetWeightKg) <= WEIGHT_TOLERANCE + slack
    results.push({
      id: 'total-weight',
      severity: 'blocking',
      title: 'Weights reconcile to the packing list total',
      detail: weightOk
        ? `Rows total ${weight.toFixed(3)} kg net, matching the packing list.` +
          (slack
            ? ' Some line weights were printed divided and multiplied back up, so this was allowed ' +
              `${(WEIGHT_TOLERANCE + slack).toFixed(3)} kg of rounding rather than the usual ${WEIGHT_TOLERANCE.toFixed(3)}.`
            : '')
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

/**
 * Screens every commodity number on the shipment, reported by part.
 *
 * The per-row classification checks below say "row 3"; this says "part 40652-0030", which
 * is what you need to go and fix the record. Two mechanical rules only — written as
 * `####.##.####`, and present in the Census concordance — applied to the number on the CIPL
 * and, where an item master is loaded, to the number it holds for the same part.
 *
 * Nothing here rewrites a code. A part whose master record is wrong is named so it can be
 * corrected at source; a shipment is not held up for it, because the number actually being
 * filed is the one on the CIPL, and that one is already checked per row.
 */
function partCodeChecks(
  merged: MergedLine[],
  index: ScheduleBIndex | null,
  itemsByPart?: Map<string, ItemLibraryEntry>,
): CheckResult[] {
  if (!merged.length) return []

  // Keyed on part *and* code: one part can appear on two lines under two classifications,
  // and screening only the first would pass a shipment carrying a bad second one. The
  // separator stays written as an escape: a literal control character here makes this file
  // binary to git, grep and anything else that sniffs for one.
  const seen = new Map<string, { part: string; code: string; description: string }>()
  for (const line of merged) {
    const key = `${line.partNumber}\u0000${line.classification}`
    if (!seen.has(key)) {
      seen.set(key, { part: line.partNumber, code: line.classification, description: line.description })
    }
  }
  const parts = new Set([...seen.values()].map((s) => s.part))

  const results: CheckResult[] = []

  const badOnDocument = [...seen.values()].flatMap(({ part, code }) => {
    const screening = screenCode(code, index)
    if (screening.status === 'ok') return []
    // Without the dataset only the written form can be judged. Saying a code is not in a
    // file that never loaded would be a finding about the tool, not about the shipment.
    if (!index && screening.status !== 'malformed') return []
    return [{ part, code, reason: screening.reason }]
  })

  results.push({
    id: 'part-codes',
    severity: 'warning',
    title: 'Every part’s commodity number is well-formed and current',
    detail: badOnDocument.length
      ? badOnDocument
          .map((f) => `${f.part}: ${f.code || '(blank)'} — ${f.reason}`)
          .join(' · ') + ' These need correcting in the item master.'
      : `All ${parts.size} part(s) carry a well-formed number present in the Census commodity file.`,
    passed: badOnDocument.length === 0,
    actual: badOnDocument.length ? `${badOnDocument.length} of ${parts.size} part(s)` : undefined,
  })

  if (!itemsByPart?.size) return results

  // --- The item master's own record for these parts ------------------------
  const covered = new Set<string>()
  const badInLibrary: { part: string; code: string; reason: string }[] = []
  const disagreeing: { part: string; document: string; library: string }[] = []

  for (const { part, code } of seen.values()) {
    const entry = itemsByPart.get(part.trim().toUpperCase())
    if (!entry) continue
    const first = !covered.has(part)
    covered.add(part)
    if (!entry.exportCode) continue

    const screening = screenCode(entry.exportCode, index)
    if (screening.status !== 'ok') {
      // One finding per part, however many lines it appears on.
      if (first && (index || screening.status === 'malformed')) {
        badInLibrary.push({ part, code: entry.exportCode, reason: screening.reason })
      }
    } else if (normalizeScheduleB(entry.exportCode) !== normalizeScheduleB(code)) {
      disagreeing.push({ part, document: code, library: entry.exportCode })
    }
  }

  results.push({
    id: 'item-library-coverage',
    severity: 'info',
    title: 'Parts found in the item library',
    detail: covered.size
      ? `${covered.size} of ${parts.size} part(s) on this shipment are in the imported item master.`
      : 'None of the parts on this shipment are in the imported item master.',
    passed: true,
    actual: `${covered.size}/${parts.size}`,
  })

  if (badInLibrary.length) {
    results.push({
      id: 'item-library-codes',
      severity: 'warning',
      title: 'The item library holds a bad commodity number for some parts',
      detail:
        badInLibrary.map((f) => `${f.part}: ${f.code} — ${f.reason}`).join(' · ') +
        ' The shipment files the number on the CIPL; this is the master record to fix.',
      passed: false,
    })
  }

  if (disagreeing.length) {
    results.push({
      id: 'item-library-conflict',
      severity: 'warning',
      title: 'The CIPL and the item library classify some parts differently',
      detail:
        disagreeing.map((d) => `${d.part}: CIPL says ${d.document}, library says ${d.library}`).join(' · ') +
        '. The CIPL number is what will be filed — record an override if the library is the correct one.',
      passed: false,
    })
  }

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
