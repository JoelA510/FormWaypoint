/**
 * The keying sheets, checked against a real FedEx Ship Manager entry.
 *
 * The reference is a Vendor A shipment as it was actually keyed: seven commodities, weights
 * in pounds, countries as two-letter codes, unit values at six decimals. Those formats are
 * the whole reason this exists — the CIPL prints none of them that way, and every one of
 * them is a value the operator would otherwise convert by hand.
 */
import { describe, expect, it } from 'vitest'
import {
  buildKeyingSheet,
  keyingSheetToWorkbook,
  kgToLb,
  toCountryPickerLabel,
  toIsoAlpha2,
  COMMODITY_COLUMNS,
  DEFAULT_KEYING_OPTIONS,
  withDefaults,
  type CommodityColumnId,
  type DescriptionSource,
  type GroupingMode,
} from '.'
import { createScheduleBIndex, type ScheduleBIndex } from '../../domain/schedule-b'
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

  it('ends the grid with a TOTAL row that sums the column above it', () => {
    const rows = workbook()[0].rows
    const [, row] = rows
    const total = rows[rows.length - 1]
    expect(total[0]).toBe('TOTAL')
    // The point of the row is that it can be checked against the application's own running
    // total, so it has to be the sum of what is printed — not a figure from somewhere else
    // that happens to describe the same shipment.
    expect(total[6]).toBe(row[6])
    expect(total[7]).toBe(row[7])
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
    expect(notes.Grouping).toContain('Part + country + code')
    expect(notes.Check).toContain('284.00 USD')
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
    buildKeyingSheet('fedex-ship-manager', fixture(lines, []), draft(), { descriptionsByPart: descriptions }).commodities

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

/**
 * The same shipment laid out four ways.
 *
 * One row per commodity record is right for keying into Ship Manager and wrong for checking
 * against a filed SLI, and neither is what somebody reading the invoice line by line wants.
 * Each mode groups on something the row can assert jointly; none merges two commodity
 * numbers, because a row states one.
 */
describe('grouping modes', () => {
  const shipment = [
    line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'United States', quantity: 2, extendedValue: 100, netWeightKg: 1 }),
    line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'Japan', quantity: 3, extendedValue: 150, netWeightKg: 2 }),
    line({ id: 'c', partNumber: 'P-2', countryOfOrigin: 'Japan', quantity: 1, extendedValue: 50, netWeightKg: 4 }),
  ]

  const rowsFor = (grouping: GroupingMode) =>
    buildKeyingSheet('fedex-ship-manager', fixture(shipment, []), draft(), { options: { grouping } }).commodities

  it('keeps two origins of one part apart, because origin is a field on the record', () => {
    const rows = rowsFor('part-origin-code')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => `${r.partNumber}/${r.countryOfManufacture}`)).toEqual(['P-1/US', 'P-1/JP', 'P-2/JP'])
  })

  it('combines a part shipped from two countries, and names both', () => {
    const rows = rowsFor('part-code')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ partNumber: 'P-1', countryOfManufacture: 'US, JP', quantity: '5' })
    expect(rows[0].countryLabel).toBe('US - United States, JP - Japan')
  })

  it('files by D/F and code, the way the SLI does, listing the parts it rolled up', () => {
    const rows = rowsFor('df-code')
    expect(rows).toHaveLength(2)
    const domestic = rows.find((r) => r.domesticForeign === 'D')!
    const foreign = rows.find((r) => r.domesticForeign === 'F')!
    expect(domestic).toMatchObject({ partNumber: 'P-1', quantity: '2', totalValue: '100.00' })
    expect(foreign).toMatchObject({ partNumber: 'P-1, P-2', quantity: '4', totalValue: '200.00' })
  })

  it('never groups when asked not to, including two lines that are otherwise identical', () => {
    const twins = [line({ id: 'x', quantity: 1, extendedValue: 10 }), line({ id: 'y', quantity: 1, extendedValue: 10 })]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(twins, []), draft(), {
      options: { grouping: 'line' },
    }).commodities
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.quantity === '1')).toBe(true)
  })

  it('totals the same in every mode, because grouping moves figures rather than changing them', () => {
    for (const grouping of ['part-origin-code', 'part-code', 'df-code', 'line'] as GroupingMode[]) {
      const rows = rowsFor(grouping)
      expect(rows.reduce((sum, r) => sum + Number(r.quantity), 0), grouping).toBe(6)
      expect(rows.reduce((sum, r) => sum + Number(r.totalValue), 0), grouping).toBe(300)
    }
  })

  it('applies a saved wording only where the row is one part', () => {
    // A description is saved against a part. A row spanning two parts cannot claim it.
    const saved = { 'P-1': 'Braided copper cable' }
    const one = buildKeyingSheet('fedex-ship-manager', fixture(shipment, []), draft(), {
      options: { grouping: 'part-code' },
      descriptionsByPart: saved,
    }).commodities
    expect(one[0]).toMatchObject({ description: 'Braided copper cable', describedByOperator: true })

    const rolled = buildKeyingSheet('fedex-ship-manager', fixture(shipment, []), draft(), {
      options: { grouping: 'df-code' },
      descriptionsByPart: saved,
    }).commodities
    expect(rolled.find((r) => r.domesticForeign === 'F')!.describedByOperator).toBe(false)
  })
})

describe('description sources', () => {
  const lines = [
    line({ id: 'a', description: 'CBL, OS32C-CBL-30M', commodityGroup: 'Electrical Conductors', quantity: 3 }),
    line({ id: 'b', description: 'CBL, OS32C-CBL-30M', commodityGroup: 'Electrical Conductors', quantity: 1 }),
  ]
  const CONCORDANCE = {
    source: 'test',
    generatedAt: '2026-01-01',
    count: 1,
    codes: { '8544420000': { d: 'Insulated electric conductors, fitted with connectors', u: ['NO'] } },
  }

  const describedBy = (
    descriptionSource: DescriptionSource,
    scheduleB: ScheduleBIndex | null = createScheduleBIndex(CONCORDANCE),
  ) =>
    buildKeyingSheet('fedex-ship-manager', fixture(lines, []), draft(), {
      options: { descriptionSource },
      scheduleB,
    }).commodities[0]

  it('takes the part’s own wording', () => {
    expect(describedBy('document').description).toBe('CBL, OS32C-CBL-30M')
  })

  it('takes the document’s commodity heading', () => {
    expect(describedBy('heading').description).toBe('Electrical Conductors')
  })

  it('takes the Census wording for the code, and keeps the document’s beside it', () => {
    const row = describedBy('schedule-b')
    expect(row.description).toBe('Insulated electric conductors, fitted with connectors')
    // Whether the code describes these goods is a human judgement, so what the document
    // called them travels with the row rather than being replaced by the official text.
    expect(row.otherDescriptions).toContain('CBL, OS32C-CBL-30M')
  })

  it('falls back to the document rather than leaving a row with no words on it', () => {
    // A code absent from the concordance has its own blocking check to answer for it; a
    // blank commodity description would be a silent one.
    expect(describedBy('schedule-b', null).description).toBe('CBL, OS32C-CBL-30M')
    expect(describedBy('schedule-b', createScheduleBIndex({ ...CONCORDANCE, codes: {} })).description).toBe(
      'CBL, OS32C-CBL-30M',
    )
  })

  it('never composes one', () => {
    // Every wording on the sheet is traceable to the document or to the Census file.
    const fromDocument = new Set(lines.flatMap((l) => [l.description, l.commodityGroup]))
    for (const source of ['document', 'heading'] as DescriptionSource[]) {
      expect(fromDocument).toContain(describedBy(source).description)
    }
  })
})

describe('column selection', () => {
  const workbookFor = (columns: CommodityColumnId[]) =>
    keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], [sli({})]), draft(), { options: { columns } }),
    )[0].rows

  it('prints only the columns asked for, in the order they were given', () => {
    const rows = workbookFor(['description', 'partNumber', 'quantity'])
    expect(rows[0]).toEqual(['Commodity Description', 'Part Number', 'Qty'])
  })

  it('carries the totals of whichever columns can be totalled', () => {
    const rows = workbookFor(['partNumber', 'quantity', 'weightKg'])
    expect(rows.at(-1)).toEqual(['TOTAL', 2, 7.438])
  })

  it('puts TOTAL in the leftmost column that is not itself a figure', () => {
    // Writing it over the quantity would replace a number somebody checks against a
    // running total with a word.
    expect(workbookFor(['quantity', 'description'])!.at(-1)).toEqual([2, 'TOTAL'])
  })

  it('ignores a stored column that no longer exists rather than printing a blank one', () => {
    const rows = workbookFor(['partNumber', 'notAColumn' as CommodityColumnId])
    expect(rows[0]).toEqual(['Part Number'])
  })

  it('falls back to the defaults when every column is unrecognised', () => {
    const rows = workbookFor(['gone' as CommodityColumnId])
    expect(rows[0]).toEqual(DEFAULT_KEYING_OPTIONS.columns.map((id) => COMMODITY_COLUMNS.find((c) => c.id === id)!.label))
  })
})

describe('what a row can honestly assert', () => {
  const mixed = [
    line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'United States', quantity: 2, extendedValue: 100 }),
    line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'Japan', quantity: 3, extendedValue: 150 }),
  ]

  it('says D, F on a row that merged both rather than naming the first origin’s letter', () => {
    // `part-code` merges origins by design. Stating D for this row would declare three
    // foreign pieces domestic.
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(mixed, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    expect(rows[0]).toMatchObject({ countryOfManufacture: 'US, JP', domesticForeign: 'D, F' })
  })

  it('keeps two units apart under df-code, because the SLI’s own rows do', () => {
    // aggregateLines keys on the canonical unit as well as D/F and code. Without it these
    // collapse into one row of `PCS, KG` that lines up with nothing on the filed form.
    const units = [
      line({ id: 'a', countryOfOrigin: 'Japan', uom: 'PCS', quantity: 2 }),
      line({ id: 'b', countryOfOrigin: 'Japan', uom: 'KG', quantity: 5 }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(units, []), draft(), {
      options: { grouping: 'df-code' },
    }).commodities
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.unitOfMeasure).sort()).toEqual(['KG', 'PCS'])
  })

  it('keeps a line’s own ECCN on its own row under df-code', () => {
    const controlled = [
      line({ id: 'a', countryOfOrigin: 'Japan' }),
      line({ id: 'b', countryOfOrigin: 'Japan', eccn: '5A992.C' } as Partial<MergedLine>),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(controlled, []), draft(), {
      options: { grouping: 'df-code' },
    }).commodities
    expect(rows).toHaveLength(2)
  })

  it('totals the pounds as printed, so the column adds up to the TOTAL under it', () => {
    // 0.101 kg is 0.2227 lb, printed 0.22. Converting the summed kilograms gives 0.45 over
    // a column that reads 0.22 + 0.22, which looks like an arithmetic error in the shipment.
    const light = [
      line({ id: 'a', partNumber: 'P-1', netWeightKg: 0.101 }),
      line({ id: 'b', partNumber: 'P-2', netWeightKg: 0.101 }),
    ]
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture(light, []), draft())
    expect(sheet.commodities.map((c) => c.weightLb)).toEqual(['0.22', '0.22'])
    expect(sheet.totals.shipmentWeightLb).toBe('0.44')
  })

  it('says on the row when the official wording was asked for and did not exist', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { descriptionSource: 'schedule-b' },
      scheduleB: null,
    })
    expect(sheet.commodities[0].scheduleBUnavailable).toBe('no-index')
    const [, row] = keyingSheetToWorkbook(sheet)[0].rows
    expect(String(row.at(-1))).toContain('Schedule B dataset not loaded')
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Descriptions).toContain('not loaded on this machine')
  })

  it('claims nothing about a fallback that did not happen', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft())
    expect(sheet.commodities[0].scheduleBUnavailable).toBeNull()
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Descriptions).not.toContain('carry the document')
  })
})

describe('what the sheet says versus what will be filed', () => {
  it('prints the code a reviewer corrected to, not the one the document got wrong', () => {
    // The sheet is typed into software that files the same shipment. Printing the document's
    // number would have the operator key the very code somebody just corrected away.
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      codesByPart: { '40649-0300': '8544.49.1000' },
    })
    expect(sheet.commodities[0].harmonizedCode).toBe('8544.49.1000')
  })

  it('lets a per-part correction beat a blanket redirect, as the SLI rows do', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      codesByPart: { '40649-0300': '8544.49.1000' },
      classificationOverrides: { '8544420000': '8544.30.0000' },
    })
    expect(sheet.commodities[0].harmonizedCode).toBe('8544.49.1000')
  })

  it('groups on the corrected code, so two parts corrected apart do not share a row', () => {
    const two = [
      line({ id: 'a', partNumber: 'P-1', quantity: 1, extendedValue: 10 }),
      line({ id: 'b', partNumber: 'P-2', quantity: 1, extendedValue: 10 }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(two, []), draft(), {
      options: { grouping: 'df-code' },
      codesByPart: { 'P-1': '8544.49.1000' },
    }).commodities
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.harmonizedCode).sort()).toEqual(['8544.42.0000', '8544.49.1000'])
  })

  it('takes the country from the origins present, not from a first line that has none', () => {
    // A group whose first line prints no origin and whose second says Japan is a Japanese
    // row. Reading `first` gave it an empty cell with nothing prompting anybody to fill it.
    const partial = [
      line({ id: 'a', partNumber: 'P-1', countryOfOrigin: '' }),
      line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'Japan' }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(partial, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    expect(rows[0].countryOfManufacture).toBe('JP')
    expect(rows[0].countryLabel).toContain('JP - Japan')
    // And the line that stated none is not silently absorbed into Japan's.
    expect(rows[0].countryLabel).toContain('some lines state no origin')
    expect(rows[0].needsCountryCode).toBe(true)
  })

  it('blames the installation, not the classification, when the dataset never loaded', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { descriptionSource: 'schedule-b' },
      scheduleB: null,
    })
    expect(sheet.commodities[0].scheduleBUnavailable).toBe('no-index')
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Descriptions).toContain('not loaded on this machine')
    expect(notes.Descriptions).not.toContain('not in the concordance')
    // Counted, not "every row": a row carrying the operator's own wording is not one of them.
    expect(notes.Descriptions).toContain('1 of 1 rows')
  })

  it('blames the code when the dataset loaded and the code is not in it', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { descriptionSource: 'schedule-b' },
      scheduleB: createScheduleBIndex({ source: 't', generatedAt: '2026-01-01', count: 0, codes: {} }),
    })
    expect(sheet.commodities[0].scheduleBUnavailable).toBe('no-code')
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Descriptions).toContain('not in the concordance')
    expect(notes.Descriptions).not.toContain('not loaded on this machine')
  })

  it('looks the official wording up under the corrected code', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { descriptionSource: 'schedule-b' },
      codesByPart: { '40649-0300': '8544.49.1000' },
      scheduleB: createScheduleBIndex({
        source: 't',
        generatedAt: '2026-01-01',
        count: 1,
        codes: { '8544491000': { d: 'Other electric conductors, not fitted with connectors', u: ['NO'] } },
      }),
    })
    expect(sheet.commodities[0].description).toBe('Other electric conductors, not fitted with connectors')
    expect(sheet.commodities[0].scheduleBUnavailable).toBeNull()
  })
})

describe('what the sheet claims about its own wording', () => {
  it('formats a corrected code the way the field expects it', () => {
    // PartCodeInput commits `normalizeScheduleB`, so a saved correction is ten bare digits.
    // Keying 8544491000 into a field expecting 8544.49.1000 is the transposition this
    // whole sheet exists to prevent.
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      codesByPart: { '40649-0300': '8544491000' },
    })
    expect(sheet.commodities[0].harmonizedCode).toBe('8544.49.1000')
  })

  it('leaves a code it cannot format alone rather than mangling it', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      codesByPart: { '40649-0300': 'PENDING' },
    })
    expect(sheet.commodities[0].harmonizedCode).toBe('PENDING')
  })

  it('does not say the document "also said" the Census wording', () => {
    // Beside official text, "also" asserts the CIPL used it. It did not.
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { descriptionSource: 'schedule-b' },
      scheduleB: createScheduleBIndex({
        source: 't',
        generatedAt: '2026-01-01',
        count: 1,
        codes: { '8544420000': { d: 'Insulated electric conductors', u: ['NO'] } },
      }),
    })
    const note = String(keyingSheetToWorkbook(sheet)[0].rows[1].at(-1))
    expect(note).toContain('document said')
    expect(note).not.toContain('document also said')
  })

  it('still says "also" where the description did come from the document', () => {
    const two = [
      line({ id: 'a', description: 'CBL, OS32C-CBL-30M', quantity: 3 }),
      line({ id: 'b', description: 'Cable assembly', quantity: 1 }),
    ]
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture(two, []), draft())
    expect(String(keyingSheetToWorkbook(sheet)[0].rows[1].at(-1))).toContain('document also said')
  })
})

describe('a stored layout that no longer means anything', () => {
  it('discards a grouping mode it does not recognise', () => {
    // Options outlive releases. An unknown mode reaches the label tables as a missing key,
    // and a Notes tab reading "undefined. undefined" is the gentler of the two outcomes.
    const options = withDefaults({ grouping: 'by-vibes' as GroupingMode })
    expect(options.grouping).toBe(DEFAULT_KEYING_OPTIONS.grouping)
  })

  it('discards a description source it does not recognise', () => {
    const options = withDefaults({ descriptionSource: 'invented' as DescriptionSource })
    expect(options.descriptionSource).toBe(DEFAULT_KEYING_OPTIONS.descriptionSource)
  })

  it('keeps the parts of a stored set that are still valid', () => {
    const options = withDefaults({ grouping: 'df-code', descriptionSource: 'nope' as DescriptionSource })
    expect(options).toMatchObject({ grouping: 'df-code', descriptionSource: 'document' })
  })
})

describe('figures that must not move when the layout does', () => {
  const shipment = [
    line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Japan', netWeightKg: 0.101, quantity: 1, extendedValue: 10 }),
    line({ id: 'b', partNumber: 'P-2', countryOfOrigin: 'Japan', netWeightKg: 0.101, quantity: 1, extendedValue: 10 }),
  ]

  it('keys the same package weight whichever way the table is grouped', () => {
    // The gross weight goes in the shipment's own weight field. A figure that moves by a
    // gramme when somebody switches from part rows to D/F rows cannot be checked against a
    // scale, and it is not a property of the layout.
    const weightFor = (grouping: GroupingMode) => {
      const sheet = buildKeyingSheet('fedex-ship-manager', fixture(shipment, []), draft(), { options: { grouping } })
      return sheet.sections
        .flatMap((s) => s.fields)
        .find((f) => f.label.startsWith('Weight'))!.note
    }
    expect(weightFor('df-code')).toBe(weightFor('part-origin-code'))
  })

  it('merges a printed ECCN with the controlled one under df-code, as the SLI does', () => {
    // aggregateLines resolves `line.eccn || options.eccn`. Bucketing a blank separately
    // splits a row the filed form merges the moment one line prints the controlled value.
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(shipment.map((l, i) =>
      i === 0 ? ({ ...l, eccn: 'EAR99' } as MergedLine) : l,
    ), []), draft(), {
      options: { grouping: 'df-code' },
      eccn: 'EAR99',
    }).commodities
    expect(rows).toHaveLength(1)
  })

  it('still splits a line whose printed ECCN differs from the controlled one', () => {
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(shipment.map((l, i) =>
      i === 0 ? ({ ...l, eccn: '5A992.C' } as MergedLine) : l,
    ), []), draft(), {
      options: { grouping: 'df-code' },
      eccn: 'EAR99',
    }).commodities
    expect(rows).toHaveLength(2)
  })
})

describe('a grid that says what its last row is', () => {
  it('labels the TOTAL row even when every chosen column is a figure', () => {
    // An unlabelled row of numbers at the foot of a grid is indistinguishable from another
    // commodity, and somebody keys it.
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { columns: ['quantity', 'totalValue'] },
      }),
    )[0].rows
    expect(rows.at(-1)![0]).toBe('TOTAL')
  })

  it('writes every total out again on the Notes tab, so the displaced figure is not lost', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
      options: { columns: ['quantity', 'totalValue'] },
    })
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    expect(notes.Check).toContain('2 pcs')
    expect(notes.Check).toContain('284.00 USD')
  })
})

describe('figures that move with the layout, and figures that must not', () => {
  // Three lines whose per-row rounding does not survive being summed: 0.005 each rounds to
  // 0.01, so the printed column adds to 0.03 against a shipment value of 0.015.
  const pennies = [
    line({ id: 'a', partNumber: 'P-1', quantity: 1, extendedValue: 0.005, netWeightKg: 0 }),
    line({ id: 'b', partNumber: 'P-2', quantity: 1, extendedValue: 0.005, netWeightKg: 0 }),
    line({ id: 'c', partNumber: 'P-3', quantity: 1, extendedValue: 0.005, netWeightKg: 0 }),
  ]

  it('states the shipment as filed, unmoved by the grouping', () => {
    const filedFor = (grouping: GroupingMode) =>
      buildKeyingSheet('fedex-ship-manager', fixture(pennies, []), draft(), { options: { grouping } }).filed
    expect(filedFor('line').customsValue).toBe(filedFor('df-code').customsValue)
    expect(filedFor('line').customsValue).toBe(filedFor('part-origin-code').customsValue)
  })

  it('still makes the TOTAL row the sum of the rows above it', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture(pennies, []), draft(), {
      options: { grouping: 'line', columns: ['partNumber', 'totalValue'] },
    })
    const rows = keyingSheetToWorkbook(sheet)[0].rows
    const printed = rows.slice(1, -1).reduce((sum, r) => sum + Number(r[1]), 0)
    expect(rows.at(-1)![1]).toBeCloseTo(printed, 10)
  })

  it('says both figures on the Notes tab rather than only the one that moves', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture(pennies, []), draft(), {
      options: { grouping: 'line' },
    })
    const notes = Object.fromEntries(keyingSheetToWorkbook(sheet)[2].rows.map((r) => [String(r[0]), String(r[1])]))
    // The two differ precisely because one rounds a row at a time; both are stated.
    expect(notes.Check).toContain('0.03 USD')
    expect(notes['Shipment as filed']).not.toContain('0.03 USD')
  })
})

describe('the country column on a row that merged origins', () => {
  const mixed = [
    line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Malaysia' }),
    line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'Ruritania' }),
  ]

  it('keeps the picker name for the origin that resolved', () => {
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture(mixed, []), draft(), {
      options: { grouping: 'part-code' },
    })
    const cell = String(keyingSheetToWorkbook(sheet)[0].rows[1][1])
    expect(cell).toContain('MY - Malaysia')
    expect(cell).toContain('Ruritania — no code found, enter it')
  })

  it('still flags the row as needing a code', () => {
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(mixed, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    expect(rows[0].needsCountryCode).toBe(true)
  })
})

describe('the unit column', () => {
  it('prints one unit where the document meant one thing by two spellings', () => {
    // PCS and EA canonicalise alike, and df-code groups on the canonical unit — so the row
    // would otherwise put `PCS, EA` in a field that holds a single value.
    const spellings = [
      line({ id: 'a', countryOfOrigin: 'Japan', uom: 'PCS' }),
      line({ id: 'b', countryOfOrigin: 'Japan', uom: 'EA' }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(spellings, []), draft(), {
      options: { grouping: 'df-code' },
    }).commodities
    expect(rows).toHaveLength(1)
    expect(rows[0].unitOfMeasure).toBe('PCS')
  })
})

describe('a stored layout that is hostile rather than merely stale', () => {
  it('does not accept an inherited property as a grouping mode', () => {
    expect(withDefaults({ grouping: 'constructor' as GroupingMode }).grouping).toBe(
      DEFAULT_KEYING_OPTIONS.grouping,
    )
    expect(withDefaults({ descriptionSource: 'toString' as DescriptionSource }).descriptionSource).toBe(
      DEFAULT_KEYING_OPTIONS.descriptionSource,
    )
  })
})

describe('a commodity record holds one unit', () => {
  const twoUnits = [
    line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Japan', uom: 'PCS', quantity: 2, extendedValue: 100 }),
    line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'Japan', uom: 'KG', quantity: 5, extendedValue: 50 }),
  ]

  it('never merges two units, in any grouping mode', () => {
    // 2 PCS and 5 KG merged into a row of 7 at a unit value averaged across two different
    // things — an impossible record for a field that holds one unit. `aggregateLines` keys
    // on the unit for exactly this reason.
    for (const grouping of ['part-origin-code', 'part-code', 'df-code', 'line'] as GroupingMode[]) {
      const rows = buildKeyingSheet('fedex-ship-manager', fixture(twoUnits, []), draft(), {
        options: { grouping },
      }).commodities
      expect(rows, grouping).toHaveLength(2)
      expect(rows.map((r) => r.unitOfMeasure).sort(), grouping).toEqual(['KG', 'PCS'])
    }
  })

  it('still merges lines the document spelled one unit two ways', () => {
    const spellings = twoUnits.map((l) => ({ ...l, uom: l.uom === 'KG' ? 'EA' : 'PCS' }) as MergedLine)
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(spellings, []), draft()).commodities
    expect(rows).toHaveLength(1)
  })
})

describe('one part printed two ways', () => {
  // Letters on purpose: a part number of digits and hyphens is the same string in either
  // case, so it cannot tell a case-insensitive key from a case-sensitive one.
  const cases = [
    line({ id: 'a', partNumber: 'CBL-100a', quantity: 2, extendedValue: 100 }),
    line({ id: 'b', partNumber: 'CBL-100A', quantity: 3, extendedValue: 150 }),
  ]

  it('is one part, because that is how the grouping keys it', () => {
    // Deduping on trim alone made a part printed in two cases look like two, which put both
    // spellings in a cell that holds one part number.
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(cases, []), draft()).commodities
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe('5')
  })

  it('shows the spelling the document used first', () => {
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(cases, []), draft()).commodities
    expect(rows[0].partNumber).toBe('CBL-100a')
  })

  it('still finds the wording saved against it', () => {
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(cases, []), draft(), {
      descriptionsByPart: { 'CBL-100A': 'Braided copper cable' },
    }).commodities
    expect(rows[0]).toMatchObject({ description: 'Braided copper cable', describedByOperator: true })
  })
})

describe('one wording printed two ways', () => {
  it('is not offered as an alternative to itself', () => {
    // The part number is stripped off the front of a description because it is already its
    // own column. Counting the two spellings apart put `document also said: CABLE ASSY`
    // beside a description reading exactly that.
    const both = [
      line({ id: 'a', partNumber: 'P-1', description: 'CABLE ASSY', quantity: 3 }),
      line({ id: 'b', partNumber: 'P-1', description: 'P-1 CABLE ASSY', quantity: 1 }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(both, []), draft()).commodities
    expect(rows[0]).toMatchObject({ description: 'CABLE ASSY', otherDescriptions: [] })
  })
})

describe('what a stored layout may be, not just what it may say', () => {
  it('survives a columns value that is not an array', () => {
    // What comes back from storage can be any shape. A TypeError here surfaces as an
    // unhandled rejection inside the restore and loses the saved layout without a word.
    expect(withDefaults({ columns: 'partNumber' as unknown as CommodityColumnId[] }).columns).toEqual(
      DEFAULT_KEYING_OPTIONS.columns,
    )
    expect(withDefaults({ columns: null as unknown as CommodityColumnId[] }).columns).toEqual(
      DEFAULT_KEYING_OPTIONS.columns,
    )
  })

  it('counts a mixed row’s origins in document order', () => {
    // `D, F`, as the field's own documentation says — not whichever origin printed first.
    const foreignFirst = [
      line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Japan' }),
      line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'United States' }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(foreignFirst, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    expect(rows[0].domesticForeign).toBe('D, F')
  })
})

describe('a row whose lines do not all state an origin', () => {
  it('does not read a foreign portion out of a blank', () => {
    // `domesticForeign('')` answers F. Reading D/F off every line rather than off the
    // origins the row has asserted a foreign portion nothing on the row supported — beside a
    // country cell reading `US - United States`, with nothing prompting anybody to look.
    const partial = [
      line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'United States' }),
      line({ id: 'b', partNumber: 'P-1', countryOfOrigin: '' }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(partial, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    // D, not `D, F`: nothing on the row says any of it is foreign. But the row does not
    // pretend the missing origin away either — the SLI files those pieces as F.
    expect(rows[0].domesticForeign).toBe('D')
    expect(rows[0].countryLabel).toContain('US - United States')
    expect(rows[0].countryLabel).toContain('some lines state no origin')
    expect(rows[0].needsCountryCode).toBe(true)
  })

  it('asks for a country when the row states none at all', () => {
    const none = [line({ id: 'a', partNumber: 'P-1', countryOfOrigin: '' })]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(none, []), draft()).commodities
    expect(rows[0]).toMatchObject({ countryOfManufacture: '', domesticForeign: '', needsCountryCode: true })
  })
})

describe('rows that must not go out unremarked', () => {
  it('prompts for a country the document never stated', () => {
    // A blank cell beside a blank D/F prompts nobody — while the SLI files F for the same
    // lines. The flag was being computed and not read.
    const sheet = buildKeyingSheet('fedex-ship-manager', fixture([line({ countryOfOrigin: '' })], []), draft())
    const cell = String(keyingSheetToWorkbook(sheet)[0].rows[1][1])
    expect(cell).toContain('enter it')
  })

  it('does not leave another part’s number inside a merged row’s wording', () => {
    // part-code and df-code merge several parts into one row. Stripping only the first
    // part's number left the others inside the description keyed against these goods.
    const merged = [
      line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Japan', description: 'P-1 CABLE ASSY', quantity: 1 }),
      line({ id: 'b', partNumber: 'P-2', countryOfOrigin: 'Japan', description: 'P-2 O-RING', quantity: 3 }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(merged, []), draft(), {
      options: { grouping: 'df-code' },
    }).commodities
    expect(rows[0].description).toBe('O-RING')
    expect(rows[0].otherDescriptions).toEqual(['CABLE ASSY'])
  })

  it('states one country per origin, however the document spelled it', () => {
    const spellings = [
      line({ id: 'a', partNumber: 'P-1', countryOfOrigin: 'Ruritania' }),
      line({ id: 'b', partNumber: 'P-1', countryOfOrigin: 'RURITANIA' }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(spellings, []), draft(), {
      options: { grouping: 'part-code' },
    }).commodities
    expect(rows[0].countryLabel).toBe('Ruritania — no code found, enter it')
  })

  it('never prints a column twice, however the stored layout repeats it', () => {
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { columns: ['partNumber', 'quantity', 'partNumber'] },
      }),
    )[0].rows
    expect(rows[0]).toEqual(['Part Number', 'Qty'])
  })
})

describe('the mode defined by D/F', () => {
  it('shows D/F, whatever columns were stored', () => {
    // Grouping by D/F and then leaving the column off produces a table that cannot be
    // checked against the filed form line for line, which is the only reason the mode exists.
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { grouping: 'df-code', columns: ['partNumber', 'quantity'] },
      }),
    )[0].rows
    expect(rows[0]).toEqual(['Part Number', 'D/F', 'Qty'])
  })

  it('leaves the other modes’ columns alone', () => {
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { grouping: 'part-origin-code', columns: ['partNumber', 'quantity'] },
      }),
    )[0].rows
    expect(rows[0]).toEqual(['Part Number', 'Qty'])
  })
})

describe('a part number that prefixes another', () => {
  it('does not claim the longer part’s description', () => {
    // `5610` prefixes `5610-2`. Taking the shorter one first left `2 CABLE ASSY LONG`
    // where the whole part number should have gone.
    const prefixes = [
      line({ id: 'a', partNumber: '5610', countryOfOrigin: 'Japan', description: '5610 CABLE ASSY', quantity: 1 }),
      line({ id: 'b', partNumber: '5610-2', countryOfOrigin: 'Japan', description: '5610-2 CABLE ASSY LONG', quantity: 3 }),
    ]
    const rows = buildKeyingSheet('fedex-ship-manager', fixture(prefixes, []), draft(), {
      options: { grouping: 'df-code' },
    }).commodities
    expect(rows[0].description).toBe('CABLE ASSY LONG')
    expect(rows[0].otherDescriptions).toEqual(['CABLE ASSY'])
  })
})

describe('the D/F column under the D/F grouping', () => {
  it('carries the letter its own key was built from', () => {
    // The key puts a blank-origin line in the F bucket, because `domesticForeign('')` is F
    // and that is what the SLI files for it. Reading the cell from the stated origins
    // instead blanked the one column this mode force-adds.
    const rows = buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({ countryOfOrigin: '' })], []),
      draft(),
      { options: { grouping: 'df-code' } },
    ).commodities
    expect(rows[0].domesticForeign).toBe('F')
    // And the missing origin is still asked for, beside it.
    expect(rows[0].needsCountryCode).toBe(true)
  })

  it('leaves the other modes reading from the origins the row has', () => {
    const rows = buildKeyingSheet(
      'fedex-ship-manager',
      fixture([line({ countryOfOrigin: '' })], []),
      draft(),
      { options: { grouping: 'part-origin-code' } },
    ).commodities
    expect(rows[0].domesticForeign).toBe('')
  })
})

describe('the D/F column’s insertion', () => {
  it('does not rearrange a layout that was given out of canonical order', () => {
    // `columns` prints in the order it was given, and every other grouping honours that.
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { grouping: 'df-code', columns: ['description', 'partNumber', 'quantity'] },
      }),
    )[0].rows
    expect(rows[0]).toEqual(['Commodity Description', 'Part Number', 'D/F', 'Qty'])
  })

  it('appends it where nothing follows it canonically', () => {
    const rows = keyingSheetToWorkbook(
      buildKeyingSheet('fedex-ship-manager', fixture([line({})], []), draft(), {
        options: { grouping: 'df-code', columns: ['partNumber'] },
      }),
    )[0].rows
    expect(rows[0]).toEqual(['Part Number', 'D/F'])
  })
})
