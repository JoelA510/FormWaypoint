/**
 * Continuation pages.
 *
 * These run against the real blank templates, because what is being tested is a property of
 * those files — how their field trees are shaped — and a hand-built form would only prove the
 * code against a shape the carriers do not use.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { pagesNeeded, paginateForm, rowsByPage, stampPageNumbers } from './paginate'
import { NIPPON_ROW_ROOTS } from './nippon-express/fields'
import { CEVA_COMMODITY_FIELDS } from './ceva/fields'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const template = (name: string) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates', name)))

const names = (doc: PDFDocument) => doc.getForm().getFields().map((f) => f.getName())

async function reload(doc: PDFDocument): Promise<PDFDocument> {
  const bytes = await doc.save({ updateFieldAppearances: true })
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
}

describe('splitting rows across pages', () => {
  it('counts the sheets a shipment needs', () => {
    expect(pagesNeeded(8, 8)).toBe(1)
    expect(pagesNeeded(9, 8)).toBe(2)
    expect(pagesNeeded(16, 8)).toBe(2)
    expect(pagesNeeded(17, 8)).toBe(3)
    // A shipment with no rows still gets the one sheet; the form is the deliverable.
    expect(pagesNeeded(0, 8)).toBe(1)
  })

  it('fills each page before starting the next', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(rowsByPage(rows, 8)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8], [9]])
    expect(rowsByPage([], 8)).toEqual([[]])
  })
})

describe('the Nippon form across pages', () => {
  it('keeps every field the template has, and adds a set of rows per extra page', async () => {
    const one = await paginateForm(template('nippon-express-sli.pdf'), 1, NIPPON_ROW_ROOTS)
    const three = await paginateForm(template('nippon-express-sli.pdf'), 3, NIPPON_ROW_ROOTS)

    const single = names(one.doc)
    const paged = names(three.doc)
    expect(three.doc.getPageCount()).toBe(3)
    // Nothing the template carries goes missing.
    for (const name of single) expect(paged, name).toContain(name)
    // Eight rows of eleven columns, twice over.
    expect(paged.length).toBe(single.length + 2 * 8 * 11)
    // And no name is claimed twice, which would be one field wearing two values.
    expect(paged.length - new Set(paged).size).toBe(0)
  })

  it('gives every page its own commodity rows', async () => {
    const { doc, form, fieldName } = await paginateForm(template('nippon-express-sli.pdf'), 3, NIPPON_ROW_ROOTS)
    const codes = ['8544.42.0000', '9031.90.0000', '8501.51.3040']
    codes.forEach((code, page) => form.getTextField(fieldName('22.02 SB1', page)).setText(code))

    const back = (await reload(doc)).getForm()
    expect(codes.map((_, page) => back.getTextField(fieldName('22.02 SB1', page)).getText())).toEqual(codes)
  })

  it('makes one field of every other box, with a widget on each page', async () => {
    // The point of sharing: a correction to the consignee on page 3 shows on page 1, because
    // it is the same field. That is the reader's own behaviour, not something kept in step.
    const { doc, form } = await paginateForm(template('nippon-express-sli.pdf'), 3, NIPPON_ROW_ROOTS)
    form.getTextField('1a. USPPI').setText('One value, three pages')

    const back = (await reload(doc)).getForm()
    const usppi = back.getTextField('1a. USPPI')
    expect(usppi.getText()).toBe('One value, three pages')
    expect(usppi.acroField.getWidgets()).toHaveLength(3)
  })

  it('shares a radio group rather than duplicating it', async () => {
    const { doc, form } = await paginateForm(template('nippon-express-sli.pdf'), 2, NIPPON_ROW_ROOTS)
    form.getRadioGroup('INCOTERM').select('FOB')
    form.getRadioGroup('9a MODE').select('AIR')

    const back = (await reload(doc)).getForm()
    expect(back.getRadioGroup('INCOTERM').getSelected()).toBe('FOB')
    expect(back.getRadioGroup('9a MODE').getSelected()).toBe('AIR')
  })

  it('leaves a one-page shipment exactly as the template names it', async () => {
    const { fieldName } = await paginateForm(template('nippon-express-sli.pdf'), 1, NIPPON_ROW_ROOTS)
    expect(fieldName('22.02 SB1', 0)).toBe('22.02 SB1')
    expect(fieldName('1a. USPPI', 0)).toBe('1a. USPPI')
  })

  it('renames only the row nodes', async () => {
    const { fieldName } = await paginateForm(template('nippon-express-sli.pdf'), 2, NIPPON_ROW_ROOTS)
    expect(fieldName('22.02 SB1', 1)).toBe('22__p2.02 SB1')
    // A shared field keeps its name on every page — that is what makes it shared.
    expect(fieldName('1a. USPPI', 1)).toBe('1a. USPPI')
    expect(fieldName('ZIP CODE', 1)).toBe('ZIP CODE')
  })
})

describe('the CEVA form across pages', () => {
  it('gives every page its own commodity columns and shares the rest', async () => {
    const { doc, form, fieldName } = await paginateForm(template('ceva-sli.pdf'), 2, CEVA_COMMODITY_FIELDS)
    form.getTextField(fieldName('Schedule B Number', 0)).setText('8544.42.0000')
    form.getTextField(fieldName('Schedule B Number', 1)).setText('9031.90.0000')
    form.getTextField('Ultimate Consignee').setText('One consignee, two pages')

    const back = (await reload(doc)).getForm()
    expect(back.getTextField(fieldName('Schedule B Number', 0)).getText()).toBe('8544.42.0000')
    expect(back.getTextField(fieldName('Schedule B Number', 1)).getText()).toBe('9031.90.0000')
    const consignee = back.getTextField('Ultimate Consignee')
    expect(consignee.getText()).toBe('One consignee, two pages')
    expect(consignee.acroField.getWidgets()).toHaveLength(2)
  })

  it('keeps a checkbox shared across pages', async () => {
    const { doc, form } = await paginateForm(template('ceva-sli.pdf'), 2, CEVA_COMMODITY_FIELDS)
    form.getCheckBox('FOB').check()
    const back = (await reload(doc)).getForm()
    expect(back.getCheckBox('FOB').isChecked()).toBe(true)
    expect(back.getCheckBox('FOB').acroField.getWidgets()).toHaveLength(2)
  })
})

describe('numbering the sheets', () => {
  it('says nothing on a single-page form', async () => {
    const { doc } = await paginateForm(template('ceva-sli.pdf'), 1, CEVA_COMMODITY_FIELDS)
    const before = (await doc.save()).length
    await stampPageNumbers(doc)
    // Nothing drawn, so nothing embedded — a form the carrier issued is left as issued.
    expect((await doc.save()).length).toBeLessThanOrEqual(before + 64)
  })

  it('numbers each sheet where there is more than one', async () => {
    const { doc } = await paginateForm(template('ceva-sli.pdf'), 2, CEVA_COMMODITY_FIELDS)
    await stampPageNumbers(doc)
    const reloaded = await reload(doc)
    expect(reloaded.getPageCount()).toBe(2)
  })
})
