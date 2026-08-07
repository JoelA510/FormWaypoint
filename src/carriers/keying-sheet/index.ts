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
import type { MergedLine, Reconciliation } from '../../domain/types'
import { KG_PER_LB, kgToLb as kilogramsToPounds } from '../../domain/units'
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
  /** ISO alpha-2, as the commodity record stores it. */
  countryOfManufacture: string
  /** `DO - Dominican Republic`: the code the record stores, and the name the picker lists. */
  countryLabel: string
  quantity: string
  unitOfMeasure: string
  /** Six decimal places, as Ship Manager displays and stores it. */
  unitValue: string
  totalValue: string
  weightLb: string
  weightKg: string
  partNumber: string
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
  switch (mode) {
    case 'line':
      return `${index}|${line.id}`
    case 'part-code':
      return [partKey(line.partNumber), code].join('|')
    // Unit and ECCN join the key because the SLI's own rows carry them: `aggregateLines`
    // keys on classification, D/F, ECCN, licence, SME *and* canonical unit. Licence and SME
    // are shipment-wide, so those two are everything that varies per line here.
    //
    // The ECCN is resolved the way `aggregateLines` resolves it — a line's printed value, or
    // the controlled one where it prints none. Treating a blank as its own bucket splits a
    // row the filed SLI merges as soon as one line happens to print the controlled value
    // outright, which is the opposite of what this mode is for.
    case 'df-code':
      return [
        domesticForeign(line.countryOfOrigin),
        code,
        canonicalUnit(line.uom) ?? line.uom,
        line.eccn || corrections.eccn || '',
      ].join('|')
    case 'part-origin-code':
    default:
      return [partKey(line.partNumber), partKey(line.countryOfOrigin), code].join('|')
  }
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
): KeyingCommodityRow[] {
  const groups = new Map<string, MergedLine[]>()
  lines.forEach((line, index) => {
    const key = groupKeyFor(line, options.grouping, index, corrections)
    const bucket = groups.get(key)
    if (bucket) bucket.push(line)
    else groups.set(key, [line])
  })

  return [...groups.values()].map((group) => {
    const first = group[0]
    const quantity = group.reduce((sum, l) => sum + l.quantity, 0)
    const total = group.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)
    // Summed in kilograms and converted once. Converting each line and adding the rounded
    // pounds accumulates the rounding: the same shipment came out 0.005 lb heavy that way.
    const weightKg = group.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    // Read from the distinct origins, not the first line's: a group whose first line prints
    // no origin and whose second says Japan is a Japanese row, and taking `first` would
    // give it an empty country cell with nothing prompting anybody to fill it in.
    const origins = [...new Set(group.map((l) => l.countryOfOrigin.trim()).filter(Boolean))]
    const country = toIsoAlpha2(origins[0] ?? '')
    const code = codeFor(first, corrections)
    // A saved wording is keyed to a part, so it only applies where the row is one part.
    const parts = [...new Set(group.map((l) => l.partNumber.trim()).filter(Boolean))]
    const saved = parts.length === 1 ? descriptions[partKey(parts[0])] : undefined
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
      countryOfManufacture: origins.length > 1 ? joinDistinct(origins.map((o) => toIsoAlpha2(o).code)) : country.code,
      countryLabel: origins.length > 1 ? joinDistinct(origins.map(toCountryPickerLabel)) : toCountryPickerLabel(origins[0] ?? ''),
      // Read off every origin in the row, not the first one. `part-code` merges origins by
      // design, so a part shipped 2 from the US and 3 from Japan is one row — and stating D
      // for it would declare three foreign pieces domestic.
      domesticForeign: joinDistinct(group.map((l) => domesticForeign(l.countryOfOrigin))),
      needsCountryCode: origins.some((o) => !toIsoAlpha2(o).known),
      quantity: String(roundTo(quantity, 3)),
      unitOfMeasure: joinDistinct(group.map((l) => l.uom)),
      // Derived from the group's own total rather than copied off one line, so the unit
      // price and the total beside it can never disagree.
      unitValue: quantity ? (total / quantity).toFixed(6) : '',
      totalValue: total.toFixed(2),
      weightLb: weightKg ? kgToLb(weightKg).toFixed(2) : '',
      weightKg: weightKg ? roundTo(weightKg, 3).toFixed(3) : '',
      partNumber: joinDistinct(parts),
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
  const { ranked } = fromDocument(group, source === 'heading' ? 'heading' : 'document')
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

  const part = group[0].partNumber.trim()
  const strip = (text: string) =>
    part && text.toUpperCase().startsWith(part.toUpperCase())
      ? text.slice(part.length).replace(/^[\s:,-]+/, '').trim() || text
      : text

  return { ranked: [...byText.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => strip(text)) }
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
  const commodities = groupForKeying(mergedLines, descriptionsByPart, options, scheduleB, {
    codesByPart: inputs.codesByPart,
    overrides: inputs.classificationOverrides,
    eccn: inputs.eccn,
  })

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
      quantity: roundTo(
        commodities.reduce((sum, c) => sum + Number(c.quantity || 0), 0),
        3,
      ),
      customsValue: customsValue.toFixed(2),
      // Summed from the printed pounds rather than converted from the summed kilograms.
      // Each row is keyed at the figure shown, so the application's running total is the sum
      // of those rounded values — converting once is the more accurate number and the wrong
      // one to check against. Two rows of 0.101 kg print 0.22 lb each and totalled 0.45.
      shipmentWeightLb: commodities.reduce((sum, c) => sum + Number(c.weightLb || 0), 0).toFixed(2),
      shipmentWeightKg: roundTo(printedKg, 3).toFixed(3),
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
 * `498781`. The hyphen is allowed because Brazil writes `01310-100`.
 */
const POSTCODE = /(\d{4,6}(?:-\d{2,4})?)\s*$/

function postalCodeFrom(lines: string[]): string {
  for (const line of [...lines].reverse()) {
    const match = line.match(POSTCODE)
    if (match) return match[1]
  }
  return ''
}

/**
 * The same line with the postcode, and any state, taken off it.
 *
 * The state is only removed when something is left afterwards, so a city that is itself
 * written in capitals survives intact.
 */
function cityFrom(lines: string[]): string {
  const index = lines.findIndex((l) => POSTCODE.test(l))
  if (index === -1) return ''
  const withoutPostcode = lines[index].replace(POSTCODE, '').trim()
  const withoutState = withoutPostcode.replace(/[\s,]+[A-Z]{2,}$/, '').trim()
  const city = (withoutState || withoutPostcode).replace(/[,;]+$/, '').trim()
  return city || lines[index - 1] || ''
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
  const columns = sheet.options.columns

  /** One row's value for one column. Numbers stay numbers so a column sums. */
  const cellFor = (row: KeyingCommodityRow, id: CommodityColumnId): CellValue => {
    switch (id) {
      case 'partNumber':
        return row.partNumber
      // The code the commodity record stores, and the name the picker lists, together: an
      // operator given only one of the two has to translate before they can type anything.
      case 'countryOfManufacture':
        return row.needsCountryCode ? `${row.countryOfManufacture} — no code found, enter it` : row.countryLabel
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
        if (row.describedByOperator) return 'your wording'
        // "also" only where the description itself came from the document. Beside Census
        // wording it would assert the CIPL had used the official text, which it did not.
        const fromDocument = sheet.options.descriptionSource !== 'schedule-b' || Boolean(row.scheduleBUnavailable)
        const lead = fromDocument ? 'document also said' : 'document said'
        const said = row.otherDescriptions.length ? `${lead}: ${row.otherDescriptions.join('; ')}` : ''
        if (!row.scheduleBUnavailable) return said
        const why =
          row.scheduleBUnavailable === 'no-index'
            ? 'Schedule B dataset not loaded — the document’s wording is used'
            : 'no Schedule B wording for this code — the document’s is used'
        return [why, said].filter(Boolean).join('; ')
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
  // The word goes in the leftmost column that is not itself a total, so it never displaces
  // a figure — and is simply absent if every chosen column carries one.
  const labelColumn = columns.find((id) => !TOTALLED.has(id))
  const totalFor = (id: CommodityColumnId): CellValue => {
    switch (id) {
      case 'quantity':
        return sheet.totals.quantity
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
          ? 'The Schedule B dataset is not loaded on this machine, so every row carries the document’s wording ' +
            'instead. That is a problem with this installation, not with these commodity numbers. '
          : '') +
        (noCode
          ? `${noCode} of ${sheet.commodities.length} rows carry the document's wording instead, because their ` +
            'commodity number is not in the concordance; each one says so in the Note column. '
          : '') +
        'Rows noted "your wording" carry a description saved against that part. Nothing here is composed by the application.',
    ],
    ['Check', `${sheet.totals.commodities} commodities · ${sheet.totals.quantity} pcs · ${sheet.totals.customsValue} USD · ${sheet.totals.shipmentWeightLb} lb · ${sheet.totals.shipmentWeightKg} kg`],
  ]

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
