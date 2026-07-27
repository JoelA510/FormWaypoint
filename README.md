# FormWaypoint

Turns a combined **Commercial Invoice & Packing List (CIPL)** into a completed carrier
**Shipper's Letter of Instruction (SLI)**.

Everything runs in the browser. The CIPL is parsed locally, the carrier's blank PDF form is
filled locally, and nothing is uploaded — there is no backend, no account, and no network
call carrying shipment data.

```bash
npm install
npm run dev      # http://localhost:5173
```

## What it does

1. **Reads the CIPL.** These are generated PDFs with a real text layer, so there is no OCR
   anywhere in the pipeline — the parser works from the text and its coordinates.
2. **Picks the controlling document set.** vendor CIPLs contain the same shipment twice:
   `FC` priced in USD and `TP1` priced in the destination currency. Only the USD set is
   used, because SLI box 31 is "value at the port of export in US dollars".
3. **Joins invoice lines to packing-list lines** by lot id, then order + sequence, then
   order + line + part. Never by description.
4. **Groups lines into commodity rows** keyed on Schedule B, D/F and the export-control
   triplet — matching how these shipments are actually filed.
5. **Validates every Schedule B number** against the U.S. Census Bureau AES commodity file:
   ten digits, currently active, reported in the required unit of quantity, and plausibly
   describing the goods.
6. **Proves the arithmetic** before generating anything. Quantities, weights and values must
   sum back to the totals printed on the source document.
7. **Fills the carrier's real blank form** and downloads it, still editable and unsigned.

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

48 tests run against three real, manually-processed shipments. The expected values come from
the completed SLIs that were filed for them, so a pass means the tool reproduces what a
person produced by hand.

| Shipment | Carrier | Lines → rows | Quantity | Net weight | USD |
| --- | --- | --- | ---: | ---: | ---: |
| vendorA1 | Nippon Express | 3 → 2 | 3 | 2.468 kg | 1,113.14 |
| vendorA2 | Nippon Express | 1 → 1 | 1 | 1.270 kg | 51.60 |
| vendorA3 | CEVA | 11 → 3 | 97 | 138.841 kg | 129,999.10 |

```bash
npm run check    # typecheck, lint, tests, production build
```

Only the CIPLs are committed as fixtures. The completed SLIs they were checked against are
not, because they carry handwritten signatures; the values read off them live in the test
expectations instead.

## Schedule B data

`public/data/schedule-b.json` is built from the Census Bureau's AES commodity concordance
(9,746 codes). Refresh it when Schedule B changes — typically each January and July:

```bash
node scripts/build-schedule-b.mjs --fetch
```

The dataset is the authority on three things the CIPL cannot tell you: whether a code is
currently valid, its official description, and the unit of quantity AES requires. That last
one matters more than it looks — `9031.90.0000` and `8483.10.5000` are reported in
kilograms, not pieces, and the tool flags a piece count filed against them.

## Local data

Kept in IndexedDB on this machine only, and clearable from the History panel:

- the exporter profile (USPPI name, EIN, signer details),
- per-consignee values that are not on the CIPL (EORI/USCI, consignee type),
- approved classification overrides with their reason and approver,
- processed shipments, for autofill and audit.

`LocalStore` in `src/store/local-store.ts` is the seam for a desktop build: a Tauri
packaging swaps the IndexedDB implementation for a file-backed one without touching any
calling code.

## Project layout

```
src/
  domain/
    cipl/        PDF text extraction and the vendor CIPL parser
    reconcile/   document-set selection, line joining, grouping, checks
    schedule-b/  Census dataset lookup and validation
    draft.ts     assembles reviewed values for a carrier form
  carriers/
    nippon-express/   field map + adapter
    ceva/             field map + adapter
    keying-sheet/     FedEx Ship Manager / UPS WorldShip
  features/      upload, review, manual fields, output
  store/         local persistence
public/
  templates/     blank carrier forms
  data/          Schedule B dataset
```

## Superseded code

`apps/`, `packages/` and `services/` are the previous monorepo (Hono API, Prisma/Postgres,
a Python OCR service, FedEx/UPS rate-shopping stubs). None of it is used by this
application and none of it is built, linted or typechecked. It is left in place only so the
history is easy to consult, and can be deleted.
