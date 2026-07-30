---
trigger: always_on
---

# Architecture (FormWaypoint)

A single Vite + React 19 application. There is no API, no ORM and no shared-schema package;
the pre-2026 monorepo (`apps/`, `packages/`, `services/`) has been deleted.

## Structure

```
src/
  domain/
    cipl/        PDF text extraction (pdfjs) and the vendor CIPL parsers, behind a
                 format registry that detects the layout and dispatches to one
    reconcile/   document-set selection, line joining, grouping, checks
    schedule-b/  Census AES dataset lookup, validation, and revision diffing
    item-library/  item-master import (.xlsx/.csv/.tsv) and commodity-number screening
    draft.ts     assembles reviewed values; checkDraft() gates on what a person supplies
  carriers/
    nippon-express/, ceva/   field map + adapter per forwarder
    keying-sheet/            FedEx Ship Manager / UPS WorldShip, for manual entry
  features/      upload, review, manual fields, output
  components/    shared UI primitives (`ui.tsx`)
  store/         IndexedDB persistence behind a LocalStore interface
  desktop/       the Tauri bridge; absent in the browser build
  lib/           small shared helpers
  styles/        globals.css — the @theme token palette, light and dark
  test/          the fixture registry; the shipment PDFs themselves are gitignored
public/
  templates/     blank carrier forms (AcroForm PDFs, filled with pdf-lib)
  data/          schedule-b.json, built by scripts/build-schedule-b.mjs
src-tauri/       the Windows desktop shell: seven commands, no decisions
```

## Critical constraints

1. **One direction only.** `carriers/` may import from `domain/`; `domain/` must not import
   from `carriers/` beyond pure formatting helpers.
2. **Adapters own carrier quirks.** Field names, defaults, row capacity, value rounding and
   checkbox encoding all live in the adapter. The two shipped carriers disagree on every
   one of those, which is why the indirection exists.
3. **`LocalStore` is the desktop seam.** A Tauri build swaps the IndexedDB implementation
   for a file-backed one without touching callers, so do not reach for `idb` outside
   `src/store`.
4. **Blocking checks gate generation.** Both `reconcile()` (the document side) and
   `checkDraft()` (the person side) must pass before a form can be produced.
5. **A new format is a detector and a parser.** Both CIPL layouts sit behind one registry
   and produce the same `ParsedCipl`. Everything downstream is shared, so a third format
   adds two things and changes nothing else. The same holds for a carrier: one adapter.
6. **The shell decides nothing.** `src-tauri` fetches, reads, writes, opens, and reports
   paths. Every compliance judgement stays in `src/domain`, where it is testable without a
   Rust toolchain. Keep the native surface auditable in one file, and prefer a few lines of
   `std` over a plugin.
