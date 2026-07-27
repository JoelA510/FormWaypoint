# FormWaypoint Roadmap

**Last Updated**: 2026-07-27

## Current focus

Turning a combined commercial invoice & packing list into a completed carrier Shipper's
Letter of Instruction, entirely in the browser. Nippon Express and CEVA are supported end
to end and verified against real, manually-processed shipments.

## Milestone tracker

| Feature | Status | Description |
| :--- | :--- | :--- |
| **CIPL parser** | ✅ Done | Position-aware text extraction; FC/TP1 sets, multi-page detail, repeated POs. No OCR — the documents have a text layer. |
| **Reconciliation** | ✅ Done | USD set selection, invoice↔packing-list join, grouping by Schedule B + D/F, blocking totals checks. |
| **Schedule B validation** | ✅ Done | Census AES dataset: 10 digits, currently active, required unit of quantity, description plausibility. |
| **Nippon Express adapter** | ✅ Done | Blank form 01/04/2022, 8 commodity rows, per-cell fields. |
| **CEVA adapter** | ✅ Done | Blank form 11201-C3 rev. 8/2023, multiline column fields, whole-dollar values. |
| **Review screen** | ✅ Done | Per-field provenance, blocking/advisory checks, classification overrides with reason and approver. |
| **FedEx / UPS** | ✅ Done | Keying sheets ordered the way Ship Manager and WorldShip prompt, for manual entry. |
| **Local history** | ✅ Done | Exporter profile, per-consignee values, overrides and processed shipments in IndexedDB. |
| **Regression suite** | ✅ Done | 70 tests over three real shipments, plus guards for the silent failure modes. |
| **Desktop build** | 📅 Planned | Tauri packaging. `LocalStore` is already the seam; swap IndexedDB for file-backed storage. |
| **More carriers** | 📅 Planned | One adapter each. The parser and reconciler carry no carrier-specific logic. |
| **More CIPL formats** | 📅 Planned | The current parser targets the Omron layout; another format needs its own parser behind the same `ParsedCipl` contract. |

## Open questions

- **Box 26 net vs gross.** All historical shipments enter net weight into a box captioned
  "Gross Shipping Weight". Exposed as an adapter option, defaulting to net (observed
  practice) rather than hard-coded either way.
- **K78455CW** was cited in an early field-mapping analysis but its documents have not been
  provided, so its totals are unverified and it is not a fixture.

## Project history

| Date | Milestone | Details |
| :--- | :--- | :--- |
| 2026-07-27 | **Superseded monorepo removed** | Deleted `apps/`, `packages/`, `services/` and the docs describing them. |
| 2026-07-27 | **CIPL → SLI pipeline** | Client-side rewrite: parser, reconciliation, Schedule B validation, two carrier adapters, review screen. |
| 2026-01-16 | **Greenfield scaffolding** | Monorepo, Hono API, Prisma — since superseded. |
