/**
 * Keying sheets for FedEx Ship Manager and UPS WorldShip.
 *
 * Neither application is driven by an API here, and neither one's paper SLI gets filled
 * either — in practice the shipment is keyed into the desktop software and the SLI is never
 * touched. So the sheet is laid out as the software's own screens: the same tabs, the same
 * field names, in the order the cursor moves through them, with every value already in the
 * unit and format that screen expects.
 *
 * Three of those formats are not what the CIPL prints, and each was taken from a real
 * Ship Manager entry rather than assumed:
 *
 *   - weights are pounds, not kilograms;
 *   - country of manufacture is an ISO alpha-2 code (`GB`), not a name (`United Kingdom`);
 *   - unit value carries six decimal places.
 *
 * Import files are deliberately still not generated: WorldShip import maps and Ship Manager
 * flat-file layouts are configured per installation, and a mismatched layout fails silently
 * or, worse, transposes values.
 */
import type { MergedLine, Reconciliation, SLILine } from '../../domain/types'
import {
  KG_PER_LB,
  filedWhole,
  kgToLb as kilogramsToPounds,
  restateExact,
  restateQuantity,
  roundPrecise,
} from '../../domain/units'
import { buildXlsx, type CellValue, type Sheet } from '../../lib/xlsx'
import type { SliDraft } from '../types'
import { canonicalUnit, formatScheduleB, normalizeScheduleB, type ScheduleBIndex } from '../../domain/schedule-b'
import { partKey } from '../../domain/part-key'
import { domesticForeign, roundTo } from '../../domain/reconcile'
import { toCountryPickerLabel, toIsoAlpha2 } from './countries'

import {
  COMMODITY_COLUMNS,
  DESCRIPTION_LABELS,
  DESCRIPTION_NOTES,
  GROUPING_LABELS,
  GROUPING_NOTES,
  withDefaults,
  type CommodityColumnId,
  type DescriptionSource,
  type GroupingMode,
  type KeyingOptions,
  type ScheduleBFallback,
} from './options'

export * from './countries'
export * from './options'

export type KeyingTarget = 'fedex-ship-manager' | 'ups-worldship'

export interface KeyingField {
  label: string
  value: string
  /** Shown beneath the value: where it came from, or that it needs manual entry. */
  note?: string
}

export interface KeyingSection {
  /** The application's own tab name, so the operator knows where they are. */
  tab: string
  title: string
  fields: KeyingField[]
}

export interface KeyingCommodityRow {
  description: string
  /** True when the wording came from a saved per-part override rather than the document. */
  describedByOperator?: boolean
  /**
   * Why this row carries the document's wording when the official one was asked for, or null
   * when it does not. Surfaced on the row and counted on the Notes tab, because a sheet that
   * says its descriptions are official must not quietly hold rows that are not — and the two
   * reasons want different action, one from the classifier and one from whoever can get the
   * dataset to load.
   */
  scheduleBUnavailable?: ScheduleBFallback
  /**
   * Other wordings the document used for this part. Printed beside the row so the choice is
   * visible: the CIPL describes one part more than one way and does not say which is meant.
   */
  otherDescriptions: string[]
  harmonizedCode: string
  /**
   * ISO alpha-2, as the commodity record stores it — comma-separated where a grouping mode
   * merged several origins into one row.
   *
   * Only origins that resolved. A name this app could not place is not a code and does not
   * belong in a field of codes; `countryLabel` carries it, with the prompt beside it, and
   * `needsCountryCode` flags the row.
   */
  countryOfManufacture: string
  /** `DO - Dominican Republic`: the code the record stores, and the name the picker lists. */
  countryLabel: string
  quantity: string
  /**
   * The unit `quantity` is expressed in — the one the SLI files for this commodity number,
   * which is not always the one the invoice printed.
   */
  unitOfMeasure: string
  /**
   * Set when the figure is the row's net weight rather than its piece count, because the
   * commodity number is reported by weight. Printed beside the row: a quantity that is not a
   * count is the one figure on this sheet an operator will otherwise key straight past.
   */
  quantityFromNetWeight?: boolean
  /**
   * Set when the figure is the document's own quantity restated into another unit — ten
   * pieces keyed as `0.83333` dozen. A derived number, and the row says so rather than
   * letting it pass as something the document printed.
   */
  quantityConverted?: boolean
  /**
   * Set when this row could not be stated in the unit its commodity number requires — the
   * SLI files that unit and this row cannot, so the two disagree and the sheet says which.
   */
  unitUnavailable?: string
  /**
   * Set for the eight commodity numbers Schedule B files with no quantity at all.
   *
   * The row still carries the document's own count, because a commodity record in Ship
   * Manager or WorldShip needs one whatever AES asks for — but the sheet says the figure is
   * for the application rather than for the declaration, which the SLI leaves blank.
   */
  quantityNotFiled?: boolean
  /**
   * True where the row files zero of a unit it does have a figure for — rounded away, or the
   * short end of a whole figure shared out across the rows that make up one commodity row.
   */
  quantityRoundedAway?: boolean
  /** Six decimal places, as Ship Manager displays and stores it. */
  unitValue: string
  totalValue: string
  weightLb: string
  weightKg: string
  partNumber: string
  /**
   * True when a line in this row carries no part number, so the names in `partNumber` do not
   * account for all of it. Counted on the Notes tab: a saved wording is keyed to a part and
   * cannot speak for goods the document does not identify.
   */
  partUnstated?: boolean
  /**
   * `D` (US origin), `F`, or `D, F` for a row that merged both.
   *
   * Read off every origin in the row, never off the seller or the ship-from location. A
   * mixed row says so: the grouping modes that combine origins can produce one, and naming
   * only the first origin's letter would misdeclare the rest.
   */
  domesticForeign: string
  /** Set when the country name could not be resolved to a code. */
  needsCountryCode?: boolean
}

export interface KeyingSheet {
  target: KeyingTarget
  applicationName: string
  shipmentReference: string
  /** The grouping, columns and description source these rows were built under. */
  options: KeyingOptions
  sections: KeyingSection[]
  commodities: KeyingCommodityRow[]
  totals: {
    commodities: number
    quantity: number
    customsValue: string
    shipmentWeightLb: string
    shipmentWeightKg: string
  }
  /** Where the figures came from, so the sheet can account for itself months later. */
  provenance: {
    sourceFile: string
    documentSet: string
    documentCurrency: string
    excludedSets: string
  }
  /**
   * The shipment's own figures, from the invoice lines and unrounded.
   *
   * Separate from `totals`, which adds up the rows as printed. Both are true and they are not
   * always equal: rounding each row to two decimals and summing is not the same as summing
   * and rounding once, and which one is wanted depends on whether you are checking the
   * application's running total or the shipment. Printing only the layout-dependent one would
   * let a figure that moves with a dropdown be read as the filed value.
   */
  filed: {
    quantity: number
    customsValue: string
    netWeightKg: string
    grossWeightKg: string | null
  }
  /** Values the operator must supply; the CIPL does not contain them. */
  manualFields: string[]
}

const APPLICATION_NAMES: Record<KeyingTarget, string> = {
  'fedex-ship-manager': 'FedEx Ship Manager',
  'ups-worldship': 'UPS WorldShip',
}

/** Rounded to the two decimals both applications accept. */
export function kgToLb(kg: number): number {
  return Math.round(kilogramsToPounds(kg) * 100) / 100
}

/** Printed in the notes so the conversion can be checked by hand. */
const KG_PER_LB_LABEL = (1 / KG_PER_LB).toFixed(9)

const MANUAL = 'Not on the CIPL — enter manually'
const CHOOSE = 'Not on the CIPL — choose in the application'

/**
 * The commodity number this line is actually filed under.
 *
 * A reviewer who corrects a part's code corrects it for the SLI, and the keying sheet is
 * typed into software that files the same shipment — printing the number the document got
 * wrong would have the operator key the very code somebody just corrected away. Precedence
 * matches `aggregateLines` exactly: the per-part correction is the narrower statement and
 * beats a blanket code redirect. Truthiness, not `??`, because an empty string means "no
 * override" and taking it would file a blank.
 */
function codeFor(line: MergedLine, corrections: CodeCorrections): string {
  return (
    corrections.codesByPart?.[partKey(line.partNumber)] ||
    corrections.overrides?.[normalizeScheduleB(line.classification)] ||
    line.classification
  )
}

export interface CodeCorrections {
  /** Commodity numbers a reviewer entered against a part. */
  codesByPart?: Record<string, string>
  /** Classification redirects, keyed by normalised source code. */
  overrides?: Record<string, string>
  /** The shipment-wide ECCN, for lines that print none. Only `df-code` reads it. */
  eccn?: string | null
  /** The shipment-wide licence, for lines that print none. Only `df-code` reads it. */
  license?: string | null
  /** The shipment-wide SME flag, for lines that print none. Only `df-code` reads it. */
  sme?: string | null
}

/**
 * What makes two invoice lines one row.
 *
 * The default is part, country of manufacture and commodity number, because that is what a
 * commodity record holds: a real Ship Manager entry for shipment vendorA4 splits its cable
 * line into 4 from MY and 2 from JP, where the SLI holds a single row of 6 under one Schedule
 * B number. Grouping the SLI's way by default would make the operator take that row apart
 * again at the keyboard, which is the manual step this exists to remove — but checking a
 * sheet *against* a filed SLI wants exactly those rows, so `df-code` is here too.
 *
 * The description is in none of the keys, though it used to be in the default. The CIPL
 * prints a commodity-group heading against some lines and the part's own description against
 * others, so one part came out as two identical records differing only in wording — shipment
 * vendorA5 keyed as eight commodities where six were called for, two of its parts each
 * appearing twice at the same code, country and unit price. The same part number is the same
 * goods; the wording is a property of how the document was printed.
 *
 * No mode merges two commodity numbers, because a row asserts one. `line` groups on the
 * line's own identity, which is how "never group" is spelled without a special case.
 */
function groupKeyFor(line: MergedLine, mode: GroupingMode, index: number, corrections: CodeCorrections): string {
  const code = normalizeScheduleB(codeFor(line, corrections))
  // In every mode, because a commodity record holds one unit and `aggregateLines` keys on it
  // for the same reason. Without it, 2 PCS and 5 KG of one part merged into a row of 7 at a
  // unit value averaged across two different things.
  const unit = canonicalUnit(line.uom) ?? line.uom.trim().toUpperCase()
  switch (mode) {
    case 'line':
      return `${index}|${line.id}`
    case 'part-code':
      return [partKey(line.partNumber), code, unit].join('|')
    // Unit and the export-control triplet join the key because the SLI's own rows carry
    // them: `aggregateLines` keys on classification, D/F, ECCN, licence, SME *and*
    // canonical unit. Each triplet member is resolved the way `aggregateLines` resolves it
    // — a line's printed value (the `omron-ci` form states all three per line), or the
    // controlled blanket where it prints none. Treating a blank as its own bucket splits a
    // row the filed SLI merges as soon as one line happens to print the controlled value
    // outright, which is the opposite of what this mode is for.
    case 'df-code':
      // Case-insensitive on the triplet, exactly as `aggregateLines` keys its rows.
      return [
        domesticForeign(line.countryOfOrigin),
        code,
        unit,
        (line.eccn || corrections.eccn || '').toUpperCase(),
        (line.license || corrections.license || '').toUpperCase(),
        (line.sme || corrections.sme || '').toUpperCase(),
      ].join('|')
    case 'part-origin-code':
    default:
      return [partKey(line.partNumber), partKey(line.countryOfOrigin), code, unit].join('|')
  }
}

/**
 * The unit to key: the first printed spelling, which is what `aggregateLines` puts in
 * `sourceUom`.
 *
 * One value, never a list, and that is guaranteed rather than hoped for — every grouping mode
 * keys on the canonical unit, so a row's lines all mean the same unit by construction. `PCS`
 * and `EA` canonicalise alike and can share a row; `PCS` and `KG` cannot. Printing both
 * spellings would put `PCS, EA` into a field that holds one value.
 */
function unitFor(group: MergedLine[]): string {
  return group[0].uom
}

/**
 * The unit each commodity number is filed in, read off the SLI's own rows.
 *
 * Read rather than recomputed, and that is the point. The sheet and the form describe one
 * shipment: if the SLI files 9031.90.0000 by weight and the sheet keys it by the piece, the
 * two documents state different quantities for the same goods and nothing in either says
 * which is meant. `reconcile` resolves the unit once, per commodity number, and this follows
 * it.
 */
function reportingUnits(sliLines: SLILine[]): Map<string, string> {
  const units = new Map<string, string>()
  for (const line of sliLines) {
    // Keyed on the commodity number *and* the unit the document reported it in, because
    // `aggregateLines` splits rows on the canonical unit too: a code invoiced partly in
    // pieces and partly in kilograms is two SLI rows filing two different units. Keyed on the
    // code alone, the keying rows built from one of those groups were told they should be
    // filing the other's unit, and the sheet asserted "this code files in NO and this row has
    // no figure for it" about goods the SLI files in KG.
    //
    // The code-only key is kept alongside as a fallback for a group whose unit matches no row
    // at all. First seen wins there, and the rows are in a settled order, so the sheet is the
    // same sheet from one run to the next.
    const code = normalizeScheduleB(line.scheduleB)
    const keyed = `${code}|${canonicalUnit(line.sourceUom) ?? ''}`
    if (!units.has(keyed)) units.set(keyed, line.reportingUom)
    if (!units.has(code)) units.set(code, line.reportingUom)
  }
  return units
}

/**
 * The row's quantity in the unit its commodity number is filed in.
 *
 * A keying group is not an SLI row — the default grouping splits a code across parts and
 * origins — so the figure is restated from *this* group's own quantity and weight rather
 * than apportioned from the form's. Where it cannot be (a group with no weight under a code
 * reported by weight), the document's own figure is kept and the row says so, because a
 * blank quantity keys as nothing and an invented one keys as a lie.
 */
/**
 * Everything derived from one keying group before its row is built.
 *
 * One record rather than a map per figure. The quantity a row prints is restated from the
 * weight beside it and shared out against the form's own rows, and three maps written in one
 * pass and read in another are three chances for those to describe different goods.
 */
interface GroupFigures {
  /** The group's own quantity, in the unit the document reported it. */
  quantity: number
  /** The group's net weight in kilograms, summed once. */
  weightKg: number
  keyed: KeyedQuantity
  /** The restated figure before its unit's whole-number rule, or NaN where it has none. */
  exact: number
}

interface KeyedQuantity {
  quantity: number
  unit: string
  fromNetWeight: boolean
  converted?: boolean
  unavailable?: string
  notFiled?: boolean
}

function keyedQuantity(
  group: MergedLine[],
  quantity: number,
  weightKg: number,
  wanted: string | undefined,
): KeyedQuantity {
  const printed = unitFor(group)
  const asPrinted = { quantity: roundTo(quantity, 3), unit: printed, fromNetWeight: false }
  if (!wanted) return asPrinted

  const restated = restateQuantity({ quantity, uom: printed, weightKg }, wanted)
  if (!restated) return { ...asPrinted, unavailable: wanted }
  // `source` is the identity restatement — the wanted unit and the printed one are the same
  // unit written two ways, which `restateQuantity` already decides. The row keeps the
  // document's own spelling, because the operator is keying against a document that says
  // `PCS` while the Census file says `NO`.
  //
  // The *figure* still comes from the restatement, not from the printed quantity. A document
  // already counting kilograms files whole kilograms on the form, and returning the printed
  // 7.438 here would key a different quantity for the same goods than the SLI states.
  if (restated.basis === 'source') return { ...asPrinted, quantity: restated.quantity }
  // The declaration files no quantity for this code, but the application still needs one, so
  // the row keys what the document counted and says which of the two it is. Writing the
  // literal 0 that "no quantity" restates to would have the operator key nothing at all
  // against a commodity that has a value.
  if (restated.basis === 'none') return { ...asPrinted, notFiled: true }
  return {
    quantity: restated.quantity,
    unit: restated.unit,
    fromNetWeight: restated.basis === 'net-weight',
    converted: restated.basis === 'converted',
  }
}

/**
 * Whole-unit quantities shared out between the keying rows and the commodity rows that
 * describe the same goods.
 *
 * The two tables divide a shipment differently. A keying group is usually finer than an SLI
 * row — the default grouping splits a code by part and origin — and under `part-code` it can
 * be coarser, merging origins the form files as separate D and F rows. Neither survives being
 * rounded independently once a unit is filed as a whole number: two groups of 3.719 kg under
 * one row key 4 and 4 against a form filing 7, and one group of 7.438 kg across two rows keys
 * 7 against a form filing 4 and 4. Either way the sheet and the declaration prepared for one
 * shipment state different quantities for the same goods, which is the failure this file
 * exists to prevent.
 *
 * So the two are reconciled over the goods they have in common. Keying groups and commodity
 * rows that share an invoice line belong to the same *component*; the component's filed total
 * is what the form files for it, and that total is shared out across its keying rows by
 * largest remainder — each takes the whole part of its exact share, the units left over go to
 * the largest fractions, ties to the earlier row. The sheet then totals what the form files,
 * by construction, whichever way round the two tables divide the shipment.
 *
 * Only where a component's keying rows account for exactly the lines its commodity rows do.
 * Anything else is a share of part of something, and there is no honest figure for it.
 */
function apportionWholeUnits(
  groups: MergedLine[][],
  figures: Map<MergedLine[], GroupFigures>,
  sliLines: SLILine[],
): void {
  const rowOf = new Map<string, SLILine>()
  for (const row of sliLines) for (const id of row.sourceLineIds) rowOf.set(id, row)

  const parent = new Map<SLILine, SLILine>()
  const find = (row: SLILine): SLILine => {
    const up = parent.get(row)
    if (!up || up === row) return row
    const root = find(up)
    parent.set(row, root)
    return root
  }

  // Eligible groups first, joining the commodity rows each of them touches. Bucketing has to
  // wait for the last join: a component's representative changes as it grows.
  const eligible: { group: MergedLine[]; rows: SLILine[] }[] = []
  for (const group of groups) {
    const figure = figures.get(group)
    // `unavailable` and `notFiled` rows keep the document's own figure and say so; neither is
    // a share of the form's, and rounding is not what is wrong with them.
    if (!figure || figure.keyed.unavailable || figure.keyed.notFiled || !filedWhole(figure.keyed.unit)) continue
    if (!Number.isFinite(figure.exact)) continue
    const rows = group.map((line) => rowOf.get(line.id))
    // A line no commodity row claims leaves nothing to take a share of.
    if (rows.some((row) => !row)) continue
    const owned = rows as SLILine[]
    for (const row of owned) {
      if (!parent.has(row)) parent.set(row, row)
      const [a, b] = [find(owned[0]), find(row)]
      if (a !== b) parent.set(b, a)
    }
    eligible.push({ group, rows: owned })
  }

  const components = new Map<SLILine, { groups: MergedLine[][]; rows: Set<SLILine> }>()
  for (const { group, rows } of eligible) {
    const root = find(rows[0])
    const found = components.get(root) ?? { groups: [], rows: new Set<SLILine>() }
    found.groups.push(group)
    for (const row of rows) found.rows.add(row)
    components.set(root, found)
  }

  for (const { groups: bucket, rows } of components.values()) {
    // Whole, not merely finite. There is nothing whole to share out of a row that is not
    // filing a whole figure, and a fractional remainder would hand a spare unit to whichever
    // group happened to sort first.
    const filed = [...rows]
    if (filed.some((row) => !filedWhole(row.reportingUom) || !Number.isInteger(row.reportingQuantity))) continue
    // Every line the commodity rows carry, accounted for by the keying rows and no more.
    // A bucket holding only some of them is a share of part of the component, and giving it
    // the whole total would key the missing lines twice.
    const keyedIds = new Set(bucket.flatMap((group) => group.map((line) => line.id)))
    const filedIds = new Set(filed.flatMap((row) => row.sourceLineIds))
    if (keyedIds.size !== filedIds.size || [...keyedIds].some((id) => !filedIds.has(id))) continue

    const total = filed.reduce((sum, row) => sum + row.reportingQuantity, 0)
    const shares = bucket.map((group) => (figures.get(group) as GroupFigures).exact)
    const held = shares.reduce((sum, value) => sum + value, 0)
    // Nothing to divide proportionally, and no honest way to guess at it.
    if (!(held > 0)) continue

    // Scaled onto the total first, then divided. Dividing the raw shares and mopping up the
    // difference only works while the form's total is within a unit of their sum, and it is
    // not always: three commodity rows of 0.5 kg each file 1 apiece, so a single keying row
    // covering all three has to key 3 against an exact share of 1.5. Scaling makes the shares
    // sum to what the form files by construction, whichever way each side rounded.
    const scaled = shares.map((value) => (value * total) / held)
    const whole = scaled.map((value) => Math.floor(value))
    const remainder = Math.min(
      Math.max(total - whole.reduce((sum, value) => sum + value, 0), 0),
      bucket.length,
    )
    const byFraction = scaled
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    for (let taken = 0; taken < remainder; taken++) whole[byFraction[taken].index] += 1

    bucket.forEach((group, index) => {
      const figure = figures.get(group) as GroupFigures
      figures.set(group, { ...figure, keyed: { ...figure.keyed, quantity: whole[index] } })
    })
  }
}

/** `MY - Malaysia`, or the name and a prompt where no code could be found for it. */
function originLabel(origin: string): string {
  const { known } = toIsoAlpha2(origin)
  return known ? toCountryPickerLabel(origin) : `${origin} — no code found, enter it`
}

/**
 * Distinct values in first-seen order, joined.
 *
 * A row that spans several parts or origins says so rather than showing the first and
 * implying the rest away. `df-code` rows routinely do: that is what filing by D/F means.
 */
function joinDistinct(values: string[]): string {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(', ')
}

function groupForKeying(
  lines: MergedLine[],
  descriptions: Record<string, string>,
  options: KeyingOptions,
  scheduleB: ScheduleBIndex | null,
  corrections: CodeCorrections,
  /**
   * The unit each commodity number is filed in, keyed by `code|canonical-unit` *and* by code
   * alone as a fallback. Look up the composite key first — see `reportingUnits` for why the
   * code alone is not enough.
   */
  units: Map<string, string>,
  /** The SLI's own commodity rows, whose whole-unit figures these rows are shared out of. */
  sliLines: SLILine[],
): KeyingCommodityRow[] {
  const groups = new Map<string, MergedLine[]>()
  lines.forEach((line, index) => {
    const key = groupKeyFor(line, options.grouping, index, corrections)
    const bucket = groups.get(key)
    if (bucket) bucket.push(line)
    else groups.set(key, [line])
  })

  // `df-code` sorted the way `aggregateLines` sorts the SLI's own rows — ascending by
  // normalised commodity number. The mode exists to be read against that form line for line,
  // and document order put row n beside a different commodity. The other modes stay in
  // document order, which is the order the invoice itself reads in.
  const ordered =
    options.grouping === 'df-code'
      ? [...groups.entries()]
          .sort((a, b) => normalizeScheduleB(codeFor(a[1][0], corrections)).localeCompare(
            normalizeScheduleB(codeFor(b[1][0], corrections)),
          ))
          .map(([, lines]) => lines)
      : [...groups.values()]

  // Restated once, up front, because a unit filed as a whole number cannot be decided one
  // group at a time — see `apportionWholeUnits`.
  const figures = new Map<MergedLine[], GroupFigures>()
  for (const group of ordered) {
    const quantity = group.reduce((sum, l) => sum + l.quantity, 0)
    // Summed in kilograms and converted once. Converting each line and adding the rounded
    // pounds accumulates the rounding: the same shipment came out 0.005 lb heavy that way.
    // Summed *here*, and read below, so the figure a quantity was restated from and the figure
    // printed beside it cannot drift apart.
    const weightKg = group.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    const codeKey = normalizeScheduleB(codeFor(group[0], corrections))
    const wanted = units.get(`${codeKey}|${canonicalUnit(group[0].uom) ?? ''}`) ?? units.get(codeKey)
    const exact = wanted ? restateExact({ quantity, uom: unitFor(group), weightKg }, wanted) : null
    figures.set(group, {
      quantity,
      weightKg,
      keyed: keyedQuantity(group, quantity, weightKg, wanted),
      exact: exact ? exact.quantity : Number.NaN,
    })
  }
  apportionWholeUnits(ordered, figures, sliLines)

  return ordered.map((group) => {
    const first = group[0]
    const total = group.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)
    const { quantity, weightKg, keyed } = figures.get(group) as GroupFigures
    // Read from the distinct origins, not the first line's: a group whose first line prints
    // no origin and whose second says Japan is a Japanese row, and taking `first` would
    // give it an empty country cell with nothing prompting anybody to fill it in.
    // Deduped case-insensitively, as `groupKeyFor` keys them: one unresolvable origin
    // printed two ways gave `Ruritania, RURITANIA` in a cell that holds one country.
    const origins = [...group.reduce((seen, l) => {
      const name = l.countryOfOrigin.trim()
      if (name && !seen.has(name.toUpperCase())) seen.set(name.toUpperCase(), name)
      return seen
    }, new Map<string, string>()).values()]
    // `part-code` combines origins by design, which means it also absorbs lines that state
    // none. The row's country and D/F can only speak for the origins it has, so the fact that
    // some lines had none is part of what the row must say — otherwise 2 pieces from the US
    // and 3 from nowhere print as 5 pieces of `D`, while the SLI files those 3 as `F`.
    const originMissing = group.some((l) => !l.countryOfOrigin.trim())
    const code = codeFor(first, corrections)
    // Deduped the way the grouping keys them, which is case-insensitively. Trimming alone
    // made one part printed in two cases look like two, which both dropped the operator's
    // saved wording and put both spellings in a cell that holds one part number.
    // A Map keeps the *last* value for a repeated key; the first spelling is the one to show.
    const parts = [...group.reduce((seen, l) => {
      const key = partKey(l.partNumber)
      if (key && !seen.has(key)) seen.set(key, l.partNumber.trim())
      return seen
    }, new Map<string, string>()).values()]
    // A saved wording is keyed to a part, so it only applies where the row is one part — and
    // a row that merged a line stating no part number is not one part, however few names it
    // carries. `parts` drops the blanks, so counting it alone made those rows look single and
    // applied one part's wording to goods the document does not identify, discarding what it
    // did say about them (`otherDescriptions` is emptied wherever a saved wording wins).
    const partMissing = group.some((l) => !l.partNumber.trim())
    const saved = parts.length === 1 && !partMissing ? descriptions[partKey(parts[0])] : undefined
    const chosen = describeGroup(group, options.descriptionSource, scheduleB, code)
    return {
      description: saved || chosen.description,
      describedByOperator: Boolean(saved),
      scheduleBUnavailable: saved ? null : chosen.fellBack,
      // Only meaningful when the app chose; the operator's own wording replaces all of them.
      otherDescriptions: saved ? [] : chosen.alternatives,
      // Formatted, because a per-part correction is stored normalised: `PartCodeInput` commits
      // `normalizeScheduleB`, so the raw value is ten bare digits. The SLI formats it and the
      // sheet must agree — an operator keying `8544491000` into a field expecting
      // `8544.49.1000` is the transposition this whole sheet exists to prevent.
      harmonizedCode: formatScheduleB(code),
      countryOfManufacture: joinDistinct(
        origins.map((o) => toIsoAlpha2(o)).filter((c) => c.known).map((c) => c.code),
      ),
      // One label per origin, each carrying its own verdict. A row of `MY, Ruritania` under a
      // single "no code found" note loses which of the two resolved, and the operator has to
      // work out for themselves that Malaysia was fine.
      countryLabel: origins.length
        ? joinDistinct([
            ...origins.map(originLabel),
            ...(originMissing ? ['some lines state no origin — enter it'] : []),
          ])
        : 'not on the document — enter it',
      // Read off every origin in the row, not the first one. `part-code` merges origins by
      // design, so a part shipped 2 from the US and 3 from Japan is one row — and stating D
      // for it would declare three foreign pieces domestic. So it is read off the origins the
      // row actually has: a line with no origin supplies no letter either, and
      // `domesticForeign('')` answers F, which would assert a foreign portion nothing on the
      // row supports. Sorted, so a mixed row reads `D, F` rather than whichever origin the
      // invoice happened to print first.
      //
      // `df-code` is the exception, and has to be. Its key is the letter — including the F
      // that a blank origin produces, which is also what the SLI files for those lines — so
      // reading the cell from the origins instead would blank the one column that mode
      // exists to be checked against. The missing origin is still flagged beside it.
      //
      // And blank, not a partial letter, where some lines state no origin at all: `D` over a
      // row whose other three pieces have no stated origin asserts they are domestic, which
      // is both unsupported and the opposite of the `F` the SLI files for them. A field that
      // cannot be stated is left for the operator, who is told to state it.
      domesticForeign:
        options.grouping === 'df-code'
          ? domesticForeign(first.countryOfOrigin)
          : originMissing
            ? ''
            : joinDistinct(origins.map(domesticForeign).sort()),
      // A row with no origin at all, or only some of one, needs one as much as a row with an
      // unrecognised name.
      needsCountryCode: originMissing || !origins.length || origins.some((o) => !toIsoAlpha2(o).known),
      // Guarded like the form boxes are: `String(NaN)` is the word "NaN", and a cell reading
      // that is keyed into Ship Manager by somebody who assumes the sheet knows better.
      quantity: Number.isFinite(keyed.quantity) ? String(keyed.quantity) : '',
      unitOfMeasure: keyed.unit,
      quantityFromNetWeight: keyed.fromNetWeight,
      quantityConverted: keyed.converted,
      unitUnavailable: keyed.unavailable,
      quantityNotFiled: keyed.notFiled,
      // A whole-unit row can come out at zero either by rounding its own figure away or by
      // taking the short end of a share-out, and the SLI's own zero-quantity check cannot see
      // it: that check reads the form's rows, which are keying nothing of the kind. A cell
      // reading `0` beside a customs value is an operator keying goods that are in the box as
      // absent.
      //
      // Gated on the row representing goods at all, rather than on its restated figure: that
      // figure is itself rounded to three places, so half a gramme under a kilogram code is
      // already `0` there and the one row most in need of the note would not have carried it.
      quantityRoundedAway:
        keyed.quantity === 0 && !keyed.notFiled && !keyed.unavailable && (weightKg > 0 || quantity > 0),
      // Derived from the group's own total rather than copied off one line, so the unit
      // price and the total beside it can never disagree. Per *keyed* unit, so that
      // quantity x unit price still comes back to the customs value on a row filed by
      // weight — both applications compute it that way and would otherwise disagree with
      // the total printed beside it.
      //
      // Stated only where there are units to divide by. A row that files no quantity — a
      // `X`-unit code, or one that shared out to nothing — has no per-unit price, and the
      // total beside it is the figure to key. Written as a comparison rather than leaning on
      // `0` being falsy, because the guard has to catch `NaN` on purpose and not by accident.
      unitValue: Number.isFinite(keyed.quantity) && keyed.quantity > 0 ? (total / keyed.quantity).toFixed(6) : '',
      totalValue: total.toFixed(2),
      weightLb: weightKg ? kgToLb(weightKg).toFixed(2) : '',
      weightKg: weightKg ? roundTo(weightKg, 3).toFixed(3) : '',
      partNumber: joinDistinct(parts),
      /** True when some line in the row carries no part number of its own. */
      partUnstated: partMissing,
    }
  })
}

/**
 * The description to key, chosen from the wordings the document already carries.
 *
 * Never written. A commodity description is part of what is being declared, so the app picks
 * between what is on the CIPL rather than composing something better — an operator who wants
 * better wording saves their own against the part, and the row says so.
 *
 * Choosing is harder than it looks, and the first attempt here was wrong. The plan was to
 * prefer the line's own description over the commodity-group heading, on the theory that the
 * heading describes a section of the invoice and the description describes these goods.
 * Shipment vendorA5 falsified it: part 44534-0730 is described as `Elect. Apparatus, Other`
 * on two lines and `44534-0730 SA34-F1` on a third, with the group heading column *empty* on
 * all three. Nothing in the document says which of those is a heading. Any rule that picks
 * the prettier one is guessing at the shape of the words.
 *
 * So the rule is one the document does support: the wording most of these goods were invoiced
 * under, by quantity, ties going to the first line. Where a part carried more than one, the
 * others travel with the row and are printed beside it — the operator sees that a choice was
 * made and what the alternatives were, instead of a silent pick.
 *
 * `schedule-b` is the one source that is not the document, and it is not composed either: it
 * is the Census Bureau's own wording for the code being filed, which is as authoritative as
 * text on an export declaration gets. It falls back to the document when a code is absent
 * from the concordance, because a blank description is worse than a terse one — and a code
 * the concordance does not hold has its own blocking check to answer for it.
 *
 * A leading repeat of the part number is dropped: it is already its own column, and
 * `44534-0730 SA34-F1` in a description field is half a column of noise.
 */
function describeGroup(
  group: MergedLine[],
  source: DescriptionSource,
  scheduleB: ScheduleBIndex | null,
  code: string,
): { description: string; alternatives: string[]; fellBack: ScheduleBFallback } {
  if (source === 'schedule-b') {
    const official = scheduleB?.lookup(code)?.description?.trim()
    // The document's own wordings still travel with the row: the official text describes the
    // code, and whether the code describes these goods is the reviewer's call, not the app's.
    if (official) {
      return { description: official, alternatives: fromDocument(group, 'document').ranked, fellBack: null }
    }
  }
  if (source === 'heading') {
    const { ranked } = fromDocument(group, 'heading')
    // The part's own wording travels with the row, as it does under `schedule-b`. Ranking
    // headings alone left a row with one entry and nothing in the Note column — while the
    // Notes tab promised the alternatives were printed there.
    const alternatives = fromDocument(group, 'document').ranked.filter((text) => text !== ranked[0])
    return { description: ranked[0] ?? '', alternatives, fellBack: null }
  }
  const { ranked } = fromDocument(group, 'document')
  // A row that asked for the official wording and did not get it has to say so, and say which
  // of the two reasons it was. "This code is not in the concordance" is a statement about the
  // code, and repeating it for every row of a shipment because the dataset failed to load
  // would send somebody looking for a classification problem that is not there.
  return {
    description: ranked[0] ?? '',
    alternatives: ranked.slice(1),
    fellBack: source !== 'schedule-b' ? null : scheduleB ? 'no-code' : 'no-index',
  }
}

/** The document's own wordings for a group, most-invoiced first. */
function fromDocument(group: MergedLine[], source: 'document' | 'heading'): { ranked: string[] } {
  const byText = new Map<string, number>()
  for (const line of group) {
    // Either source falls back to the other rather than leaving the row blank: the CIPL
    // prints a heading against some lines and a description against others, and a row with
    // no words on it is not a row anybody can key.
    const text = (source === 'heading'
      ? line.commodityGroup || line.description
      : line.description || line.commodityGroup
    ).trim()
    if (text) byText.set(text, (byText.get(text) ?? 0) + line.quantity)
  }
  if (!byText.size) return { ranked: [] }

  // Any of the row's parts, not just the first: `part-code` and `df-code` merge several into
  // one row, and another part's number left inside the wording travels into the description
  // keyed against these goods.
  // Longest first: `5610` prefixes `5610-2`, and taking the shorter one first left `2 CABLE
  // ASSY LONG` where the whole part number should have gone.
  const parts = [...new Set(group.map((l) => l.partNumber.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  const strip = (text: string) => {
    for (const part of parts) {
      if (!text.toUpperCase().startsWith(part.toUpperCase())) continue
      const rest = text.slice(part.length)
      // The repeat has to end where the part number ends. Without that, a short part like
      // `CA` matched `CABLE ASSY` and the row was described as `BLE ASSY`.
      //
      // A hyphen is not a boundary, whatever it is elsewhere: part numbers contain them, so
      // `5610` against `5610-2 CABLE ASSY LONG` would take the front off a *different* part's
      // number and describe the goods as `2 CABLE ASSY LONG`. Longest-first ordering only
      // helps when both numbers happen to be in the same row, which under the default
      // grouping they never are.
      if (rest && !/^[\s:,]/.test(rest)) continue
      return rest.replace(/^[\s:,-]+/, '').trim() || text
    }
    return text
  }

  // Stripped before the tally, not after. `40649-0300 CABLE ASSY` and `CABLE ASSY` are the
  // same wording printed two ways, and counting them apart put `document also said: CABLE
  // ASSY` beside a description reading exactly that.
  const stripped = new Map<string, number>()
  for (const [text, quantity] of byText) {
    const key = strip(text)
    stripped.set(key, (stripped.get(key) ?? 0) + quantity)
  }

  return { ranked: [...stripped.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text) }
}

export interface KeyingInputs {
  /** Commodity wording the operator saved against a part, keyed by normalised part number. */
  descriptionsByPart?: Record<string, string>
  /** The document these figures were read from, for the provenance block. */
  sourceFile?: string
  /** Document sets present but not used, e.g. a TP1 copy priced in another currency. */
  excludedSets?: string[]
  /** How rows are grouped, which columns print, and where descriptions come from. */
  options?: Partial<KeyingOptions>
  /** Needed only for the `schedule-b` description source. */
  scheduleB?: ScheduleBIndex | null
  /**
   * Commodity numbers a reviewer entered against a part, and classification redirects — the
   * same corrections `reconcile` was given. Without them the sheet prints the number the
   * document got wrong and the operator keys the code somebody just corrected away.
   */
  codesByPart?: Record<string, string>
  classificationOverrides?: Record<string, string>
  /** The controlled ECCN the SLI rows were built with, so `df-code` partitions as they do. */
  eccn?: string | null
  /** The blanket licence the SLI rows were built with, for the same reason. */
  license?: string | null
  /** The blanket SME flag the SLI rows were built with, for the same reason. */
  sme?: string | null
}

export function buildKeyingSheet(
  target: KeyingTarget,
  reconciliation: Reconciliation,
  draft: SliDraft,
  inputs: KeyingInputs = {},
): KeyingSheet {
  const { header, mergedLines } = reconciliation
  const { descriptionsByPart = {}, sourceFile, excludedSets = [], scheduleB = null } = inputs
  const options = withDefaults(inputs.options)
  const isFedex = target === 'fedex-ship-manager'
  const commodities = groupForKeying(
    mergedLines,
    descriptionsByPart,
    options,
    scheduleB,
    {
      codesByPart: inputs.codesByPart,
      overrides: inputs.classificationOverrides,
      eccn: inputs.eccn,
      license: inputs.license,
      sme: inputs.sme,
    },
    reportingUnits(reconciliation.sliLines),
    reconciliation.sliLines,
  )

  // Two different weights, because they answer two different questions.
  //
  // The shipment's own net weight comes from the lines, unrounded, so the package weight
  // keyed into Ship Manager is the same figure whichever way the operator groups the table —
  // a gross weight that moves by a gramme when somebody switches from part rows to D/F rows
  // is a number nobody can reconcile against a scale.
  //
  // The TOTAL row instead sums the rows the sheet prints. It sits under a column somebody
  // adds up, and a figure there that is not the sum of what is above it reads as an
  // arithmetic error in the shipment with nothing on the sheet to say otherwise.
  const netKg = mergedLines.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
  const grossKg = header.totalGrossWeightKg ?? netKg
  const customsValue = commodities.reduce((sum, c) => sum + Number(c.totalValue || 0), 0)
  const printedKg = commodities.reduce((sum, c) => sum + Number(c.weightKg || 0), 0)

  const consignee = draft.ultimateConsignee
  const [address1 = '', address2 = '', address3 = ''] = consignee.addressLines

  const sections: KeyingSection[] = isFedex
    ? [
        {
          tab: 'Shipment details',
          title: 'Recipient information',
          fields: [
            { label: 'Recipient ID', value: '', note: 'Address book entry — choose in the application' },
            { label: 'Country', value: toCountryPickerLabel(draft.destinationCountry), note: 'CIPL discharge port' },
            { label: 'Contact name', value: header.notifyTo ?? '', note: header.notifyTo ? 'CIPL notify party' : MANUAL },
            { label: 'Company name', value: consignee.name, note: 'CIPL "CONSIGNED TO"' },
            { label: 'Address 1', value: address1, note: 'CIPL "CONSIGNED TO"' },
            { label: 'Address 2', value: address2 },
            { label: 'Address 3', value: address3, note: 'Express only' },
            { label: 'Postal code', value: postalCodeFrom(consignee.addressLines), note: 'CIPL address block' },
            { label: 'City', value: cityFrom(consignee.addressLines), note: 'CIPL address block' },
            { label: 'Telephone', value: '', note: MANUAL },
            {
              label: 'Tax ID/EIN',
              value: consignee.consigneeId ?? '',
              note: consignee.consigneeId ? 'Consignee registration' : MANUAL,
            },
          ],
        },
        {
          tab: 'Shipment details',
          title: 'Package and shipment details',
          fields: [
            { label: 'Package contains', value: 'Commodity/Merchandise', note: 'Not a document shipment' },
            {
              label: 'Number of packages',
              value: header.cartons != null ? String(header.cartons) : '',
              note: 'CIPL carton count',
            },
            { label: 'Weight (lbs)', value: kgToLb(grossKg).toFixed(2), note: `Gross ${grossKg.toFixed(3)} kg converted` },
            { label: 'Service type', value: '', note: CHOOSE },
            { label: 'Package type', value: '', note: CHOOSE },
            { label: 'Package dimensions', value: '', note: 'Not on the CIPL — measure and enter' },
            { label: 'Ship date', value: draft.dateOfExportation, note: 'CIPL invoice date' },
            {
              label: 'Total carriage value',
              value: '',
              note: 'Declared value for carriage — a decision, not a document value',
            },
          ],
        },
        {
          tab: 'Shipment details',
          title: 'Billing details',
          fields: [
            {
              label: 'Bill transportation to',
              value: draft.freight === 'COLLECT' ? 'Recipient' : 'Shipper',
              note: `CIPL trade terms (${draft.freight || 'not stated'})`,
            },
            {
              label: 'Bill duties/taxes/fees',
              value: draft.freight === 'COLLECT' ? 'Recipient' : 'Shipper',
              note: 'Confirm against the trade terms',
            },
            {
              label: 'Customer reference',
              value: draft.shipmentReference,
              note: draft.shipmentReference ? 'Shipment reference' : MANUAL,
            },
          ],
        },
        {
          tab: 'Shipment details',
          title: 'Additional references',
          fields: [
            {
              label: 'P.O. number',
              value: header.orderNumbers[0] ?? '',
              note: header.orderNumbers.length > 1 ? `First of ${header.orderNumbers.length}` : 'CIPL line items',
            },
            { label: 'Invoice number', value: header.invoiceNumber, note: 'CIPL' },
            { label: 'Shipment ID', value: '', note: MANUAL },
          ],
        },
      ]
    : [
        {
          tab: 'Ship To',
          title: 'Ship To',
          fields: [
            { label: 'Customer ID', value: '', note: 'Address book entry — choose in the application' },
            { label: 'Company or Name', value: consignee.name, note: 'CIPL "CONSIGNED TO"' },
            { label: 'Attention', value: header.notifyTo ?? '', note: header.notifyTo ? 'CIPL notify party' : MANUAL },
            { label: 'Address 1', value: address1, note: 'CIPL "CONSIGNED TO"' },
            { label: 'Address 2', value: address2 },
            { label: 'Address 3', value: address3 },
            { label: 'Country/Territory', value: draft.destinationCountry, note: 'CIPL discharge port' },
            { label: 'Postal Code', value: postalCodeFrom(consignee.addressLines), note: 'CIPL address block' },
            { label: 'City or Town', value: cityFrom(consignee.addressLines), note: 'CIPL address block' },
            { label: 'State/Province/County', value: '', note: MANUAL },
            { label: 'Telephone', value: '', note: MANUAL },
            {
              label: 'Tax ID Number',
              value: consignee.consigneeId ?? '',
              note: consignee.consigneeId ? 'Consignee registration' : MANUAL,
            },
          ],
        },
        {
          tab: 'Service',
          title: 'Service and billing',
          fields: [
            { label: 'UPS Service', value: '', note: CHOOSE },
            {
              label: 'Bill Transportation To',
              value: draft.freight === 'COLLECT' ? 'Receiver' : 'Shipper',
              note: `CIPL trade terms (${draft.freight || 'not stated'})`,
            },
            { label: 'Package Type', value: '', note: CHOOSE },
            { label: 'Weight (lb)', value: kgToLb(grossKg).toFixed(2), note: `Gross ${grossKg.toFixed(3)} kg converted` },
            { label: 'Package Value', value: '', note: 'Declared value — a decision, not a document value' },
          ],
        },
        {
          tab: 'Detail',
          title: 'Package detail',
          fields: [
            { label: 'Length / Width / Height (in)', value: '', note: 'Not on the CIPL — measure and enter' },
            {
              label: 'Merchandise Description for Package',
              value: describeShipment(commodities),
              note: 'From the commodity descriptions',
            },
            { label: 'Special Instructions for Shipment', value: '', note: MANUAL },
          ],
        },
        {
          tab: 'Reference',
          title: 'Reference numbers',
          fields: [
            { label: 'Reference Number 1', value: header.invoiceNumber, note: 'CIPL invoice number' },
            {
              label: 'Reference Number 2',
              value: header.orderNumbers[0] ?? '',
              note: header.orderNumbers.length > 1 ? `First of ${header.orderNumbers.length}` : 'CIPL line items',
            },
            {
              label: 'Reference Number 3',
              value: draft.shipmentReference,
              note: draft.shipmentReference ? 'Shipment reference' : MANUAL,
            },
          ],
        },
      ]

  return {
    target,
    applicationName: APPLICATION_NAMES[target],
    shipmentReference: header.invoiceNumber,
    options,
    sections,
    commodities,
    totals: {
      commodities: commodities.length,
      // Rounded like the figures beside it. A fractional UOM sums to a binary tail —
      // 0.1 + 0.2 — and this one is written into the workbook as a number, not a string.
      // Trimmed of its binary tail, not clamped to three places. The rows can now carry more
      // than three — a tonne figure is `0.004263` — and rounding the total to three made the
      // last row of the grid disagree with the column above it while the Notes tab asserted
      // the two were equal.
      //
      // Nine places, which is where `roundScaled` caps a row's own precision, so the total can
      // never be less precise than the column it adds up. Through `roundPrecise`, not
      // `roundTo`, whose nudge is unusable past six places — see the note on it.
      quantity: roundPrecise(
        commodities.reduce((sum, c) => sum + Number(c.quantity || 0), 0),
        9,
      ),
      customsValue: customsValue.toFixed(2),
      // Summed from the printed pounds rather than converted from the summed kilograms.
      // Each row is keyed at the figure shown, so the application's running total is the sum
      // of those rounded values — converting once is the more accurate number and the wrong
      // one to check against. Two rows of 0.101 kg print 0.22 lb each and totalled 0.45.
      shipmentWeightLb: commodities.reduce((sum, c) => sum + Number(c.weightLb || 0), 0).toFixed(2),
      shipmentWeightKg: roundTo(printedKg, 3).toFixed(3),
    },
    filed: {
      quantity: roundTo(mergedLines.reduce((sum, l) => sum + l.quantity, 0), 3),
      customsValue: mergedLines.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0).toFixed(2),
      netWeightKg: roundTo(netKg, 3).toFixed(3),
      grossWeightKg: header.totalGrossWeightKg == null ? null : roundTo(header.totalGrossWeightKg, 3).toFixed(3),
    },
    provenance: {
      sourceFile: sourceFile ?? '',
      documentSet: reconciliation.selectedSet,
      documentCurrency: header.documentCurrency,
      excludedSets: excludedSets.join(', '),
    },
    manualFields: sections
      .flatMap((s) => s.fields)
      .filter((f) => f.note?.startsWith('Not on the CIPL'))
      .map((f) => f.label),
  }
}

/**
 * The postcode is the trailing number, and nothing in front of it.
 *
 * These address lines read `city [state] postcode`, and the state is often a placeholder
 * the CIPL prints rather than a real one — `Singapore EX 498781`, `'s-Hertogenbosch NA
 * 5234`. Taking the letters with the digits puts `EX 498781` into a field that Ship Manager
 * validates and a courier sorts on; the entry that shipment was actually keyed with reads
 * `498781`. The hyphen is allowed because Brazil writes `01310-100`, and the digits run to
 * eight because Israel writes `3109601` and Japan `1500001` unhyphenated — bounded at six,
 * a seven-digit postcode was read as its own last six.
 *
 * And it has to be the whole run, not the tail of a longer one. `VAT GB123456789` printed
 * under the city otherwise yielded a postcode of `23456789` and a city of `VAT GB1`, and
 * stopped the search before the real postcode line above it. The two bounds only work
 * together: the length alone let a longer number in, and the anchor alone shut out the
 * seven-digit postcodes that widening the length is for.
 *
 * The hyphenated form takes three leading digits where the plain form needs four, because
 * Japan writes `150-0001`. It cannot be relaxed for the plain form too — `Suite 200` ends
 * an address line the same way — and the anchor is on the digits alone rather than on a
 * preceding hyphen, which shut out every Japanese postcode there is. Its *second* group
 * takes three or four for the same kind of reason: at two, `Unit 100-12` matched, and a
 * room range on the last line hijacked both fields from the address above it.
 */
const POSTCODE = /(?<!\d)((?:\d{3,8}-\d{3,4})|\d{4,8})\s*$/

/**
 * A line whose trailing digits are a telephone number, not a postcode.
 *
 * The keyword has to *label* the number — stand immediately in front of it, with only
 * punctuation between — rather than merely appear on the line. Matched as a word anywhere,
 * this skipped `Tel Aviv 61000`, `Mobile, AL 36602` and `Fax Islands 12345`, which are
 * cities, and threw away the postcode and the city with them. Labelling is the whole of
 * what distinguishes `Phone 5551234` from a place that happens to be spelled that way.
 *
 * It must also *begin* a word, which is what keeps `PURCELL 73080` and `Chatel 74390` out
 * of it. And the list holds only words that are not themselves places: `mobile` and `cell`
 * were in it until `MOBILE 36602` — Mobile, Alabama — lost its postcode and its city to
 * them. A bare keyword in front of bare digits is all the signal there is here, so a word
 * that can be a city cannot be on the list at all.
 */
const CONTACT_LINE = /\b(?:phone|telephone|tel|fax|attn|attention|contact|e-?mail)\.?\s*:?\s*[+(]?\d[\d\s()+.-]*$/i


/**
 * The line the postcode is on — the *last* one that ends in one, not the first.
 *
 * Both fields have to read the same line, and they did not: the postcode was taken from the
 * last match and the city from the first, so any address whose earlier lines end in a number
 * split them apart. `Postbus 1234` above `'s-Hertogenbosch NA 5234` gave the right postcode
 * and the city `Postbus` — a PO box label typed into the field a courier sorts on. A street
 * number, a suite number and a building number all end an address line the same way.
 *
 * One guard keeps the search from walking past the address the other way: a line whose
 * trailing digits are labelled as a telephone number is skipped, so a `Phone 5551234`
 * printed under the city stops supplying a City of `Phone 5`. It is not a rule about what a
 * postcode is — it is about what a line that is plainly a phone number is not. Nothing
 * bounds the *length* of the digits, because a seven-digit postcode is a real postcode:
 * Israel writes `3109601` and Japan writes `1500001` unhyphenated.
 *
 * A short *unlabelled* registration line under the address — `VAT 12345678` — is a known
 * limitation and is deliberately left alone. It is written exactly as `OH 44114` and
 * `ROME 00184` are, and every rule tried against it took those with it: skipping a real
 * city loses the postcode and the city together, which is worse and far commoner than
 * reading a registration number as a postcode. A longer one is already excluded by the
 * digit bounds, and a labelled telephone number by the rule above; between them the
 * realistic trailing lines are covered without guessing at the rest.
 */
function postcodeLineIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (CONTACT_LINE.test(lines[i])) continue
    if (POSTCODE.test(lines[i])) return i
  }
  return -1
}

function postalCodeFrom(lines: string[]): string {
  const index = postcodeLineIndex(lines)
  return index === -1 ? '' : (lines[index].match(POSTCODE)?.[1] ?? '')
}

/**
 * The subdivision codes recognised on a line that is itself written in capitals.
 *
 * On a mixed-case line the capitals are the evidence: `Sao Paulo SP`, `Bangalore KARNATAKA`
 * and `Singapore EX` all set the subdivision off from the city by case alone, at any length.
 * A line printed wholly in capitals offers no such contrast, and stripping the last word
 * from one took the second word off `LA PAZ` and `AL AIN`.
 *
 * So on those lines the token must be recognised rather than merely shaped: these are the
 * codes of the countries whose addresses print a subdivision as a bare abbreviation between
 * the city and the postcode. Anything outside the list stays in the City box, where it is
 * visible to whoever keys the shipment rather than deleted on a hunch.
 *
 * The residual is a subdivision spelled out in full on an all-caps line — `BANGALORE
 * KARNATAKA` keys as both words, where `Bangalore KARNATAKA` keys as the city alone.
 * Recognising those would mean listing the subdivision names of every country, and the two
 * errors are not equal: a state left in the City box is wrong in a way the person keying
 * the shipment can see, and a city silently shortened to its first word is not.
 */
const SUBDIVISION_CODES = new Set([
  // United States, District of Columbia and territories
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
  // Canada
  'ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU',
  // Australia
  'NSW', 'VIC', 'QLD', 'TAS', 'ACT', 'SA',
  // Brazil, which prints the two-letter state between the city and the CEP
  'AC', 'AM', 'AP', 'BA', 'CE', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PB', 'PE', 'PI', 'PR',
  'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
  // Not subdivisions at all, but what the CIPL prints in that position for a country that
  // has none — `Singapore EX 498781`, `'s-Hertogenbosch NA 5234`. They belong in the City
  // box no more than a real state does, and the same postcode comment above cites them.
  'EX', 'NA',
])

/**
 * The same line with the postcode, and any state, taken off it.
 *
 * The state is only removed when something is left afterwards, so a line that is a state
 * code and nothing else keeps it rather than reading back empty.
 */
function cityFrom(lines: string[]): string {
  const index = postcodeLineIndex(lines)
  if (index === -1) return ''
  const withoutPostcode = lines[index].replace(POSTCODE, '').trim()
  // A state is stripped on evidence, and which evidence is available depends on the line.
  // A comma introduces one at any length. Failing that, a run of capitals at the end of a
  // mixed-case line is set off from the city by its case; on a line that is capitals
  // throughout, only a recognised subdivision code is.
  const commaSeparated = withoutPostcode.replace(/,\s*[A-Z]{2,}$/, '').trim()
  const capitalised = commaSeparated === commaSeparated.toUpperCase()
  const withoutState = capitalised
    ? commaSeparated
        .replace(/\s+([A-Z]{2,3})$/, (whole, code: string) => (SUBDIVISION_CODES.has(code) ? '' : whole))
        .trim()
    : commaSeparated.replace(/\s+[A-Z]{2,}$/, '').trim()
  const city = (withoutState || withoutPostcode).replace(/[,;]+$/, '').trim()
  if (city) return city
  // A postcode printed on a line of its own falls back to the line above — the nearest one
  // that is neither blank nor a telephone number. Taking the immediately preceding line
  // whatever it was produced a City of `Tel: 555-1234`, which is the outcome the guard on
  // the search itself exists to prevent, arrived at by another road.
  for (let i = index - 1; i >= 0; i--) {
    const above = lines[i].trim()
    if (above && !CONTACT_LINE.test(above)) return above
  }
  return ''
}

function describeShipment(rows: KeyingCommodityRow[]): string {
  const parts = [...new Set(rows.map((r) => r.description).filter(Boolean))]
  const joined = parts.join(', ')
  return joined.length <= 50 ? joined : `${joined.slice(0, 47)}...`
}

/**
 * The keying sheet as a workbook.
 *
 * A grid, because that is what the work is: six rows of eight fields, keyed one after
 * another into a table on the other screen. The outline this replaced spent nine lines on
 * each commodity, so a six-commodity shipment ran to fifty-four lines of scrolling and gave
 * no way to check a column at a glance.
 *
 * Three sheets, kept apart because they are read at different moments. **Commodities** is
 * the table being typed, ending in a TOTAL row to check the application's own running total
 * against. **Shipment details** is the form above it — labels and values, in the order the
 * application asks for them, each saying where it came from or that it needs entering by
 * hand. **Notes** is what the sheet would need to account for itself later: which document,
 * which copy of it, and how the weights were converted.
 */
export function keyingSheetToWorkbook(sheet: KeyingSheet): Sheet[] {
  // Once, above both readers. The grid blanks its quantity total from this and the Notes tab
  // names the units from it; computed twice, a later edit to one call diverges from the other
  // and the sheet contradicts its own notes.
  const units = keyedUnits(sheet)
  const columns = sheet.options.columns

  /** One row's value for one column. Numbers stay numbers so a column sums. */
  const cellFor = (row: KeyingCommodityRow, id: CommodityColumnId): CellValue => {
    switch (id) {
      case 'partNumber':
        return row.partNumber
      // The code the commodity record stores, and the name the picker lists, together: an
      // operator given only one of the two has to translate before they can type anything.
      // `countryLabel` carries the whole verdict, origin by origin: the picker name where it
      // resolved, the prompt where it did not, and the prompt on its own where the document
      // states no origin at all. Nothing to re-derive here.
      case 'countryOfManufacture':
        return row.countryLabel
      case 'domesticForeign':
        return row.domesticForeign
      case 'harmonizedCode':
        return row.harmonizedCode
      case 'quantity':
        return numberOr(row.quantity)
      case 'unitOfMeasure':
        return row.unitOfMeasure
      case 'unitValue':
        return numberOr(row.unitValue)
      case 'totalValue':
        return numberOr(row.totalValue)
      case 'weightLb':
        return numberOr(row.weightLb)
      case 'weightKg':
        return numberOr(row.weightKg)
      case 'description':
        return row.description
      case 'note': {
        // Ahead of the wording notes, because it is about the figure rather than the words:
        // a quantity that is a weight is the one cell on this row an operator can key
        // straight past without noticing it is not a count.
        const unitNote = row.quantityRoundedAway
          ? `quantity rounds to 0 whole ${row.unitOfMeasure} — these goods have a value but no ` +
            'quantity to key; decide what this cell should say'
          : row.unitUnavailable
          ? `quantity is the ${row.unitOfMeasure} the document prints; this code files in ` +
            `${row.unitUnavailable} and this row has no figure for it`
          : row.quantityNotFiled
            ? `Schedule B files no quantity for this code; the ${row.unitOfMeasure} figure is the document's own, ` +
              'for this application only'
            : row.quantityFromNetWeight
              ? `quantity is the net weight in ${row.unitOfMeasure} — this code is reported by weight, not by the piece`
              : row.quantityConverted
                ? `quantity is restated in ${row.unitOfMeasure}, the unit this code is reported in — the document ` +
                  'does not print this figure'
                : ''
        if (row.describedByOperator) return join(unitNote, 'your wording')
        // "also" only where the description itself came from the document. Beside Census
        // wording it would assert the CIPL had used the official text, which it did not.
        const fromDocument = sheet.options.descriptionSource !== 'schedule-b' || Boolean(row.scheduleBUnavailable)
        const lead = fromDocument ? 'document also said' : 'document said'
        const said = row.otherDescriptions.length ? `${lead}: ${row.otherDescriptions.join('; ')}` : ''
        if (!row.scheduleBUnavailable) return join(unitNote, said)
        const why =
          row.scheduleBUnavailable === 'no-index'
            ? 'Schedule B dataset not loaded — the document’s wording is used'
            : 'no Schedule B wording for this code — the document’s is used'
        return join(unitNote, [why, said].filter(Boolean).join('; '))
      }
    }
  }

  /**
   * The TOTAL row, which only totals what can be totalled.
   *
   * Blank cells rather than zeroes elsewhere: a zero under Unit Value reads as a price, and
   * summing unit prices down a column is a figure that means nothing.
   */
  const TOTALLED = new Set<CommodityColumnId>(['quantity', 'totalValue', 'weightLb', 'weightKg'])
  // Whether the quantity column can be totalled at all. Rows are filed in the unit their own
  // commodity number requires, so a sheet can hold pieces beside kilograms — and pieces added
  // to kilograms is not a quantity. The review screen leaves its own footer cell blank for
  // the same reason; a figure here that the Notes tab has to describe as "in mixed units" is
  // a number somebody reads off the grid without ever seeing that caveat.
  //
  // The same list the Notes tab names the units from, so the grid and the note cannot
  // contradict each other about whether this sheet is mixed.
  const oneUnit = units.length <= 1
  // The word goes in the leftmost column that is not itself a total, so it never displaces a
  // figure. Where every chosen column carries one it takes the first anyway: an unlabelled
  // row of figures at the foot of a grid is indistinguishable from another commodity, and
  // somebody keys it. The figure it displaces is not lost — every total is written out again
  // on the Notes tab.
  const labelColumn = columns.find((id) => !TOTALLED.has(id)) ?? columns[0]
  const labelDisplacesAFigure = !columns.some((id) => !TOTALLED.has(id))
  const totalFor = (id: CommodityColumnId): CellValue => {
    if (labelDisplacesAFigure && id === labelColumn) return 'TOTAL'
    switch (id) {
      case 'quantity':
        return oneUnit ? sheet.totals.quantity : ''
      case 'totalValue':
        return numberOr(sheet.totals.customsValue)
      case 'weightLb':
        return numberOr(sheet.totals.shipmentWeightLb)
      case 'weightKg':
        return numberOr(sheet.totals.shipmentWeightKg)
      default:
        return id === labelColumn ? 'TOTAL' : null
    }
  }

  const label = (id: CommodityColumnId) => COMMODITY_COLUMNS.find((c) => c.id === id)?.label ?? id

  const commodities: CellValue[][] = [
    columns.map(label),
    ...sheet.commodities.map((row): CellValue[] => columns.map((id) => cellFor(row, id))),
    columns.map(totalFor),
  ]

  const details: CellValue[][] = [['Tab', 'Section', 'Field', 'Value', 'Where it came from']]
  for (const section of sheet.sections) {
    for (const field of section.fields) {
      details.push([section.tab, section.title, field.label, field.value || '—', field.note ?? ''])
    }
  }

  const noIndex = sheet.commodities.filter((c) => c.scheduleBUnavailable === 'no-index').length
  const noCode = sheet.commodities.filter((c) => c.scheduleBUnavailable === 'no-code').length
  // Counted here as well as printed on the row, because the column picker can switch the
  // country column off — and a prompt that lives only in a cell nobody chose to print is a
  // prompt that does not exist. The Schedule B fallback is repeated here for the same reason.
  const needCountry = sheet.commodities.filter((c) => c.needsCountryCode).length
  const unnamedParts = sheet.commodities.filter((c) => c.partUnstated).length
  const printed = new Set(sheet.options.columns)
  const alternatives = sheet.commodities.some((c) => c.otherDescriptions.length || c.describedByOperator)
  const byWeight = sheet.commodities.filter((c) => c.quantityFromNetWeight).length
  const converted = sheet.commodities.filter((c) => c.quantityConverted).length
  const notFiled = sheet.commodities.filter((c) => c.quantityNotFiled).length
  const unstatable = sheet.commodities.filter((c) => c.unitUnavailable)
  const roundedAway = sheet.commodities.filter((c) => c.quantityRoundedAway)
  // The units those rows are actually in. `keyedUnitLabel` is the phrase "in mixed units" on a
  // sheet holding more than one, which reads as "file 0 whole in mixed units" in a slot that
  // wants a unit name.
  const roundedUnits = joinDistinct(roundedAway.map((c) => c.unitOfMeasure)) || 'units'
  // What the quantity column is actually counting. A single unit is named; a mixed sheet
  // says so rather than calling a column of kilograms and pieces "pcs", which is what the
  // TOTAL row read as before any of it could be anything but a count.
  // Derived from the same test the grid's total uses, so the two cannot describe one sheet
  // differently — a sheet whose rows print no unit at all has one total and one label.
  const keyedUnitLabel = units.length <= 1 ? (units[0] ?? 'units') : 'in mixed units'

  const notes: CellValue[][] = [
    ['Note', 'Detail'],
    ['Application', sheet.applicationName],
    ['Shipment', sheet.shipmentReference],
    ['Source document', sheet.provenance.sourceFile || '—'],
    [
      'Document basis',
      sheet.provenance.excludedSets
        ? `Used the ${sheet.provenance.documentSet} set, priced in ${sheet.provenance.documentCurrency}. ${sheet.provenance.excludedSets} describes the same goods and was excluded.`
        : `Used the ${sheet.provenance.documentSet} set, priced in ${sheet.provenance.documentCurrency}.`,
    ],
    ['Grouping', `${GROUPING_LABELS[sheet.options.grouping]}. ${GROUPING_NOTES[sheet.options.grouping]}`],
    [
      'Weight basis',
      `Each row's net weight is summed in kilograms and converted once at 1 kg = ${KG_PER_LB_LABEL} lb. ` +
        'The TOTAL row adds the pounds as printed, because that is what the application will have added.',
    ],
    [
      'Descriptions',
      `${DESCRIPTION_LABELS[sheet.options.descriptionSource]}. ${DESCRIPTION_NOTES[sheet.options.descriptionSource]} ` +
        (noIndex
          ? `The Schedule B dataset is not loaded on this machine, so ${noIndex} of ` +
            `${sheet.commodities.length} rows carry the document’s wording instead — every row this app ` +
            'described. That is a problem with this installation, not with these commodity numbers. '
          : '') +
        (noCode
          ? `${noCode} of ${sheet.commodities.length} rows carry the document's wording instead, because their ` +
            'commodity number is not in the concordance' +
            (printed.has('note')
              ? '; each one says so in the Note column. '
              : ', and the Note column is switched off for this sheet, so they are not marked on it. ')
          : '') +
        (printed.has('note')
          ? 'Rows noted "your wording" carry a description saved against that part. '
          : alternatives
            ? 'The Note column is switched off for this sheet, so what else the document called these goods — ' +
              'and which rows carry a wording saved against the part — is not printed on it. '
            : '') +
        'Nothing here is composed by the application.',
    ],
    [
      'Check',
      `This sheet: ${sheet.totals.commodities} commodities · ${sheet.totals.quantity} ${keyedUnitLabel} · ` +
        `${sheet.totals.customsValue} USD · ${sheet.totals.shipmentWeightLb} lb · ${sheet.totals.shipmentWeightKg} kg. ` +
        'Those are the printed rows added up. ' +
        (units.length > 1
          ? 'The rows are in more than one unit, so the grid leaves its quantity total blank — the figure ' +
            'above is what those quantities add up to, and it is only meaningful as a cross-check that no ' +
            'row was dropped. '
          : '') +
        (labelDisplacesAFigure
          ? 'Every chosen column carries a total, so the word TOTAL sits in the first of them and that ' +
            'one figure is only stated here.'
          : 'The last row of the grid equals the column above it.'),
    ],
    [
      'Shipment as filed',
      `${sheet.filed.quantity} as invoiced · ${sheet.filed.customsValue} USD · ${sheet.filed.netWeightKg} kg net` +
        `${sheet.filed.grossWeightKg ? ` · ${sheet.filed.grossWeightKg} kg gross` : ''}. ` +
        'Taken from the invoice lines rather than the printed rows, so it does not move when the grouping ' +
        'does. Where it differs from the line above, the difference is rounding a row at a time.',
    ],
  ]

  if (byWeight || converted || notFiled || unstatable.length) {
    notes.push([
      'Unit of quantity',
      (byWeight
        ? `${byWeight} of ${sheet.commodities.length} rows are keyed at their net weight rather than a piece ` +
          'count, because the Census Bureau reports those commodity numbers by weight. The SLI for this ' +
          'shipment files the same figures, so the two agree. '
        : '') +
        (converted
          ? `${converted} row(s) carry the document's own figure restated into the unit their commodity number ` +
            'is reported in. The document does not print those figures; they were worked out from the ones it does. '
          : '') +
        (notFiled
          ? `${notFiled} row(s) are under a commodity number Schedule B files with no quantity at all. Their ` +
            'figure is the document\'s own count, carried because the application needs one — the SLI leaves it blank. '
          : '') +
        (roundedAway.length
          ? `${roundedAway.length} row(s) file 0 whole ${roundedUnits}: the goods carry a value but round to nothing ` +
            'in the unit their commodity number is reported in, or took the short end of a figure shared out ' +
            'across the rows making up one commodity row on the SLI. Decide what those cells should say before ' +
            'keying — a quantity of 0 keys goods that are in the box as absent. '
          : '') +
        (unstatable.length
          ? `${unstatable.length} row(s) could not be stated in the unit their commodity number requires ` +
            `(${[...new Set(unstatable.map((c) => c.unitUnavailable))].join(', ')}) and carry the document's own ` +
            'figure instead — nothing on this shipment gives the weight those codes are reported in. Supply the ' +
            'per-part weights or correct the classification before keying. '
          : '') +
        (printed.has('note')
          ? 'The Note column says which rows.'
          : 'The Note column is switched off for this sheet, so it does not say which rows.'),
    ])
  }

  if (needCountry) {
    notes.push([
      'Country of manufacture',
      `${needCountry} of ${sheet.commodities.length} rows need one entered by hand — the document either ` +
        'states no origin for some of their lines, or names one this app could not resolve to a code. ' +
        (printed.has('countryOfManufacture')
          ? 'The country column says which. '
          : 'The country column is switched off for this sheet, so it does not say which. ') +
        'A commodity record needs the code either way.',
    ])
  }

  if (unnamedParts) {
    notes.push([
      'Part numbers',
      `${unnamedParts} of ${sheet.commodities.length} rows include a line the document gives no part number ` +
        'for, so the Part Number cell does not account for the whole row. No wording saved against a part ' +
        'was applied to those rows — a saved description speaks for the part it was saved against, and ' +
        'nothing identifies these goods.',
    ])
  }

  if (sheet.manualFields.length) {
    notes.push(['Enter manually', sheet.manualFields.join(', ')])
  }

  return [
    { name: 'Commodities', rows: commodities },
    { name: 'Shipment details', rows: details },
    { name: 'Notes', rows: notes, columnWidths: [22, 100] },
  ]
}

/**
 * The distinct units this sheet keys in, in the spelling each was printed in.
 *
 * Canonical for the comparison: one group reading `PCS` beside another reading `EA` is one
 * unit spelled two ways, and calling that sheet "mixed" both blanks a quantity total it could
 * carry and says something untrue about it in the notes. One definition, because the grid
 * cell and the note are written from it separately and must not disagree.
 */
function keyedUnits(sheet: KeyingSheet): string[] {
  const seen = new Map<string, string>()
  for (const row of sheet.commodities) {
    const unit = row.unitOfMeasure.trim()
    if (!unit) continue
    const key = canonicalUnit(unit) ?? unit
    if (!seen.has(key)) seen.set(key, unit)
  }
  return [...seen.values()]
}

/** Two note fragments in one cell, with the empty ones dropped. */
function join(...parts: string[]): string {
  return parts.filter(Boolean).join('; ')
}

/**
 * A formatted figure back to a number, so the column totals in the spreadsheet.
 *
 * The rest of this module formats for display — six decimals on a unit value, two on a
 * weight — and those strings are exactly right in a text sheet and exactly wrong in a
 * workbook, where a right-aligned summable number is the entire point.
 */
function numberOr(text: string): CellValue {
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : text
}

/** The workbook as bytes, ready to write. */
export function keyingSheetToXlsx(sheet: KeyingSheet): Uint8Array {
  return buildXlsx(keyingSheetToWorkbook(sheet))
}
