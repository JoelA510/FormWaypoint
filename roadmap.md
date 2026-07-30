# FormWaypoint Roadmap

**Last Updated**: 2026-07-30

## Current focus

Turning a combined commercial invoice & packing list into a completed carrier Shipper's
Letter of Instruction, on this machine. Two CIPL formats and two carriers are supported end
to end, verified against real, manually-processed shipments. It ships as a web app and as a
Windows desktop app; the desktop build adds the in-app Schedule B refresh, which cannot work
in a browser, and writes the finished form to a path it can report back rather than handing
the bytes to the webview and losing track of them.

Two of the three planned items are the same shape of work: a new format or carrier is a
detector, a parser, or an adapter, and nothing downstream changes. Denied-party screening is
the one that adds a capability rather than a variant, and it is deliberately modelled on
Schedule B validation — a published list, shipped with the app and refreshable, checked
against rather than inferred from.

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
| **Regression suite** | ✅ Done | 322 TypeScript tests, 122 of them over six real shipments across both formats, plus Rust unit tests for the shell's path handling. A clean checkout runs 200 and skips the 122 that need the uncommitted shipment documents. |
| **Desktop packaging seam** | ✅ Done | `localStore` is the single named implementation; a Tauri build replaces one assignment. Windows-only target; WebView2 covers every platform API the app uses. |
| **Desktop build (.exe)** | ✅ Done | Tauri v2 shell; the Windows installer is built by the `Desktop build` workflow. Seven Rust commands and no decisions. TLS goes through the OS certificate store, so a corporate inspection CA is trusted, and an environment proxy is honoured. |
| **Schedule B revision diff** | ✅ Done | `src/domain/schedule-b/revision.ts` — diffs two datasets, intersects the result with the item library by part, and renders the change log and CSV worklist. Pure logic, no filesystem or network. |
| **In-app Schedule B refresh** | ✅ Done | Downloads the concordance, diffs it, writes the change log and CSV worklist, then replaces the dataset. Verified end to end against the live Census server in a packaged binary. |
| **Saved output** | ✅ Done | `save_output` writes the filled SLI or keying sheet into Downloads and returns the path, `open_output` opens it; the panel reports where the file landed. Regenerating suffixes rather than overwriting, because the earlier copy may already be signed. Browser builds keep the blob download, which is all a browser can do. |
| **More carriers** | 📅 Planned | One adapter each. The parser and reconciler carry no carrier-specific logic. |
| **Denied-party screening** | 📅 Planned | The consignee checked against the Consolidated Screening List, shipped and refreshed the way `schedule-b.json` is. A match is reported with the list and the matched field, never scored into a pass/fail the filer cannot inspect. No decision is made for them. |
| **More CIPL formats** | 📅 Planned | A detector and a parser behind the same `ParsedCipl` contract — the registry and everything downstream are already shared. |

## How the in-app Schedule B refresh works

The refresh runs in Rust, not in the webview —
`https://www.census.gov/.../expaes.txt` returns no `access-control-allow-origin` header, so
a `fetch` from the page is blocked no matter how the app is packaged.

**What it does.** Downloads the concordance, parses it with `parse-concordance.ts` (pinned
against the checked-in raw file and the committed dataset, so it cannot drift from
`scripts/build-schedule-b.mjs`), diffs it, and writes the change log and the CSV worklist
into the app's data directory *before* replacing `schedule-b.json`. A refresh that failed
mid-way can therefore never leave a swapped dataset with no record of what moved.

**Why a change log, and what goes in it.** The log exists to be read by a person and then
acted on by hand — reviewed, carried into a later Schedule B session, and used to correct
the JDE Item Tag. Those uses want two different scopes, so the log carries both, clearly
separated:

1. *The revision itself* — every code added, retired, or whose description or required unit
   of quantity changed. Retirements and unit changes matter most: a retired code is a filing
   AES will reject, and a changed unit silently invalidates how a line's quantity is
   reported.
2. *What it means for this item master* — the subset intersected with the imported item
   library, keyed by part number. This is the actionable list, because a nationwide revision
   touches hundreds of codes and only the handful held against real parts drive a JDE edit.

**Format.** A dated, append-only file (`schedule-b-changes-YYYY-MM-DD.md` or a CSV
companion) — never overwritten, so the history of revisions accumulates and an earlier one
can still be consulted after a later refresh.

**Boundaries, unchanged from the rest of the tool.** The refresh never edits the item
library, never reclassifies a part, and never rewrites a code. It reports what Census
changed and which of your parts that touches; every correction stays a human action.

## Considered and not planned

An earlier set of enhancement proposals was written for the monorepo — a Hono API with
Postgres, carrier rate shopping, booking and label printing. Recording why they do not
apply, so they are not re-proposed as though nothing had changed:

| Proposal | Why not |
| :--- | :--- |
| Rate shopping, landed cost, carrier scorecards, carbon estimates | All need live carrier rate APIs and an account relationship. This tool talks to no carrier; it fills the form the carrier already gave you. |
| Bulk booking, batch label printing, mass status updates | These assume a shipment lifecycle — booked, in transit, delivered — that does not exist here. A shipment is a document in and a form out. |
| Vendor portal for suppliers | Needs a server, accounts and someone else's data on it. That is a different product, and rule 1 makes it a product decision rather than a feature. |
| ERP sync heartbeat | The item-master import already covers the part that mattered: getting weights and codes out of the ERP. A live connection buys nothing a periodic export does not. |
| Auto-archiving generated documents | Largely done. Processed shipments are kept locally for autofill and audit, and the desktop build reports the path it saved to. |

## Open questions

- **Box 26 net vs gross.** All historical shipments enter net weight into a box captioned
  "Gross Shipping Weight". Exposed as an adapter option, defaulting to net (observed
  practice) rather than hard-coded either way.
- **K78455CW** was cited in an early field-mapping analysis but its documents have not been
  provided, so its totals are unverified and it is not a fixture.
- **Item-master cleanup.** One imported library flags 1,456 of 2,856 rows — import-HTS
  numbers filed where Schedule B numbers belong. The tool lists them by part; correcting
  them in the source system is a separate effort, and one it deliberately does not do for
  you.

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
| 2026-07-30 | **Saved output** | `save_output`/`open_output` on the shell: the app learns where the finished form landed and opens it, instead of losing the blob to the webview. |
| 2026-07-28 | **Pre-packaging pass** | Store seam narrowed to one assignment, Schedule B staleness warning, toolchain bumps (vite 8, vitest 4), monorepo leftovers removed. |
| 2026-07-27 | **Item library** | Dependency-free .xlsx/.csv import, per-part weights, commodity-number screening. |
| 2026-07-27 | **Second CIPL format** | `OMRON SHIPMENT#` parser behind a format registry; sales order vs customer PO separated. |
| 2026-07-27 | **Superseded monorepo removed** | Deleted `apps/`, `packages/`, `services/` and the docs describing them. |
| 2026-07-27 | **CIPL → SLI pipeline** | Client-side rewrite: parser, reconciliation, Schedule B validation, two carrier adapters, review screen. |
| 2026-01-16 | **Greenfield scaffolding** | Monorepo, Hono API, Prisma — since superseded. |
