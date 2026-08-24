/**
 * Continuation pages for a one-page carrier form.
 *
 * A shipment with more commodity rows than the blank form holds used to be refused: the
 * reconciliation raised a blocking check and nothing came out. The forms themselves have
 * always been filed as several sheets in that case, so the tool now produces them.
 *
 * The whole problem is AcroForm field names. Copy a page and its widgets come with it, but
 * two widgets sharing a fully-qualified name are one field with one value — which is exactly
 * right for the parties and the signature block, and exactly wrong for the commodity table,
 * where page 2 row 1 would show whatever page 1 row 1 says.
 *
 * So that property is used rather than fought:
 *
 *   - **Everything but the commodity rows keeps its name.** One field owns a widget on every
 *     page, so a correction to the consignee on page 3 shows on page 1 as well. This is
 *     native reader behaviour, not something the app has to maintain.
 *   - **The commodity rows are renamed per page.** Each page's rows become their own fields,
 *     independent of every other page's.
 *
 * What makes that cheap is the shape of the templates. The Nippon form names its commodity
 * fields hierarchically — `22.02 SB1` is the field `02 SB1` under the row node `22` — so a
 * page's eight rows are renamed by renaming eight nodes. The CEVA form is flat and its five
 * commodity columns are top-level fields, renamed directly. Both are "rename these roots".
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, StandardFonts } from 'pdf-lib'
import type { PDFAcroForm, PDFContext, PDFForm } from 'pdf-lib'

export { pagesNeeded, rowsByPage } from '../lib/pagination'

/**
 * Entries that belong to the widget annotation rather than to the field, used when a
 * single-widget field has to be split so it can own a widget on more than one page.
 *
 * `DA` is deliberately absent from both this list and `FIELD_ONLY`: it is meaningful on a
 * field *and* on a widget, and a text field that loses it renders its value in no font at all.
 */
const WIDGET_ONLY = [
  'Type', 'Subtype', 'Rect', 'MK', 'F', 'P', 'AP', 'AS', 'BS', 'Border', 'H', 'A', 'AA',
  'StructParent', 'BM', 'C',
]

/** Entries that belong to the field rather than to any one of its widgets. */
const FIELD_ONLY = ['FT', 'T', 'TU', 'TM', 'Ff', 'V', 'DV', 'MaxLen', 'Q', 'Opt', 'I']

/**
 * An entry of a `/Kids` or `/Fields` array as the reference it is.
 *
 * Both arrays hold indirect references by definition — a field has to be shareable between
 * a page's annotations and the form's field tree — but the reader types their entries as
 * plain objects.
 */
function asRef(entry: unknown): PDFRef {
  return entry as PDFRef
}

/** The partial name a field node contributes, or null where it contributes none. */
function partialName(dict: PDFDict): string | null {
  const value = dict.get(PDFName.of('T'))
  return value && 'decodeText' in value ? (value as PDFString).decodeText() : null
}

function kidsOf(ctx: PDFContext, dict: PDFDict): PDFArray | undefined {
  return ctx.lookupMaybe(dict.get(PDFName.of('Kids')), PDFArray)
}

/**
 * Whether a node is a *terminal* field — one that holds a value — rather than a namespace
 * above other fields.
 *
 * Decided on whether any child contributes a name component, and on nothing else. A field
 * with a single widget has that widget merged into its own dictionary, so it appears as a
 * named child with `/Subtype /Widget`; reading the subtype instead treats `1a` as terminal
 * and never reaches the ` USPPI` beneath it.
 */
function isTerminal(ctx: PDFContext, dict: PDFDict): boolean {
  const kids = kidsOf(ctx, dict)
  if (!kids) return true
  for (let i = 0; i < kids.size(); i++) {
    if (partialName(ctx.lookup(kids.get(i), PDFDict)) !== null) return false
  }
  return true
}

interface Node {
  ref: PDFRef
  dict: PDFDict
}

/** Every terminal field at or below `ref`, keyed by fully-qualified name. */
function terminalsUnder(ctx: PDFContext, ref: PDFRef, prefix: string, out: Map<string, Node>): Map<string, Node> {
  const dict = ctx.lookup(ref, PDFDict)
  const own = partialName(dict)
  const qualified = own === null ? prefix : prefix ? `${prefix}.${own}` : own
  if (isTerminal(ctx, dict)) {
    out.set(qualified, { ref, dict })
    return out
  }
  const kids = kidsOf(ctx, dict)
  if (kids) for (let i = 0; i < kids.size(); i++) terminalsUnder(ctx, asRef(kids.get(i)), qualified, out)
  return out
}

/** The top of the field tree an annotation hangs from. */
function rootOf(ctx: PDFContext, annot: PDFRef): { ref: PDFRef; dict: PDFDict; name: string } {
  let ref = annot
  let dict = ctx.lookup(annot, PDFDict)
  // Bounded: a malformed file can point a parent chain back at itself, and this runs over
  // every annotation on every page.
  for (let hops = 0; hops < 32; hops++) {
    const parent = dict.get(PDFName.of('Parent'))
    if (!(parent instanceof PDFRef)) break
    ref = parent
    dict = ctx.lookup(parent, PDFDict)
  }
  return { ref, dict, name: partialName(dict) ?? '' }
}

/**
 * Give a single-widget field a field dictionary of its own, so it can own a widget on every
 * page instead of being one.
 *
 * Returns the node to treat as the field from now on. A dictionary that is both a field and
 * a widget may only have the one widget — the format says so — so a field about to acquire a
 * second has to be separated from the first.
 */
function splitMergedWidget(ctx: PDFContext, node: Node): Node & { replaced?: PDFRef } {
  if (!node.dict.has(PDFName.of('Rect')) || node.dict.has(PDFName.of('Kids'))) return node

  const fieldDict = ctx.obj({}) as PDFDict
  for (const [key, value] of node.dict.entries()) {
    if (!WIDGET_ONLY.includes(key.decodeText())) fieldDict.set(key, value)
  }
  for (const key of FIELD_ONLY) node.dict.delete(PDFName.of(key))

  const parent = node.dict.get(PDFName.of('Parent'))
  if (parent) fieldDict.set(PDFName.of('Parent'), parent)

  const fieldRef = ctx.register(fieldDict)
  node.dict.set(PDFName.of('Parent'), fieldRef)
  fieldDict.set(PDFName.of('Kids'), ctx.obj([node.ref]))
  return { ref: fieldRef, dict: fieldDict, replaced: node.ref }
}

/** Point whatever referenced the old merged dictionary at the field that replaced it. */
function relink(ctx: PDFContext, acro: PDFAcroForm, oldRef: PDFRef, replacement: Node): void {
  const parent = replacement.dict.get(PDFName.of('Parent'))
  const list =
    parent instanceof PDFRef
      ? ctx.lookup(ctx.lookup(parent, PDFDict).get(PDFName.of('Kids')), PDFArray)
      : ctx.lookup(acro.dict.get(PDFName.of('Fields')), PDFArray)
  for (let i = 0; i < list.size(); i++) {
    if (list.get(i).toString() === oldRef.toString()) {
      list.set(i, replacement.ref)
      return
    }
  }
}

export interface PaginatedForm {
  doc: PDFDocument
  form: PDFForm
  pageCount: number
  /**
   * The name a template field goes by on a given page.
   *
   * Identity for page 0, and for every field that is not page-specific on any page — those
   * are one field with a widget per page, and writing to the single name fills them all.
   */
  fieldName(templateName: string, pageIndex: number): string
}

/**
 * The template, extended to `pageCount` sheets, with `perPageRoots` renamed per sheet and
 * everything else shared.
 *
 * `perPageRoots` are *root* field names: the row nodes on a hierarchical form, or the fields
 * themselves on a flat one. A template field is page-specific when its name is one of them
 * or begins with one followed by a dot.
 */
export async function paginateForm(
  templateBytes: Uint8Array,
  pageCount: number,
  perPageRoots: readonly string[],
): Promise<PaginatedForm> {
  // The template *is* the document, rather than a page copied into a new one.
  //
  // Its AcroForm carries the resource dictionary the fields render with, the default
  // appearance and the signature flags, and every reference inside those points at an object
  // in the template's own numbering. Copying that dictionary into a document built from
  // scratch carries the references without the objects, so `/Arial 15 0 R` resolves to
  // whatever object 15 happens to be there — and a reader regenerating an appearance, which
  // is what happens the moment somebody edits the shared consignee box, finds no font.
  //
  // Starting from the template also means a shipment that fits one sheet is filled exactly as
  // it was before any of this existed: nothing below runs.
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true, updateMetadata: false })
  const sheets = Math.max(1, pageCount)
  const roots = new Set(perPageRoots)

  const fieldName = (templateName: string, pageIndex: number): string => {
    if (pageIndex === 0) return templateName
    const root = [...roots].find((r) => templateName === r || templateName.startsWith(`${r}.`))
    if (!root) return templateName
    return pageSuffixed(root, pageIndex) + templateName.slice(root.length)
  }

  if (sheets === 1) return { doc, form: doc.getForm(), pageCount: 1, fieldName }

  const ctx = doc.context
  const acro = doc.getForm().acroForm

  /** Page 1's terminal fields, which the later sheets hand their widgets to. */
  const shared = new Map<string, Node>()
  for (const root of rootsOnPage(ctx, doc, 0)) {
    if (roots.has(root.name)) continue
    for (const [name, node] of terminalsUnder(ctx, root.ref, '', new Map())) shared.set(name, node)
  }

  for (let pageIndex = 1; pageIndex < sheets; pageIndex++) {
    // A fresh load per sheet. Copying the same source page twice would hand both copies the
    // same annotation objects, and renaming one sheet's rows would rename the other's.
    const source = await PDFDocument.load(templateBytes, { ignoreEncryption: true, updateMetadata: false })
    const [page] = await doc.copyPages(source, [0])
    doc.addPage(page)

    for (const root of rootsOnPage(ctx, doc, pageIndex)) {
      if (roots.has(root.name)) {
        root.dict.set(PDFName.of('T'), PDFString.of(pageSuffixed(root.name, pageIndex)))
        acro.addField(root.ref)
        continue
      }

      // A later sheet's copy of a shared field. Each of its terminals hands its widgets to
      // page 1's field of the same name, and the copy itself is left unregistered.
      for (const [name, node] of terminalsUnder(ctx, root.ref, '', new Map())) {
        const target = shared.get(name)
        if (!target) {
          // A field page 1 does not have. Registered under its own name rather than dropped,
          // so nothing the template carries goes missing.
          acro.addField(root.ref)
          break
        }
        const field = splitMergedWidget(ctx, target)
        if (field.replaced) {
          relink(ctx, acro, field.replaced, field)
          shared.set(name, { ref: field.ref, dict: field.dict })
        }
        const kids = ctx.lookup(field.dict.get(PDFName.of('Kids')), PDFArray)
        const incoming = kidsOf(ctx, node.dict)
        if (incoming) {
          for (let i = 0; i < incoming.size(); i++) {
            ctx.lookup(incoming.get(i), PDFDict).set(PDFName.of('Parent'), field.ref)
            kids.push(incoming.get(i))
          }
        } else {
          for (const key of FIELD_ONLY) node.dict.delete(PDFName.of(key))
          node.dict.set(PDFName.of('Parent'), field.ref)
          kids.push(node.ref)
        }
      }
    }
  }

  return { doc, form: doc.getForm(), pageCount: sheets, fieldName }
}

/**
 * The distinct field-tree roots a page's annotations hang from.
 *
 * Collected before the caller changes anything. Re-parenting a widget rewrites the chain the
 * next widget would walk, so a pass that mutates as it goes reaches page 1's field from
 * page 2's second widget and folds an array into itself.
 */
function rootsOnPage(ctx: PDFContext, doc: PDFDocument, pageIndex: number): ReturnType<typeof rootOf>[] {
  const annots = doc.getPage(pageIndex).node.Annots()
  if (!annots) return []
  const found = new Map<string, ReturnType<typeof rootOf>>()
  for (let i = 0; i < annots.size(); i++) {
    const root = rootOf(ctx, asRef(annots.get(i)))
    if (!found.has(root.ref.toString())) found.set(root.ref.toString(), root)
  }
  return [...found.values()]
}

/**
 * The renamed form of a row node on a continuation page.
 *
 * Two underscores and a page number: `.` is the separator between name components and would
 * make the row a child of something, and the suffix has to be one no template field already
 * ends with.
 */
function pageSuffixed(root: string, pageIndex: number): string {
  return `${root}__p${pageIndex + 1}`
}

/**
 * Number the sheets, bottom right.
 *
 * Only where there is more than one: a single-page form is the form the carrier issued, and
 * "Page 1 of 1" printed on it is this tool leaving a mark for no reason.
 */
export async function stampPageNumbers(doc: PDFDocument): Promise<void> {
  const pages = doc.getPages()
  if (pages.length < 2) return
  const font = await doc.embedFont(StandardFonts.Helvetica)
  pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    const size = 8
    page.drawText(label, {
      x: page.getWidth() - font.widthOfTextAtSize(label, size) - 24,
      y: 14,
      size,
      font,
    })
  })
}
