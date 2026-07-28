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
import type { SliDraft } from '../types'
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
  harmonizedCode: string
  /** ISO alpha-2, as the commodity record stores it. */
  countryOfManufacture: string
  quantity: string
  unitOfMeasure: string
  /** Six decimal places, as Ship Manager displays and stores it. */
  unitValue: string
  totalValue: string
  weightLb: string
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
  totals: { commodities: number; customsValue: string; shipmentWeightLb: string }
  /** Values the operator must supply; the CIPL does not contain them. */
  manualFields: string[]
}

const APPLICATION_NAMES: Record<KeyingTarget, string> = {
  'fedex-ship-manager': 'FedEx Ship Manager',
  'ups-worldship': 'UPS WorldShip',
}

const KG_TO_LB = 2.20462262

export function kgToLb(kg: number): number {
  return Math.round(kg * KG_TO_LB * 100) / 100
}

const MANUAL = 'Not on the CIPL — enter manually'
const CHOOSE = 'Not on the CIPL — choose in the application'

/**
 * One commodity record per description *and* country of manufacture.
 *
 * Country is a field on the commodity record, so two origins cannot share one: a real entry
 * for shipment vendorA4 splits its cable line into 4 from MY and 2 from JP, where the SLI
 * holds a single row of 6 under one Schedule B number. Grouping the way the SLI does would
 * make the operator take that row apart again at the keyboard, which is the manual step
 * this exists to remove.
 */
function groupForKeying(lines: MergedLine[]): KeyingCommodityRow[] {
  const groups = new Map<string, MergedLine[]>()
  for (const line of lines) {
    const key = `${line.partNumber}|${line.description}|${line.countryOfOrigin}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(line)
    else groups.set(key, [line])
  }

  return [...groups.values()].map((group) => {
    const first = group[0]
    const quantity = group.reduce((sum, l) => sum + l.quantity, 0)
    const total = group.reduce((sum, l) => sum + (l.extendedValue ?? 0), 0)
    const weightKg = group.reduce((sum, l) => sum + (l.netWeightKg ?? 0), 0)
    const country = toIsoAlpha2(first.countryOfOrigin)
    return {
      description: first.description || first.commodityGroup,
      harmonizedCode: first.classification,
      countryOfManufacture: country.code,
      needsCountryCode: !country.known && Boolean(first.countryOfOrigin),
      quantity: String(quantity),
      unitOfMeasure: first.uom,
      // Derived from the group's own total rather than copied off one line, so the unit
      // price and the total beside it can never disagree.
      unitValue: quantity ? (total / quantity).toFixed(6) : '',
      totalValue: total.toFixed(2),
      weightLb: weightKg ? kgToLb(weightKg).toFixed(2) : '',
      partNumber: first.partNumber,
    }
  })
}

export function buildKeyingSheet(
  target: KeyingTarget,
  reconciliation: Reconciliation,
  draft: SliDraft,
): KeyingSheet {
  const { header, mergedLines, sliLines } = reconciliation
  const isFedex = target === 'fedex-ship-manager'
  const commodities = groupForKeying(mergedLines)

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
      customsValue: customsValue.toFixed(2),
      shipmentWeightLb: kgToLb(netKg).toFixed(2),
    },
    manualFields: sections
      .flatMap((s) => s.fields)
      .filter((f) => f.note?.startsWith('Not on the CIPL'))
      .map((f) => f.label),
  }
}

/** Last address line that looks like it carries a postcode. */
function postalCodeFrom(lines: string[]): string {
  for (const line of [...lines].reverse()) {
    const match = line.match(/\b([A-Z]{0,2}\s?\d{4,6})\s*$/)
    if (match) return match[1].trim()
  }
  return ''
}

/** The address line carrying the postcode, with the postcode taken off, is the city. */
function cityFrom(lines: string[]): string {
  const index = lines.findIndex((l) => /\b[A-Z]{0,2}\s?\d{4,6}\s*$/.test(l))
  if (index === -1) return ''
  const stripped = lines[index].replace(/\b[A-Z]{0,2}\s?\d{4,6}\s*$/, '').trim().replace(/[,;]+$/, '')
  return stripped || lines[index - 1] || ''
}

function describeShipment(rows: KeyingCommodityRow[]): string {
  const parts = [...new Set(rows.map((r) => r.description).filter(Boolean))]
  const joined = parts.join(', ')
  return joined.length <= 50 ? joined : `${joined.slice(0, 47)}...`
}

/** Plain-text rendering, for clipboard and print. */
export function keyingSheetToText(sheet: KeyingSheet): string {
  const out: string[] = [
    `${sheet.applicationName} — keying sheet`,
    `Shipment ${sheet.shipmentReference}`,
    '',
    'Values are already in the units this application expects: weights in pounds,',
    'country of manufacture as a two-letter code, unit value to six decimals.',
    '',
  ]

  let tab = ''
  for (const section of sheet.sections) {
    if (section.tab !== tab) {
      tab = section.tab
      out.push(`── ${tab} tab ──`)
    }
    out.push(`  ${section.title}`)
    for (const field of section.fields) {
      out.push(`    ${field.label.padEnd(34)} ${field.value || '—'}${field.note ? `   (${field.note})` : ''}`)
    }
    out.push('')
  }

  out.push('── Commodity/Merchandise ──')
  out.push(
    `  ${sheet.totals.commodities} commodit${sheet.totals.commodities === 1 ? 'y' : 'ies'} · ` +
      `total customs value ${sheet.totals.customsValue} · total shipment weight ${sheet.totals.shipmentWeightLb} lb`,
  )
  out.push('')
  for (const [i, row] of sheet.commodities.entries()) {
    out.push(`  Commodity ${i + 1}`)
    out.push(`    Commodity description          ${row.description}`)
    out.push(
      `    Country of manufacture         ${row.countryOfManufacture}` +
        (row.needsCountryCode ? '   (not recognised — enter the two-letter code)' : ''),
    )
    out.push(`    Quantity                       ${row.quantity}`)
    out.push(`    Unit of measure                ${row.unitOfMeasure}`)
    out.push(`    Unit value                     ${row.unitValue}`)
    out.push(`    Total customs value            ${row.totalValue}`)
    out.push(`    Total commodity weight (lbs)   ${row.weightLb}`)
    out.push(`    Harmonized code                ${row.harmonizedCode}`)
    out.push(`    Part number                    ${row.partNumber}`)
  }

  if (sheet.manualFields.length) {
    out.push('', 'Enter manually — not present on the CIPL:')
    for (const label of sheet.manualFields) out.push(`  • ${label}`)
  }

  return out.join('\n')
}
