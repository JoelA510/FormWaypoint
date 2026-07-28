import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import { parseCipl } from '../domain/cipl'
import { hasFixtures, readFixture } from '../test/fixtures'
import { createScheduleBIndex, type ScheduleBIndex } from '../domain/schedule-b'
import { reconcile } from '../domain/reconcile'
import { buildDraft, defaultShipmentSettings, summariseReferences, type CompanyProfile } from '../domain/draft'
import { getAdapter, detectCarrier } from './registry'
import { buildKeyingSheet, keyingSheetToText } from './keying-sheet'
import type { ParsedCipl } from '../domain/types'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

/** The exporter behind all three sample shipments. */
const OMRON: CompanyProfile = {
  usppiName: 'Omron Robotics and Safety Technologies, Inc.',
  usppiAddressLines: ['4225 Hacienda Drive', 'Pleasanton CA 94588', 'UNITED STATES OF AMERICA'],
  usppiZip: '94588',
  usppiEin: '94-2900635',
  contactName: 'Joel Abraham',
  contactPhone: '+19252453400',
  pointOfOrigin: 'California',
  signerName: 'Joel Abraham',
  signerTitle: 'Logistics Specialist',
  signerEmail: 'joel.abraham@omron.com',
  signerPhone: '925-245-8170',
  signerInitials: 'JA',
}

const parsed: Record<string, ParsedCipl> = {}
let scheduleB: ScheduleBIndex
const template = (name: string) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates', name)))

beforeAll(async () => {
  parsed.G78495IQ = await parseCipl('G78495IQ', readFixture('G78495IQ'))
  parsed.K78464FJ = await parseCipl('K78464FJ', readFixture('K78464FJ'))
  parsed.K78027EC = await parseCipl('K78027EC', readFixture('K78027EC'))
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
  const draft = buildDraft(result, OMRON, settings, adapter)
  const filled = await adapter.fill(template(path.basename(adapter.templateUrl)), draft)
  return { adapter, result, draft, filled, values: await readBack(filled.bytes) }
}

// Shipment documents are customer data and are not committed. Without them this
// suite cannot run; the assertions themselves are checked in and unaffected.
describe.skipIf(!hasFixtures())('carrier detection', () => {
  it('picks the carrier the CIPL names', () => {
    expect(detectCarrier(parsed.G78495IQ.headers.FC.vesselAgent)).toBe('nippon-express')
    expect(detectCarrier(parsed.K78027EC.headers.FC.vesselAgent)).toBe('ceva')
    expect(detectCarrier('DB Schenker')).toBeNull()
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

describe.skipIf(!hasFixtures())('Nippon Express — G78495IQ', () => {
  it('writes the header values from the filed SLI', async () => {
    const { values } = await generate('G78495IQ', 'nippon-express')

    expect(values['1b USPPI IRS NO or ID NO']).toBe('94-2900635')
    expect(values['ZIP CODE']).toBe('94588')
    expect(values['1a. USPPI']).toContain('Omron Robotics and Safety Technologies, Inc.')
    expect(values['1a. USPPI']).toContain('Joel Abraham / +19252453400')

    // Invoice date, not the later "on or about July 25" sailing date.
    expect(values['2 DATE OF EXPORTATION']).toBe('07-20-2026')
    expect(values['5a FORWARDING AGENT']).toBe('Nippon Express USA, Inc.')
    expect(values['6 POINT OF ORIGIN OR FTZ NO Must be 7digit Legacy or 9digit ACE format']).toBe('California')
    expect(values['7 COUNTRY OF ULTIMATE DESTINATION']).toBe('India')

    // Consignee, not the buyer.
    const consignee = values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available']
    expect(consignee).toContain('Omron Automation Pvt. Ltd. - Edi')
    expect(consignee).toContain('Bangalore, KARNATAKA 562123')
  })

  it('sets the check boxes the filed SLI sets', async () => {
    const { values } = await generate('G78495IQ', 'nippon-express')
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
    const { values, filled } = await generate('G78495IQ', 'nippon-express')

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
    const { values, filled } = await generate('G78495IQ', 'nippon-express')
    expect(values['33c TITLE']).toBe('Logistics Specialist')
    expect(values['33e EMAIL ADDRESS']).toBe('joel.abraham@omron.com')
    expect(values['33g DATE']).toBe('07-20-2026')
    // No signature is ever applied automatically.
    expect(Object.keys(filled.written)).not.toContain('33a Signature2')
    expect(Object.keys(filled.written)).not.toContain('33b Signature3')
  })

  it('can write gross weight instead of net when that policy is chosen', async () => {
    const adapter = getAdapter('nippon-express', {
      nipponExpress: { useGrossWeight: true, grossWeightByRow: [1.518, 1.196] },
    })
    const result = reconcile(parsed.G78495IQ, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const draft = buildDraft(result, OMRON, defaultShipmentSettings(adapter), adapter)
    const values = await readBack((await adapter.fill(template('nippon-express-sli.pdf'), draft)).bytes)
    expect(values['22.05 WEIGHT1']).toBe('1.518')
    expect(values['23.05WEIGHT2']).toBe('1.196')
  })
})

describe.skipIf(!hasFixtures())('CEVA — K78027EC', () => {
  it('writes the commodity table as aligned multiline columns', async () => {
    const { values } = await generate('K78027EC', 'ceva')

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
    const { values } = await generate('K78027EC', 'ceva')
    expect(values.USPPI).toBe('94-2900635')
    expect(values.ZipCode).toBe('94588')
    expect(values['Point of Origin']).toBe('California')
    expect(values['Country of Ultimate']).toBe('Netherlands')
    expect(values['Ultimate Consignee']).toContain('Omron Europe B.V.')
    expect(values.Date).toBe('04/24/2026')
    expect(values.Related).toBe('checked')
    expect(values.RESELLER).toBe('checked')
    expect(values.FOB).toBe('checked')
    expect(values.NO).toBe('checked') // routed export transaction = No
    expect(values['License No']).toBe('NLR')
  })

  it('abbreviates the eight purchase orders the way the filed SLI does', async () => {
    const { values } = await generate('K78027EC', 'ceva')
    expect(values['Consignee PO']).toMatch(/, 7 Add'l$/)
    expect(summariseReferences(['A'])).toBe('A')
    expect(summariseReferences([])).toBe('')
  })

  it('leaves ECCN blank and initials the dangerous-goods box', async () => {
    const { values } = await generate('K78027EC', 'ceva')
    // CEVA's ECCN box is "when required"; EAR99 belongs in the Nippon form, not this one.
    expect(values.ECCN).toBeUndefined()
    expect(values['DOES NOT CONTAIN DANGEROUS GOODS']).toBe('JA')
    expect(values['Duly Authorized']).toBe('Joel Abraham')
  })

  it('produces a PDF that still opens and keeps its form', async () => {
    const { filled } = await generate('K78027EC', 'ceva')
    const doc = await PDFDocument.load(filled.bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getForm().getFields().length).toBeGreaterThan(50)
    expect(filled.warnings).toEqual([])
  })
})

describe.skipIf(!hasFixtures())('overflow handling', () => {
  it('warns rather than silently dropping rows beyond the form capacity', async () => {
    const adapter = getAdapter('nippon-express')
    const result = reconcile(parsed.K78027EC, scheduleB, CONTROLLED)
    const draft = buildDraft(result, OMRON, defaultShipmentSettings(adapter), adapter)
    // Nine rows against an eight-row form.
    const overflowing = { ...draft, lines: [...draft.lines, ...draft.lines, ...draft.lines] }
    const filled = await adapter.fill(template('nippon-express-sli.pdf'), overflowing)
    expect(filled.warnings.join(' ')).toMatch(/holds 8/)
    expect(filled.warnings.join(' ')).toMatch(/continuation sheet/)
  })
})

describe.skipIf(!hasFixtures())('FedEx / UPS keying sheets', () => {
  it('lists commodities per source line, because both applications ask for a unit price', async () => {
    const { result, draft } = await generate('K78027EC', 'ceva')
    const sheet = buildKeyingSheet('ups-worldship', result, draft)
    expect(sheet.applicationName).toBe('UPS WorldShip')
    // 11 invoice lines, not the 3 aggregated SLI rows.
    expect(sheet.commodities).toHaveLength(11)
    expect(sheet.commodities[0].unitValue).toBe('131.100')
    expect(sheet.commodities[0].harmonizedCode).toBe('8544.42.0000')
    expect(sheet.commodities[0].countryOfManufacture).toBe('Japan')
  })

  it('names the fields the operator has to supply themselves', async () => {
    const { result, draft } = await generate('G78495IQ', 'nippon-express')
    const sheet = buildKeyingSheet('fedex-ship-manager', result, draft)
    expect(sheet.applicationName).toBe('FedEx Ship Manager')
    expect(sheet.manualFields).toContain('Dimensions')
    expect(sheet.manualFields).toContain('Service')

    const text = keyingSheetToText(sheet)
    expect(text).toContain('FedEx Ship Manager — keying sheet')
    expect(text).toContain('Enter manually — not present on the CIPL:')
    expect(text).toContain('8501.51.3040')
  })
})

describe.skipIf(!hasFixtures())('country in the ultimate consignee block', () => {
  it('appends the country when the CIPL address omits it', async () => {
    // K78027EC's consigned-to block ends "'s-Hertogenbosch NA 5234" — no country anywhere.
    const ceva = await generate('K78027EC', 'ceva')
    expect(ceva.values['Ultimate Consignee'].split('\r').at(-1)).toBe('Netherlands')
    expect(ceva.values['Country of Ultimate']).toBe('Netherlands')

    // G78495IQ ends "Bangalore, KARNATAKA 562123".
    const nippon = await generate('G78495IQ', 'nippon-express')
    const consignee =
      nippon.values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available']
    expect(consignee.split('\r').at(-1)).toBe('India')
  })

  it('does not duplicate a country the CIPL already prints', async () => {
    // K78464FJ's consigned-to block already ends "China".
    const { values } = await generate('K78464FJ', 'nippon-express')
    const lines =
      values['4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available'].split('\r')
    expect(lines.at(-1)).toBe('China')
    expect(lines.filter((l) => l.trim() === 'China')).toHaveLength(1)
  })
})

describe.skipIf(!hasFixtures())('CEVA fields that were mapped but not written', () => {
  it('writes the insurance box when the shipment is insured', async () => {
    const adapter = getAdapter('ceva')
    const result = reconcile(parsed.K78027EC, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const draft = { ...buildDraft(result, OMRON, defaultShipmentSettings(adapter), adapter), insured: true }
    const values = await readBack((await adapter.fill(template('ceva-sli.pdf'), draft)).bytes)
    expect(values.Insurance).toBe('YES')
  })

  it('always completes exactly one dangerous-goods declaration', async () => {
    const adapter = getAdapter('ceva')
    const result = reconcile(parsed.K78027EC, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
    const base = buildDraft(result, OMRON, defaultShipmentSettings(adapter), adapter)

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
