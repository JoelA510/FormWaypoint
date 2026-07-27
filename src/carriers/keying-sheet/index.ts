/**
 * Keying sheets for FedEx Ship Manager and UPS WorldShip.
 *
 * Neither desktop application is driven by an API here. The tool produces the same
 * reconciled data laid out in the order each application prompts for it, so the operator
 * types straight down the screen instead of hunting across the CIPL. Field labels match the
 * wording the applications use, not the SLI's box names.
 *
 * Import files are deliberately not generated: WorldShip import maps and Ship Manager
 * flat-file layouts are configured per installation, and a mismatched layout fails silently
 * or, worse, transposes values.
 */
import type { Reconciliation } from '../../domain/types'
import type { SliDraft } from '../types'

export type KeyingTarget = 'fedex-ship-manager' | 'ups-worldship'

export interface KeyingField {
  label: string
  value: string
  /** Shown beneath the value: where it came from, or that it needs manual entry. */
  note?: string
}

export interface KeyingSection {
  title: string
  fields: KeyingField[]
}

export interface KeyingCommodityRow {
  description: string
  harmonizedCode: string
  countryOfManufacture: string
  quantity: string
  unitOfMeasure: string
  unitValue: string
  totalValue: string
  weightKg: string
}

export interface KeyingSheet {
  target: KeyingTarget
  applicationName: string
  shipmentReference: string
  sections: KeyingSection[]
  commodities: KeyingCommodityRow[]
  /** Values the operator must supply; the CIPL does not contain them. */
  manualFields: string[]
}

const APPLICATION_NAMES: Record<KeyingTarget, string> = {
  'fedex-ship-manager': 'FedEx Ship Manager',
  'ups-worldship': 'UPS WorldShip',
}

export function buildKeyingSheet(
  target: KeyingTarget,
  reconciliation: Reconciliation,
  draft: SliDraft,
): KeyingSheet {
  const { header, mergedLines, sliLines } = reconciliation
  const isFedex = target === 'fedex-ship-manager'

  const recipient: KeyingSection = {
    title: isFedex ? '1. Recipient' : '1. Ship To',
    fields: [
      { label: 'Company', value: draft.ultimateConsignee.name, note: 'CIPL "CONSIGNED TO"' },
      ...draft.ultimateConsignee.addressLines.map((line, i) => ({
        label: `Address ${i + 1}`,
        value: line,
        note: 'CIPL "CONSIGNED TO"',
      })),
      { label: 'Country', value: draft.destinationCountry, note: 'CIPL discharge port' },
      { label: 'Contact name', value: '', note: 'Not on the CIPL — enter manually' },
      { label: 'Phone', value: '', note: 'Not on the CIPL — enter manually' },
    ],
  }

  const shipment: KeyingSection = {
    title: isFedex ? '2. Shipment details' : '2. Service and package',
    fields: [
      { label: 'Ship date', value: draft.dateOfExportation, note: 'CIPL invoice date' },
      { label: 'Service', value: '', note: 'Not on the CIPL — choose in the application' },
      { label: 'Packaging', value: header.cartons ? `${header.cartons} carton(s)` : '', note: 'CIPL packing list' },
      {
        label: 'Total gross weight',
        value: header.totalGrossWeightKg != null ? `${header.totalGrossWeightKg.toFixed(3)} kg` : '',
        note: 'CIPL packing list — gross, not net',
      },
      { label: 'Dimensions', value: '', note: 'Not on the CIPL — measure and enter' },
      {
        label: isFedex ? 'Customs value' : 'Declared value for customs',
        value: `${sumValue(sliLines).toFixed(2)} USD`,
        note: 'Reconciled USD invoice total',
      },
      { label: 'Terms of sale', value: draft.incoterm, note: 'CIPL trade terms' },
      { label: 'Freight charges', value: draft.freight, note: 'CIPL trade terms' },
    ],
  }

  const customs: KeyingSection = {
    title: isFedex ? '3. Customs documentation' : '3. Invoice / customs',
    fields: [
      { label: 'Invoice number', value: header.invoiceNumber, note: 'CIPL' },
      { label: 'Invoice date', value: header.invoiceDate, note: 'CIPL' },
      { label: 'Purchase orders', value: header.orderNumbers.join(', '), note: 'CIPL line items' },
      { label: 'Reason for export', value: 'Sold', note: 'Confirm before filing' },
      {
        label: isFedex ? 'B13A / AES' : 'EEI / AES',
        value: draft.shipmentReference || '',
        note: draft.shipmentReference ? 'Internal shipment reference' : 'Not on the CIPL — enter manually',
      },
    ],
  }

  // Commodity rows are given per source line rather than per aggregated SLI row: both
  // applications ask for a unit price, which only exists before aggregation.
  const commodities: KeyingCommodityRow[] = mergedLines.map((line) => ({
    description: line.description || line.commodityGroup,
    harmonizedCode: line.classification,
    countryOfManufacture: line.countryOfOrigin,
    quantity: String(line.quantity),
    unitOfMeasure: line.uom,
    unitValue: line.unitValue != null ? line.unitValue.toFixed(3) : '',
    totalValue: line.extendedValue != null ? line.extendedValue.toFixed(2) : '',
    weightKg: line.netWeightKg != null ? line.netWeightKg.toFixed(3) : '',
  }))

  return {
    target,
    applicationName: APPLICATION_NAMES[target],
    shipmentReference: header.invoiceNumber,
    sections: [recipient, shipment, customs],
    commodities,
    manualFields: [recipient, shipment, customs]
      .flatMap((s) => s.fields)
      .filter((f) => f.note?.includes('Not on the CIPL'))
      .map((f) => f.label),
  }
}

function sumValue(lines: { valueUsd: number }[]): number {
  return lines.reduce((sum, l) => sum + l.valueUsd, 0)
}

/** Plain-text rendering, for clipboard and print. */
export function keyingSheetToText(sheet: KeyingSheet): string {
  const out: string[] = [
    `${sheet.applicationName} — keying sheet`,
    `Shipment ${sheet.shipmentReference}`,
    '',
  ]

  for (const section of sheet.sections) {
    out.push(section.title)
    for (const field of section.fields) {
      out.push(`  ${field.label.padEnd(26)} ${field.value || '—'}${field.note ? `   (${field.note})` : ''}`)
    }
    out.push('')
  }

  out.push('4. Commodities')
  for (const [i, row] of sheet.commodities.entries()) {
    out.push(`  Line ${i + 1}`)
    out.push(`    Description        ${row.description}`)
    out.push(`    Harmonized code    ${row.harmonizedCode}`)
    out.push(`    Country of mfr.    ${row.countryOfManufacture}`)
    out.push(`    Quantity           ${row.quantity} ${row.unitOfMeasure}`)
    out.push(`    Unit value         ${row.unitValue}`)
    out.push(`    Total value        ${row.totalValue}`)
    out.push(`    Net weight (kg)    ${row.weightKg}`)
  }

  if (sheet.manualFields.length) {
    out.push('', 'Enter manually — not present on the CIPL:')
    for (const label of sheet.manualFields) out.push(`  • ${label}`)
  }

  return out.join('\n')
}
