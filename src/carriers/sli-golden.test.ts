import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import { parseCipl } from '../domain/cipl'
import { createScheduleBIndex, type ScheduleBIndex } from '../domain/schedule-b'
import { reconcile } from '../domain/reconcile'
import { buildDraft, defaultShipmentSettings, type CompanyProfile } from '../domain/draft'
import { buildSyntheticCipl, simpleShipment } from '../test/synthetic/cipl'
import type { ParsedCipl } from '../domain/types'
import { getAdapter } from './registry'

/**
 * Every box on each SLI, end to end, with no shipment documents.
 *
 * The suites that assert weights, values, parties and dates against real shipments skip in CI,
 * because the documents are not committed. This one runs everywhere: a synthetic CIPL goes
 * through parsing, reconciliation, the draft and the real blank form, and the whole filled
 * form is compared with the maps below. Their field names and formatting were read off one
 * run; every figure in them was then checked by hand against the shipment below. A box that
 * changes, appears or disappears fails the test, so a change to any of them is a deliberate
 * edit here, with the arithmetic beside it.
 *
 * The shipment (`simpleShipment`):
 *   8544.42.0000  Japan 4 @ $10, 1.200 kg; Malaysia 2 @ $25, 0.500 kg  -> foreign, 6, 1.700 kg, $90
 *   9031.49.8000  United States 1 @ $100, 1.700 kg                     -> domestic, 1, 1.700 kg, $100
 *   gross 1.32 + 0.55 + 1.87 = 3.740 kg in 2 cartons; dated July 28, 2026; consignee in Singapore.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

/** Fictitious throughout: no real exporter, person or number. */
const PROFILE: CompanyProfile = {
  usppiName: 'Example Exporter, Inc.',
  usppiAddressLines: ['100 Example Way', 'Exampleville CA 94000'],
  usppiZip: '94000',
  usppiEin: '00-0000000',
  contactName: 'Pat Example',
  contactPhone: '555-0100',
  pointOfOrigin: 'California',
  signerName: 'Pat Example',
  signerTitle: 'Shipping Lead',
  signerEmail: 'pat@example.com',
  signerPhone: '555-0101',
  signerInitials: 'PE',
}

const CONTROLLED = { eccn: 'EAR99', sme: 'N', license: 'NLR' }

const NIPPON_EXPECTED: Record<string, string> = {
  '1a. USPPI': 'Example Exporter, Inc.\r100 Example Way\rExampleville CA 94000\rPat Example / 555-0100',
  '1b USPPI IRS NO or ID NO': '00-0000000',
  'ZIP CODE': '94000',
  '1c1 PARTIES': 'RELATED',
  '2 DATE OF EXPORTATION': '07-28-2026',
  '4a2 ULTIMATE CONSIGNEE Complete name  address and contact name  tel if available':
    'Example Consignee Pte. Ltd.\r1 Example Road\rExampleton EX 100200\rSingapore',
  '4b2 CNEE TYPE': 'RESELLER',
  '5a FORWARDING AGENT': 'Nippon Express USA, Inc.',
  '6 POINT OF ORIGIN OR FTZ NO Must be 7digit Legacy or 9digit ACE format': 'California',
  '7 COUNTRY OF ULTIMATE DESTINATION': 'Singapore',
  '9a MODE': 'AIR',
  '16b HAZMAT': 'NO',
  '18b CONTAINER': 'NO',
  '20b RET': 'NO',
  INSURANCE: 'NO',
  FREIGHT: 'CC',
  JETPAK: 'NO',
  TERM: 'DD',
  INCOTERM: 'FOB',
  // Row 1: 8544.42.0000, foreign.
  '22.01 DF1': 'F',
  '22.02 SB1': '8544.42.0000',
  '22.03 sB UNIT1': '6',
  '22.04 UOM1': 'NO',
  '22.05 WEIGHT1': '1.700',
  '22.07 ECCN1': 'EAR99',
  '22.08 SME1': 'N',
  '22.09 LICENSE1': 'NLR',
  '22.10 VALUE1': '90.00',
  // Row 2: 9031.49.8000, domestic.
  '23.01 DF2': 'D',
  '23.02 SB2': '9031.49.8000',
  '23.03 SB UNI2': '1',
  '23.04UOM2': 'NO',
  '23.05WEIGHT2': '1.700',
  '23.07ECCN2': 'EAR99',
  '23.08SME2': 'N',
  '23.09LICENSE2': 'NLR',
  '23.10VALUE2': '100.00',
  '33c TITLE': 'Shipping Lead',
  '33e EMAIL ADDRESS': 'pat@example.com',
  '33f TEL': '555-0101',
  '33g DATE': '07-28-2026',
}

const CEVA_EXPECTED: Record<string, string> = {
  'U.S. Principle Party': 'Example Exporter, Inc.\r100 Example Way\rExampleville CA 94000',
  ZipCode: '94000',
  USPPI: '00-0000000',
  'Ultimate Consignee': 'Example Consignee Pte. Ltd.\r1 Example Road\rExampleton EX 100200\rSingapore',
  'Consignee PO': "00000001OP0010, 2 Add'l",
  'Point of Origin': 'California',
  'Country of Ultimate': 'Singapore',
  Air: 'X',
  Location: 'COLLECT',
  'D/F': 'F\rD',
  'Quantity Schedule B Unit': '6\r1',
  'Schedule B Number': '8544.42.0000 (Electrical Conductors)\r9031.49.8000 (Optical instruments)',
  'Shipping Weight': '1.700\r1.700',
  // "U.S. dollar, omit cents".
  Value: '90\r100',
  // 3.740 kg gross is 8.245 lb, filed whole.
  'Pieces & Dimensions': '2 cartons\r8 lbs / 3.740 Kg gross',
  'License No': 'NLR',
  'Duly Authorized': 'Pat Example',
  Title: 'Shipping Lead',
  Date: '07/28/2026',
  Date2: '07/28/2026',
  Related: 'checked',
  RESELLER: 'checked',
  FOB: 'checked',
  NO: 'checked',
  'COMMERCIAL INVOICE': 'checked',
  'DOES NOT CONTAIN DANGEROUS GOODS': 'PE',
}

let scheduleB: ScheduleBIndex
let document: ParsedCipl

beforeAll(async () => {
  scheduleB = createScheduleBIndex(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/schedule-b.json'), 'utf8')),
  )
  document = await parseCipl('synthetic.pdf', await buildSyntheticCipl(simpleShipment()))
}, 60_000)

/** Every filled value in a generated PDF, keyed by field name. */
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

async function fillSynthetic(carrier: 'nippon-express' | 'ceva', hazardous = false) {
  const adapter = getAdapter(carrier)
  const result = reconcile(document, scheduleB, { ...CONTROLLED, maxRows: adapter.maxCommodityRows })
  expect(result.canGenerate).toBe(true)
  const draft = buildDraft(result, PROFILE, defaultShipmentSettings(adapter), adapter)
  const blank = new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates', path.basename(adapter.templateUrl))))
  const filled = await adapter.fill(blank, { ...draft, hazardous })
  return { filled, values: await readBack(filled.bytes) }
}

describe('every box on the Nippon Express SLI', () => {
  it('matches the shipment, box for box', async () => {
    const { filled, values } = await fillSynthetic('nippon-express')
    expect(values).toEqual(NIPPON_EXPECTED)
    expect(filled.warnings).toEqual([])
  })

  it('declares dangerous goods when the shipment has them', async () => {
    const { values } = await fillSynthetic('nippon-express', true)
    // The form has a radio field per answer: 16a is YES, 16b is NO.
    expect(values['16a HAZMAT']).toBe('YES')
    expect(values['16b HAZMAT']).toBeUndefined()
  })
})

describe('every box on the CEVA SLI', () => {
  it('matches the shipment, box for box', async () => {
    const { filled, values } = await fillSynthetic('ceva')
    expect(values).toEqual(CEVA_EXPECTED)
    expect(filled.warnings).toEqual([])
  })

  it('declares dangerous goods when the shipment has them', async () => {
    const { values } = await fillSynthetic('ceva', true)
    expect(values['DOES CONTAIN DANGEROUS GOODS']).toBe('PE')
    expect(values['DOES NOT CONTAIN DANGEROUS GOODS']).toBeUndefined()
  })
})
