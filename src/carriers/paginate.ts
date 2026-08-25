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
import type { PDFAcroForm, PDFContext, PDFForm, PDFPage } from 'pdf-lib'

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

/**
 * Every terminal field at or below `ref`, keyed by fully-qualified name.
 *
 * `seen` bounds the walk the way the hop counts bound the upward ones: a `/Kids` array that
 * contains an ancestor is a malformed file, not an impossible one, and this runs over every
 * root on every page — unbounded, one such node takes the browser tab down with the stack.
 */
function terminalsUnder(
  ctx: PDFContext,
  ref: PDFRef,
  prefix: string,
  out: Map<string, Node>,
  seen: Set<string> = new Set(),
): Map<string, Node> {
  if (seen.has(ref.toString())) return out
  seen.add(ref.toString())
  const dict = ctx.lookup(ref, PDFDict)
  const own = partialName(dict)
  const qualified = own === null ? prefix : prefix ? `${prefix}.${own}` : own
  if (isTerminal(ctx, dict)) {
    out.set(qualified, { ref, dict })
    return out
  }
  const kids = kidsOf(ctx, dict)
  if (kids) for (let i = 0; i < kids.size(); i++) terminalsUnder(ctx, asRef(kids.get(i)), qualified, out, seen)
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

/** Every field-tree node at or below `ref`, the node itself included. Bounded like `terminalsUnder`. */
function refsUnder(ctx: PDFContext, ref: PDFRef, out: PDFRef[], seen: Set<string> = new Set()): PDFRef[] {
  if (seen.has(ref.toString())) return out
  seen.add(ref.toString())
  out.push(ref)
  const kids = kidsOf(ctx, ctx.lookup(ref, PDFDict))
  if (kids) for (let i = 0; i < kids.size(); i++) refsUnder(ctx, asRef(kids.get(i)), out, seen)
  return out
}

/**
 * Keep a *button* field's `/Opt` array as long as its `/Kids`.
 *
 * On a radio group `/Opt[i]` is the export value of `Kids[i]` (PDF 32000-1 §12.7.4.2.1), so a
 * field that gains widgets without gaining entries leaves every widget on a continuation sheet
 * without one — and a reader that resolves a tick by kid index gets nothing back for a
 * selection made on page 2.
 *
 * On a *choice* field the same key means something else entirely: it is the list of items the
 * dropdown offers, and appending to it would offer the filer the first item once per sheet.
 * Hence the field type is checked rather than the presence of the key. Neither template has a
 * choice field today; that is the point — a revision that adds one should not quietly corrupt
 * its item list.
 *
 * `entries` are the incoming copy's own, read before its field-level keys were stripped.
 */
function extendOptions(ctx: PDFContext, field: PDFDict, entries: PDFArray | undefined, count: number): void {
  if (fieldType(ctx, field) !== 'Btn') return
  const options = ctx.lookupMaybe(field.get(PDFName.of('Opt')), PDFArray)
  if (!options) return
  const source = entries ?? options
  for (let i = 0; i < count; i++) {
    const entry = i < source.size() ? source.get(i) : undefined
    if (entry !== undefined) options.push(entry)
  }
}

/** A field's type, which may be stated on it or inherited from a node above it. */
function fieldType(ctx: PDFContext, dict: PDFDict): string | null {
  let node: PDFDict | undefined = dict
  for (let hops = 0; node && hops < 32; hops++) {
    const type = node.get(PDFName.of('FT'))
    if (type instanceof PDFName) return type.decodeText()
    node = ctx.lookupMaybe(node.get(PDFName.of('Parent')), PDFDict)
  }
  return null
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
 * Remove the document-level active content the blank templates were authored with.
 *
 * The CEVA form carries Adobe's "Please Migrate Document" boilerplate as document-level
 * JavaScript, and one of its four scripts ends in
 * `this.getURL("http://cgi.adobe.com/special/acrobat/update" + platform/version/language)`
 * on a reader older than 6.02. It takes an old reader and a click to fire, so nothing has
 * ever gone out — but a filed SLI is a signed declaration this tool promises stays on the
 * machine, and shipping one with a live outbound path in it is not a promise worth relying
 * on somebody's Acrobat version to keep.
 *
 * Not new to continuation pages: the adapters have always loaded these templates as the
 * document, so this has been in every SLI the tool has produced. It is removed here because
 * this is now the single door every filled form comes through.
 *
 * The scripts are Adobe's own version check and a barcode initialiser for readers before
 * version 5. Neither computes a field, so nothing on either form depends on them.
 */
function stripActiveContent(doc: PDFDocument): void {
  const names = doc.context.lookupMaybe(doc.catalog.get(PDFName.of('Names')), PDFDict)
  if (names) {
    names.delete(PDFName.of('JavaScript'))
    // An empty name dictionary is a name dictionary; the catalog entry goes with its content.
    if (names.keys().length === 0) doc.catalog.delete(PDFName.of('Names'))
  }
  // Neither template carries these today. They are the other two places a PDF runs something
  // of its own on open, and a template revision that acquired one would arrive silently.
  doc.catalog.delete(PDFName.of('OpenAction'))
  doc.catalog.delete(PDFName.of('AA'))
  for (const page of doc.getPages()) page.node.delete(PDFName.of('AA'))
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
  stripActiveContent(doc)
  // `Math.max(1, NaN)` is `NaN`, which would run the loop below zero times and hand back a
  // one-sheet form claiming however many sheets the caller asked for.
  const sheets = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1
  const roots = new Set(perPageRoots)

  const fieldName = (templateName: string, pageIndex: number): string => {
    if (pageIndex === 0) return templateName
    // Scanned over the array the caller passed rather than the set: this runs once per field
    // per row per page — 729 times on an eighty-row Nippon shipment — and spreading a set into
    // a fresh array to scan it allocated one throwaway array each time.
    const root = perPageRoots.find((r) => templateName === r || templateName.startsWith(`${r}.`))
    if (!root) return templateName
    return pageSuffixed(root, pageIndex) + templateName.slice(root.length)
  }

  if (sheets === 1) return { doc, form: doc.getForm(), pageCount: 1, fieldName }

  const ctx = doc.context
  const acro = doc.getForm().acroForm

  // The CEVA template labels its pages with the literal string `1` and no numbering style, so
  // every sheet of a paginated form would be page "1" in the reader's page box while the
  // corner of the paper says 2 of 3. Dropped rather than rewritten: without it the reader
  // numbers the sheets itself, which is what the stamp says too.
  doc.catalog.delete(PDFName.of('PageLabels'))

  /** Page 1's terminal fields, which the later sheets hand their widgets to. */
  const shared = new Map<string, Node>()
  for (const root of rootsOnPage(ctx, doc, 0)) {
    if (roots.has(root.name)) continue
    for (const [name, node] of terminalsUnder(ctx, root.ref, '', new Map())) shared.set(name, node)
  }

  // Loaded once. Each `copyPages` call builds its own object copier, so two calls against one
  // source produce independent copies — the sheets do not share annotations, and renaming one
  // sheet's rows cannot rename another's. (This used to re-parse the whole template per sheet
  // on the belief that they would: 1.1 MB of PDF, parsed again for every extra page, in the
  // browser's generate path.)
  const source = await PDFDocument.load(templateBytes, { ignoreEncryption: true, updateMetadata: false })

  for (let pageIndex = 1; pageIndex < sheets; pageIndex++) {
    const [page] = await doc.copyPages(source, [0])
    doc.addPage(page)
    // The index `addPage` put it at, not `pageIndex`. The template is the document now, so a
    // sheet is appended *after* whatever pages the template already had; on a template that
    // ever gains a second page, `pageIndex` would walk one of those and leave the copy this
    // iteration just made unprocessed — its widgets unregistered, its rows unnamed.
    const sheet = doc.getPageCount() - 1
    // A copy carries the tagging index of the page it came from, and two pages cannot both be
    // structure element 0. Nothing re-tags the copy, so it says it is untagged, which it is.
    page.node.delete(PDFName.of('StructParents'))
    // And whatever the source page ran on open. `stripActiveContent` cleared this from the
    // template's own pages before any of them were copied, so without this a page-level
    // action would survive on every sheet but the first.
    page.node.delete(PDFName.of('AA'))
    reparentWidgets(ctx, doc, page)

    for (const root of rootsOnPage(ctx, doc, sheet)) {
      if (roots.has(root.name)) {
        root.dict.set(PDFName.of('T'), PDFString.of(pageSuffixed(root.name, pageIndex)))
        acro.addField(root.ref)
        continue
      }

      // A later sheet's copy of a shared field. Each of its terminals hands its widgets to
      // page 1's field of the same name, and the copy itself is left unregistered.
      const terminals = [...terminalsUnder(ctx, root.ref, '', new Map())]
      // Decided before anything moves. Adopting the terminals this root shares with page 1 and
      // then registering the root for one it does not would leave the adopted terminals in two
      // parents' `/Kids` under a name the document now holds twice.
      if (terminals.some(([name]) => !shared.has(name))) {
        // A field page 1 does not have. Registered under its own name rather than dropped, so
        // nothing the template carries goes missing.
        acro.addField(root.ref)
        continue
      }

      // Collected before the tree is taken apart: what is left of it afterwards is decided by
      // what did *not* move.
      const wasUnder = refsUnder(ctx, root.ref, [])
      const adopted = new Set<string>()

      for (const [name, node] of terminals) {
        const field = splitMergedWidget(ctx, shared.get(name) as Node)
        if (field.replaced) {
          relink(ctx, acro, field.replaced, field)
          shared.set(name, { ref: field.ref, dict: field.dict })
        }
        // `splitMergedWidget` hands back a node with `/Kids` in every case it acts on, but it
        // declines a dictionary that is neither a widget (no `/Rect`) nor already a parent.
        // Looking that up unconditionally threw on the whole document rather than adopting
        // the one odd field.
        let kids = kidsOf(ctx, field.dict)
        if (!kids) {
          kids = ctx.obj([]) as PDFArray
          field.dict.set(PDFName.of('Kids'), kids)
        }
        // Read before anything is stripped: `Opt` is one of the field-level keys the merged
        // branch below deletes, and reading it afterwards silently fell back to the field's
        // own entries rather than the copy's.
        const entries = ctx.lookupMaybe(node.dict.get(PDFName.of('Opt')), PDFArray)
        const incoming = kidsOf(ctx, node.dict)
        if (incoming) {
          for (let i = 0; i < incoming.size(); i++) {
            ctx.lookup(incoming.get(i), PDFDict).set(PDFName.of('Parent'), field.ref)
            kids.push(incoming.get(i))
            adopted.add(incoming.get(i).toString())
          }
          extendOptions(ctx, field.dict, entries, incoming.size())
        } else {
          for (const key of FIELD_ONLY) node.dict.delete(PDFName.of(key))
          node.dict.set(PDFName.of('Parent'), field.ref)
          kids.push(node.ref)
          adopted.add(node.ref.toString())
          extendOptions(ctx, field.dict, entries, 1)
        }
      }

      // The copied root and the namespace nodes beneath it are referenced by nothing now:
      // not by `/Fields`, not by the page's `/Annots`, not by any widget's `/Parent`. pdf-lib
      // writes unreachable objects, so left alone they ship in the filed PDF — around fifty
      // dead field dictionaries per continuation sheet.
      for (const ref of wasUnder) {
        // Never a widget, whatever the field tree says about it: those are on the page.
        if (adopted.has(ref.toString())) continue
        if (ctx.lookup(ref, PDFDict).has(PDFName.of('Rect'))) continue
        ctx.delete(ref)
      }
    }
  }

  await stampPageNumbers(doc)
  return { doc, form: doc.getForm(), pageCount: sheets, fieldName }
}

/**
 * Point a copied sheet's widgets at the sheet they are actually on.
 *
 * A widget's `/P` is the page it appears on. pdf-lib's copier clones the source page dictionary
 * before it records it as copied, so the annotations it copies alongside end up pointing at a
 * *second* clone that never joins the page tree — every widget on a continuation sheet claims
 * to live on a page the document does not have. Readers that resolve a field's page through
 * `/P` (field navigation, flattening, some print pipelines) can misplace or drop those fields,
 * and the dead page dictionaries are written into the filed PDF alongside them.
 *
 * Verified on the real templates: a three-sheet form held five `/Type /Page` dictionaries for
 * three pages, and all 99 widgets on sheets 2 and 3 pointed at the two that were not in it.
 */
function reparentWidgets(ctx: PDFContext, doc: PDFDocument, page: PDFPage): void {
  const annots = page.node.Annots()
  if (!annots) return
  const inTree = new Set(doc.getPages().map((p) => p.ref.toString()))
  const stranded = new Set<string>()
  for (let i = 0; i < annots.size(); i++) {
    const annot = ctx.lookup(asRef(annots.get(i)), PDFDict)
    const owner = annot.get(PDFName.of('P'))
    if (owner instanceof PDFRef && !inTree.has(owner.toString())) stranded.add(owner.toString())
    annot.set(PDFName.of('P'), page.ref)
  }
  // The clones are referenced by nothing once the widgets have been repointed.
  for (const [ref, object] of ctx.enumerateIndirectObjects()) {
    if (stranded.has(ref.toString()) && object instanceof PDFDict) ctx.delete(ref)
  }
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
    const ref = asRef(annots.get(i))
    // Widgets only. A page can carry links, notes and stamps too, and those are annotations
    // without a field above them: walked as fields they all resolve to the empty name, get
    // split into orphan field dictionaries nothing registers, and the last one on page 1 wins
    // the name the rest of them share. Neither template carries one — a footer URL in a
    // revision is all it would take.
    const subtype = ctx.lookup(ref, PDFDict).get(PDFName.of('Subtype'))
    if (!(subtype instanceof PDFName) || subtype.decodeText() !== 'Widget') continue
    const root = rootOf(ctx, ref)
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
 *
 * Called by `paginateForm` itself rather than left to each adapter. Nothing about a filled
 * form shows an unnumbered continuation sheet — the field values read back identically — so a
 * third carrier that called `paginateForm` and forgot this would ship sheets with no way to
 * tell which is which, and no test reading field values would notice.
 *
 * Exported for the tests, which check what was drawn rather than what was filled.
 */
export async function stampPageNumbers(doc: PDFDocument): Promise<void> {
  const pages = doc.getPages()
  if (pages.length < 2) return
  const font = await doc.embedFont(StandardFonts.Helvetica)
  pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    const size = 8
    // Placed against the crop box, which is the part of the sheet a reader shows and a printer
    // prints. `getWidth()` is the *media* width and the two are not the same paper: the CEVA
    // template's media runs 0..684 while its crop runs 36..648, so right-aligning to the media
    // put the last three characters of every page number off the visible page. The Nippon
    // template's crop starts at y = 11.99, which left the label 2pt clear of the bottom edge,
    // inside the margin most printers will not mark.
    const box = page.getCropBox()
    page.drawText(label, {
      x: box.x + box.width - font.widthOfTextAtSize(label, size) - 24,
      y: box.y + 14,
      size,
      font,
    })
  })
}
