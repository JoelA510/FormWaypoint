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
    expect(values['Quantity Schedule B Unit']).toBe('10\r75\r12')
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
    sourceUom: 'EA',
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
