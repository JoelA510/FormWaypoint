# FormWaypoint Roadmap

**Last Updated**: 2026-08-06

## Current focus

Two workflows, deliberately separate.

**Standard shipping** turns a combined commercial invoice & packing list into a completed
carrier Shipper's Letter of Instruction, on this machine. Two CIPL formats and two carriers
are supported end to end, verified against real, manually-processed shipments.

**Dangerous goods — air** classifies lithium, lithium metal and sodium ion batteries under the
IATA DGR, checks a consignment against the limits its classification carries, and produces the
Shipper's Declaration for Dangerous Goods and the package checklist. Conventional shipping
stays free of hazard questions, because a hazard question asked of every shipment is a hazard
question nobody reads.

It ships as a web app and as a Windows desktop app; the desktop build adds the in-app Schedule
B refresh, which cannot work in a browser.

## Milestone tracker

| Feature | Status | Description |
| :--- | :--- | :--- |
| **CIPL parser** | ✅ Done | Position-aware text extraction; FC/TP1 sets, multi-page detail, repeated POs. No OCR — the documents have a text layer. |
| **Second CIPL format** | ✅ Done | The SAP-style `SHIPMENT#` layout behind a format registry: single currency, stated ECCNs, no weights, two-digit dates. |
| **Reconciliation** | ✅ Done | USD set selection, invoice↔packing-list join, grouping by Schedule B + D/F, blocking totals checks. |
| **Schedule B validation** | ✅ Done | Census AES dataset: 10 digits, currently active, required unit of quantity, description plausibility. Staleness warning once a January/July revision passes the dataset's date. |
| **Unit of quantity** | ✅ Done | Each row filed in the unit its commodity number requires — the net weight where Schedule B reports a code by weight — with the unit changeable per code on the review screen, carried identically into both SLIs and both keying sheets. Never invents a figure a shipment cannot state. |
| **Incoterms** | ✅ Done | The rule read off `DAP Singapore`, `FOB Origin - Collect` or `Ex Works` rather than matched literally, with the named place preserved and written where a form has no box for it. Rules withdrawn since Incoterms 2020 reported, never remapped. |
| **Item library** | ✅ Done | Item-master import (.xlsx/.csv/.tsv, columns matched by heading, explicit weight unit) supplying per-part weights, with the `####.##.####` + concordance filter flagging codes to fix by part number. |
| **Nippon Express adapter** | ✅ Done | Blank form 01/04/2022, 8 commodity rows, per-cell fields. |
| **CEVA adapter** | ✅ Done | Blank form 11201-C3 rev. 8/2023, multiline column fields, whole-dollar values. |
| **Review screen** | ✅ Done | Per-field provenance, blocking/advisory checks, classification overrides with reason and approver. |
| **FedEx / UPS** | ✅ Done | Keying sheets ordered the way Ship Manager and WorldShip prompt, for manual entry. |
| **Local history** | ✅ Done | Exporter profile, per-consignee values, per-part weights, the item library, overrides and processed shipments in IndexedDB. |
| **Lithium battery classification (air)** | ✅ Done | UN3480/3481/3090/3091/3551/3552, PI 965–970 and 976–978, Sections IA/IB/I/II from chemistry, cell-or-battery, configuration and energy content. Per-package limits, state of charge, marks and labels, air waybill statements. Every figure cited against the training material it came from. |
| **Consignment assessment (air)** | ✅ Done | Package limits per regulatory entry and A181 totals, aircraft type, UN specification packaging, the battery-mark exemption and its two-package consignment ceiling, forbidden conditions (A154, A183), state and operator variation confirmation. |
| **UN 38.3 coverage** | ✅ Done | Tested-article scope against the article in the box. A module summary held against an assembled pack blocks with both levels named. |
| **State of charge as evidence** | ✅ Done | Value, basis, method, date, measurer. An indicated-capacity reading blocks wherever the 25% alternative does not apply — everywhere but contained-in-equipment. |
| **Three weights** | ✅ Done | Gross, equipment net and battery net entered separately and never derived from one another. Contents heavier than the package block. |
| **Operating carrier** | ✅ Done | Separate from the forwarder, with its source. Unresolved blocks, because operator variations attach to the airline. |
| **Overpack integrity** | ✅ Done | An identifier on every overpack, the OVERPACK mark, and the reproduce-marks-unless-visible rule on the package requirements. |
| **Vehicle question** | ✅ Done | Asked of any battery with equipment; undetermined blocks. Names UN3556/3557/3558 by air and the unadopted UN3171 position in 49 CFR. |
| **Shipper's Declaration** | ✅ Done | Drawn to the IATA layout rather than filled, since no blank form exists to fetch. Red hatched margins, struck-out aircraft and shipment type, real page x of y, overpack wording in all three of its forms, forwarder boxes left fillable, signature block empty. |
| **Package checklist** | ✅ Done | Markdown to print and work through — the only deliverable for a Section II consignment, where the battery mark and the air waybill statement carry the whole of the hazard communication. |
| **DG retention** | ✅ Done | Prepared consignments recorded locally with the date the two-year retention obligation runs to. |
| **Regression suite** | ✅ Done | 336 TypeScript tests: five real shipments across both CIPL formats, plus the lithium battery course's own worked scenarios, plus Rust unit tests for the shell's path handling. |
| **Desktop packaging seam** | ✅ Done | `localStore` is the single named implementation; a Tauri build replaces one assignment. Windows-only target; WebView2 covers every platform API the app uses. |
| **Desktop build (.exe)** | ✅ Done | Tauri v2 shell; the Windows installer is built by the `Desktop build` workflow. Four Rust commands and no decisions. TLS goes through the OS certificate store, so a corporate inspection CA is trusted, and an environment proxy is honoured. |
| **Schedule B revision diff** | ✅ Done | `src/domain/schedule-b/revision.ts` — diffs two datasets, intersects the result with the item library by part, and renders the change log and CSV worklist. Pure logic, no filesystem or network. |
| **In-app Schedule B refresh** | ✅ Done | Downloads the concordance, diffs it, writes the change log and CSV worklist, then replaces the dataset. Verified end to end against the live Census server in a packaged binary. |
| **More carriers** | 📅 Planned | One adapter each. The parser and reconciler carry no carrier-specific logic. |
| **More CIPL formats** | 📅 Planned | A detector and a parser behind the same `ParsedCipl` contract — the registry and everything downstream are already shared. |
| **DG by ground and vessel** | 📅 Planned | The classification module is air-only by design. Ground adds the 49 CFR "medium" band and its own shipping paper; vessel adds IMDG special provision 188 and the multimodal dangerous goods form. Both reuse the consignment model unchanged. |
| **State and operator variations** | 📅 Planned | Currently a confirmation the reviewer ticks, because no dataset ships with the app. A per-operator table — UPS 5X-08 and the rest — would turn the reminder into a check. |

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

## What the dangerous goods workflow still does not do

Two supplied documents — an ORT per-shipment checklist and a domain specification — describe a
platform considerably larger than this workflow. `docs/dangerous-goods-fact-check.md` records
which of their claims were confirmed, which could not be reached, and which was wrong. What is
knowingly absent:

- **A ruleset maintained as versioned data.** Thresholds and limits are in source with
  citations, which means a January revision is a code change. The specification is right that
  this should be data a compliance user publishes; it is a larger piece of work than the
  workflow it would serve.
- **A governed battery master.** Keyed on manufacturer, model and revision, with article level
  and composition, so the engine resolves which revision is physically in the box rather than
  which is on the drawing. Today each consignment is described from scratch.
- **Scoped approval objects, annual production run evidence, and personnel qualification
  gating.** All three are how the prototype, low-production-run and A99 paths would actually
  clear rather than simply block.
- **Forwarder DG approval and HAWB weight reconciliation as workflow states.** The checklist is
  explicit that pickup is not scheduled before forwarder approval and that the house air waybill
  weight must be checked against the packing record. Both appear on the generated checklist as
  steps; neither is a state the application tracks.
- **PI 910 and PI 974 on an approved declaration.** Claimed by the specification, unconfirmable
  from anything available here, and therefore not implemented rather than guessed.

## Where the dangerous goods figures come from

Every threshold, limit, packing instruction and statement in
`src/domain/dangerous-goods/lithium.ts` is cited against the figure it was taken from in the
Labelmaster *Shipping Lithium Batteries — Excepted & Fully Regulated* multimodal course
(Student Guide rev. 02/01/2026; Supplemental Appendix rev. 01/01/2025). Where the materials
allow, a figure is sourced twice: the Section I and Section II package limits come from
columns I–L of the List of Dangerous Goods *and* from the per-section requirement tables, and
they agree. The Section IB limits — 10 kg for lithium ion, 2.5 kg for lithium metal — come
only from figure 5-29, because the List of Dangerous Goods defers to the packing instruction
for UN3480 and UN3090.

The PI 965 text reproduced in the appendix confirms the Student Guide figures directly:
Table 965-IA gives passenger `Forbidden` and cargo 35 kg, Table 965-IB gives `Forbidden` and
10 kg, and special provision A802 expressly excepts Section IB from UN specification packaging.

Nothing is interpolated. Where the materials state no limit, the module says so instead of
inventing one, and the assessment reports it rather than passing it silently.

Two boundaries are deliberate and should stay:

- **Air only.** The ground "medium" band — ion cells >20 and ≤60 Wh, batteries >100 and
  ≤300 Wh — has no air equivalent, and a battery this module calls large is large *by air*.
- **No variations.** State and operator variations change what is acceptable more often than
  the DGR does, and none of them ship with the app. The reviewer confirms; the app does not
  pretend.

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
| 2026-08-06 | **DG fact check and hardening** | The supplied ORT checklist and domain specification worked through against the PI 965 text and eCFR. UN 38.3 article coverage, three weights, state-of-charge evidence, operating carrier, overpack identity, the corrected co-packing list, packaging authorization limits and the vehicle question all folded in. |
| 2026-08-06 | **Dangerous goods — air** | Lithium and sodium battery classification, consignment assessment, the Shipper's Declaration drawn to the IATA layout, the package checklist, and two-year retention — behind its own tab, leaving conventional shipping untouched. |
| 2026-07-28 | **Pre-packaging pass** | Store seam narrowed to one assignment, Schedule B staleness warning, toolchain bumps (vite 8, vitest 4), monorepo leftovers removed. |
| 2026-07-27 | **Item library** | Dependency-free .xlsx/.csv import, per-part weights, commodity-number screening. |
| 2026-07-27 | **Second CIPL format** | `SHIPMENT#` parser behind a format registry; sales order vs customer PO separated. |
| 2026-07-27 | **Superseded monorepo removed** | Deleted `apps/`, `packages/`, `services/` and the docs describing them. |
| 2026-07-27 | **CIPL → SLI pipeline** | Client-side rewrite: parser, reconciliation, Schedule B validation, two carrier adapters, review screen. |
| 2026-01-16 | **Greenfield scaffolding** | Monorepo, Hono API, Prisma — since superseded. |
