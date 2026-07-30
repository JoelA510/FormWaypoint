# FormWaypoint

Turns a combined **Commercial Invoice & Packing List (CIPL)** into a completed carrier
**Shipper's Letter of Instruction (SLI)**.

Everything runs in the browser. The CIPL is parsed locally, the carrier's blank PDF form is
filled locally, and nothing is uploaded — there is no backend, no account, and no network
call carrying shipment data.

Node 22.12 or newer (CI runs 24).

```bash
npm install
npm run dev            # browser, http://localhost:5173
npm run desktop:dev    # desktop window (needs a Rust toolchain)
npm run check          # typecheck, lint, tests, production build — the one gate
```

A Windows installer is built by the **Desktop build** workflow — run it from the Actions
tab and download the `FormWaypoint-windows-installer` artifact. It cannot be built anywhere
but a Windows runner.

## Supported CIPL formats

| Format | Shape | Weights | ECCN |
| --- | --- | --- | --- |
| Omron Robotics FC/TP1 | Invoice + packing list, printed twice (USD and destination currency) | per line | not stated |
| Omron shipment (`OMRON SHIPMENT#`) | Commercial invoice + master packing list, single copy | **none — supplied per part** | stated per line |

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
2. **Picks the controlling document set.** Omron CIPLs contain the same shipment twice:
   `FC` priced in USD and `TP1` priced in the destination currency. Only the USD set is
   used, because SLI box 31 is "value at the port of export in US dollars".
3. **Joins invoice lines to packing-list lines** by lot id, then order + sequence, then
   order + line + part. Never by description.
4. **Groups lines into commodity rows** keyed on Schedule B, D/F and the export-control
   triplet — matching how these shipments are actually filed.
5. **Honours an ECCN the document states.** Where a CIPL prints one it wins over the blanket
   value, and the reviewer is told — shipment 278515 states `ECCN: 5A992.C` on a line whose
   filed SLI says EAR99.
6. **Validates every Schedule B number** against the U.S. Census Bureau AES commodity file:
   ten digits, currently active, reported in the required unit of quantity, and plausibly
   describing the goods.
7. **Proves the arithmetic** before generating anything. Quantities, weights and values must
   sum back to the totals printed on the source document.
8. **Fills the carrier's real blank form** and hands it back still editable and unsigned:
   a download in the browser, a saved file with its path reported on the desktop.

## Supported carriers

| Carrier | Form | Rows | Notes |
| --- | --- | --- | --- |
| Nippon Express USA | SLI, file version 01/04/2022 | 8 | Per-cell fields; values keep cents; `EAR99` per row |
| CEVA Logistics | SLI 11201-C3 rev. 8/2023 | 12 | One multiline field per column; values rounded to whole dollars |

FedEx and UPS are handled differently on purpose: instead of an API, the tool produces a
**keying sheet** laid out in the order FedEx Ship Manager and UPS WorldShip prompt for each
field, for manual entry. Import files are not generated because WorldShip import maps and
Ship Manager flat-file layouts are configured per installation, and a mismatched layout
fails silently or transposes values.

Adding a carrier means writing one adapter under `src/carriers/`. The parser and the
reconciliation engine contain no carrier-specific logic.

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
- It never adopts a classification from a historical form. One sample shipment was filed
  with `8483.10.5000` ("transmission shafts and cranks") on a cable assembly; a tool that
  learned from that would repeat the error forever. Changing a code requires an explicit,
  recorded override — and the override is still challenged if it does not fit the goods.
- It never infers **country of origin**, **hazardous-material status**, **routed-export
  status**, **consignee type** or **related-party status**.
- It never treats a blank field as zero, and never applies a signature.

## Verification

322 tests, of which 122 replay six real, manually-processed shipments across both CIPL
formats. The expected values come from the completed SLIs that were filed for them, so a
pass means the tool reproduces what a person produced by hand. The other 200 pin the
failure modes that would otherwise be silent — a blank exporter profile, an unreadable
weight total, a double-claimed packing line, an impossible date — because a form that looks
complete and is wrong is the worst outcome this tool can produce.

| Shipment | Carrier | Lines → rows | Quantity | Net weight | USD |
| --- | --- | --- | ---: | ---: | ---: |
| G78495IQ | Nippon Express | 3 → 2 | 3 | 2.468 kg | 1,113.14 |
| K78464FJ | Nippon Express | 1 → 1 | 1 | 1.270 kg | 51.60 |
| K78027EC | CEVA | 11 → 3 | 97 | 138.841 kg | 129,999.10 |
| 278515 | Nippon Express | 6 → 5 | 9 | supplied | 11,532.24 |
| 278514 | CEVA | 1 → 1 | 2 | supplied | 1,251.37 |
| K78541WH | FedEx / UPS | 7 rows keyed | | | |

K78541WH is checked differently from the rest. It is the parser's hardest document — a line
block split by a page break, weights printed divided (`(@ / 6)`), a commodity heading
stranded at the foot of a page — and it is the reference for the FedEx and UPS keying
sheets, checked against how that shipment was actually keyed rather than against a filed
PDF form.

```bash
npm run check    # typecheck, lint, tests, production build
```

CI runs exactly this command on every push and pull request, so it cannot drift from what
you see locally.

**No shipment document is committed.** The CIPLs are a customer's commercial paperwork —
part numbers, values, consignees, classifications — so `src/test/fixtures/*.pdf` is
gitignored; the filed SLIs are not committed either, because they carry handwritten
signatures. Only the expected values live in the repository, as plain data in the test
files, so a fixture supplies the input side and nothing else. The 122 tests that need those
documents skip when they are absent, which is what a clean checkout sees: 200 pass, 122
skip. To run the whole suite, drop the CIPLs into `src/test/fixtures/` under the names in
[`src/test/fixtures.ts`](src/test/fixtures.ts).

## Schedule B data

`public/data/schedule-b.json` is built from the Census Bureau's AES commodity concordance
(9,746 codes, built 2026-07-27). Refresh it when Schedule B changes — typically each
January and July:

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
kilograms, not pieces, and the tool flags a piece count filed against them.

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

## Where the finished form goes

In the browser the filled SLI is a download, because a download is the only route a browser
has. That route tells the app nothing back: not the folder, not the final name, not whether
the write succeeded.

On the desktop the shell writes it instead. `save_output` writes into the user's Downloads
folder and returns the full path, so the panel can say **Saved to `<path>`** and offer an
**Open** button; `open_output` then hands that path to whatever the system opens PDFs with.
The file opens straight away, because the next thing anyone does with a filled SLI is read
it and sign it, and the boxes deliberately left blank are only fillable in a reader. The
same applies to the FedEx and UPS keying sheets.

Regenerating a shipment never overwrites the copy already saved — the earlier file may
already have been signed — so `unique_path` suffixes instead.

## Project layout

```
src/
  desktop/       the Tauri bridge; absent in the browser build
  domain/
    cipl/        PDF text extraction and the Omron CIPL parser
    reconcile/   document-set selection, line joining, grouping, checks
    schedule-b/  Census dataset lookup, validation, and revision diffing
    item-library/  item-master import and commodity-number screening
    draft.ts     assembles reviewed values for a carrier form
  carriers/
    nippon-express/   field map + adapter (8 commodity rows)
    ceva/             field map + adapter (12 commodity rows)
    keying-sheet/     FedEx Ship Manager / UPS WorldShip
  features/      upload, review, manual fields, output
  components/    shared UI primitives
  store/         local persistence
  lib/           small shared helpers
  styles/        Tailwind v4 theme, configured CSS-first
  test/          fixture registry; the shipment PDFs are not committed
public/
  templates/     blank carrier forms
  data/          Schedule B dataset
src-tauri/       the desktop shell: seven commands, no decisions
```

The shell's seven commands are the whole native surface, auditable in one file
(`src-tauri/src/lib.rs`): `fetch_concordance`, `read_data_file`, `write_data_file`,
`data_dir`, `save_output`, `open_output`, `output_dir`. No Tauri plugins — the opening is
one `std::process::Command` per platform with the path as a single argument and no shell,
so a space in `C:\Users\Firstname Lastname\Downloads` is quoted by the standard library
rather than resplit by an interpreter.

## History

An earlier version of this repository was a monorepo — a Hono API, Prisma/Postgres, a
Python OCR service and FedEx/UPS rate-shopping stubs. None of it served this problem, and
it was removed in full once the client-side pipeline was verified. It remains in the git
history if you need to consult it.
