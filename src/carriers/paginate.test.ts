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
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream, type PDFPage } from 'pdf-lib'
import { pagesNeeded, paginateForm, rowsByPage, stampPageNumbers } from './paginate'
import { NIPPON_ROW_ROOTS } from './nippon-express/fields'
import { CEVA_COMMODITY_FIELDS } from './ceva/fields'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const template = (name: string) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public/templates', name)))

const names = (doc: PDFDocument) => doc.getForm().getFields().map((f) => f.getName())

/**
 * The page numbers actually drawn on the sheets, read back off the content streams.
 *
 * `drawText` appends a stream of its own and writes the label as a hex string, so this looks
 * for `<hex> Tj` and keeps what reads as a page number. Counting pages proves the sheets
 * exist; this proves they say which of them the reader is holding.
 */
function stamps(doc: PDFDocument): string[] {
  const found: string[] = []
  for (const page of doc.getPages()) {
    const contents = page.node.Contents()
    const entries = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    for (const entry of entries) {
      const stream = doc.context.lookup(entry)
      if (!(stream instanceof PDFRawStream)) continue
      const text = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
      for (const [, hex] of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const label = (hex.match(/../g) ?? []).map((byte) => String.fromCharCode(parseInt(byte, 16))).join('')
        if (label.startsWith('Page ')) found.push(label)
      }
    }
  }
  return found
}

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

describe('what the form needs to render itself', () => {
  it('keeps the template’s own resources, so an edited field still has a font', async () => {
    // The paginated document *is* the template rather than a page copied into a new one.
    // Copying the resource dictionary across contexts carries its references without the
    // objects — `/Helv 16 0 R` then resolves to whatever object 16 happens to be — and a
    // reader regenerating an appearance, which is what happens the moment somebody edits the
    // shared consignee box, finds no font. That is this feature's headline behaviour.
    const { doc, form } = await paginateForm(template('nippon-express-sli.pdf'), 2, NIPPON_ROW_ROOTS)
    form.getTextField('1a. USPPI').setText('Edited on either page')
    const back = await reload(doc)

    const acro = back.getForm().acroForm.dict
    const resources = back.context.lookup(acro.get(PDFName.of('DR')), PDFDict)
    const fonts = back.context.lookup(resources.get(PDFName.of('Font')), PDFDict)
    expect(fonts.entries().length).toBeGreaterThan(0)
    for (const [name] of fonts.entries()) {
      const resolved = back.context.lookup(fonts.get(name))
      expect(resolved, name.decodeText()).toBeInstanceOf(PDFDict)
    }
    // And the flags the template carried are still on it.
    expect(acro.get(PDFName.of('DA'))).toBeDefined()
    expect(acro.get(PDFName.of('SigFlags'))).toBeDefined()
  })

  it('leaves a single-sheet form’s field tree exactly as the template names it', async () => {
    // Nothing restructures when the rows fit, so a one-page shipment is filled exactly as it
    // was before continuation pages existed: the same fields, in the same order, each still
    // owning the widgets the template gave it. (Not byte-for-byte — `stripActiveContent`
    // runs on every form. That is asserted separately below.)
    const single = await paginateForm(template('nippon-express-sli.pdf'), 1, NIPPON_ROW_ROOTS)
    const direct = await PDFDocument.load(template('nippon-express-sli.pdf'), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    expect(names(single.doc)).toEqual(names(direct))
    expect(single.doc.getPageCount()).toBe(1)

    const widgets = (doc: PDFDocument) =>
      doc.getForm().getFields().map((f) => [f.getName(), f.acroField.getWidgets().length])
    expect(widgets(single.doc)).toEqual(widgets(direct))
  })

  it('asks for no more sheets than it can count', async () => {
    // `Math.max(1, NaN)` is `NaN`. A page count that arrived as one — a row total divided by
    // a template's row capacity, where the capacity was missing — clamped to nothing at all,
    // and the loop that adds sheets ran zero times while the result claimed however many.
    for (const count of [Number.NaN, 0, -3]) {
      const { doc, pageCount } = await paginateForm(template('ceva-sli.pdf'), count, CEVA_COMMODITY_FIELDS)
      expect(pageCount, String(count)).toBe(1)
      expect(doc.getPageCount(), String(count)).toBe(1)
    }
  })

  it('numbers the sheet it just appended, not the template’s own second page', async () => {
    // The paginated document *is* the template, so a sheet is appended after whatever pages
    // the template already had. Indexing by the loop counter instead walked one of those and
    // left the copy just made unprocessed — its rows unnamed, its widgets in no field.
    const twoPage = await PDFDocument.load(template('nippon-express-sli.pdf'), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    twoPage.insertPage(1)
    const { doc, form, fieldName } = await paginateForm(
      new Uint8Array(await twoPage.save()),
      2,
      NIPPON_ROW_ROOTS,
    )
    // The template's two pages, and the continuation sheet after them.
    expect(doc.getPageCount()).toBe(3)
    form.getTextField(fieldName('22.02 SB1', 0)).setText('8544.42.0000')
    form.getTextField(fieldName('22.02 SB1', 1)).setText('9031.90.0000')

    const back = (await reload(doc)).getForm()
    expect(back.getTextField(fieldName('22.02 SB1', 0)).getText()).toBe('8544.42.0000')
    expect(back.getTextField(fieldName('22.02 SB1', 1)).getText()).toBe('9031.90.0000')
  })
})

/**
 * Field dictionaries nothing in the document can reach: not `/Fields`, not any page's
 * `/Annots`, not any widget's `/Parent`. pdf-lib writes unreachable objects, so these ship
 * inside the filed PDF.
 *
 * A field is told from the rest by its `/T` being a *name* — the template's linearization
 * dictionary has a `/T` too, and it is a byte offset.
 */
function strandedFields(doc: PDFDocument): string[] {
  const reachable = new Set<string>()
  const walk = (ref: unknown) => {
    const key = String(ref)
    if (reachable.has(key)) return
    reachable.add(key)
    const dict = doc.context.lookupMaybe(ref as never, PDFDict)
    const kids = dict && doc.context.lookupMaybe(dict.get(PDFName.of('Kids')), PDFArray)
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.get(i))
  }
  const fields = doc.context.lookup(doc.getForm().acroForm.dict.get(PDFName.of('Fields')), PDFArray)
  for (let i = 0; i < fields.size(); i++) walk(fields.get(i))
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (annots) for (let i = 0; i < annots.size(); i++) walk(annots.get(i))
  }

  const named: string[] = []
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || reachable.has(String(ref))) continue
    const title = object.get(PDFName.of('T'))
    if (title instanceof PDFString || title instanceof PDFHexString) named.push(title.decodeText())
  }
  return named
}

describe('what the template carries that a filed form should not', () => {
  const javaScript = (doc: PDFDocument): PDFDict | undefined => {
    const names = doc.context.lookupMaybe(doc.catalog.get(PDFName.of('Names')), PDFDict)
    return names && doc.context.lookupMaybe(names.get(PDFName.of('JavaScript')), PDFDict)
  }

  it('the CEVA template really does carry document-level JavaScript', async () => {
    // Asserted about the blank template so that the removal below is proved to remove
    // something. A template revision that arrives without it should not quietly turn the
    // next test into one that passes by having nothing to do.
    const blank = await PDFDocument.load(template('ceva-sli.pdf'), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    expect(javaScript(blank)).toBeInstanceOf(PDFDict)
  })

  it('leaves no document-level JavaScript in a form it produces', async () => {
    // One of the four scripts is Adobe's version check, which ends in
    // `this.getURL("http://cgi.adobe.com/special/acrobat/update" + …)` on a reader older
    // than 6.02. A filed SLI is a signed declaration this tool promises stays on the
    // machine; it should not ship with an outbound path in it whatever the reader.
    for (const sheets of [1, 2]) {
      const { doc } = await paginateForm(template('ceva-sli.pdf'), sheets, CEVA_COMMODITY_FIELDS)
      expect(javaScript(doc), `${sheets} sheet(s)`).toBeUndefined()
      expect(javaScript(await reload(doc)), `${sheets} sheet(s), saved`).toBeUndefined()
      expect(doc.catalog.get(PDFName.of('OpenAction'))).toBeUndefined()
    }
  })

  it('drops the page labels once there is more than one sheet', async () => {
    // The CEVA template labels its pages with the literal `1` and no numbering style, so
    // every sheet would be page "1" in the reader's page box while the corner of the paper
    // says 2 of 3.
    const single = await paginateForm(template('ceva-sli.pdf'), 1, CEVA_COMMODITY_FIELDS)
    expect(single.doc.catalog.get(PDFName.of('PageLabels'))).toBeDefined()
    const paged = await paginateForm(template('ceva-sli.pdf'), 2, CEVA_COMMODITY_FIELDS)
    expect(paged.doc.catalog.get(PDFName.of('PageLabels'))).toBeUndefined()
  })

  it('keeps a radio group’s export values as long as its widgets', async () => {
    // `/Opt[i]` is the export value of `Kids[i]` (PDF 32000-1 §12.7.4.2.1). A field that gains
    // widgets without gaining entries leaves every widget on a continuation sheet without one,
    // and a reader resolving a tick by kid index gets nothing back for a selection made there.
    const { doc } = await paginateForm(template('nippon-express-sli.pdf'), 3, NIPPON_ROW_ROOTS)
    const withOptions = doc
      .getForm()
      .getFields()
      .map((field) => ({
        name: field.getName(),
        widgets: field.acroField.getWidgets().length,
        options: doc.context.lookupMaybe(field.acroField.dict.get(PDFName.of('Opt')), PDFArray)?.size(),
      }))
      .filter((field) => field.options !== undefined)

    // The template has two of them; if a revision drops both, this test stops testing anything.
    expect(withOptions.length).toBeGreaterThan(0)
    for (const field of withOptions) expect(field.options, field.name).toBe(field.widgets)
  })

  it('leaves no field dictionary behind that nothing can reach', async () => {
    // A continuation sheet arrives with its own copy of every shared field. Those copies hand
    // their widgets to page 1's fields and are then referenced by nothing — not `/Fields`, not
    // `/Annots`, not any widget's `/Parent` — and pdf-lib writes unreachable objects, so left
    // alone they ship inside the filed PDF.
    const paged = await paginateForm(template('nippon-express-sli.pdf'), 3, NIPPON_ROW_ROOTS)
    const single = await paginateForm(template('nippon-express-sli.pdf'), 1, NIPPON_ROW_ROOTS)
    // Against the one-sheet form rather than against zero, so the template's own housekeeping
    // is not read as this code's litter: it carries a linearization dictionary whose `/T` is a
    // byte offset, not a name.
    expect(strandedFields(paged.doc)).toEqual(strandedFields(single.doc))
    expect(strandedFields(single.doc)).toEqual([])
  })

  it('does not let a continuation sheet claim the first sheet’s tagging index', async () => {
    // A copied page carries the `/StructParents` of the page it came from, and two pages
    // cannot both be structure element 0. Nothing re-tags the copy, so it says it is
    // untagged, which is what it is.
    const { doc } = await paginateForm(template('nippon-express-sli.pdf'), 2, NIPPON_ROW_ROOTS)
    expect(doc.getPage(0).node.get(PDFName.of('StructParents'))).toBeDefined()
    expect(doc.getPage(1).node.get(PDFName.of('StructParents'))).toBeUndefined()
  })
})

/**
 * Two shapes neither carrier template has.
 *
 * Everything else here runs against the real blanks, because what is being tested is a
 * property of those files. These two are the opposite case: the code has to behave when a
 * template revision brings a shape the current ones do not, and the only way to put one in
 * front of it is to build it.
 */
describe('shapes the shipped templates do not have', () => {
  async function builtForm(extra: (doc: PDFDocument, page: PDFPage) => void = () => {}): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 300])
    const form = doc.getForm()
    const rows = form.createTextField('Row')
    rows.addToPage(page, { x: 10, y: 200, width: 200, height: 20 })
    const shared = form.createTextField('Consignee')
    shared.addToPage(page, { x: 10, y: 160, width: 200, height: 20 })
    extra(doc, page)
    return doc.save()
  }

  it('leaves a dropdown’s list of items alone', async () => {
    // `/Opt` means one entry per kid on a radio group and the list of selectable items on a
    // choice field. Extending it on sight would offer the filer the first item once per sheet,
    // in a box they pick a declaration value from.
    const bytes = await builtForm((doc, page) => {
      const terms = doc.getForm().createDropdown('Terms')
      terms.setOptions(['FOB', 'CIF', 'DAP'])
      terms.addToPage(page, { x: 10, y: 120, width: 200, height: 20 })
    })
    const { doc, form } = await paginateForm(bytes, 3, ['Row'])
    const terms = form.getDropdown('Terms')
    expect(terms.getOptions()).toEqual(['FOB', 'CIF', 'DAP'])
    // Shared like any other box: one field, a widget on each sheet.
    expect(terms.acroField.getWidgets()).toHaveLength(3)
    expect(doc.getPageCount()).toBe(3)
  })

  it('leaves an annotation that is not a form widget out of the field tree', async () => {
    // A link in the footer is the ordinary case. Walked as a field it resolves to the empty
    // name, is split into an orphan dictionary nothing registers, and every sheet’s copy is
    // parented onto it.
    const bytes = await builtForm((doc, page) => {
      page.node.addAnnot(
        doc.context.register(
          doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 30], Border: [0, 0, 0] }),
        ),
      )
    })
    const { doc, form, fieldName } = await paginateForm(bytes, 2, ['Row'])
    expect(names(doc).sort()).toEqual(['Consignee', 'Row', 'Row__p2'])
    expect(strandedFields(doc)).toEqual([])

    // The link is still a link: nothing adopted it into a field, on either sheet.
    for (const page of doc.getPages()) {
      const annots = page.node.Annots()!
      const links = []
      for (let i = 0; i < annots.size(); i++) {
        const annot = doc.context.lookup(annots.get(i), PDFDict)
        if (String(annot.get(PDFName.of('Subtype'))) === '/Link') links.push(annot)
      }
      expect(links, `page ${doc.getPages().indexOf(page)}`).toHaveLength(1)
      expect(links[0].get(PDFName.of('Parent'))).toBeUndefined()
    }

    // And the form still works either side of it.
    form.getTextField(fieldName('Row', 0)).setText('sheet one')
    form.getTextField(fieldName('Row', 1)).setText('sheet two')
    form.getTextField('Consignee').setText('both sheets')
    const back = (await reload(doc)).getForm()
    expect(back.getTextField('Row').getText()).toBe('sheet one')
    expect(back.getTextField('Row__p2').getText()).toBe('sheet two')
    expect(back.getTextField('Consignee').acroField.getWidgets()).toHaveLength(2)
  })
})

describe('numbering the sheets', () => {
  it('numbers each sheet where there is more than one, without being asked', async () => {
    // `paginateForm` does this itself. Nothing about a filled form shows an unnumbered
    // continuation sheet — the field values read back identically — so an adapter that had to
    // remember a second call would ship sheets with no way to tell which is which.
    const { doc } = await paginateForm(template('ceva-sli.pdf'), 3, CEVA_COMMODITY_FIELDS)
    const reloaded = await reload(doc)
    expect(reloaded.getPageCount()).toBe(3)
    expect(stamps(reloaded)).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3'])
  })

  it('says nothing on a single-page form', async () => {
    // A one-page form is the form the carrier issued, and "Page 1 of 1" printed on it is this
    // tool leaving a mark for no reason. Nothing drawn, so nothing embedded either.
    const { doc } = await paginateForm(template('ceva-sli.pdf'), 1, CEVA_COMMODITY_FIELDS)
    expect(stamps(await reload(doc))).toEqual([])
    // Nor does asking again change anything: it embeds no font and draws no stream, so a form
    // the carrier issued comes back the size it went in.
    const before = (await doc.save()).length
    await stampPageNumbers(doc)
    expect((await doc.save()).length).toBeLessThanOrEqual(before + 64)
  })

  it('stamps a form filled through the adapter, on the sheets the shipment needed', async () => {
    // Through the door the app actually uses, so nothing between the pagination and the saved
    // bytes can drop it.
    const { doc } = await paginateForm(template('nippon-express-sli.pdf'), 2, NIPPON_ROW_ROOTS)
    expect(stamps(await reload(doc))).toEqual(['Page 1 of 2', 'Page 2 of 2'])
  })
})
