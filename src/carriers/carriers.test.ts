import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import { parseCipl } from '../domain/cipl'
import { hasFixtures, readFixture, fixtureFile } from '../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from '../domain/schedule-b'
import { reconcile } from '../domain/reconcile'
import { buildDraft, defaultShipmentSettings, summariseReferences, type CompanyProfile } from '../domain/draft'
import { getAdapter, detectCarrier } from './registry'
import { isNamedPlace, parseIncoterm } from '../domain/incoterms'
import { buildSyntheticCipl, simpleShipment } from '../test/synthetic/cipl'
import { buildKeyingSheet, keyingSheetToWorkbook } from './keying-sheet'
import type { ParsedCipl, ShipmentHeader, SLILine } from '../domain/types'
import type { SliDraft } from './types'

/** Enough of a header to build a draft from rows that were not parsed from a document. */
const BLANK_HEADER: ShipmentHeader = {
  invoiceNumber: 'SYNTHETIC',
  invoiceDate: '2026-07-20',
  onOrAboutDate: null,
  soldTo: { name: 'Consignee', lines: ['Japan'], country: null },
  consignedTo: { name: 'Consignee', lines: ['Japan'], country: null },
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
  documentCurrency: 'USD',
  totalQuantity: 0,
  totalValue: 0,
  totalNetWeightKg: null,
  totalGrossWeightKg: null,
  totalMeasurementM3: null,
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/** The exporter behind all three sample shipments. */
const VENDOR: CompanyProfile = {
  usppiName: 'Vendor A Manufacturing, Inc.',
  usppiAddressLines: ['4225 Hacienda Drive', 'Pleasanton CA 94588', 'UNITED STATES OF AMERICA'],
  usppiZip: '94588',
  usppiEin: '94-2900635',
  contactName: 'Joel Abraham',
  contactPhone: '+19252453400',
  pointOfOrigin: 'California',
  signerName: 'Joel Abraham',
  signerTitle: 'Logistics Specialist',
  signerEmail: 'joel.abraham@vendor.com',
  signerPhone: '925-245-8170',
  signerInitials: 'JA',
}

/** One reviewed commodity row, for the suites that build rows rather than parse them. */
const ROW: SLILine = {
  sourceLineIds: ['line:1'],
  domesticForeign: 'F',
  scheduleB: '8544.42.0000',
  description: 'Electrical conductors',
  quantity: 10,
  scheduleBUnit: 'NO',
  scheduleBUnits: ['NO'],
  sourceUom: 'PCS',
  reportingUom: 'NO',
  reportingQuantity: 10,
  reportingBasis: 'source',
  weightKg: 7.078,
  valueUsd: 1149.4,
  eccn: 'EAR99',
  sme: 'N',
  license: 'NLR',
  countriesOfOrigin: ['Japan'],
}

const parsed: Record<string, ParsedCipl> = {}
let scheduleB: ScheduleBIndex
const template = (name: string) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates', name)))

beforeAll(async () => {
  // Guarded, not assumed. The suites keyed to real shipments skip without the documents,
  // but this hook runs regardless of what is skipped, and reading a fixture that is not
  // there would fail the whole file — including the tests that need no fixture at all.
  if (hasFixtures()) {
    parsed.vendorA1 = await parseCipl(fixtureFile('vendorA1'), readFixture('vendorA1'))
    parsed.vendorA2 = await parseCipl(fixtureFile('vendorA2'), readFixture('vendorA2'))
    parsed.vendorA3 = await parseCipl(fixtureFile('vendorA3'), readFixture('vendorA3'))
  }
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/schedule-b.json'), 'utf8')),
  )
}, 60_000)

/** Read every filled value back out of a generated PDF. */
async function readBack(bytes: Uint8Array): Promise<Record<string, string>> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const values: Record<string, string> = {}
  for (const field of doc.getForm().getFields()) {
    const name = field.getName()
    if (field instanceof PDFTextField) {
      const text = field.getText()
      if (text) values[name] = text
    } else if (field instanceof PDFRadioGroup) {
      const selected = field.getSelected()
      if (selected) values[name] = selected
    } else if (field instanceof PDFCheckBox) {
      if (field.isChecked()) values[name] = 'checked'
    }
  }
  return values
}

async function generate(fixture: keyof typeof parsed, carrier: 'nippon-express' | 'ceva') {
  const adapter = getAdapter(carrier)
  const result = reconcile(parsed[fixture], scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
  const settings = defaultShipmentSettings(adapter)
  const draft = buildDraft(result, VENDOR, settings, adapter)
  const filled = await adapter.fill(template(path.basename(adapter.templateUrl)), draft)
  return { adapter, result, draft, filled, values: await readBack(filled.bytes) }
}

// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('carrier detection', () => {
  it('picks the carrier the CIPL names', () => {
    expect(detectCarrier(parsed.vendorA1.headers.FC.vesselAgent)).toBe('nippon-express')
    expect(detectCarrier(parsed.vendorA3.headers.FC.vesselAgent)).toBe('ceva')
    expect(detectCarrier('DB Schenker')).toBeNull()
  })
})

describe('carrier detection on names alone', () => {
  it('matches UPS as a word, not a substring', () => {
    // 'ups' sits inside ordinary words, and a match there silently preselects UPS and swaps
    // its keying defaults in.
    expect(detectCarrier('UPS')).toBe('ups')
    expect(detectCarrier('UPS Supply Chain Solutions')).toBe('ups')
    expect(detectCarrier('United Parcel Service')).toBe('ups')
    expect(detectCarrier('XYZ Groups Logistics')).toBeNull()
    expect(detectCarrier('Supship Marine Services')).toBeNull()
  })
})

describe.skipIf(!hasFixtures())('template verification', () => {
  it('recognises both shipped blank templates', async () => {
    for (const id of ['nippon-express', 'ceva'] as const) {
      const adapter = getAdapter(id)
      const check = await adapter.verifyTemplate(template(path.basename(adapter.templateUrl)))
      expect(check.missing, `${id}: ${check.missing.join(', ')}`).toEqual([])
      expect(check.ok).toBe(true)
      expect(check.found).toBeGreaterThan(50)
    }
  })

  it('reports the mapped fields a wrong template is missing', async () => {
    // The Nippon adapter is written against the current blank form; the CEVA form stands in
    // here for any other PDF, and every mapped field should come back missing.
    const adapter = getAdapter('nippon-express')
    const check = await adapter.verifyTemplate(template('ceva-sli.pdf'))
    expect(check.ok).toBe(false)
    expect(check.missing.length).toBeGreaterThan(10)
  })
})

describe.skipIf(!hasFixtures())('Nippon Express — vendorA1', () => {
  it('writes the header values from the filed SLI', async () => {
    const { values } = await generate('vendorA1', 'nippon-express')

    expect(values['1b USPPI IRS NO or ID NO']).toBe('94-2900635')
    expect(values['ZIP CODE']).toBe('94588')
    expect(values['1a. USPPI']).toContain('Vendor A Manufacturing, Inc.')
    expect(values['1a. USPPI']).toContain('Joel Abraham / +19252453400')

    // Invoice date, not the later "on or about July 25" sailing date.
    expect(values['2 DATE OF EXPORTATION']).toBe('07-20-2026')
    expect(values['5a FORWARDING AGENT']).toBe('Nippon Express USA, Inc.')
    expect(values['6 POINT OF ORIGIN OR FTZ NO Must be 7digit Legacy or 9digit ACE format']).toBe('California')
    expect(values['7 COUNTRY OF ULTIMATE DESTINATION']).toBe('India')

    // Consignee, not the buyer.
    const consignee = values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available']
    expect(consignee).toContain('the vendor Automation Pvt. Ltd. - Edi')
    expect(consignee).toContain('Bangalore, KARNATAKA 562123')
  })

  it('sets the check boxes the filed SLI sets', async () => {
    const { values } = await generate('vendorA1', 'nippon-express')
    expect(values['1c1 PARTIES']).toBe('RELATED')
    expect(values['4b2 CNEE TYPE']).toBe('RESELLER')
    expect(values['9a MODE']).toBe('AIR')
    expect(values.INSURANCE).toBe('NO')
    expect(values.FREIGHT).toBe('CC') // trade terms say Collect
    expect(values.JETPAK).toBe('NO')
    expect(values.INCOTERM).toBe('FOB')
    expect(values.TERM).toBe('DD')
    expect(values['16b HAZMAT']).toBe('NO')
    expect(values['18b CONTAINER']).toBe('NO')
    expect(values['20b RET']).toBe('NO')
  })

  it('writes both commodity rows', async () => {
    const { values, filled } = await generate('vendorA1', 'nippon-express')

    expect(values['22.01 DF1']).toBe('F')
    expect(values['22.02 SB1']).toBe('8501.51.3040')
    expect(values['22.03 sB UNIT1']).toBe('1')
    expect(values['22.05 WEIGHT1']).toBe('1.380')
    expect(values['22.10 VALUE1']).toBe('968.01')
    expect(values['22.07 ECCN1']).toBe('EAR99')
    expect(values['22.08 SME1']).toBe('N')
    expect(values['22.09 LICENSE1']).toBe('NLR')

    expect(values['23.01 DF2']).toBe('F')
    expect(values['23.02 SB2']).toBe('8544.42.0000')
    expect(values['23.03 SB UNI2']).toBe('2')
    expect(values['23.05WEIGHT2']).toBe('1.088')
    expect(values['23.10VALUE2']).toBe('145.13')

    // Unused rows stay empty rather than being filled with placeholders.
    expect(values['24.02']).toBeUndefined()
    expect(filled.warnings).toEqual([])
  })

  it('leaves the signature fields for a human', async () => {
    const { values, filled } = await generate('vendorA1', 'nippon-express')
    expect(values['33c TITLE']).toBe('Logistics Specialist')
    expect(values['33e EMAIL ADDRESS']).toBe('joel.abraham@vendor.com')
    expect(values['33g DATE']).toBe('07-20-2026')
    // No signature is ever applied automatically.
    expect(Object.keys(filled.written)).not.toContain('33a Signature2')
    expect(Object.keys(filled.written)).not.toContain('33b Signature3')
  })

  it('can write gross weight instead of net when that policy is chosen', async () => {
    const adapter = getAdapter('nippon-express', {
      nipponExpress: { useGrossWeight: true, grossWeightByRow: [1.518, 1.196] },
    })
    const result = reconcile(parsed.vendorA1, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const draft = buildDraft(result, VENDOR, defaultShipmentSettings(adapter), adapter)
    const values = await readBack((await adapter.fill(template('nippon-express-sli.pdf'), draft)).bytes)
    expect(values['22.05 WEIGHT1']).toBe('1.518')
    expect(values['23.05WEIGHT2']).toBe('1.196')
  })
})

describe.skipIf(!hasFixtures())('CEVA — vendorA3', () => {
  it('writes the commodity table as aligned multiline columns', async () => {
    const { values } = await generate('vendorA3', 'ceva')

    // Exactly the three rows on the filed SLI, in the same order.
    expect(values['D/F']).toBe('F\rD\rD')
    // The third row departs from the filed SLI deliberately. 9031.90.0000 is reported in
    // kilograms — the Census file says so and the Schedule B unit check has always warned
    // about it — so box 24 carries the row's net weight rather than the 12 pieces that were
    // filed, with the unit spelled out beside a figure that is no longer a count. The other
    // two codes are reported in NO and are unchanged.
    expect(values['Quantity Schedule B Unit']).toBe('10\r75\r4.263 KG')
    expect(values['Shipping Weight']).toBe('7.078\r127.500\r4.263')
    // "U.S. dollar, omit cents" — 1149.40, 128181.80 and 667.90 rounded.
    expect(values.Value).toBe('1149\r128182\r668')

    const codes = values['Schedule B Number'].split('\r')
    expect(codes).toHaveLength(3)
    expect(codes[0]).toContain('8544.42.0000')
    expect(codes[1]).toContain('9031.49.8000')
    expect(codes[2]).toContain('9031.90.0000')

    // Every column has the same row count, or the table would be misaligned.
    const rowCounts = ['D/F', 'Quantity Schedule B Unit', 'Shipping Weight', 'Value', 'Schedule B Number'].map(
      (f) => values[f].split('\r').length,
    )
    expect(new Set(rowCounts).size).toBe(1)
  })

  it('writes the header values from the filed SLI', async () => {
    const { values } = await generate('vendorA3', 'ceva')
    expect(values.USPPI).toBe('94-2900635')
    expect(values.ZipCode).toBe('94588')
    expect(values['Point of Origin']).toBe('California')
    expect(values['Country of Ultimate']).toBe('Netherlands')
    expect(values['Ultimate Consignee']).toContain('the vendor Europe B.V.')
    expect(values.Date).toBe('04/24/2026')
    expect(values.Related).toBe('checked')
    expect(values.RESELLER).toBe('checked')
    expect(values.FOB).toBe('checked')
    expect(values.NO).toBe('checked') // routed export transaction = No
    expect(values['License No']).toBe('NLR')
  })

  it('abbreviates the eight purchase orders the way the filed SLI does', async () => {
    const { values } = await generate('vendorA3', 'ceva')
    expect(values['Consignee PO']).toMatch(/, 7 Add'l$/)
    expect(summariseReferences(['A'])).toBe('A')
    expect(summariseReferences([])).toBe('')
  })

  it('leaves ECCN blank and initials the dangerous-goods box', async () => {
    const { values } = await generate('vendorA3', 'ceva')
    // CEVA's ECCN box is "when required"; EAR99 belongs in the Nippon form, not this one.
    expect(values.ECCN).toBeUndefined()
    expect(values['DOES NOT CONTAIN DANGEROUS GOODS']).toBe('JA')
    expect(values['Duly Authorized']).toBe('Joel Abraham')
  })

  it('produces a PDF that still opens and keeps its form', async () => {
    const { filled } = await generate('vendorA3', 'ceva')
    const doc = await PDFDocument.load(filled.bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getForm().getFields().length).toBeGreaterThan(50)
    expect(filled.warnings).toEqual([])
  })
})

describe.skipIf(!hasFixtures())('overflow handling', () => {
  it('warns rather than silently dropping rows beyond the form capacity', async () => {
    const adapter = getAdapter('nippon-express')
    const result = reconcile(parsed.vendorA3, scheduleB, CONTROLLED)
    const draft = buildDraft(result, VENDOR, defaultShipmentSettings(adapter), adapter)
    // Nine rows against an eight-row form.
    const overflowing = { ...draft, lines: [...draft.lines, ...draft.lines, ...draft.lines] }
    const filled = await adapter.fill(template('nippon-express-sli.pdf'), overflowing)
    expect(filled.warnings.join(' ')).toMatch(/holds 8/)
    expect(filled.warnings.join(' ')).toMatch(/continuation sheet/)
  })
})

describe.skipIf(!hasFixtures())('FedEx / UPS keying sheets', () => {
  it('groups commodities the way the application stores them, not the way the SLI does', async () => {
    const { result, draft } = await generate('vendorA3', 'ceva')
    const sheet = buildKeyingSheet('ups-worldship', result, draft)
    expect(sheet.applicationName).toBe('UPS WorldShip')

    // One record per part and country of manufacture: fewer than the 11 invoice lines,
    // more than the 3 aggregated SLI rows, because country is a field on the record.
    expect(sheet.commodities.length).toBeGreaterThan(result.sliLines.length)
    expect(sheet.commodities.length).toBeLessThanOrEqual(result.mergedLines.length)

    // Every value is in the form the application expects.
    for (const row of sheet.commodities) {
      expect(row.unitValue).toMatch(/^\d+\.\d{6}$/)
      if (row.countryOfManufacture) expect(row.countryOfManufacture).toMatch(/^[A-Z]{2}$/)
    }

    // Totals still tie back to the reconciled shipment.
    const keyedValue = sheet.commodities.reduce((sum, r) => sum + Number(r.totalValue), 0)
    expect(keyedValue).toBeCloseTo(Number(sheet.totals.customsValue), 2)
  })

  it('names the fields the operator has to supply themselves', async () => {
    const { result, draft } = await generate('vendorA1', 'nippon-express')
    const sheet = buildKeyingSheet('fedex-ship-manager', result, draft)
    expect(sheet.applicationName).toBe('FedEx Ship Manager')
    expect(sheet.manualFields).toContain('Package dimensions')
    expect(sheet.manualFields).toContain('Service type')

    const [commodities, , notes] = keyingSheetToWorkbook(sheet)
    expect(commodities.rows.flat()).toContain('8501.51.3040')
    expect(notes.rows.find((r) => r[0] === 'Enter manually')?.[1]).toContain('Package dimensions')
  })
})

describe.skipIf(!hasFixtures())('country in the ultimate consignee block', () => {
  it('appends the country when the CIPL address omits it', async () => {
    // vendorA3's consigned-to block ends "'s-Hertogenbosch NA 5234" — no country anywhere.
    const ceva = await generate('vendorA3', 'ceva')
    expect(ceva.values['Ultimate Consignee'].split('\r').at(-1)).toBe('Netherlands')
    expect(ceva.values['Country of Ultimate']).toBe('Netherlands')

    // vendorA1 ends "Bangalore, KARNATAKA 562123".
    const nippon = await generate('vendorA1', 'nippon-express')
    const consignee =
      nippon.values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available']
    expect(consignee.split('\r').at(-1)).toBe('India')
  })

  it('does not duplicate a country the CIPL already prints', async () => {
    // vendorA2's consigned-to block already ends "China".
    const { values } = await generate('vendorA2', 'nippon-express')
    const lines =
      values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available'].split('\r')
    expect(lines.at(-1)).toBe('China')
    expect(lines.filter((l) => l.trim() === 'China')).toHaveLength(1)
  })
})

describe.skipIf(!hasFixtures())('CEVA fields that were mapped but not written', () => {
  it('writes the insurance box when the shipment is insured', async () => {
    const adapter = getAdapter('ceva')
    const result = reconcile(parsed.vendorA3, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const draft = { ...buildDraft(result, VENDOR, defaultShipmentSettings(adapter), adapter), insured: true }
    const values = await readBack((await adapter.fill(template('ceva-sli.pdf'), draft)).bytes)
    expect(values.Insurance).toBe('YES')
  })

  it('always completes exactly one dangerous-goods declaration', async () => {
    const adapter = getAdapter('ceva')
    const result = reconcile(parsed.vendorA3, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const base = buildDraft(result, VENDOR, defaultShipmentSettings(adapter), adapter)

    const safe = await readBack((await adapter.fill(template('ceva-sli.pdf'), base)).bytes)
    expect(safe['DOES NOT CONTAIN DANGEROUS GOODS']).toBe('JA')
    expect(safe['DOES CONTAIN DANGEROUS GOODS']).toBeUndefined()

    // Previously a hazardous shipment left *both* boxes blank, declaring nothing.
    const hazardous = await adapter.fill(template('ceva-sli.pdf'), { ...base, hazardous: true })
    const values = await readBack(hazardous.bytes)
    expect(values['DOES CONTAIN DANGEROUS GOODS']).toBe('JA')
    expect(values['DOES NOT CONTAIN DANGEROUS GOODS']).toBeUndefined()
    expect(hazardous.warnings.join(' ')).toMatch(/shipper’s declaration/)
  })
})

/**
 * End to end on a document, because the unit a row is filed in is resolved in one place and
 * consumed in three, and the ways it can go wrong are all in the joins: a choice that never
 * reaches the adapter, an SLI and a keying sheet that disagree, a quantity restated twice.
 */
describe('the reported unit from document to form', () => {
  const CODE_BY_WEIGHT = '9031.90.0000'
  let document: ParsedCipl

  beforeAll(async () => {
    const spec = simpleShipment()
    document = await parseCipl(
      'synthetic.pdf',
      await buildSyntheticCipl({
        ...spec,
        lines: [
          { ...spec.lines[0], classification: '8544.42.0000', quantity: 10, netWeightKg: 7.078, grossWeightKg: 7.5 },
          { ...spec.lines[1], classification: CODE_BY_WEIGHT, quantity: 12, netWeightKg: 4.263, grossWeightKg: 4.5 },
        ],
      }),
    )
  }, 60_000)

  const run = (reportingUnits: Record<string, string> = {}) => {
    const adapter = getAdapter('ceva')
    const result = reconcile(document, scheduleB, {
      ...CONTROLLED,
      reportingUnits,
      maxRows: adapter.maxCommodityRows,
    })
    return { adapter, result, draft: buildDraft(result, VENDOR, defaultShipmentSettings(adapter), adapter) }
  }

  it('files the weight-reported row by weight, on the form and on the sheet alike', async () => {
    const { adapter, result, draft } = run()
    const values = await readBack((await adapter.fill(template('ceva-sli.pdf'), draft)).bytes)
    // Rows are ordered by commodity number: 8544 first, then 9031.
    expect(values['Quantity Schedule B Unit']).toBe('10\r4.263 KG')

    const sheet = buildKeyingSheet('fedex-ship-manager', result, draft)
    const keyed = sheet.commodities.find((c) => c.harmonizedCode === CODE_BY_WEIGHT)!
    expect(keyed.unitOfMeasure).toBe('KG')
    expect(keyed.quantity).toBe('4.263')
  })

  it('carries a chosen unit all the way to the form and the sheet', async () => {
    const { adapter, result, draft } = run({ '9031900000': 'NO' })
    const values = await readBack((await adapter.fill(template('ceva-sli.pdf'), draft)).bytes)
    expect(values['Quantity Schedule B Unit']).toBe('10\r12')

    const sheet = buildKeyingSheet('fedex-ship-manager', result, draft)
    const keyed = sheet.commodities.find((c) => c.harmonizedCode === CODE_BY_WEIGHT)!
    expect(keyed.unitOfMeasure).toBe('PCS')
    expect(keyed.quantity).toBe('12')
  })

  it('ticks the Incoterm the document states', async () => {
    // The synthetic trade terms read `FOB Origin - Collect`, which is how the Vendor A
    // layout prints them and what used to leave every box on this form unticked.
    const { adapter, draft } = run()
    const filled = await adapter.fill(template('ceva-sli.pdf'), draft)
    const values = await readBack(filled.bytes)
    expect(values.FOB).toBe('checked')
    expect(filled.warnings).toEqual([])
  })
})

/**
 * Both forms record the Incoterm as a tick against a fixed list, so what reaches the adapter
 * has to be resolved to a rule before anything can be ticked. What reaches it is rarely a
 * bare code.
 */
describe('reading an Incoterm off a document', () => {
  it('takes the rule and keeps the place that qualifies it', () => {
    expect(parseIncoterm('DAP Singapore')).toEqual({ code: 'DAP', namedPlace: 'Singapore', retired: false })
    expect(parseIncoterm('FOB Origin - Collect')).toEqual({
      code: 'FOB',
      namedPlace: 'Origin - Collect',
      retired: false,
    })
    expect(parseIncoterm('  cif  rotterdam ')).toEqual({ code: 'CIF', namedPlace: 'rotterdam', retired: false })
    expect(parseIncoterm('FCA - Long Beach')).toEqual({ code: 'FCA', namedPlace: 'Long Beach', retired: false })
    expect(parseIncoterm('EXW')).toEqual({ code: 'EXW', namedPlace: '', retired: false })
  })

  it('reads the rule written out in words', () => {
    expect(parseIncoterm('Ex Works')?.code).toBe('EXW')
    expect(parseIncoterm('Ex-Works Pleasanton')).toEqual({ code: 'EXW', namedPlace: 'Pleasanton', retired: false })
    expect(parseIncoterm('Free on Board')?.code).toBe('FOB')
    expect(parseIncoterm('COST, INSURANCE AND FREIGHT')?.code).toBe('CIF')
    // The longer rule wins over the one that is a prefix of it.
    expect(parseIncoterm('Delivered at Place Unloaded')?.code).toBe('DPU')
    expect(parseIncoterm('Delivered at Place')?.code).toBe('DAP')
  })

  it('recognises a retired rule as retired rather than as nothing', () => {
    // Reported so a person can reclassify it. Silently mapping DAT onto DPU would be this
    // app deciding a delivery term, which is not its decision to make.
    expect(parseIncoterm('DAT Rotterdam')).toEqual({ code: 'DAT', namedPlace: 'Rotterdam', retired: true })
    expect(parseIncoterm('DDU')?.retired).toBe(true)
  })

  it('tells a named place from a freight term', () => {
    // A trade-terms line is a composite. What follows the rule is a place on `DAP Singapore`
    // and a payment term on `FOB Origin - Collect`, and only the first belongs in a box
    // captioned "NAMED PLACE/PORT".
    expect(isNamedPlace('Singapore')).toBe(true)
    expect(isNamedPlace('Long Beach')).toBe(true)
    expect(isNamedPlace('Origin - Collect')).toBe(false)
    expect(isNamedPlace('Prepaid')).toBe(false)
    expect(isNamedPlace('DUTY PAID BY CONSIGNEE')).toBe(false)
    expect(isNamedPlace('')).toBe(false)
  })

  it('answers nothing for what is not an Incoterm', () => {
    expect(parseIncoterm('')).toBeNull()
    expect(parseIncoterm(null)).toBeNull()
    expect(parseIncoterm('Ex Factory')).toBeNull()
    // A three-letter word that is not a rule, so the adapter does not tick a box for it.
    expect(parseIncoterm('TBD later')).toBeNull()
    expect(parseIncoterm('PREPAID')).toBeNull()
  })
})

/**
 * The Nippon form states the quantity and its unit in two boxes side by side (24 and 25), so
 * they have to be resolved together — a count under a kilogram heading is a form that
 * contradicts itself.
 */
describe('Nippon Express — quantity, its unit, and the named place', () => {
  const fillWith = async (line: Partial<SLILine>, draft: Partial<SliDraft> = {}) => {
    const adapter = getAdapter('nippon-express')
    const base = buildDraft(
      {
        header: BLANK_HEADER,
        sliLines: [{ ...ROW, ...line }],
        mergedLines: [],
        checks: [],
        selectedSet: 'FC',
        canGenerate: true,
      },
      VENDOR,
      defaultShipmentSettings(adapter),
      adapter,
    )
    const result = await adapter.fill(template('nippon-express-sli.pdf'), { ...base, ...draft })
    return { values: await readBack(result.bytes), warnings: result.warnings }
  }

  it('writes the count and NO for a code reported by the piece', async () => {
    const { values } = await fillWith({})
    expect(values['22.03 sB UNIT1']).toBe('10')
    expect(values['22.04 UOM1']).toBe('NO')
  })

  it('writes the net weight and KG for a code reported by weight', async () => {
    const { values } = await fillWith({
      scheduleB: '9031.90.0000',
      scheduleBUnit: 'KG',
      scheduleBUnits: ['KG'],
      reportingUom: 'KG',
      reportingQuantity: 4.263,
      reportingBasis: 'net-weight',
    })
    expect(values['22.03 sB UNIT1']).toBe('4.263')
    expect(values['22.04 UOM1']).toBe('KG')
  })

  it('selects the Incoterm from a term that carries its place, and fills the place', async () => {
    // Matched literally, `DAP Singapore` selected nothing and box 15 stayed empty.
    const { values, warnings } = await fillWith({}, { incoterm: 'DAP Singapore' })
    expect(values.INCOTERM).toBe('DAP')
    expect(values['NAMED PLACE/PORT']).toBe('Singapore')
    expect(warnings).toEqual([])
  })

  it('keeps a named place the operator typed', async () => {
    const { values } = await fillWith({}, { incoterm: 'FOB Origin - Collect', namedPlace: 'SFO' })
    expect(values.INCOTERM).toBe('FOB')
    expect(values['NAMED PLACE/PORT']).toBe('SFO')
  })

  it('does not write a freight term into the named-place box', async () => {
    // `FOB Origin - Collect` is the Vendor A trade-terms wording. "Origin - Collect" is who
    // pays the freight, not a port, and box 15 is captioned "NAMED PLACE/PORT".
    const { values } = await fillWith({}, { incoterm: 'FOB Origin - Collect', namedPlace: '' })
    expect(values.INCOTERM).toBe('FOB')
    expect(values['NAMED PLACE/PORT']).toBeUndefined()
  })

  it('says what a retired rule has become rather than selecting nothing quietly', async () => {
    const { values, warnings } = await fillWith({}, { incoterm: 'DAT Rotterdam' })
    expect(values.INCOTERM).toBeUndefined()
    expect(warnings.join(' ')).toMatch(/DPU/)
  })
})

/**
 * The Incoterm is the one term on a CEVA SLI that is recorded as a tick and nothing else, so
 * a value the adapter cannot place is a form with no delivery term on it at all — and the
 * form gives no sign of the omission. None of this needs a shipment document: what is being
 * tested is the range of spellings that reach the adapter, not any particular parse.
 */
describe('CEVA — recording the Incoterm', () => {
  const fillWith = async (draft: Partial<SliDraft>) => {
    const adapter = getAdapter('ceva')
    const base = buildDraft(
      {
        header: BLANK_HEADER,
        sliLines: [ROW],
        mergedLines: [],
        checks: [],
        selectedSet: 'FC',
        canGenerate: true,
      },
      VENDOR,
      defaultShipmentSettings(adapter),
      adapter,
    )
    const result = await adapter.fill(template('ceva-sli.pdf'), { ...base, ...draft })
    return { values: await readBack(result.bytes), warnings: result.warnings }
  }

  it('ticks the box for a bare rule', async () => {
    const { values, warnings } = await fillWith({ incoterm: 'FOB' })
    expect(values.FOB).toBe('checked')
    expect(warnings).toEqual([])
    // Already stated by the tick; repeating it would only crowd a box people read.
    expect(values['Special Instructions']).toBeUndefined()
  })

  it('ticks the box when the term carries its named place', async () => {
    // What the `omron-ci` INCOTERMS box actually says. Matched literally against the box
    // names, this ticked nothing at all.
    const { values, warnings } = await fillWith({ incoterm: 'DAP Singapore' })
    expect(values.DAP).toBe('checked')
    expect(warnings).toEqual([])
    // The place has no box on this form, and `DAP` alone does not say where delivery happens.
    expect(values['Special Instructions']).toBe('Incoterm: DAP Singapore')
  })

  it('reads the Vendor A trade terms and lower-case entry', async () => {
    expect((await fillWith({ incoterm: 'FOB Origin - Collect' })).values.FOB).toBe('checked')
    expect((await fillWith({ incoterm: 'cif rotterdam' })).values.CIF).toBe('checked')
    expect((await fillWith({ incoterm: 'Ex Works' })).values.EXW).toBe('checked')
    expect((await fillWith({ incoterm: 'Delivered at Place Unloaded' })).values.DPU).toBe('checked')
  })

  it('does not tick DPU for a DAT term, and says what to do about it', async () => {
    // DAT was renamed DPU in Incoterms 2020, and this revision of the form dropped the box.
    // Reclassifying a delivery term is the filer's decision, not this adapter's.
    const { values, warnings } = await fillWith({ incoterm: 'DAT Rotterdam' })
    expect(values.DPU).toBeUndefined()
    expect(values['Special Instructions']).toBe('Incoterm: DAT Rotterdam')
    expect(warnings.join(' ')).toMatch(/DPU/)
  })

  it('writes an unrecognisable term out rather than losing it', async () => {
    const { values, warnings } = await fillWith({ incoterm: 'Ex Factory' })
    expect(values['Special Instructions']).toBe('Incoterm: Ex Factory')
    expect(warnings.join(' ')).toMatch(/not recognised/)
    // Nothing was ticked, and nothing was invented.
    for (const box of ['EXW', 'FCA', 'FOB', 'DAP']) expect(values[box]).toBeUndefined()
  })

  it('writes a named place the operator supplied, since this form has no box for one', async () => {
    const { values } = await fillWith({ incoterm: 'FOB', namedPlace: 'SFO' })
    expect(values.FOB).toBe('checked')
    expect(values['Special Instructions']).toBe('Incoterm: FOB SFO')
  })

  it('does not repeat a place the term already names', async () => {
    const { values } = await fillWith({ incoterm: 'DAP Singapore', namedPlace: 'Singapore' })
    expect(values['Special Instructions']).toBe('Incoterm: DAP Singapore')
  })

  it('lets the operator’s named place win, as the Nippon form does', async () => {
    // The two forms disagreeing about whose place wins is how one shipment gets filed two
    // ways. Typing one is a deliberate act; the document is the default.
    const { values, warnings } = await fillWith({ incoterm: 'DAP Singapore', namedPlace: 'Rotterdam' })
    expect(values.DAP).toBe('checked')
    expect(values['Special Instructions']).toBe('Incoterm: DAP Rotterdam')
    // And the disagreement is said out loud rather than applied quietly.
    expect(warnings.join(' ')).toMatch(/DAP Singapore/)
  })

  it('keeps the operator’s own instructions and the EORI beside it', async () => {
    const { values } = await fillWith({
      incoterm: 'DAP Singapore',
      specialInstructions: 'Deliver to dock 4',
      ultimateConsignee: { name: 'C', addressLines: ['b'], consigneeId: 'NL008305535' },
    })
    expect(values['Special Instructions']).toBe('Deliver to dock 4\rIncoterm: DAP Singapore\rEORI # NL008305535')
  })

  it('says nothing when the shipment has no Incoterm', async () => {
    const { values, warnings } = await fillWith({ incoterm: '' })
    expect(values['Special Instructions']).toBeUndefined()
    expect(warnings).toEqual([])
  })
})

/**
 * Box 24 is captioned "Quantity — Schedule B Unit". Filing a piece count under a commodity
 * number the Census Bureau reports in kilograms is a reporting error the rest of the form
 * gives no sign of, so the row files the unit the code requires wherever it can state it.
 */
describe('CEVA — the quantity box carries the Schedule B unit', () => {
  const fillRows = async (lines: SLILine[]) => {
    const adapter = getAdapter('ceva')
    const draft = buildDraft(
      { header: BLANK_HEADER, sliLines: lines, mergedLines: [], checks: [], selectedSet: 'FC', canGenerate: true },
      VENDOR,
      defaultShipmentSettings(adapter),
      adapter,
    )
    return readBack((await adapter.fill(template('ceva-sli.pdf'), draft)).bytes)
  }

  it('writes a count bare, as the filed SLIs do', async () => {
    const values = await fillRows([{ ...ROW, reportingUom: 'NO', reportingQuantity: 10, reportingBasis: 'source' }])
    expect(values['Quantity Schedule B Unit']).toBe('10')
  })

  it('names the unit beside a figure that is not a count', async () => {
    // `4.263` on its own, in a column that has held piece counts on every form before it,
    // reads as four cables to everybody who has ever filled this in.
    const values = await fillRows([
      {
        ...ROW,
        scheduleB: '9031.90.0000',
        scheduleBUnit: 'KG',
        scheduleBUnits: ['KG'],
        reportingUom: 'KG',
        reportingQuantity: 4.263,
        reportingBasis: 'net-weight',
      },
    ])
    expect(values['Quantity Schedule B Unit']).toBe('4.263 KG')
  })

  it('keeps the columns aligned when the units are mixed', async () => {
    const values = await fillRows([
      { ...ROW, reportingUom: 'NO', reportingQuantity: 10, reportingBasis: 'source' },
      {
        ...ROW,
        scheduleB: '9031.90.0000',
        reportingUom: 'KG',
        reportingQuantity: 4.263,
        reportingBasis: 'net-weight',
      },
    ])
    expect(values['Quantity Schedule B Unit']).toBe('10\r4.263 KG')
    const rowCounts = ['D/F', 'Quantity Schedule B Unit', 'Shipping Weight', 'Value'].map(
      (f) => values[f].split('\r').length,
    )
    expect(new Set(rowCounts).size).toBe(1)
  })
})

/**
 * The CEVA form has one ECCN box for the entire shipment, so a shipment whose rows are
 * classified differently cannot be stated accurately in it. Needs no shipment document —
 * the rows are built directly, because the point is the combination, not the parse.
 */
describe('CEVA — an ECCN box shared by every row', () => {
  const row = (scheduleB: string, eccn: string | null): SLILine => ({
    sourceLineIds: [`line:${scheduleB}`],
    domesticForeign: 'F',
    scheduleB,
    description: 'Parts',
    quantity: 1,
    scheduleBUnit: 'NO',
    scheduleBUnits: ['NO'],
    sourceUom: 'EA',
    reportingUom: 'NO',
    reportingQuantity: 1,
    reportingBasis: 'source',
    weightKg: 1,
    valueUsd: 100,
    eccn,
    sme: 'N',
    license: 'NLR',
    countriesOfOrigin: ['Japan'],
  })

  const fill = async (lines: SLILine[]) => {
    const adapter = getAdapter('ceva')
    const draft: SliDraft = {
      ...buildDraft(
        { header: BLANK_HEADER, sliLines: lines, mergedLines: [], checks: [], selectedSet: 'FC', canGenerate: true },
        VENDOR,
        defaultShipmentSettings(adapter),
        adapter,
      ),
    }
    const result = await adapter.fill(template('ceva-sli.pdf'), draft)
    return { values: await readBack(result.bytes), warnings: result.warnings }
  }

  it('leaves the box blank when every row is EAR99', async () => {
    // The box is captioned "when required", and CEVA practice is NLR in the licence box.
    const { values } = await fill([row('8544.42.0000', 'EAR99'), row('9031.49.8000', 'EAR99')])
    expect(values.ECCN).toBeUndefined()
    expect(values['License No']).toBe('NLR')
  })

  it('writes a single controlled ECCN on its own', async () => {
    const { values } = await fill([row('8544.42.0000', '5A992.C'), row('9031.49.8000', '5A992.C')])
    expect(values.ECCN).toBe('5A992.C')
  })

  it('writes every value, and warns, when the rows disagree', async () => {
    // Shipment vendorB1 is this shape: a 5A992.C pendant kit beside EAR99 lines. Writing
    // only the controlled code would read as though it covered the whole shipment.
    const { values, warnings } = await fill([row('8544.42.0000', 'EAR99'), row('8537.10.9090', '5A992.C')])
    expect(values.ECCN).toBe('EAR99 / 5A992.C')
    expect(warnings.join(' ')).toMatch(/different ECCNs/)
  })
})
