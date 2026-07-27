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
    cipl/        PDF text extraction (pdfjs) and the Omron CIPL parser
    reconcile/   document-set selection, line joining, grouping, checks
    schedule-b/  Census AES dataset lookup and validation
    draft.ts     assembles reviewed values; checkDraft() gates on what a person supplies
  carriers/
    nippon-express/, ceva/   field map + adapter per forwarder
    keying-sheet/            FedEx Ship Manager / UPS WorldShip, for manual entry
  features/      upload, review, manual fields, output
  store/         IndexedDB persistence behind a LocalStore interface
public/
  templates/     blank carrier forms (AcroForm PDFs, filled with pdf-lib)
  data/          schedule-b.json, built by scripts/build-schedule-b.mjs
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
