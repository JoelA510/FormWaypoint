# FormWaypoint

Two shipping workflows, kept apart on purpose:

- **Standard shipping** — turns a combined **Commercial Invoice & Packing List (CIPL)** into
  a completed carrier **Shipper's Letter of Instruction (SLI)**.
- **Dangerous goods — air** — classifies lithium, lithium metal and sodium ion batteries
  under the IATA DGR, checks the consignment against the limits that classification carries,
  and produces the **Shipper's Declaration for Dangerous Goods** and the package checklist
  that goes with it.

Everything runs in the browser. The CIPL is parsed locally, the carrier's blank PDF form is
filled locally, and nothing is uploaded — there is no backend, no account, and no network
call carrying shipment data.

```bash
npm install
npm run dev            # browser, http://localhost:5173
npm run desktop:dev    # desktop window (needs a Rust toolchain)
```

A Windows installer is built by the **Desktop build** workflow — run it from the Actions
tab and download the `FormWaypoint-windows-installer` artifact. It cannot be built anywhere
but a Windows runner.

## Supported CIPL formats

| Format | Shape | Weights | ECCN |
| --- | --- | --- | --- |
| Vendor A (FC/TP1 dual-currency) | Invoice + packing list, printed twice (USD and destination currency) | per line | not stated |
| the vendor shipment (`SHIPMENT#`) | Commercial invoice + master packing list, single copy | **none — supplied per part** | stated per line |
| Omron Commercial Invoice (form 00004-00202) | The in-house fixed-grid invoice, read from the **.xlsx workbook itself** or a PDF printed from it | **none — supplied per part** | full triplet (ECCN, license, SME) stated per line |

The format is detected from the document and dispatched to its own parser; everything
downstream is shared. Adding a third means adding a detector and a parser, nothing else.

The second format states no weights at all, so box 26 comes from an imported item library
or a per-part table you fill in once and the tool reuses. The reconciliation reports those
weights as *supplied* rather than proved against the source, because there is nothing in
the document to prove them against. A part with no known weight blocks generation instead
of defaulting to zero.

## What it does

1. **Reads the CIPL.** These are generated PDFs with a real text layer, so there is no OCR
   anywhere in the pipeline — the parser works from the text and its coordinates.
2. **Picks the controlling document set.** Vendor A CIPLs contain the same shipment twice:
   `FC` priced in USD and `TP1` priced in the destination currency. Only the USD set is
   used, because SLI box 31 is "value at the port of export in US dollars".
3. **Joins invoice lines to packing-list lines** by lot id, then order + sequence, then
   order + line + part. Never by description.
4. **Groups lines into commodity rows** keyed on Schedule B, D/F and the export-control
   triplet — matching how these shipments are actually filed.
5. **Honours an ECCN the document states.** Where a CIPL prints one it wins over the blanket
   value, and the reviewer is told, including when it disagrees with what was filed
   previously.
6. **Validates every Schedule B number** against the U.S. Census Bureau AES commodity file:
   ten digits, currently active, reported in the required unit of quantity, and plausibly
   describing the goods.
7. **Files each row in the unit its commodity number is reported in.** Where Schedule B
   reports a code by weight and the invoice counts pieces, the row carries the net weight
   instead — and the review screen lets you change the unit before anything is generated.
8. **Proves the arithmetic** before generating anything. Quantities, weights and values must
   sum back to the totals printed on the source document.
9. **Fills the carrier's real blank form** and downloads it, still editable and unsigned.

## Supported carriers

| Carrier | Form | Rows per sheet | Notes |
| --- | --- | --- | --- |
| Nippon Express USA | SLI, file version 01/04/2022 | 8 | Per-cell fields; values keep cents; `EAR99` per row |
| CEVA Logistics | SLI 11201-C3 rev. 8/2023 | 12 | One multiline field per column; values rounded to whole dollars |

A shipment with more commodity rows than a sheet holds continues onto another, numbered in
the bottom corner. Every box but the commodity table is one field with a widget on each
sheet, so correcting the consignee on page 3 corrects it on page 1 — that is the reader's own
behaviour, not something this tool maintains. See **Continuation pages** below.

FedEx and UPS are handled differently on purpose: instead of an API, the tool produces a
**keying sheet** laid out in the order FedEx Ship Manager and UPS WorldShip prompt for each
field, for manual entry. Import files are not generated because WorldShip import maps and
Ship Manager flat-file layouts are configured per installation, and a mismatched layout
fails silently or transposes values.

Adding a carrier means writing one adapter under `src/carriers/`. The parser and the
reconciliation engine contain no carrier-specific logic.

## Dangerous goods — lithium batteries by air

A separate tab, sharing nothing with the CIPL flow but the design language and the checks
panel. The two jobs have almost nothing in common: one reads a document and proves its
arithmetic, the other asks what is in a box and tells you what the regulations make of it.
Folding dangerous goods into the standard flow would put a hazard question in front of every
ordinary shipment, which is how hazard questions come to be answered without being read.

**What it classifies.** Lithium ion, lithium metal and sodium ion, as cells or batteries,
standalone or packed with or contained in the equipment they power. From those four facts and
the energy content it derives the UN number, proper shipping name, packing instruction and
section, and everything each section carries:

| | Standalone | Packed with equipment | Contained in equipment |
| --- | --- | --- | --- |
| Small (≤20 Wh cell / ≤100 Wh battery, ≤1 g / ≤2 g LC) | **Section IB** — PI 965 / 968, fully regulated, CAO only, 10 kg (ion) or 2.5 kg (metal) per package | **Section II** — PI 966 / 969, excepted, 5 kg | **Section II** — PI 967 / 970, excepted, 5 kg |
| Large | **Section IA** — PI 965 / 968, UN specification packaging, CAO only, 35 kg | **Section I** — PI 966 / 969, UN specification packaging, 5 kg PAX / 35 kg CAO | **Section I** — PI 967 / 970, 5 kg PAX / 35 kg CAO |

Standalone batteries have no Section II at all, which is the most-missed rule in the set: a
"small" standalone battery is still fully regulated, still cargo aircraft only, and still
needs a declaration. Every standalone sodium ion battery is fully regulated under PI 976,
which has no sections. The U.S. ground "medium" band does not exist by air and is not applied.

**What it refuses.** Damaged or defective batteries (A154) and waste batteries for recycling
(A183) are forbidden by air, and block. So does an unmarked battery case, a net battery weight
over the package limit, a standalone entry offered on a passenger aircraft, Section I or IA
without a UN specification marking, and — most importantly — a battery whose watt-hour rating
or lithium content has not been stated. A state of charge over 30% blocks where the materials
write the rule as a requirement — every standalone lithium ion and sodium ion battery, and
everything packed with equipment except a cell rated at or below 2.7 Wh — and warns where they
write it as a recommendation, which is batteries contained in equipment and those cells. The
check says which of the two it is applying. That
last one is the point: a missing rating is not evidence of a small battery, and treating it as
one would move a fully regulated shipment onto an air waybill statement and no declaration.

Four more blocks exist because they are what has actually gone wrong on real consignments:

- **A test summary that covers the wrong article.** UN 38.3 coverage is asked as two questions
  — what the summary covers, and what is in the box — because a module-level summary held
  against the pack assembled from those modules reads as qualification and is not one. A
  battery must be of a proved type *irrespective of whether the cells it is composed of are of
  a tested type*, so coverage of the parts is not coverage of the whole. This is the failure
  that looks compliant right up until an airline asks.
- **A state of charge that is asserted rather than measured.** Value, basis, device or method,
  date, and who measured. The basis matters as much as the number: 30% of rated capacity and
  25% of indicated capacity are different standards written for different entries, and a
  gauge reading cannot demonstrate a rated-capacity limit. An indicated-capacity figure blocks
  wherever the 25% alternative does not apply, which is everywhere except batteries contained
  in equipment.
- **The forwarder treated as the airline.** Operator variations attach to the operating
  carrier, which comes off the booking confirmation or the master air waybill and is routinely
  not known when the paperwork is prepared. Both are recorded; an unresolved carrier blocks.
- **Equipment nobody has determined is not a vehicle.** A vehicle — a self-propelled apparatus
  designed to carry persons or goods — is a different entry entirely: UN3556, UN3557 or UN3558
  by air. An autonomous machine that carries goods sits on that boundary, so the answer is a
  recorded determination, not something inferred from a product name. Worth knowing: the
  United States has not adopted those entries, where a battery-powered vehicle is still
  UN3171, so the same machine has one identity by air and another by US ground.

**What it will not pretend to know.** State (IATA 2.8.1) and operator (2.8.3) variations. No
published dataset of those travels with the app, and lithium batteries attract more of them
than any other entry — UPS 5X-08 wants the packing instruction marked on Section II packages,
Saudi Arabia SAG-06 wants the consignee's telephone number on every package. The app says
which ones to read, names the operator, and refuses to generate until someone confirms they
have.

**What it produces.**

- **The Shipper's Declaration**, drawn to the IATA layout — red hatched margins, the boxes in
  their published order, the warning and the certification verbatim. There is no blank IATA
  form to fill, and the regulations expressly allow a computer-generated declaration that
  conforms in format. Aircraft limitation and shipment type are struck out rather than left
  ambiguous, page x of y is real, and the boxes the forwarder completes — air waybill number,
  airports, the authorization column — are left as fillable fields with a rule to write on
  rather than as printed blanks. The signature block is empty: a typewritten signature is not
  acceptable.
- **The package checklist**, as markdown to print and work through: the marks and labels each
  package must carry, the packaging the section demands, the air waybill statement, and what
  is still outstanding. For a Section II consignment there is no declaration, so this *is* the
  deliverable — the battery mark and the air waybill statement carry the whole of the hazard
  communication between them.

**Retention.** A copy of the declaration must be kept for two years and be producible at the
shipment location on request, so preparing a consignment records it on this machine with the
date its retention obligation runs to. The record is not the declaration — the declaration is
the signed paper — it is what was declared and what the checks said.

**Three weights, never derived from one another.** Package gross, equipment net and battery
net are three measurements of the same parcel and they will not match — the declaration files
the battery net quantity, the air waybill carries something closer to the gross. Deriving any
of them from the others is how a declaration ends up stating a quantity nobody weighed, so
they are entered separately and only sanity-checked against each other.

The regulatory figures come from the Labelmaster *Shipping Lithium Batteries — Excepted &
Fully Regulated* multimodal course (Student Guide rev. 02/01/2026, Supplemental Appendix rev.
01/01/2025 for the reproduced PI 965 text), and each is cited in
`src/domain/dangerous-goods/lithium.ts` against the figure it was taken from, so it can be
re-checked when the DGR is revised. `docs/dangerous-goods-fact-check.md` records what was
checked against what, including the claims in the supplied ORT documents that could be
confirmed, the two that could not, and the one — the co-packing prohibition list — that turned
out to be wrong in both directions.

## Item library

An item master exported from your ERP can be imported (`.xlsx`, `.csv`, `.tsv`) to supply
what a CIPL cannot: the net weight of each part, for the format that prints none. Columns
are matched by heading rather than position, so differently-shaped exports read without
configuration — `Part Number` / `Current Export HTS` / `Weight (G)` and `2nd Item Number` /
`Harmonized Shipping Code` / `Net Weight` land in the same fields. The `.xlsx` reader is
~250 dependency-free lines over the platform's own `DecompressionStream`; no spreadsheet
library touches the page your shipment data is on.

Two decisions are put to you rather than guessed:

- **The weight unit**, whenever the file's heading does not state one. Grams read as
  kilograms overstate a shipment a thousandfold, and nothing in the numbers distinguishes
  them, so the choice is explicit and previewed against real rows first.
- **What to do about bad commodity numbers.** Every code in the library — and every code on
  each processed CIPL — is put through two mechanical rules: written as `####.##.####`, and
  present in the Census concordance. Failures are listed by part number for correction at
  source, never corrected in place. The number filed is always the one on the CIPL; when
  the library disagrees, that disagreement is reported and the existing override mechanism
  is how a filing actually changes.

A second file can replace the library or merge into it. A weight typed on the review screen
wins over the library figure, and a library figure never displaces a weight the packing
list itself prints.

## What it will not do

These are deliberate. An export declaration is signed under penalty, and the tool refuses to
manufacture the parts a document cannot support:

- It never assigns **EAR99** because no ECCN appears on the invoice, and never assigns
  **NLR** because EAR99 was chosen. Both are entered by the filer.
- It never converts an **HTSUS** number into a Schedule B number.
- It never adopts a classification from a historical form. Real filings contain codes that
  do not fit the goods, and a tool that learned from them would repeat the error forever.
  Changing a code requires an explicit, recorded override, and the override is still
  challenged if it does not fit the goods.
- It never infers **country of origin**, **hazardous-material status**, **routed-export
  status**, **consignee type** or **related-party status**.
- It never treats a blank field as zero, and never applies a signature.
- It never quietly substitutes a figure of its own for one the documents give. A **quantity,
  weight or value entered by hand** replaces the document's — that is what it is for — and
  every one is named in a check, with the figure it replaced, for as long as it stands.

## Verification

A clean checkout runs the whole suite — several hundred tests, and `npm run check` prints the
count. They cover the parsers, the reconciliation engine, the
Schedule B validator, the carrier adapters and the guards, using synthetic documents built
to reproduce each supported layout without reproducing anyone's data.

The dangerous goods suites are written against the course materials' own worked scenarios, so
a failure means this tool and the training disagree: the workbook's two-box Section IB
consignment produces the declaration the exercise asks for, its three 76 Wh power drills
classify as PI 967 Section II and need the battery mark, its 300 Wh data-backup batteries are
fully regulated by air, and the two-laptops-in-two-packages marking exemption withdraws itself
the moment a third package joins the consignment.

A further **122 tests are skipped unless real shipment documents are present**. Those are
the regression suites: they run five real, manually-processed shipments across both layouts
and check the result against the completed SLIs that were filed for them, so a pass means
the tool reproduces what a person produced by hand. They also pin the failure modes that
would otherwise be silent: a blank exporter profile, an unreadable weight total, a
double-claimed packing line, an impossible date. A form that looks complete and is wrong is
the worst outcome this tool can produce.

Those documents are a customer's commercial paperwork and are not committed, so neither the
files nor their document numbers appear in this repository. To run the full suite, place the
CIPL PDFs in `src/test/fixtures/` with a `manifest.json` naming them; the format is
documented in `src/test/fixtures.ts`. Everything the tests assert is checked in, so a
fixture only ever supplies the input side.

```bash
npm run check    # typecheck, lint, tests, production build
```

CI runs exactly this command on every push and pull request, so it cannot drift from what
you see locally.

## Schedule B data

`public/data/schedule-b.json` is built from the Census Bureau's AES commodity concordance
(9,746 codes). Refresh it when Schedule B changes — typically each January and July:

```bash
node scripts/build-schedule-b.mjs --fetch
```

The app knows the revision calendar: once a 1 January or 1 July boundary passes the
dataset's generation date, the header badge turns amber and a notice explains that retired
codes will still pass as active until the dataset is rebuilt.

**On the desktop the app refreshes it itself.** "Check for a new revision" downloads the
concordance, diffs it against the installed dataset, and writes a change log beside it
before the dataset is replaced — so a refresh can never leave you with codes you cannot
account for. The log has two parts: the revision in full, and the parts in your item
library it touches, which is the list to work through in the item master. A CSV of that
worklist is written alongside it. Nothing is corrected automatically.

This is desktop-only because it has to be: census.gov serves the file with no
`access-control-allow-origin` header, so a browser can never fetch it.

The dataset is the authority on three things the CIPL cannot tell you: whether a code is
currently valid, its official description, and the unit of quantity AES requires. That last
one matters more than it looks — `9031.90.0000` and `8483.10.5000` are reported in
kilograms, not pieces, and a piece count filed against them is a reporting error even when
every other number on the form is right.

## Unit of quantity

Each commodity row is filed in the unit its Schedule B number requires, wherever the
shipment can state it. A code reported in kilograms carries the row's net weight rather than
the invoice's piece count; a code reported by the piece is unchanged. Both carrier forms and
both keying sheets take the same figure from the same place, so the paperwork prepared for
one shipment cannot disagree with itself.

A kilogram quantity is filed as a whole number of kilograms: 48 pieces weighing 4.499 kg are
filed as `4`. Only the figure in the box is rounded — the net weight the row is reconciled
against keeps every decimal the packing list gave it. Tonnes and grams are left alone, since
rounding a tonne quantity whole would file almost every shipment in this trade as zero.

It never files zero for goods that are there. A quantity box reading `0` on a signed
declaration states that nothing was shipped, and thirty grams of gasket under a kilogram code
is not nothing, so a row under half a unit files `1` — the least the unit can hold, and more
than the row holds. Every such row is named on the review screen, in the checks and on the
keying sheet, because filing one kilogram for thirty grams overstates the weight thirty-fold
and only the filer can decide whether that is what should be declared.

Where a code accepts more than one unit — `NO+KG` — only the filer knows how the goods are
actually measured, so the review screen offers the choice per commodity number. Units the
shipment cannot state are listed and disabled with the reason, rather than hidden: "there is
no net weight for these goods" is the answer somebody is looking for. Where nothing supports
the required unit at all, the document's own figure is filed and the reconciliation says so.

## Figures entered by hand

Every figure this tool files comes from the paperwork, with one door out of that. Quantity,
net weight and value are editable on each commodity row, and export control can be set per
part where one item is classified differently from the rest — for the shipment whose packing
list is missing a weight somebody forgot to enter, found on the day it ships.

Nothing is inferred through that door. An entered figure is shared out over the invoice lines
the row holds, so the form and the keying sheet state one shipment rather than two; the
documents' own figure stays on the screen as the placeholder; and every row and every part
touched is named in a check that never passes once anything has been entered, because the one
thing a reviewer must not be able to do is forget that a box says something the invoice does
not. None of it is stored: these are statements about one document's rows, and a figure that
outlived the document it was entered against would file itself against the next shipment.

## Continuation pages

Both blank forms hold a fixed number of commodity rows — eight on the Nippon SLI, twelve on
the CEVA one. A longer shipment used to be refused outright by a blocking check, which
stopped the one thing this tool does over a situation the paperwork handles by being filed as
several sheets.

The form is now produced with as many sheets as the shipment needs. Rows fill each sheet
before the next is started, and the sheets are numbered bottom-right where there is more than
one.

What makes it work is AcroForm field naming. Two widgets sharing a fully-qualified name are
one field with one value — wrong for the commodity table, right for everything else — so the
commodity rows are renamed per sheet and nothing else is:

- **The parties, the shipment boxes and the signature block are one field each**, with a
  widget on every sheet. Edit any of them on any page and every page follows.
- **The commodity rows belong to their sheet.** Page 2 row 1 is its own field.

The Nippon template names its commodity fields hierarchically (`22.02 SB1` is `02 SB1` under
the row node `22`), so a sheet's eight rows are renamed by renaming eight nodes; the CEVA
template is flat and its five columns are renamed directly. Both reduce to "rename these
roots", which is all `paginateForm` is told.

## Incoterms

The rule is read off whatever the document or the operator supplied, not matched literally:
`DAP Singapore`, `FOB Origin - Collect`, `cif rotterdam` and `Ex Works` all resolve to the
rule the form has a box for. The named place is kept — an Incoterm without one does not say
which port — and written into the CEVA form's special instructions, which is the only place
that form can record it. A rule withdrawn since Incoterms 2020 (`DAT`, `DDU`) is reported
with its replacement rather than silently mapped onto it: reclassifying a delivery term is
the filer's decision.

## Local data

Kept in IndexedDB on this machine only, and clearable from the History panel:

- the exporter profile (USPPI name, EIN, signer details),
- per-consignee values that are not on the CIPL (EORI/USCI, consignee type, destination country),
- net weight per part, for the format that states none,
- approved classification overrides with their reason and approver,
- processed shipments, for autofill and audit,

- the imported item library.

`localStore` in `src/store/local-store.ts` is the seam for a desktop build: it is the one
place an implementation is named, so a Tauri packaging replaces that single assignment with
a file-backed `LocalStore` and no calling code changes.

## Project layout

```
src/
  desktop/       the Tauri bridge; absent in the browser build
  domain/
    cipl/        PDF text extraction and the vendor CIPL parsers
    reconcile/   document-set selection, line joining, grouping, checks
    schedule-b/  Census dataset lookup and validation
    item-library/  item-master import and commodity-number screening
    dangerous-goods/  IATA classification, consignment assessment, the declaration
    draft.ts     assembles reviewed values for a carrier form
  carriers/
    nippon-express/   field map + adapter
    ceva/             field map + adapter
    keying-sheet/     FedEx Ship Manager / UPS WorldShip
    dgd/              the Shipper's Declaration, drawn rather than filled
  features/      upload, review, manual fields, output, dangerous goods
  store/         local persistence
public/
  templates/     blank carrier forms
  data/          Schedule B dataset
src-tauri/       the desktop shell: four commands, no decisions
```

## History

An earlier version of this repository was a monorepo — a Hono API, Prisma/Postgres, a
Python OCR service and FedEx/UPS rate-shopping stubs. None of it served this problem, and
it was removed in full once the client-side pipeline was verified. It remains in the git
history if you need to consult it.
