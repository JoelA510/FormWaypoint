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
import {
  checkClassification,
  formatScheduleB,
  normalizeScheduleB,
  screenCode,
  type ScheduleBIndex,
} from '../schedule-b'
import { canRestate, resolveReportingQuantity, roundedAwayToNothing } from '../units'
import { MAX_SHEETS, pagesNeeded } from '../../lib/pagination'
import type { ItemLibraryEntry } from '../item-library'
import { partKey } from '../part-key'
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
  /** Commodity rows one sheet of the target form holds. Beyond it the form continues onto another. */
  maxRows?: number
  /** Overrides which document set is used. Defaults to the USD set. */
  forceSet?: DocumentSet
  /**
   * The imported item master, keyed by uppercased part number.
   *
   * Used to screen the commodity numbers held against the parts on this shipment, and to
   * report where the master and the CIPL disagree. Never used to change a code — that is
   * what `codesByPart` is, and it only ever holds what a person typed.
   */
  itemsByPart?: Map<string, ItemLibraryEntry>
  /**
   * The unit of quantity to file a commodity row in, keyed by normalised Schedule B number.
   *
   * Keyed by code rather than by row because that is what the choice is *about*: the Census
   * file requires a unit per commodity number, so "file 9031.90.0000 in kilograms" holds for
   * every row carrying that code and survives a regrouping that splits or merges them.
   *
   * Empty by default, and it should usually stay that way — the default already aligns with
   * Schedule B wherever the shipment can state it. This exists for the codes that accept more
   * than one unit, where only the filer can say which the goods are actually measured in.
   */
  reportingUnits?: Record<string, string>
}

/**
 * Choose the controlling document set.
 *
 * Vendor A CIPLs carry the same goods twice: `FC` priced in USD and `TP1` priced in the
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
 * omits the country entirely (vendorA3 ends at `'s-Hertogenbosch NA 5234`). Returning null
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

  // The unit each row is filed in, and its quantity restated into that unit.
  //
  // Here rather than in `aggregateLines` because only the Census dataset knows what a code
  // requires, and at all because a piece count filed against a code reported in kilograms is
  // a reporting error that nothing else on the form gives any sign of. The document's own
  // figure is never overwritten — `quantity` and `sourceUom` still say what was printed.
  for (const line of sliLines) {
    // The Census file's own spellings, not their canonical forms. `canonicalUnit` exists to
    // make what a *document* prints comparable with what the file requires; using it on the
    // file's side too would file `NO` against the 51 commodity numbers the file reports in
    // `PCS`, which is a unit it does not list for them.
    const accepted = (index?.lookup(line.scheduleB)?.units ?? [])
      .map((unit) => unit.trim().toUpperCase())
      .filter(Boolean)
    line.scheduleBUnit = accepted[0] ?? null
    line.scheduleBUnits = accepted
    const restated = resolveReportingQuantity(
      { quantity: line.quantity, uom: line.sourceUom, weightKg: line.weightKg },
      accepted,
      options.reportingUnits?.[normalizeScheduleB(line.scheduleB)],
    )
    line.reportingUom = restated.unit
    line.reportingQuantity = restated.quantity
    line.reportingBasis = restated.basis
  }

  // A figure that is not a number is a fault upstream, and it reaches three outputs — two
  // form boxes and a keying sheet cell. Gated once here rather than papered over at each:
  // blank boxes and an empty cell all read as "nothing to declare", and the keying sheet's
  // TOTAL would quietly come out short by the missing row.
  const unusable = sliLines.filter(
    (line) => line.reportingBasis !== 'none' && !Number.isFinite(line.reportingQuantity),
  )

  // A row whose figure rounds away to nothing. Kilogram quantities are filed as whole
  // kilograms, so anything under half a kilo lands on zero — and a quantity box reading `0`
  // on a signed declaration says these goods are not there. Warned rather than blocked: what
  // to file instead is a decision (round up to one, file the piece count, reclassify), and
  // none of them is this app's to make.
  // One rule, shared with the review screen and the keying sheet, so the three surfaces cannot
  // describe the same row differently. Gated on the row representing goods at all, not on it
  // having a weight: a row invoiced in grams under a kilogram code converts without one, and
  // 400 g rounds to zero just the same.
  const roundedAway = sliLines.filter(
    (line) =>
      line.reportingBasis !== 'none' &&
      roundedAwayToNothing(
        { quantity: line.quantity, uom: line.sourceUom, weightKg: line.weightKg },
        line.reportingUom,
        line.reportingQuantity,
      ),
  )

  const checks: CheckResult[] = [
    { id: 'set-selection', severity: 'info', title: 'Controlling document set', detail: reason, passed: true },
    {
      id: 'quantities-usable',
      severity: 'blocking',
      title: 'Every commodity row has a usable quantity',
      detail: unusable.length
        ? `${unusable.length} row(s) have no usable quantity (${unusable.map((l) => l.scheduleB).join(', ')}). ` +
          'A quantity box left blank on a signed declaration reads as nothing to declare, and the keying ' +
          'sheet would total short by those rows.'
        : 'Every row carries a figure that can be written.',
      passed: unusable.length === 0,
    },
    {
      id: 'quantities-nonzero',
      severity: 'warning',
      title: 'No commodity row files a quantity of zero',
      detail: roundedAway.length
        ? `${roundedAway.length} row(s) round to a quantity of 0 in the unit they are filed in ` +
          // Whichever figure actually rounded away, and in whichever unit. A row invoiced in
          // grams under a kilogram code converts without a stated weight, and printing
          // `at 0 kg` about it sent the filer to look for a weight the document never had.
          `(${roundedAway.map(roundedAwayFrom).join(', ')}). A quantity in one of these units is filed as a ` +
          'whole number of them, so anything under half a unit has nowhere to land. Decide what the box ' +
          'should say before signing — a zero declares the goods absent.'
        // Not "at least one": the eight codes Schedule B files with no quantity at all are
        // deliberately outside this check, and a shipment made up of them files a blank box
        // on every row.
        : 'No row files a quantity of zero.',
      passed: roundedAway.length === 0,
    },
    ...currencyCheck(currency),
    {
      id: 'header-readable',
      severity: 'blocking',
      title: 'Shipment header was read',
      detail: headerReadable
        ? `Header read from the ${set} document set.`
        : `No header could be read for the ${set} set, so there are no document totals to reconcile against. ` +
          'This file is probably not one of the supported CIPL layouts.',
      passed: headerReadable,
    },
    ...totalsChecks(header, mergedLines, sliLines, parsed.providesWeights, parsed.format !== 'vendor-a'),
    ...partTotalChecks(mergedLines, parsed.partTotals),
    ...lineageChecks(mergedLines, packingLines, sliLines),
    ...partCodeChecks(mergedLines, index, options.itemsByPart),
    ...partCodeOverrideChecks(mergedLines, options.codesByPart),
    ...classificationChecks(sliLines, mergedLines, index),
    ...exportControlChecks(options, mergedLines),
    ...sourceControlChecks(sliLines, mergedLines, options),
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
 * A row that rounded to nothing, named alongside the figure that did the rounding.
 *
 * Told by the basis, not by whether a weight happens to be on the row. A line invoiced as
 * 400 g under a kilogram code converts from its own quantity and rounds away there — and a
 * packing list that also states a 0.45 kg net weight for it would have the filer inspecting
 * a figure that had nothing to do with it.
 */
function roundedAwayFrom(line: SLILine): string {
  const from =
    line.reportingBasis === 'net-weight'
      ? `${line.weightKg} kg`
      : `${line.quantity} ${line.sourceUom}`
  return `${line.scheduleB} at ${from}, filed in ${line.reportingUom}`
}

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
 * first, so multiplying back up re-inflates that rounding N-fold. Shipment vendorA4 prints
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
  /**
   * True for formats (`vendor-b`, `omron-ci`) whose header quantity total is the sum of
   * their own parsed lines, so the total-quantity check cannot catch a line that parsed
   * as zero. For those, a zero-quantity line must block; for a format with a printed
   * total (`vendor-a`), that total already guards misread quantities and a printed zero
   * may be legitimate (a backordered row), so it only warns.
   */
  quantityTotalIsSelfReferential: boolean,
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

  // A line with no readable quantity parses as zero, and for a format whose quantity
  // total is the sum of its own lines the total-quantity check above then agrees with
  // itself. Zero pieces of a real part is not a fileable customs line — it is an
  // incomplete one, and where no printed total can catch it, it must hold the shipment
  // rather than file as nothing.
  const zeroQuantity = merged.filter((line) => !(line.quantity > 0))
  results.push({
    id: 'line-quantities',
    severity: quantityTotalIsSelfReferential ? 'blocking' : 'warning',
    title: 'Every invoice line has a quantity',
    detail: zeroQuantity.length
      ? `${zeroQuantity.length} line(s) have no readable quantity: ` +
        `${zeroQuantity.map((l) => l.partNumber || l.description || l.id).join(', ')}. ` +
        'A blank quantity must not be filed as zero.'
      : 'Every line states a positive quantity.',
    passed: zeroQuantity.length === 0,
    refs: zeroQuantity.map((l) => l.id),
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
    if (header.totalNetWeightKg != null) {
      // No per-line weights, but the header carries a net total (the `omron-ci` form
      // prints one, typed by the preparer). Both sides are supplied figures rather than
      // document-proved ones, so this is a cross-check between the per-part table and the
      // form — a warning that catches a stale or mistyped unit weight, not proof.
      //
      // The tolerance is far looser than the printed-total branch below: the form's box
      // is typically typed to one decimal while the per-part sum carries three, so the
      // two can legitimately disagree by rounding. Holding them to a gram would fail
      // routinely-correct shipments and train the reader to skip the one warning meant
      // to catch a genuinely stale figure.
      const suppliedTolerance = Math.max(0.05, header.totalNetWeightKg * 0.005)
      const weightOk = Math.abs(weight - header.totalNetWeightKg) <= suppliedTolerance
      results.push({
        id: 'total-weight',
        severity: 'warning',
        title: 'Supplied weights agree with the form’s net total',
        detail: weightOk
          ? `Rows total ${weight.toFixed(3)} kg net from the per-part figures, matching the total entered on the form.`
          : `Rows total ${weight.toFixed(3)} kg from the per-part figures but the form states ` +
            `${header.totalNetWeightKg.toFixed(3)} kg. One of the two is wrong — check the per-part weights ` +
            'and the form before filing.',
        passed: weightOk,
        expected: header.totalNetWeightKg.toFixed(3),
        actual: weight.toFixed(3),
      })
    } else {
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
    }
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
  // Worded for where the weight was supposed to come from. An invoice-only format has no
  // packing list to match against — its weights come from the saved per-part table — and
  // being told "no packing-list match" names a document the shipment cannot have while
  // saying nothing about the thing that would fix it.
  const lineRefs = missingWeights.map((l) => `${l.orderNumber}/${l.sequence}`).join(', ')
  results.push({
    id: 'weights-present',
    severity: 'blocking',
    title: providesWeights ? 'Every invoice line has a packing-list weight' : 'Every invoice line has a net weight',
    detail: !missingWeights.length
      ? providesWeights
        ? 'All invoice lines matched a packing-list line.'
        : 'Every line has a net weight from the saved per-part table.'
      : providesWeights
        ? `No packing-list match for ${missingWeights.length} line(s): ${lineRefs}. ` +
          'A blank weight must not be filed as zero.'
        : `No saved weight for ${missingWeights.length} line(s): ${lineRefs}. This document states no ` +
          'per-line weights, so each part needs one in the saved per-part table, or entered by hand. A blank ' +
          'weight must not be filed as zero.',
    passed: missingWeights.length === 0,
    refs: missingWeights.map((l) => l.id),
  })

  return results
}

/**
 * Every part on the shipment, against the quantity the document totals for it.
 *
 * The strongest check available to the `vendor-b` layout, and the only one there that
 * is not circular. Its other totals are sums of the same line blocks the parser reads, so
 * they agree with the rows by construction however many lines were dropped; the packing
 * list's summary section is written independently of them.
 *
 * Blocking in both directions. A part short of its summary means a line was missed — that is
 * how shipment vendorB3's `REPL ACT’R MFS-11` went unnoticed. A part over it, or one that does
 * not appear in the summary at all, means a line was double-counted or read wrong, which
 * misstates the shipment just as badly in the other direction.
 */
function partTotalChecks(merged: MergedLine[], partTotals?: Record<string, number>): CheckResult[] {
  // Deliberately not guarded on `merged.length`. A document whose every line block was
  // refused produces no merged lines at all, and every other check then compares zero
  // against zero and passes — which is precisely the shipment this must hold.
  if (!partTotals || !Object.keys(partTotals).length) return []

  const counted = new Map<string, number>()
  for (const line of merged) {
    const key = partKey(line.partNumber)
    counted.set(key, roundTo((counted.get(key) ?? 0) + line.quantity, 3))
  }

  const discrepancies: string[] = []
  for (const [part, expected] of Object.entries(partTotals)) {
    const actual = counted.get(part) ?? 0
    if (Math.abs(actual - expected) > 0.0005) {
      discrepancies.push(
        actual === 0
          ? `${part}: the document totals ${expected} but no line for it was read at all`
          : `${part}: rows total ${actual} against the document's ${expected}`,
      )
    }
  }
  for (const [part, actual] of counted) {
    if (!(part in partTotals)) {
      discrepancies.push(`${part}: rows total ${actual} but the document's summary does not list it`)
    }
  }

  const parts = Object.keys(partTotals).length
  return [
    {
      id: 'packing-summary',
      severity: 'blocking',
      title: 'Every part matches the packing list’s own summary',
      detail: discrepancies.length
        ? `${discrepancies.join(' · ')}. The summary is written independently of the line detail, so a ` +
          'disagreement means a line was missed, duplicated, or misread.'
        : `All ${parts} part(s) match the quantities the packing list summarises.`,
      passed: discrepancies.length === 0,
      expected: `${parts} part(s)`,
      actual: discrepancies.length ? `${discrepancies.length} disagree` : 'all agree',
    },
  ]
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
    const entry = itemsByPart.get(partKey(part))
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

/**
 * Parts filed under a commodity number a person entered rather than the one printed.
 *
 * Never silent. Substituting a classification is the single most consequential thing anyone
 * can do on this screen, and the substitution is invisible by the time it reaches the
 * commodity table — the row simply shows the new code as though the document said so. This
 * says which parts were changed and away from what, every time, so signing the form is a
 * decision taken with that in view.
 *
 * Reported where the code actually differs. A saved override that happens to match what this
 * document prints changed nothing, and listing it would train the reader to skip the notice.
 */
function partCodeOverrideChecks(merged: MergedLine[], codesByPart?: Record<string, string>): CheckResult[] {
  if (!codesByPart || !Object.keys(codesByPart).length) return []

  const substituted = new Map<string, { part: string; from: string; to: string }>()
  for (const line of merged) {
    const entered = codesByPart[partKey(line.partNumber)]
    if (!entered) continue
    if (normalizeScheduleB(entered) === normalizeScheduleB(line.classification)) continue
    substituted.set(line.partNumber, {
      part: line.partNumber,
      from: line.classification || '(blank)',
      // Both codes punctuated the same way. The entered one is stored as ten bare digits, and
      // printing it raw beside a dotted one reads as a different kind of value — the reader is
      // being asked to compare two codes, so they have to look comparable.
      to: formatScheduleB(entered),
    })
  }

  if (!substituted.size) return []

  return [
    {
      id: 'part-code-overrides',
      severity: 'warning',
      title: 'Some parts are filed under a manually entered commodity number',
      detail:
        [...substituted.values()]
          .map((s) => `${s.part}: filing ${s.to} instead of the ${s.from} on the document`)
          .join(' · ') + '. Confirm each before signing — this is a classification you are making.',
      passed: false,
      actual: `${substituted.size} part(s)`,
    },
  ]
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

    return checkClassification(
      {
        code: line.scheduleB,
        sourceText,
        sourceUom: line.sourceUom,
        reportingUom: line.reportingUom,
        reportingBasis: line.reportingBasis,
        hasNetWeight: line.weightKg > 0,
        // Answered by the conversion rules rather than inferred from the unit's name, so the
        // check can tell "the figure does not exist" from "somebody chose otherwise".
        //
        // For the *first* accepted unit, which is the one the check's advice names. Asked
        // across the whole set, a code accepting KG then NO on a weightless row answered yes
        // — and the filer was told to put the row back to KG, the one unit it cannot state.
          // Every accepted unit this row could actually state, so the check can name the one it
        // is telling the filer to go back to. Asked across the set but reported as a list:
        // taking the first accepted unit alone told a filer to restore `KG` on a code
        // accepting `KG` or `DOZ` where only `DOZ` was reachable.
        reachableUnits: line.scheduleBUnits.filter((unit) =>
          canRestate({ quantity: line.quantity, uom: line.sourceUom, weightKg: line.weightKg }, unit),
        ),
        ref: `row-${i + 1}`,
      },
      index,
    )
  })
}

/**
 * The export-control triplet is a decision, not an extraction — with one exception.
 *
 * The vendor CIPLs never carry it (beyond `vendor-b`'s occasional ECCN). Treating absence
 * as EAR99, or EAR99 as automatically meaning NLR, is precisely the inference an
 * export-compliance tool must not make, so an unanswered blanket value is surfaced as an
 * unanswered question rather than filled in.
 *
 * The `omron-ci` form is the exception: it states ECCN, license and SME per line, and a
 * stated value is a classification the exporter already made. A component of the triplet
 * is therefore only "missing" when the blanket value is unset *and* some line does not
 * state its own.
 */
function exportControlChecks(options: ReconcileOptions, merged: MergedLine[]): CheckResult[] {
  const statedEverywhere = (value: (line: MergedLine) => string | undefined): boolean =>
    merged.length > 0 && merged.every((line) => value(line))

  const missing = [
    ['ECCN / EAR99 / USML category', options.eccn, (line: MergedLine) => line.eccn],
    ['SME', options.sme, (line: MergedLine) => line.sme],
    ['Licence, exception or NLR', options.license, (line: MergedLine) => line.license],
  ]
    .filter(([, blanket, stated]) => !blanket && !statedEverywhere(stated as (line: MergedLine) => string | undefined))
    .map(([label]) => label as string)

  return [
    {
      id: 'export-control',
      severity: 'warning',
      title: 'Export-control classification supplied',
      detail: missing.length
        ? `Not yet set: ${missing.join(', ')}. These are not on the CIPL and are never inferred — ` +
          'an absent ECCN does not establish EAR99, and EAR99 does not by itself establish NLR.'
        : 'Every row carries a full export-control triplet, from the document line where stated and the ' +
          'entered blanket value otherwise.',
      passed: missing.length === 0,
    },
  ]
}

/**
 * Rows whose stated export-control values change what would otherwise be filed.
 *
 * Surfaced because the substitution runs both ways in the historical data: shipment
 * vendorB1 states `ECCN: 5A992.C` against its T20 pendant kit, and the SLI filed for it says
 * EAR99. A stated value is a classification the exporter already made, so it wins — but the
 * reviewer is told, because it changes what is being declared. The same rule covers the
 * licence and SME the `omron-ci` form states per line: a stated NLR under an entered
 * licence number is a downgrade of a person's entry and must not pass silently.
 *
 * "Changes" is judged against the blanket value; with no blanket entered, the unremarkable
 * norms (EAR99 / NLR / N) are not reported, because the `omron-ci` form states them on
 * every line and flagging each one would train the reader to skip the warning.
 */
function sourceControlChecks(sliLines: SLILine[], merged: MergedLine[], options: ReconcileOptions): CheckResult[] {
  const byId = new Map(merged.map((l) => [l.id, l]))
  const members = [
    { id: 'eccn-from-document', label: 'ECCN', blanket: options.eccn, norm: 'EAR99', value: (l: MergedLine) => l.eccn },
    { id: 'license-from-document', label: 'licence', blanket: options.license, norm: 'NLR', value: (l: MergedLine) => l.license },
    { id: 'sme-from-document', label: 'SME', blanket: options.sme, norm: 'N', value: (l: MergedLine) => l.sme },
  ]

  return members.flatMap(({ id, label, blanket, norm, value }) => {
    const unremarkable = (blanket ?? '').trim().toUpperCase() || norm
    const stated = sliLines.flatMap((line, i) => {
      const sourceValue = line.sourceLineIds
        .map((lineId) => {
          const source = byId.get(lineId)
          return source ? value(source) : undefined
        })
        .find(Boolean)
      return sourceValue && sourceValue.trim().toUpperCase() !== unremarkable
        ? [{ row: i + 1, scheduleB: line.scheduleB, value: sourceValue }]
        : []
    })

    if (!stated.length) return []

    return [
      {
        id,
        severity: 'warning' as const,
        title: `The document states a ${label} that changes what is declared`,
        detail:
          stated
            .map((s) => `Row ${s.row} (${s.scheduleB}) will be filed as ${s.value}, as printed on the document`)
            .join('; ') +
          '. A stated value beats the blanket value — confirm it before signing.',
        passed: false,
        refs: stated.map((s) => `row-${s.row}`),
      },
    ]
  })
}

/**
 * How many sheets the shipment will take.
 *
 * Informational, not blocking. A shipment with more commodity rows than the blank form holds
 * used to be refused outright, which stopped the one thing the tool exists to do over a
 * situation the forms themselves handle by being filed as several sheets — so the form is now
 * produced with continuation pages and this says how many. See `paginateForm`.
 */
function capacityCheck(sliLines: SLILine[], rowsPerPage?: number): CheckResult[] {
  if (!rowsPerPage) return []
  const pages = pagesNeeded(sliLines.length, rowsPerPage)
  // Past any real shipment. Every sheet is a full copy of the template page, produced on the
  // browser's main thread, so a row count the parser got wrong turns into tens of megabytes
  // and a frozen tab — and with the old blocking check gone, nothing else would notice.
  if (pages > MAX_SHEETS) {
    return [
      {
        id: 'row-capacity',
        severity: 'blocking',
        title: 'Commodity rows are within a plausible shipment',
        detail:
          `${sliLines.length} commodity rows would be filed on ${pages} sheets at ${rowsPerPage} to a sheet. ` +
          `More than ${MAX_SHEETS} sheets is past any shipment this tool is meant for, so this is far more ` +
          'likely to be a document the parser read wrongly than a shipment that large. Check the commodity ' +
          'rows against the invoice before generating anything.',
        expected: `at most ${MAX_SHEETS} sheets`,
        actual: `${sliLines.length} rows, ${pages} sheets`,
        passed: false,
      },
    ]
  }
  return [
    {
      id: 'row-capacity',
      severity: 'info',
      // Not "rows fit the form": it says so on exactly the shipments that need a second sheet.
      title: 'Sheets the commodity table needs',
      detail:
        pages === 1
          ? `${sliLines.length} of ${rowsPerPage} available rows used, on one sheet.`
          : `${sliLines.length} rows at ${rowsPerPage} to a sheet, so the form is generated as ${pages} pages. ` +
            'Every box but the commodity table is one field across the sheets — correcting the consignee on ' +
            'any page corrects it on all of them.',
      // No `expected`/`actual`: the checks panel renders those only for a check that failed,
      // and this one reports rather than judges.
      passed: true,
    },
  ]
}
