/**
 * The keying sheets, checked against a real FedEx Ship Manager entry.
 *
 * The reference is shipment vendorA4 as it was actually keyed: seven commodities, weights
 * in pounds, countries as two-letter codes, unit values at six decimals. Those formats are
 * the whole reason this exists — the CIPL prints none of them that way, and every one of
 * them is a value the operator would otherwise convert by hand.
 */
import { describe, expect, it } from 'vitest'
import { buildKeyingSheet, keyingSheetToText, kgToLb, toCountryPickerLabel, toIsoAlpha2 } from '.'
import type { MergedLine, Reconciliation, SLILine } from '../../domain/types'
import type { SliDraft } from '../types'

const line = (over: Partial<MergedLine>): MergedLine =>
  ({
    id: over.id ?? Math.random().toString(36).slice(2),
    documentSet: 'FC',
    documentKind: 'INVOICE',
    page: 1,
    orderNumber: '01004338OP0010',
    sequence: '1',
    lineNumber: '0001',
    itemId: 'X',
    partNumber: '40649-0300',
    model: '',
    description: 'CBL, OS32C-CBL-30M',
    commodityGroup: 'Electrical Conductors',
    countryOfOrigin: 'Malaysia',
    classification: '8544.42.0000',
    quantity: 2,
    uom: 'PCS',
    extendedValue: 284,
    netWeightKg: 7.438,
    ...over,
  }) as MergedLine

const sli = (over: Partial<SLILine>): SLILine =>
  ({
    sourceLineIds: [],
    domesticForeign: 'F',
    scheduleB: '8544.42.0000',
    description: 'Electrical Conductors',
    quantity: 6,
    scheduleBUnit: 'NO',
    sourceUom: 'PCS',
    weightKg: 8.118,
    valueUsd: 749.4,
    eccn: 'EAR99',
    sme: 'N',
    license: 'NLR',
    countriesOfOrigin: ['Malaysia', 'Japan'],
    ...over,
  }) as SLILine

function fixture(lines: MergedLine[], rows: SLILine[]): Reconciliation {
  return {
    selectedSet: 'FC',
    header: {
      invoiceNumber: 'vendorA4',
      invoiceDate: 'July 28, 2026',
      onAboutDate: null,
      soldTo: { name: 'vendor Corporation', lines: [], country: null },
      consignedTo: {
        name: 'vendor Asia Pacific Pte. Ltd.',
        lines: ['2nd Floor 40 Alps Avenue', 'Singapore EX 498781'],
        country: 'Singapore',
      },
      notifyTo: 'Nippon Express (Singapore) PTE LTD',
      shippedFrom: 'San Francisco',
      dischargePort: 'Singapore, Singapore',
      vesselAgent: 'FedEx',
      orderNumbers: ['00993549OP0010', '01004338OP0010'],
      purchaseOrders: [],
      tradeTerms: 'FOB Origin - Collect',
      incoterm: 'FOB',
      freightTerms: 'COLLECT',
      cartons: 2,
      documentCurrency: 'USD',
      totalQuantity: 72,
      totalValue: 6872.53,
      totalNetWeightKg: 36.583,
      totalGrossWeightKg: 40.241,
      totalMeasurementM3: null,
    },
    mergedLines: lines,
    sliLines: rows,
    checks: [],
    canGenerate: true,
    // `onAboutDate` above is the field name used by ShipmentHeader.
  } as unknown as Reconciliation
}

const draft = (over: Partial<SliDraft> = {}): SliDraft =>
  ({
    usppiName: 'Vendor A Manufacturing, Inc.',
    usppiAddressLines: ['4225 Hacienda Drive', 'Pleasanton CA 94588'],
    usppiZip: '94588',
    usppiEin: '',
    usppiContactName: '',
    usppiContactPhone: '',
    ultimateConsignee: {
      name: 'vendor Asia Pacific Pte. Ltd.',
      addressLines: ['2nd Floor 40 Alps Avenue', 'Singapore EX 498781'],
    },
    destinationCountry: 'Singapore',
    dateOfExportation: 'July 28, 2026',
    incoterm: 'FOB',
    freight: 'COLLECT',
    shipmentReference: '',
    ...over,
  }) as SliDraft

describe('unit conversion', () => {
  it('converts kilograms to pounds, which is what both applications ask for', () => {
    // 36.583 kg is the shipment's net weight; Ship Manager showed 80.60 lb for it.
    expect(kgToLb(36.583)).toBeCloseTo(80.65, 1)
    expect(kgToLb(0)).toBe(0)
  })
})

describe('country codes', () => {
  it('maps the names this CIPL prints to the codes the commodity record stores', () => {
    expect(toIsoAlpha2('United Kingdom').code).toBe('GB')
    expect(toIsoAlpha2('Malaysia').code).toBe('MY')
    expect(toIsoAlpha2('Japan').code).toBe('JP')
    expect(toIsoAlpha2('United States').code).toBe('US')
  })

  it('passes through a value that is already a code', () => {
    expect(toIsoAlpha2('GB')).toEqual({ code: 'GB', known: true })
  })

  it('never guesses at a name it does not know', () => {
    const unknown = toIsoAlpha2('Ruritania')
    expect(unknown).toEqual({ code: 'Ruritania', known: false })
  })

  it('renders the picker label the country dropdown shows', () => {
    expect(toCountryPickerLabel('Singapore')).toBe('SG - Singapore')
    expect(toCountryPickerLabel('')).toBe('')
  })
})

describe('commodity grouping', () => {
  it('splits one Schedule B row into a commodity per country of manufacture', () => {
    // The SLI holds 6 pieces of 8544.42.0000 across Malaysia and Japan. Ship Manager holds
    // two commodity records, because country is a field on the record.
    const sheet = buildKeyingSheet(
      'fedex-ship-manager',
      fixture(
        [
          line({ id: 'a', countryOfOrigin: 'Malaysia', quantity: 2, extendedValue: 284 }),
          line({ id: 'b', countryOfOrigin: 'Malaysia', quantity: 2, extendedValue: 284 }),
          line({
            id: 'c',
            countryOfOrigin: 'Japan',
            quantity: 2,
            extendedValue: 181.4,
            partNumber: '40650-0050',
            description: 'CBL, OS32C-ECBL-05M',
          }),
        ],
        [sli({})],
      ),
      draft(),
    )

    expect(sheet.commodities).toHaveLength(2)
    const my = sheet.commodities.find((c) => c.countryOfManufacture === 'MY')!
    const jp = sheet.commodities.find((c) => c.countryOfManufacture === 'JP')!
    expect(my.quantity).toBe('4')
    expect(my.totalValue).toBe('568.00')
    expect(jp.quantity).toBe('2')
    expect(jp.totalValue).toBe('181.40')
  })

  it('states a unit value at six decimals, derived from the group it belongs to', () => {
    const sheet = buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({ quantity: 2, extendedValue: 284 })], [sli({})]),
      draft(),
    )
    expect(sheet.commodities[0].unitValue).toBe('142.000000')
  })

  it('states commodity weight in pounds', () => {
    const sheet = buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({ netWeightKg: 7.438 })], [sli({})]),
      draft(),
    )
    expect(sheet.commodities[0].weightLb).toBe('16.40')
  })

  it('marks a country it could not resolve rather than inventing a code', () => {
    const sheet = buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({ countryOfOrigin: 'Ruritania' })], [sli({})]),
      draft(),
    )
    expect(sheet.commodities[0]).toMatchObject({ countryOfManufacture: 'Ruritania', needsCountryCode: true })
    expect(keyingSheetToText(sheet)).toContain('enter the two-letter code')
  })
})

describe('FedEx Ship Manager sheet', () => {
  const sheet = () =>
    buildKeyingSheet('fedex-ship-manager', fixture([line({})], [sli({})]), draft({ shipmentReference: 'SO 13352151' }))

  it('is laid out as the application’s own tabs', () => {
    expect([...new Set(sheet().sections.map((s) => s.tab))]).toEqual(['Shipment details'])
    expect(sheet().sections.map((s) => s.title)).toEqual([
      'Recipient information',
      'Package and shipment details',
      'Billing details',
      'Additional references',
    ])
  })

  it('gives the country in the form the picker shows', () => {
    const field = sheet().sections[0].fields.find((f) => f.label === 'Country')!
    expect(field.value).toBe('SG - Singapore')
  })

  it('gives the package weight in pounds, converted from the gross', () => {
    const field = sheet().sections[1].fields.find((f) => f.label === 'Weight (lbs)')!
    expect(field.value).toBe('88.72')
    expect(field.note).toContain('40.241 kg')
  })

  it('bills to the recipient when the CIPL says collect', () => {
    const field = sheet().sections[2].fields.find((f) => f.label === 'Bill transportation to')!
    expect(field.value).toBe('Recipient')
    expect(field.note).toContain('COLLECT')
  })

  it('carries the invoice and purchase order into Additional references', () => {
    const fields = sheet().sections[3].fields
    expect(fields.find((f) => f.label === 'Invoice number')!.value).toBe('vendorA4')
    expect(fields.find((f) => f.label === 'P.O. number')!.value).toBe('00993549OP0010')
    expect(fields.find((f) => f.label === 'P.O. number')!.note).toContain('First of 2')
  })

  it('lists what the CIPL cannot supply instead of leaving it silently blank', () => {
    expect(sheet().manualFields).toContain('Telephone')
    expect(sheet().manualFields).toContain('Package dimensions')
  })
})

describe('UPS WorldShip sheet', () => {
  const sheet = () => buildKeyingSheet('ups-worldship', fixture([line({})], [sli({})]), draft())

  it('is laid out as WorldShip’s tabs', () => {
    expect(sheet().sections.map((s) => s.tab)).toEqual(['Ship To', 'Service', 'Detail', 'Reference'])
  })

  it('uses WorldShip’s own field names', () => {
    const shipTo = sheet().sections[0].fields.map((f) => f.label)
    expect(shipTo).toContain('Company or Name')
    expect(shipTo).toContain('Country/Territory')
    expect(shipTo).toContain('City or Town')
  })

  it('bills to the receiver when the CIPL says collect', () => {
    const field = sheet().sections[1].fields.find((f) => f.label === 'Bill Transportation To')!
    expect(field.value).toBe('Receiver')
  })

  it('puts the invoice number in Reference Number 1', () => {
    const refs = sheet().sections[3].fields
    expect(refs[0]).toMatchObject({ label: 'Reference Number 1', value: 'vendorA4' })
  })
})

describe('address extraction', () => {
  const at = (addressLines: string[]) =>
    buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({})], [sli({})]),
      draft({ ultimateConsignee: { name: 'X', addressLines } }),
    ).sections[0].fields

  const field = (addressLines: string[], label: string) =>
    at(addressLines).find((f) => f.label === label)!.value

  it('takes the postcode without the state placeholder printed in front of it', () => {
    // The CIPL writes `city [state] postcode`, and the state is often a placeholder. The
    // real Ship Manager entry for this consignee reads 498781, not "EX 498781".
    expect(field(['2nd Floor 40 Alps Avenue', 'Singapore EX 498781'], 'Postal code')).toBe('498781')
    expect(field(['Europalaan 20', "'s-Hertogenbosch NA 5234"], 'Postal code')).toBe('5234')
  })

  it('reads a hyphenated postcode', () => {
    // vendorB2 shipped to Brazil, which writes them this way.
    expect(field(['Rua Example 100', 'Sao Paulo SP 01310-100'], 'Postal code')).toBe('01310-100')
  })

  it('takes the city without the postcode or the state', () => {
    expect(field(['2nd Floor 40 Alps Avenue', 'Singapore EX 498781'], 'City')).toBe('Singapore')
    expect(field(['Europalaan 20', "'s-Hertogenbosch NA 5234"], 'City')).toBe("'s-Hertogenbosch")
    expect(field(['Plot 12', 'Bangalore, KARNATAKA 562123'], 'City')).toBe('Bangalore')
    expect(field(['Rua Example 100', 'Sao Paulo SP 01310-100'], 'City')).toBe('Sao Paulo')
  })

  it('keeps a city that is itself written in capitals', () => {
    expect(field(['1 Example Road', 'SINGAPORE 498781'], 'City')).toBe('SINGAPORE')
  })

  it('leaves both blank rather than guessing when there is no postcode', () => {
    expect(field(['Some Street', 'Some City'], 'Postal code')).toBe('')
    expect(field(['Some Street', 'Some City'], 'City')).toBe('')
  })
})

describe('rendered text', () => {
  it('states the totals the application shows back', () => {
    const text = keyingSheetToText(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], [sli({})]), draft()),
    )
    expect(text).toContain('total customs value 749.40')
    expect(text).toMatch(/total shipment weight 17\.90 lb/)
    expect(text).toContain('── Shipment details tab ──')
  })
})
