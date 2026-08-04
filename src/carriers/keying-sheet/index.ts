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
import { normalizeScheduleB } from '../../domain/schedule-b'
import { partKey } from '../../domain/part-key'
import { roundTo } from '../../domain/reconcile'
import { toCountryPickerLabel, toIsoAlpha2 } from './countries'

export * from './countries'

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
  /** Set when the country name could not be resolved to a code. */
  needsCountryCode?: boolean
}

export interface KeyingSheet {
  target: KeyingTarget
  applicationName: string
  shipmentReference: string
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
 * One commodity record per part, country of manufacture *and* commodity number.
 *
 * Country is a field on the commodity record, so two origins cannot share one: a real entry
 * for shipment vendorA4 splits its cable line into 4 from MY and 2 from JP, where the SLI
 * holds a single row of 6 under one Schedule B number. Grouping the way the SLI does would
 * make the operator take that row apart again at the keyboard, which is the manual step
 * this exists to remove.
 *
 * The description is deliberately *not* in the key, though it used to be. The CIPL prints a
 * commodity-group heading against some lines and the part's own description against others,
 * so one part came out as two identical records differing only in wording — shipment
 * vendorA5 keyed as eight commodities where six were called for, two of its parts each
 * appearing twice at the same code, country and unit price. The same part number is the same
 * goods; the wording is a property of how the document was printed.
 */
function groupForKeying(lines: MergedLine[], descriptions: Record<string, string>): KeyingCommodityRow[] {
  const groups = new Map<string, MergedLine[]>()
  for (const line of lines) {
    const key = [partKey(line.partNumber), partKey(line.countryOfOrigin), normalizeScheduleB(line.classification)].join('|')
    const bucket = groups.get(key)
    if (bucket) bucket.push(line)
    else groups.set(key, [line])
  }

  return [...groups.values()].map((group) => {
    const first = group[0]
    const quantity = group.reduce((sum, l) => sum + l.quantity, 0)
    const total = group.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)
    // Summed in kilograms and converted once. Converting each line and adding the rounded
    // pounds accumulates the rounding: the same shipment came out 0.005 lb heavy that way.
    const weightKg = group.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    const country = toIsoAlpha2(first.countryOfOrigin)
    const saved = descriptions[partKey(first.partNumber)]
    const chosen = describeGroup(group)
    return {
      description: saved || chosen.description,
      describedByOperator: Boolean(saved),
      // Only meaningful when the app chose; the operator's own wording replaces all of them.
      otherDescriptions: saved ? [] : chosen.alternatives,
      harmonizedCode: first.classification,
      countryOfManufacture: country.code,
      countryLabel: toCountryPickerLabel(first.countryOfOrigin),
      needsCountryCode: !country.known && Boolean(first.countryOfOrigin),
      quantity: String(roundTo(quantity, 3)),
      unitOfMeasure: first.uom,
      // Derived from the group's own total rather than copied off one line, so the unit
      // price and the total beside it can never disagree.
      unitValue: quantity ? (total / quantity).toFixed(6) : '',
      totalValue: total.toFixed(2),
      weightLb: weightKg ? kgToLb(weightKg).toFixed(2) : '',
      weightKg: weightKg ? roundTo(weightKg, 3).toFixed(3) : '',
      partNumber: first.partNumber,
    }
  })
}

/**
 * The description to key, chosen from the wordings the document already carries.
 *
 * Never written. A commodity description is part of what is being declared, so the app picks
 * between what is on the CIPL rather than composing something better — an operator who wants
 * better wording saves their own against the part, which is theirs and carries their name.
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
 * A leading repeat of the part number is dropped: it is already its own column, and
 * `44534-0730 SA34-F1` in a description field is half a column of noise.
 */
function describeGroup(group: MergedLine[]): { description: string; alternatives: string[] } {
  const byText = new Map<string, number>()
  for (const line of group) {
    const text = (line.description || line.commodityGroup || '').trim()
    if (text) byText.set(text, (byText.get(text) ?? 0) + line.quantity)
  }
  if (!byText.size) return { description: '', alternatives: [] }

  const ranked = [...byText.entries()].sort((a, b) => b[1] - a[1])
  const part = group[0].partNumber.trim()
  const strip = (text: string) =>
    part && text.toUpperCase().startsWith(part.toUpperCase())
      ? text.slice(part.length).replace(/^[\s:,-]+/, '').trim() || text
      : text

  return { description: strip(ranked[0][0]), alternatives: ranked.slice(1).map(([text]) => strip(text)) }
}

export function buildKeyingSheet(
  target: KeyingTarget,
  reconciliation: Reconciliation,
  draft: SliDraft,
  /** Commodity wording the operator saved against a part, keyed by normalised part number. */
  descriptionsByPart: Record<string, string> = {},
  /** The document these figures were read from, for the provenance block. */
  sourceFile?: string,
  /** Document sets present but not used, e.g. a TP1 copy priced in another currency. */
  excludedSets: string[] = [],
): KeyingSheet {
  const { header, mergedLines, sliLines } = reconciliation
  const isFedex = target === 'fedex-ship-manager'
  const commodities = groupForKeying(mergedLines, descriptionsByPart)

  const customsValue = sliLines.reduce((sum, l) => sum + l.valueUsd, 0)
  const netKg = sliLines.reduce((sum, l) => sum + l.weightKg, 0)
  const grossKg = header.totalGrossWeightKg ?? netKg

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
    sections,
    commodities,
    totals: {
      commodities: commodities.length,
      quantity: commodities.reduce((sum, c) => sum + Number(c.quantity || 0), 0),
      customsValue: customsValue.toFixed(2),
      shipmentWeightLb: kgToLb(netKg).toFixed(2),
      shipmentWeightKg: roundTo(netKg, 3).toFixed(3),
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
  const commodities: CellValue[][] = [
    [
      'Part Number',
      'Country of Manufacture',
      'Harmonized Code',
      'Qty',
      'UOM',
      'Unit Value (USD)',
      'Total Customs Value (USD)',
      'Weight (lb)',
      'Weight (kg)',
      'Commodity Description',
      'Note',
    ],
    ...sheet.commodities.map((row): CellValue[] => [
      row.partNumber,
      // The code the commodity record stores, and the name the picker lists, together: an
      // operator given only one of the two has to translate before they can type anything.
      row.needsCountryCode ? `${row.countryOfManufacture} — no code found, enter it` : row.countryLabel,
      row.harmonizedCode,
      numberOr(row.quantity),
      row.unitOfMeasure,
      numberOr(row.unitValue),
      numberOr(row.totalValue),
      numberOr(row.weightLb),
      numberOr(row.weightKg),
      row.description,
      row.describedByOperator
        ? 'your wording'
        : row.otherDescriptions.length
          ? `document also said: ${row.otherDescriptions.join('; ')}`
          : '',
    ]),
    // Blank cells rather than zeroes in the columns a total is meaningless for.
    ['TOTAL', null, null, sheet.totals.quantity, null, null, numberOr(sheet.totals.customsValue), numberOr(sheet.totals.shipmentWeightLb), numberOr(sheet.totals.shipmentWeightKg), null, null],
  ]

  const details: CellValue[][] = [['Tab', 'Section', 'Field', 'Value', 'Where it came from']]
  for (const section of sheet.sections) {
    for (const field of section.fields) {
      details.push([section.tab, section.title, field.label, field.value || '—', field.note ?? ''])
    }
  }

  const notes: CellValue[][] = [
    ['', ''],
    ['Application', sheet.applicationName],
    ['Shipment', sheet.shipmentReference],
    ['Source document', sheet.provenance.sourceFile || '—'],
    [
      'Document basis',
      sheet.provenance.excludedSets
        ? `Used the ${sheet.provenance.documentSet} set, priced in ${sheet.provenance.documentCurrency}. ${sheet.provenance.excludedSets} describes the same goods and was excluded.`
        : `Used the ${sheet.provenance.documentSet} set, priced in ${sheet.provenance.documentCurrency}.`,
    ],
    [
      'Grouping',
      'One row per part number, country of manufacture and commodity number. Lines the document split by wording were combined; a part shipped from two countries, or carrying two commodity numbers, stays on separate rows because those are fields on the record.',
    ],
    ['Weight basis', `Net weights summed in kilograms and converted once at 1 kg = ${KG_PER_LB_LABEL} lb.`],
    [
      'Descriptions',
      'Chosen from the wordings already on the document — the one most of the goods were invoiced under, by quantity. Where a part was described more than one way the alternatives are printed in the Note column, because the document does not say which is meant. Rows noted "your wording" carry a description saved against that part. Nothing here is composed by the application.',
    ],
    ['Check', `${sheet.totals.commodities} commodities · ${sheet.totals.quantity} pcs · ${sheet.totals.customsValue} USD · ${sheet.totals.shipmentWeightLb} lb · ${sheet.totals.shipmentWeightKg} kg`],
  ]
  notes[0] = ['Note', 'Detail']

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
