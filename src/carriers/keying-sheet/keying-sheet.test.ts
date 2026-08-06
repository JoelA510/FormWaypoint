/**
 * The keying sheets, checked against a real FedEx Ship Manager entry.
 *
 * The reference is a Vendor A shipment as it was actually keyed: seven commodities, weights
 * in pounds, countries as two-letter codes, unit values at six decimals. Those formats are
 * the whole reason this exists — the CIPL prints none of them that way, and every one of
 * them is a value the operator would otherwise convert by hand.
 */
import { describe, expect, it } from 'vitest'
import { buildKeyingSheet, keyingSheetToWorkbook, kgToLb, toCountryPickerLabel, toIsoAlpha2 } from '.'
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
      invoiceNumber: 'INV-0004',
      invoiceDate: 'July 28, 2026',
      onAboutDate: null,
      soldTo: { name: 'the vendor Corporation', lines: [], country: null },
      consignedTo: {
        name: 'the vendor Asia Pacific Pte. Ltd.',
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
      name: 'the vendor Asia Pacific Pte. Ltd.',
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
    expect(toIsoAlpha2('GB')).toEqual({ code: 'GB', known: true, name: 'United Kingdom' })
  })

  it('never guesses at a name it does not know', () => {
    const unknown = toIsoAlpha2('Ruritania')
    expect(unknown).toEqual({ code: 'Ruritania', known: false, name: '' })
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
    const [, row] = keyingSheetToWorkbook(sheet)[0].rows
    expect(String(row[1])).toContain('no code found, enter it')
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
    expect(fields.find((f) => f.label === 'Invoice number')!.value).toBe('INV-0004')
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
    expect(refs[0]).toMatchObject({ label: 'Reference Number 1', value: 'INV-0004' })
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

  it('reads both fields off the same line when an earlier one also ends in a number', () => {
    // A PO box, a suite or a building number ends an address line exactly the way a postcode
    // does. The postcode was taken from the last matching line and the city from the first,
    // so these two came apart: the right postcode, and `Postbus` typed into the field a
    // courier sorts on.
    const lines = ['Postbus 1234', "'s-Hertogenbosch NA 5234"]
    expect(field(lines, 'Postal code')).toBe('5234')
    expect(field(lines, 'City')).toBe("'s-Hertogenbosch")

    const suite = ['Example Tower Suite 1200', 'Singapore EX 498781']
    expect(field(suite, 'Postal code')).toBe('498781')
    expect(field(suite, 'City')).toBe('Singapore')
  })

  it('keeps a city that is itself written in capitals', () => {
    expect(field(['1 Example Road', 'SINGAPORE 498781'], 'City')).toBe('SINGAPORE')
  })

  it('leaves both blank rather than guessing when there is no postcode', () => {
    expect(field(['Some Street', 'Some City'], 'Postal code')).toBe('')
    expect(field(['Some Street', 'Some City'], 'City')).toBe('')
  })
})

describe('the workbook', () => {
  const workbook = () =>
    keyingSheetToWorkbook(buildKeyingSheet('fedex-ship-manager', fixture([line({})], [sli({})]), draft()))

  it('is three sheets: the grid, the form above it, and where the figures came from', () => {
    expect(workbook().map((s) => s.name)).toEqual(['Commodities', 'Shipment details', 'Notes'])
  })

  it('ends the grid with a TOTAL row to check the application against', () => {
    const rows = workbook()[0].rows
    const total = rows[rows.length - 1]
    expect(total[0]).toBe('TOTAL')
    expect(total[6]).toBe(749.4)
    expect(total[7]).toBe(17.9)
    // No country, code or unit value on a total — those columns stay empty rather than
    // carrying a number that means nothing.
    expect([total[1], total[2], total[5]]).toEqual([null, null, null])
  })

  it('writes the figures as numbers, so a column can be totalled and checked', () => {
    const [, row] = workbook()[0].rows
    expect(typeof row[3]).toBe('number')
    expect(typeof row[6]).toBe('number')
    expect(typeof row[7]).toBe('number')
  })

  it('accounts for itself on the Notes sheet', () => {
    const notes = Object.fromEntries(workbook()[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Application).toBe('FedEx Ship Manager')
    expect(notes['Weight basis']).toContain('summed in kilograms and converted once')
    expect(notes.Grouping).toContain('One row per part number, country of manufacture and commodity number')
    expect(notes.Check).toContain('749.40 USD')
  })
})

describe('every country, not the ones someone remembered', () => {
  it('resolves an origin the short list had never heard of', () => {
    // Two of shipment vendorA5's six commodity rows came out as
    // "(not recognised — enter the two-letter code)" because the map held about fifty names.
    expect(toIsoAlpha2('Dominican Republic')).toMatchObject({ code: 'DO', known: true })
  })

  it('covers the whole register, including places nobody would think to add', () => {
    for (const [name, code] of [
      ['Lesotho', 'LS'],
      ['Turkmenistan', 'TM'],
      ['Saint Kitts and Nevis', 'KN'],
      ['Faroe Islands', 'FO'],
      ['Wallis and Futuna', 'WF'],
      ['Bhutan', 'BT'],
    ] as const) {
      expect(toIsoAlpha2(name), name).toMatchObject({ code, known: true })
    }
  })

  it('answers to the everyday name as well as the register’s', () => {
    for (const [name, code] of [
      ['Netherlands', 'NL'],
      ['Netherlands, Kingdom of the', 'NL'],
      ['South Korea', 'KR'],
      ['Korea, Republic of', 'KR'],
      ['Korea', 'KR'],
      ['Ivory Coast', 'CI'],
      ['Taiwan', 'TW'],
      ['Vietnam', 'VN'],
      ['Viet Nam', 'VN'],
      ['Czech Republic', 'CZ'],
    ] as const) {
      expect(toIsoAlpha2(name), name).toMatchObject({ code, known: true })
    }
  })

  it('labels with the code and the name, since the record wants one and the picker lists the other', () => {
    expect(toCountryPickerLabel('Dominican Republic')).toBe('DO - Dominican Republic')
    expect(toCountryPickerLabel('DE')).toBe('DE - Germany')
    // A formal register name still labels as the name a picker shows.
    expect(toCountryPickerLabel('United Kingdom of Great Britain and Northern Ireland')).toBe('GB - United Kingdom')
  })

  it('still refuses to guess', () => {
    expect(toCountryPickerLabel('Ruritania')).toBe('Ruritania')
    expect(toIsoAlpha2('Ruritania').known).toBe(false)
  })
})

describe('one part is one commodity record', () => {
  /**
   * Shipment vendorA5, reduced to the two parts that exposed the split. Each was printed on
   * two invoice lines — one carrying the part's own description, one carrying the
   * commodity-group heading — and came out as two identical records at the same code,
   * country and unit price.
   */
  const at = (over: Partial<MergedLine>): MergedLine =>
    line({ countryOfOrigin: 'Germany', classification: '8538.90.7080', uom: 'PCS', ...over })

  const vendorA5 = [
    at({ partNumber: '44534-0730', description: 'Elect. Apparatus, Other', commodityGroup: 'Elect. Apparatus, Other', quantity: 7, extendedValue: 106.68, netWeightKg: 0.28 }),
    at({ partNumber: '44534-0730', description: '44534-0730 SA34-F1', commodityGroup: 'Elect. Apparatus, Other', quantity: 6, extendedValue: 91.44, netWeightKg: 0.24 }),
    at({ partNumber: '44536-0105', description: 'CM-S1 SWITCH 5M CABLE', commodityGroup: 'electrical boards, panels', classification: '8536.50.9065', quantity: 13, extendedValue: 662.87, netWeightKg: 3.81 }),
    at({ partNumber: '44536-0105', description: 'electrical boards, panels', commodityGroup: 'electrical boards, panels', classification: '8536.50.9065', quantity: 5, extendedValue: 254.95, netWeightKg: 1.464 }),
  ]

  const build = (lines: MergedLine[], descriptions: Record<string, string> = {}) =>
    buildKeyingSheet('fedex-ship-manager', fixture(lines, []), draft(), descriptions).commodities

  it('merges the lines the document split by wording', () => {
    const rows = build(vendorA5)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.partNumber, r.quantity, r.totalValue])).toEqual([
      ['44534-0730', '13', '198.12'],
      ['44536-0105', '18', '917.82'],
    ])
  })

  it('still splits a part shipped from two countries', () => {
    // Country is a field on the commodity record; two origins cannot share one.
    const rows = build([
      at({ partNumber: 'AAA-1', countryOfOrigin: 'Malaysia', quantity: 4, extendedValue: 40 }),
      at({ partNumber: 'AAA-1', countryOfOrigin: 'Japan', quantity: 2, extendedValue: 20 }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.countryOfManufacture).sort()).toEqual(['JP', 'MY'])
  })

  it('still splits a part carrying two commodity numbers', () => {
    const rows = build([
      at({ partNumber: 'AAA-1', classification: '8536.50.9065', quantity: 1, extendedValue: 10 }),
      at({ partNumber: 'AAA-1', classification: '8538.90.7080', quantity: 1, extendedValue: 10 }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('keys the wording most of the goods were invoiced under', () => {
    // 7 pieces went out as `Elect. Apparatus, Other` against 6 as `44534-0730 SA34-F1`;
    // 13 as `CM-S1 SWITCH 5M CABLE` against 5 as `electrical boards, panels`.
    expect(build(vendorA5).map((r) => r.description)).toEqual(['Elect. Apparatus, Other', 'CM-S1 SWITCH 5M CABLE'])
  })

  it('carries the wordings it did not choose, rather than picking silently', () => {
    // The document describes one part more than one way and does not mark which is a
    // heading. Showing the alternatives is the honest version of choosing.
    expect(build(vendorA5).map((r) => r.otherDescriptions)).toEqual([['SA34-F1'], ['electrical boards, panels']])
  })

  it('drops a part number repeated into its own description', () => {
    // `44534-0730 SA34-F1` in a description field is half a column of noise; the part
    // number is already its own column.
    const rows = build([at({ partNumber: '44534-0730', description: '44534-0730 SA34-F1', quantity: 6, extendedValue: 91.44 })])
    expect(rows[0].description).toBe('SA34-F1')
  })

  it('uses the operator’s own wording when they have saved some', () => {
    const rows = build(vendorA5, { '44536-0105': 'Coded safety switches with 5 m cable' })
    expect(rows[1]).toMatchObject({
      description: 'Coded safety switches with 5 m cable',
      describedByOperator: true,
      // The operator's wording replaces every one the document offered.
      otherDescriptions: [],
    })
    expect(rows[0].describedByOperator).toBeFalsy()
  })

  it('sums weight in kilograms and converts once', () => {
    // Converting each line and adding the rounded pounds runs 0.005 lb heavy on this
    // shipment: 0.62 + 0.53 against 1.146.
    const rows = build(vendorA5)
    expect(rows[0]).toMatchObject({ weightKg: '0.520', weightLb: '1.15' })
    expect(rows[1]).toMatchObject({ weightKg: '5.274', weightLb: '11.63' })
  })
})
