# FormWaypoint Roadmap

**Last Updated**: 2026-07-28

## Current focus

Turning a combined commercial invoice & packing list into a completed carrier Shipper's
Letter of Instruction, entirely in the browser. Two CIPL formats and two carriers are
supported end to end, verified against real, manually-processed shipments. Next up: the
Tauri desktop packaging.

## Milestone tracker

| Feature | Status | Description |
| :--- | :--- | :--- |
| **CIPL parser** | ✅ Done | Position-aware text extraction; FC/TP1 sets, multi-page detail, repeated POs. No OCR — the documents have a text layer. |
| **Second CIPL format** | ✅ Done | The SAP-style `OMRON SHIPMENT#` layout behind a format registry: single currency, stated ECCNs, no weights, two-digit dates. |
| **Reconciliation** | ✅ Done | USD set selection, invoice↔packing-list join, grouping by Schedule B + D/F, blocking totals checks. |
| **Schedule B validation** | ✅ Done | Census AES dataset: 10 digits, currently active, required unit of quantity, description plausibility. Staleness warning once a January/July revision passes the dataset's date. |
| **Item library** | ✅ Done | Item-master import (.xlsx/.csv/.tsv, columns matched by heading, explicit weight unit) supplying per-part weights, with the `####.##.####` + concordance filter flagging codes to fix by part number. |
| **Nippon Express adapter** | ✅ Done | Blank form 01/04/2022, 8 commodity rows, per-cell fields. |
| **CEVA adapter** | ✅ Done | Blank form 11201-C3 rev. 8/2023, multiline column fields, whole-dollar values. |
| **Review screen** | ✅ Done | Per-field provenance, blocking/advisory checks, classification overrides with reason and approver. |
| **FedEx / UPS** | ✅ Done | Keying sheets ordered the way Ship Manager and WorldShip prompt, for manual entry. |
| **Local history** | ✅ Done | Exporter profile, per-consignee values, per-part weights, the item library, overrides and processed shipments in IndexedDB. |
| **Regression suite** | ✅ Done | 154 tests over five real shipments across both formats, plus guards for the silent failure modes. |
| **Desktop packaging seam** | ✅ Done | `localStore` is the single named implementation; a Tauri build replaces one assignment. Windows-only target; WebView2 covers every platform API the app uses. |
| **Desktop build (.exe)** | 📅 Planned | Tauri packaging around the existing seam. Decide there whether Schedule B refresh moves in-app (a filesystem makes it easy). |
| **More carriers** | 📅 Planned | One adapter each. The parser and reconciler carry no carrier-specific logic. |
| **More CIPL formats** | 📅 Planned | A detector and a parser behind the same `ParsedCipl` contract — the registry and everything downstream are already shared. |

## Open questions

- **Box 26 net vs gross.** All historical shipments enter net weight into a box captioned
  "Gross Shipping Weight". Exposed as an adapter option, defaulting to net (observed
  practice) rather than hard-coded either way.
- **K78455CW** was cited in an early field-mapping analysis but its documents have not been
  provided, so its totals are unverified and it is not a fixture.
- **Item-master cleanup.** One imported library flags 1,456 of 2,856 rows — import-HTS
  numbers filed where Schedule B numbers belong. The tool lists them by part; correcting
  them in the source system is a separate effort.

## Known residue

- `npm audit` reports 6 high dev-only advisories, all one chain: eslint 9 →
  `@eslint/config-array` → `minimatch@3` → `brace-expansion@1`, whose DoS fix exists only
  in `brace-expansion@5` (a breaking API change no eslint-9-compatible release consumes).
  Escaping it requires eslint 10, which `eslint-plugin-jsx-a11y` does not yet support —
  dropping a11y linting to silence lint-time advisories is the wrong trade. Nothing from
  this chain ships: `npm audit --omit=dev` is clean, and CI audits with `--omit=dev`.

## Project history

| Date | Milestone | Details |
| :--- | :--- | :--- |
| 2026-07-28 | **Pre-packaging pass** | Store seam narrowed to one assignment, Schedule B staleness warning, toolchain bumps (vite 8, vitest 4), monorepo leftovers removed. |
| 2026-07-27 | **Item library** | Dependency-free .xlsx/.csv import, per-part weights, commodity-number screening. |
| 2026-07-27 | **Second CIPL format** | `OMRON SHIPMENT#` parser behind a format registry; sales order vs customer PO separated. |
| 2026-07-27 | **Superseded monorepo removed** | Deleted `apps/`, `packages/`, `services/` and the docs describing them. |
| 2026-07-27 | **CIPL → SLI pipeline** | Client-side rewrite: parser, reconciliation, Schedule B validation, two carrier adapters, review screen. |
| 2026-01-16 | **Greenfield scaffolding** | Monorepo, Hono API, Prisma — since superseded. |
