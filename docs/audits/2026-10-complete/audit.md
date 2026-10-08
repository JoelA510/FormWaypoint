# Audit

Repo: **JoelA510/FormWaypoint** · Commit audited: `36a74ddc75cabb77509a6cd336cd43502a59736d`
(main, 2026-09-17; the process delivery `169a282` that follows it touches only `prompts/`,
`.agents/` and `.claude/`) · Audited: 2026-10-08 · Auditor: Claude Code running
`prompts/existing-project.md` from JoelA510/repo-build-template main `9ed3142`

Complete means: a shipper at Omron installs it on Windows, gets updates without reinstalling,
and can produce SLI forms for CIPL documentation without the tool ever filing a wrong figure.

Project inputs, as the owner gave them on 2026-10-08:

- **State:** standard shipping (CIPL to SLI) works end to end for three CIPL formats (Vendor A,
  the `SHIPMENT#` layout, Omron 00004-00202), filling Nippon Express and CEVA SLIs and FedEx/UPS
  keying sheets. The dangerous goods (DG) workflow is built but has never been used, so it is
  assumed working, not known working.
- **Hosting and distribution:** an unsigned NSIS installer downloaded by hand from a GitHub
  Actions artifact; no auto-update. Code signing and an updater are wanted in scope. The web
  build is not deployed.
- **Constraints:** no customer shipment data in the repository, CI or fixtures, so real-data
  tests stay on the owner's machine; no backend; a $0 budget; the Antigravity workflow cut-off on
  2026-10-19. The owner is the only user, so nothing here disrupts anyone.
- **Known issues:** the two roadmaps, the silently skipped real-data tests, the repeated
  precision bugs. No issues are open in the tracker; the only open pull request is Dependabot's
  js-yaml security bump (#54, open since 2026-09-10).
- **Visibility and plan:** public (GitHub API). The account's plan wasn't readable here; a public
  repository can require a status check on any plan, so it doesn't change the plan.

Assumption: the DG workflow is outside "complete" (the definition names SLIs only, and DG has
never been used). DG findings are still graded on their own severity, because a wrong Shipper's
Declaration is a safety failure.

Verification labels: *statically reviewed* (read in the source), *executed* (a command was run
and its output observed), *fully validated* (run and verified end to end). Findings marked
"executed (reviewer)" were run by one of five parallel area reviewers in this pass and the
result read back; the ones that set a severity of blocker were re-run by the auditor and say so.

## Severity

- **Blocker:** cannot responsibly ship: data loss, a security hole, an authorization bypass, a
  broken core flow.
- **High:** will hurt users or the team soon: an unenforced guarantee, a silent failure path, a
  missing test on logic people depend on.
- **Medium:** real debt with a schedule.
- **Low:** polish.

## Baseline (run before reading for findings)

Run on 2026-10-08 in a separate worktree of `36a74dd` (never the working tree), Linux, Node
24.21.0, npm 11.19.0, rustc/cargo 1.97.0.

| Gate | Command | Result | Notes (counts, skips, flags it needed, environment) |
| --- | --- | --- | --- |
| Install | `npm ci` | PASS | One deprecation warning (whatwg-encoding, via jsdom). |
| Typecheck | `npm run typecheck` | PASS | `tsc -b --noEmit`, `strict` on. |
| Lint | `npm run lint` | PASS | `eslint .`, no warnings printed. ESLint 9.39.5, end-of-life since 2026-08-06. |
| Unit / integration tests | `npm test` | PASS, with 122 skipped | 29 files passed, 7 skipped; 947 tests passed, **122 skipped**, 0 failed. Every skip is `describe.skipIf(!hasFixtures())`: the real-shipment suite, whose documents are gitignored. Exit code 0; nothing but the summary line says so. |
| Real-shipment suite | (same, with `src/test/fixtures/` present) | BLOCKED (environment) | The documents are kept off the repository by design. Last recorded full run: commit `1e181f5`, 2026-07-28 (209 tests). 28 non-merge commits since have touched the parsers, reconcile, the adapters or `draft.ts`. |
| E2E tests | none | ABSENT | No Playwright, no Testing Library, no `.test.tsx`. |
| Build | `npm run build` | PASS | Main chunk 987.54 kB (353.69 kB gzip), pdf chunk 373.77 kB, pdf.js worker 2,346 kB. `vite.config.ts` raises `chunkSizeWarningLimit` to 1200, so the bundler doesn't warn. |
| Desktop installer | `npx --yes @tauri-apps/cli@^2 build` (desktop.yml) | BLOCKED (environment) | Needs a Windows runner; not run. |
| Rust format | `cargo fmt --check` | FAIL | Formatting drift in `src-tauri/src/lib.rs` (three hunks). |
| Rust lint | `cargo clippy --all-targets -- -D warnings` | FAIL | One error: `ptr_arg` at `src-tauri/src/lib.rs:92` (`&PathBuf` for `&Path`). Needed the WebKitGTK/GTK development libraries installed first. |
| Rust tests | `cargo test` | PASS | 4 tests (`unique_path`, `safe_join`), Linux. CI runs them only in desktop.yml, on pushes to main. |
| Dependency audit | `npm audit --omit=dev --audit-level=high` / `npm audit --audit-level=high` | PASS / FAIL | Production: 0. Everything: 6 (4 high, 2 moderate), all dev-only (vitest/@vitest/mocker, brace-expansion, js-yaml, nanoid, source-map-js). No waivers. CI runs only the production audit, with `continue-on-error`. |
| Standards conformance | `npm run check:conformance -- --root <repo>` (template 9ed3142) | FAIL | Packs detected: core, node, tauri, vite-spa. 16 fail, 1 skipped, 8 pass, 3 n/a, 7 audit. Failing: core.agent-rules, core.dependency-updates, core.instructions-resolve, core.no-agent-workflows, core.process-delivered (since fixed by `169a282`), core.security-policy, core.workflows-audited, node.audit-gate, node.ci-uses-pin, node.install-guards, node.runtime-pinned, node.unused-code, tauri.rust-gates-in-ci, tauri.supply-chain, vite-spa.bundle-budget, vite-spa.client-env. Skipped: core.license (visibility not declared). n/a: tauri.updater-key (no updater). |
| Agent instructions | `npm run check:instructions -- --root <repo>` | FAIL | 15 findings: 8 hidden characters in `.agent/rules/30-design-standards.md`, 7 paths that don't exist. |
| Client env | `npm run check:env -- --root <repo>` | FAIL | 1 finding: `import.meta.env` read whole at `src/domain/cipl/parse-vendor-b.ts:44`. |
| Repository settings | `npm run check:settings -- --repo JoelA510/FormWaypoint` | BLOCKED (environment) | The session's token was refused (401). The reviewer read three settings through the GitHub API instead (see 7.3, 8.4). |

Runtime: local Node 24.21.0 (this run); CI Node `'24'`, written into both workflows, with no pin
file (`package.json` `engines` says `>=22.12.0`); production is WebView2 on Windows (evergreen)
plus a Rust binary built on `dtolnay/rust-toolchain@stable` (unpinned; `Cargo.toml` declares
`rust-version = "1.77"`).

## Known issues going in

- **The two roadmaps**: `roadmap.md` and `docs/ROADMAP_ENHANCEMENTS.md`. See §12 (12.5).
- **Silently skipped real-data tests**: `src/test/fixtures.ts`, `describe.skipIf(!hasFixtures())`.
  Confirmed and worse than described: with the skip in place, no running test checks a weight,
  value, header or hazmat box on either SLI. See §6 (6.1 to 6.5).
- **Repeated precision bugs**: 16 fix commits between 2026-07-27 and 2026-09-17. Confirmed; the
  root pattern is that no one module turns a figure into what a box files. See §4 (4.3) and §5
  (5.1).
- **Issue tracker**: nothing open. Dependabot PR #54 is §8 (8.3).
- **Antigravity workflows stop on 2026-10-19** (13 in `.agent/workflows/`). Confirmed. See §12
  (12.1); the mapping heads the remediation plan.

## Summary

| # | Area | Severity of worst finding | One-line state |
| --- | --- | --- | --- |
| 1 | Architecture & boundaries | Medium | Clean domain/UI split; the item-library preview converts weights differently from the import; `domain` and `carriers` import each other. |
| 2 | Type safety | Medium | `strict`, zero `any`; 205 unchecked index reads under `noUncheckedIndexedAccess`, 129 of them in the CIPL parsers. |
| 3 | Auth & authorization | n/a | No backend, no accounts. Who can ship code to users is covered in §7 and §8. |
| 4 | Data layer | Medium | Identifiers stay text, multi-step writes are transactional; unread totals become zero, rounding is scattered, saved records aren't validated. |
| 5 | Error handling | Blocker | FedEx/UPS keying sheets key net weight as "Gross" whenever the CIPL prints no gross. No error boundary. |
| 6 | Testing | Blocker | 947 tests pass, yet a 10% error planted in every SLI weight and value passes them all. |
| 7 | CI/CD | High | CI runs the gate on PRs but isn't required; no release, versioning, updater or rollback. |
| 8 | Security | Blocker | Five customer CIPLs reachable through public pull-request refs. Installer unsigned. |
| 9 | Observability | High | No logging, no error capture, no visible version. |
| 10 | Performance | Low | pdf.js lazy; pdf-lib (about 408 kB) and the DG workflow load eagerly. |
| 11 | Accessibility & UX completeness | Medium | Every control labelled; several token pairs fail AA contrast; no live regions or focus management. |
| 12 | Docs, operability & stated-rule conformance | High | Every agent rule lives in Antigravity-only files that stop on 2026-10-19; roadmaps conflict; no desktop runbook. |

## 1. Architecture & boundaries

- **Current state:** `src/domain/`, `src/carriers/` and `src/lib/` import no React, `features/`
  or `store/` code. `src/App.tsx` (985 lines, about 20 `useState`) holds all workflow state.
  The local store sits behind one seam (`src/store/local-store.ts`), and the native surface is
  one file (`src-tauri/src/lib.rs`).
- **Findings:**
  - **1.1** `Medium` `executed (reviewer)`. The item-library import preview converts weights
    differently from the import itself. The preview (`src/features/item-library.tsx:333-337`,
    `previewKg`) strips every comma. The import (`src/domain/item-library/index.ts:226-239`)
    reads `1,5` as 1.5. For a gram column, `1,5` is stored as 0.0015 kg and previewed as
    0.015 kg (10x); `0,25` is stored as 0.00025 kg and previewed as 0.025 kg (100x). The preview
    is the screen where the operator chooses the unit, so it invites the wrong choice. The pound
    factor is also written out three times (`src/domain/units.ts:17`,
    `src/domain/item-library/index.ts:60`, `src/features/item-library.tsx:336`).
  - **1.2** `Medium` `statically reviewed`. `domain` and `carriers` import each other:
    `src/domain/draft.ts:10-11` imports `carriers/types` and the runtime `parseLooseDate` from
    `carriers/form-utils` (which imports pdf-lib), while carriers import `domain/draft` and
    `domain/types`. The Vendor B parser reads build-time env directly
    (`src/domain/cipl/parse-vendor-b.ts:43-56`), so a developer's `.env.local` changes how a
    locally built installer parses documents, with no typed env module.
  - **1.3** `Low` `statically reviewed`. The same value is derived in several places. The
    keyed-carrier adapter fallback is written three times (`src/App.tsx:161,292,857`).
    `src/features/schedule-b-refresh.tsx:46` stamps a UTC date that `src/lib/report.ts:55-59`
    documents as wrong and replaces with `localDate()`.
  - **1.4** `Low` `statically reviewed` `node.unused-code` (§1). Functions with no callers
    (`loadScheduleB` in `src/domain/schedule-b/index.ts:163`, `isDesktop` in
    `src/desktop/index.ts:52`, `parseVendorBShipment` in
    `src/domain/cipl/parse-vendor-b.ts:218`). An `@` alias nothing imports. An ESLint override
    for `src/components/ui/**`, which matches nothing because the file is
    `src/components/ui.tsx`. Node types in the browser tsconfig. No knip in CI.
- **Pattern that closes the gap:** one exported `parseWeight` used by both preview and import,
  with a test that they agree; shared types and date parsing moved into `domain`; parser markers
  passed in through a typed config; a `no-restricted-imports` boundary rule per folder; knip in CI.

## 2. Type safety

- **Current state:** `strict` is on. An AST scan of non-test source found zero `any`, 78 `as`
  casts (mostly narrowing `<select>` values) and 3 non-null assertions, all safe
  (`parse-vendor-b.ts:321,412` after identical guards; `main.tsx:6`). ESLint uses the
  non-type-aware `tseslint.configs.recommended`. The scorecard passes `node.strict-types`.
- **Findings:**
  - **2.1** `Medium` `executed (reviewer)`. `tsc -p tsconfig.app.json --noUncheckedIndexedAccess`
    reports 205 errors in non-test source, 129 in the CIPL parsers (parse-vendor-a 70,
    parse-omron-ci 37, parse-vendor-b 22); `--exactOptionalPropertyTypes` reports 20. In a
    parser, an out-of-range index becomes `undefined` and flows into `Number()` or string
    concatenation with no compile error: the shape of several past precision and column bugs.
  - **2.2** `Medium` `statically reviewed`. External data is cast, not validated: nine IndexedDB
    reads (`src/store/local-store.ts:395-503`), the profile (`src/App.tsx:232`), the Schedule B
    payload (`src/domain/schedule-b/index.ts:158`, `res.json() as RawPayload`; `refresh.ts:106`
    checks only that `codes` is non-empty) and Tauri command results (`src/desktop/index.ts:65`).
    Same root as 4.6.
- **Pattern that closes the gap:** `noUncheckedIndexedAccess` on `src/domain/cipl` first, with a
  ratchet baseline for the rest; type-aware lint (`recommendedTypeChecked`,
  `no-floating-promises`); a validating decoder at each boundary (4.6).

## 3. Auth & authorization

- **Current state:** Doesn't apply as written. There is no backend, account or server-side data.
  The one network call is an unauthenticated GET to a fixed census.gov URL from Rust
  (`src-tauri/src/lib.rs:28-29`). Data stays in IndexedDB inside WebView2, the app data folder and
  Downloads, protected by the Windows user account, which suits a per-user install
  (`src-tauri/tauri.conf.json`, `installMode: currentUser`).
- **Findings:** none in this area. The authority that does apply, who can put code on the
  shipper's machine, is today anyone who can push to `main` (7.3). Once an updater exists it is
  whoever holds the update-signing key (7.1). Both are recorded where they're fixed.
- **Pattern that closes the gap:** n/a.

## 4. Data layer

- **Current state:** Identifiers stay text: 9,746 Schedule B codes, all 10 characters, 839 with a
  leading zero, kept as strings (executed, reviewer). Part numbers go through `partKey`. The
  xlsx writer emits numeric cells only for typed numbers (`src/lib/xlsx.ts:78,94`). Multi-step
  store writes are transactional (`savePartOverride`, `replaceItems`,
  `src/store/local-store.ts:411-451`). IndexedDB is versioned per store (`DB_VERSION = 5`,
  `local-store.ts:22`). A non-USD set, a missing packing-list net total, and a blank or zero line
  weight each block (`src/domain/reconcile/index.ts:659,826,883`). A Schedule B refresh rejects
  a download of fewer than 5,000 codes (`src/domain/schedule-b/parse-concordance.ts:61`).
  Arithmetic is partly centralised: `src/domain/units.ts` (`roundTo`, `roundPrecise`,
  `roundScaled`), `src/lib/apportion.ts` (largest remainder), and `FIGURE_ON_LINE`
  (`reconcile/index.ts:410-414`).
- **Findings:**
  - **4.1** `Medium` `statically reviewed`. A blank becomes zero, and "nothing read" can pass.
    Unread header totals become 0 (`parse-vendor-a.ts:292-293`, `parse-vendor-b.ts:129,249`,
    `parse-omron-ci.ts:527`). A line with no value contributes 0 (`reconcile/lines.ts:296,327`),
    and no per-line `values-present` check matches `weights-present`. Reconcile has no "at least
    one commodity row" check (`reconcile/index.ts:384`); `parse-vendor-b-shapes.test.ts:301`
    notes that "every other check compares zero against zero and passes". For Omron, headings
    not found returns `[]` with a warning (`parse-omron-ci.ts:636-637`); if the totals band is
    also unread, total value compares 0 with 0. The audit record stores
    `totalNetWeightKg ?? 0` (`App.tsx:504`).
  - **4.2** `Medium` `statically reviewed`. CEVA files whole dollars with no floor:
    `String(Math.round(l.valueUsd))` (`src/carriers/ceva/adapter.ts:256`) prints `0` for a row
    under $0.50, and nothing warns. Quantities already have a floor and a warning
    (`units.ts:87-89`, `reconcile/index.ts:296-335`).
  - **4.3** `Medium` `executed (reviewer)`. Root pattern of the precision bugs: several rounding
    rules with different tie behaviour, and no single module that turns a figure into what a box
    files. Each adapter rounds its own boxes (`ceva/adapter.ts:254,256`;
    `nippon-express/adapter.ts:208,210`), and the keying sheet has its own `kgToLb`
    (`keying-sheet/index.ts:221-222`). At least six bare `Math.round(x*f)/f` copies exist
    (`parse-vendor-b.ts:523-525`, `parse-vendor-a.ts:687`, `features/review.tsx:330`,
    `dangerous-goods/assess.ts:100`, `dangerous-goods/dgd.ts:133`,
    `item-library/index.ts:239`). Money is float dollars. Results: `Number((1.005).toFixed(2))`
    is 1 while `roundTo(1.005,2)` is 1.01; `(2.675).toFixed(2)` is 2.67 while `roundTo` gives
    2.68. The figure box commits with `toFixed` (`review.tsx:749`) while reconciliation uses
    `roundTo`. Today's impact is small because adapters `toFixed` values that are already
    rounded; most of the 16 fixes were one figure computed at two surfaces, and these are the
    surfaces left. The history:
    - `0d96f92`: a packing-list total that couldn't be read dropped the weight check.
    - `01a2940`, `14dcb10`, `9be7669`: a total read from the wrong row or page.
    - `81d69b3`, `e65e661`: DG package counts floored or fractional.
    - `a4e48ff`, `5c0a0b9`, `66238db`, `7e5ab64`: restated quantities and `roundTo`.
    - `5122489`, `bcd978a`: the keying sheet rounding groups on its own.
    - `6236598`, `c62a272`, `1e969f4`: entered figures, display precision used as filing
      precision.
    - `b954496`, `3db2d5d`: Vendor A weights read from the wrong column.
  - **4.4** `Medium` `statically reviewed`. With the Schedule B index absent, classification
    checks fall back to one warning (`reconcile/index.ts:1183-1193`) and skip the blocking
    10-digit and active-code checks (`schedule-b/index.ts:304-331`). The index starts null and
    loads asynchronously (`App.tsx:105,207-214`), so generation is allowed during that window
    and after any load failure. The header badge then reads "loading Schedule B…" for good
    (`App.tsx:693`).
  - **4.5** `Medium` `statically reviewed`. Dataset staleness isn't gated and can be masked.
    `scheduleBIsStale` only drives banners (`App.tsx:689,770`) and isn't stored with the
    shipment. `scripts/build-schedule-b.mjs:62` stamps `generatedAt` with the run date, so
    re-running without `--fetch` makes the checked-in concordance look current. The bundled data
    is dated 2026-07-27 and goes stale on 2027-01-01.
  - **4.6** `Medium` `statically reviewed`. Persisted records have no schema version or
    validation. `upgrade()` only adds stores (`local-store.ts:314-357`). Reads are casts
    (`:395-480`). The profile isn't merged with defaults (`App.tsx:232`). A non-finite stored
    weight would pass `weights-present` (`NaN <= 0` is false; `lines.ts:121-124`) and print
    `NaN`. `upgrade()` is untested. With an auto-updater (7.1), every release meets the previous
    release's records, so this becomes the update path's main data risk.
  - **4.7** `Medium` `statically reviewed`, needs an owner decision. Net weight is filed in boxes
    captioned for shipping or gross weight. `nippon-express/adapter.ts:33-35` states that box 26
    "Gross Shipping Weight" gets net weight, following past forms. CEVA's `Shipping Weight`
    column (`ceva/fields.ts:39`, `adapter.ts:254`) does the same. `useGrossWeight` and
    `grossWeightByRow` exist but nothing sets them (`registry.ts:28,33`). Whether that is a
    wrong figure depends on the filing rule (15 CFR 30.6 defines shipping weight as including
    packaging, as the reviewer recalls; not re-checked in this pass) and on what the carriers
    accept.
- **Pattern that closes the gap:** carry `null` through header totals and block on it; a blocking
  `rows-present` check and a per-line value check; one filed-figure module (integer cents and
  grams, one rounding function, a floor-or-warn policy per box) with a lint rule against bare
  `toFixed`/`Math.round` on figures elsewhere; Schedule B unavailable or stale is a blocking
  check recorded with the shipment; a `schemaVersion` per record and a validating decoder that
  quarantines and reports bad rows, tested by loading the previous version's records.

## 5. Error handling

- **Current state:** Deliberate and mostly strong. Store writes go through `write()`
  (`App.tsx:178-201`) and report failure; startup restore uses `allSettled` and shows a banner;
  upload, template, verification and download failures surface in their panels
  (`upload-panel.tsx:45`, `output-panel.tsx:179,229`). A failed audit-record write after a
  successful file is reported as exactly that (`App.tsx:520-526`). Every empty `catch` carries a
  comment saying why. On the Rust side, no command unwraps; the only `expect` is at startup
  (`lib.rs:241`). The HTTP call has a 120-second timeout, and its URL is fixed in Rust.
- **Findings:**
  - **5.1** `Blocker` `statically reviewed` (the auditor read the code and the parser that
    supplies it). The FedEx/UPS keying sheet keys net weight as the package's gross weight.
    `src/carriers/keying-sheet/index.ts:975` sets `grossKg = header.totalGrossWeightKg ?? netKg`,
    and lines 1015 and 1096 print it as "Weight (lbs)" with the note
    `Gross … kg converted`. The Vendor B parser never reads a gross total
    (`parse-vendor-b.ts:279`, `totalGrossWeightKg: null`), so every Vendor B FedEx/UPS sheet
    understates the package weight under a label that says it's gross. Omron does the same when
    its GROSS WT cell is blank (`parse-omron-ci.ts:889`). The test at `keying-sheet.test.ts:646`
    covers only the case where gross is present. Graded blocker rather than high because it is a
    wrong figure the tool files today, against the one thing "complete" rules out.
  - **5.2** `High` `statically reviewed`. No error boundary. `main.tsx:6` renders without
    `onUncaughtError`, and nothing in `src/` defines a boundary (searched for `ErrorBoundary`,
    `componentDidCatch` and `onUncaughtError`: no matches). `reconcile`, `buildDraft`,
    `checkDraft` (`App.tsx:355-402`) and the DG assessment run during render on whatever a
    document parsed into. A thrown TypeError unmounts the tree. The release build has no
    devtools and no log (9.1), so the shipper sees a blank window, loses the shipment's entered
    values, and leaves no trace.
  - **5.3** `Medium` `statically reviewed`. A stale "Saved to …" survives a failed retry and later
    edits. `generate()` clears the error and warnings but not `saved`
    (`output-panel.tsx:153-156` vs `174`, rendered at `273-287`); the DG panel does the same
    (`dangerous-goods.tsx:228-241`). After a failed regeneration, a red error sits beside a green
    "Saved to" naming the previous file.
  - Schedule B unavailable but generation allowed: recorded as 4.4.
- **Pattern that closes the gap:** never substitute one figure for another; a missing gross is a
  blank, manual field with a note (or a block). Add a boundary per workflow that keeps the
  entered values, offers "start over", and writes to the local log (9.1). Clear `saved` when an
  attempt starts, and key the result to a hash of the draft.

## 6. Testing

- **Current state:** 1,069 tests in 36 files, Vitest in the Node environment; 947 run and pass in
  CI. Well covered, by planted-defect evidence (executed, reviewer):
  - the FedEx/UPS keying sheets: a 10% weight and value defect fails 14 tests;
  - Vendor A's synthetic builder: page-break split, divided weights, stranded heading;
  - the Vendor B layout checks;
  - Omron in both xlsx and PDF form (103 tests);
  - about 230 DG tests.

  The fixture-free carrier tests fill the real blank templates in `public/templates/` and read
  them back. No test has zero assertions.
- **Findings:**
  - **6.1** `Blocker` `executed` (auditor re-ran the reviewer's plant). No running test checks
    the weight or value written on either SLI. Multiplying every row weight by 1.1 and every
    value by 0.9 in `src/carriers/nippon-express/adapter.ts:208,210` and
    `src/carriers/ceva/adapter.ts:254,256` leaves the suite at 947 passed, 0 failed. Writing the
    ZIP into the EIN box and hard-coding the destination country and export date also passes
    (reviewer). Every assertion on header, party, signature, weight and value fields is
    fixture-gated (`src/carriers/carriers.test.ts:178-257,259-325,397-450`); the ungated fill
    tests from line 453 assert quantity, unit, Schedule B, Incoterm, ECCN and pagination only.
    This is a verification blocker, not a demonstrated wrong figure: nothing shows the build
    writes the right ones.
  - **6.2** `High` `executed (reviewer)`. The hazmat boxes can be hard-wired to "no dangerous
    goods" (`ceva/adapter.ts:296`; `nippon-express/adapter.ts:174-175`) with every running test
    green. Their only tests are fixture-gated (`carriers.test.ts:199-212,430`).
  - **6.3** `High` `executed (reviewer)`. The draft checks that gate generation
    (`profile-complete`, `destination-country`, `export-date`, `mode-supported`;
    `src/domain/draft.ts:296,306,318,330`) can be set to always pass with every running test
    green. Their only tests are in `src/domain/guards.test.ts`, which skips entirely.
  - **6.4** `High` `executed`. The skip is silent and the docs misstate it. Exit code 0; the only
    signal is "7 skipped" in the summary. No mode fails when fixtures are absent. The CI comment
    says `check` runs "the regression tests against real shipments"
    (`.github/workflows/ci.yml:6-8`); `README.md:255` says a clean checkout "runs the whole
    suite", contradicting `README.md:267`. The last recorded full run was `1e181f5`
    (2026-07-28). `d1420ce` (2026-08-20) records "The fixture-backed suite has not run against
    any of this", and `5122489` (2026-08-24) found two gated tests stale. It contradicts the
    repo's own rule that "a check that cannot run must fail loudly, never disappear"
    (`.agent/rules/00`).
  - **6.5** `High` `executed (reviewer)`. Vendor B's PDF path is untested end to end: making
    `isVendorBFormat` (`parse-vendor-b.ts:62-67`) always return false passes. The shape tests
    hand-build `TextPage` rows, bypassing extraction, detection and the env-overridable
    `SHIPMENT#` label; `detectCiplFormat` is tested only in a skipped block
    (`parse-vendor-b.test.ts:159`).
  - **6.6** `Medium` `statically reviewed`. Fixture gating covers blocks that read no document:
    `guards.test.ts:101,134,185` (carrier switching, dates, the invoice-to-packing join) and
    `carriers.test.ts:157` (template verification, which reads only `public/templates`).
  - **6.7** `Medium` `statically reviewed`. Omron 00004-00202, the owner's own format, has no
    real-document fixture, and no Omron test fills a carrier form and asserts its header. The
    xlsx tests use workbooks from the repo's own writer (inline strings only,
    `src/lib/xlsx.ts:96`); Excel's shared-strings layout is tested only in the item library
    (`item-library.test.ts:156-163`).
  - **6.8** `Medium` `statically reviewed`. The Shipper's Declaration PDF is never read back:
    rendering tests assert the header, size, page and field counts (`dgd.test.ts:206-228`), so a
    UN number in the wrong column passes.
  - **6.9** `Medium` `statically reviewed`. No end-to-end or UI test of load CIPL, review,
    generate. The Rust tests cover `unique_path` and `safe_join` only
    (`src-tauri/src/lib.rs:244-299`); `open_output`, `fetch_concordance` and the JS-to-Rust
    command and argument names (`src/desktop/index.ts:24-32`) are untested.
  - **6.10** `Medium` `executed (reviewer)`. Coverage isn't measured: no `@vitest/coverage-*`
    installed and no thresholds in `vitest.config.ts`.
  - **6.11** `Medium` `statically reviewed`. Test profiles hold real-looking identity data: a
    business street address, an EIN-shaped number, and a named person's phone numbers and
    email (`carriers.test.ts:52-65`, `guards.test.ts:22-35`). That breaks the repo's own fixture
    policy (`src/test/fixtures.ts:12-16`).
  - **6.12** `Low` `executed (reviewer)`. Three loops assert over arrays never checked non-empty
    (`dgd.test.ts:423,640`, `assess.test.ts:125`). A global 30-second timeout. No `.only` left in.
- **Pattern that closes the gap:** one synthetic golden test per carrier that runs the synthetic
  builders through reconcile, `buildDraft`, fill and read-back, and compares the entire field
  map, including weights, values, header and hazmat, against values written out independently.
  Ungate everything that reads no document. A required-fixtures mode that fails when documents
  are missing, run before every release on the owner's machine with a dated log. A synthetic
  Vendor B PDF builder. Positional text read-back for the DG declaration. One journey test.
  Coverage reported in CI.

## 7. CI/CD

- **Current state:** `ci.yml` runs `npm run check` (typecheck, lint, test, build) on every pull
  request and on pushes to main (the scorecard passes `core.ci-on-pull-requests`,
  `node.ci-runs-gate`, `node.test-suites-in-ci`). `desktop.yml` builds the NSIS installer on
  Windows on pushes to main that touch the app, and on demand, after the same gate and
  `cargo test`, and uploads it as an artifact kept 30 days. There are 0 tags and 0 releases
  (GitHub API, reviewer).
- **Findings:**
  - **7.1** `High` `executed (reviewer)`. No auto-updater. `src-tauri/tauri.conf.json` has no
    `plugins.updater` and no `createUpdaterArtifacts`; `Cargo.toml` has no
    `tauri-plugin-updater`; `lib.rs:9-12` says "No plugins, deliberately". A search of the tree
    and all commits for `updater`, `TAURI_SIGNING`, `pubkey`, `signCommand` and
    `certificateThumbprint` finds nothing outside the delivered `prompts/`. So **no update-signing
    key exists, it is kept nowhere, and there is nothing for anyone to recover today.** The key's
    custody is a decision to make before the first updater release, because a lost key strands
    every installed copy on its version (Tauri docs, verification record). The updater plugin
    needs Rust 1.90 or later; `Cargo.toml` declares 1.77. Graded high rather than blocker because
    it is a missing capability against "complete", not a defect in what ships.
  - **7.2** `High` `executed (reviewer)`. No release process, versioning or rollback. The version
    is 0.1.0 in `package.json:3`, `src-tauri/Cargo.toml:3` and `tauri.conf.json:4`, with nothing
    keeping them in step; every build reports 0.1.0. The installer exists only as a 30-day
    artifact that needs a GitHub login (`desktop.yml:51-59`), so the build a shipper runs can't
    be identified or re-fetched after 30 days. The build runs `npx --yes @tauri-apps/cli@^2`
    rather than the locked devDependency through `npm run desktop:build` (`desktop.yml:49`).
  - **7.3** `High` `executed (reviewer)` `core.settings-branch-protected` (§7). `main` has no
    branch protection and no ruleset (API: 404 "Branch not protected"; rulesets `[]`), so CI
    isn't a required check. The repo is public, so it can be one. `desktop.yml` builds whatever
    lands on `main`, which makes `main` the publishing authority.
  - **7.4** `Medium` `executed` `tauri.rust-gates-in-ci` (§7). The Rust side is never checked on a
    pull request. `ci.yml` has no cargo step; `cargo test` runs only after merge, and `cargo fmt
    --check` and `cargo clippy -D warnings` fail today (baseline).
  - **7.5** `Medium` `statically reviewed` `node.runtime-pinned`, `node.ci-uses-pin` (§7).
    - Node is pinned nowhere: there is no `.nvmrc`, and both workflows hard-code `'24'`.
    - The Rust toolchain is a branch reference (`dtolnay/rust-toolchain@stable`,
      `desktop.yml:30`), and there is no `rust-toolchain.toml`.
    - Actions use mutable tags (`checkout@v5`, `setup-node@v5`, `upload-artifact@v6`,
      `swatinem/rust-cache@v2`, `github-script@v7`).
    - ESLint 9 is end-of-life (verification record).
  - **7.6** `Medium` `statically reviewed`. The "Codex Review Bot" (`.github/workflows/review-bot.yml`)
    calls no model. It always posts "No issues found in changed scope" and "Patches proposed: 0"
    (`:214-228`). Its diagnostic plan names `npm run lint:security`, `supabase db lint` and `act`,
    none of which exist here (`:182-188`). It triggers on four events and has run 968 times
    against 311 CI runs. On a tool whose promise is "never a wrong figure", a review that never
    happened reported as clean is false assurance. No script injection found: the only
    expression is a SHA-based concurrency group, and it never checks out PR code.
  - **7.7** `Medium` `statically reviewed` `core.workflows-audited` (§8, recorded here with the
    workflows). No workflow audit (zizmor). `ci.yml` and `desktop.yml` have no `permissions:`
    block, so they get the repository default (not readable here).
- **Pattern that closes the gap:**
  - One version source (`package.json`, read by `tauri.conf.json` through
    `"version": "../package.json"`, with a check that `Cargo.toml` matches).
  - A release workflow on `v*` tags that builds, signs and publishes the installer, its updater
    signature and `latest.json` to a GitHub Release, keeping old releases. Rollback is a higher
    version built from the old code.
  - The updater plugin with the public key in config and the private key in a GitHub Environment
    that needs the owner's approval, plus an offline backup (release-runbook skeleton).
  - A ruleset requiring the CI check (`.github/rulesets/main.json` skeleton).
  - A Rust job on pull requests running fmt, clippy and tests.
  - `.nvmrc` read by `setup-node`, `rust-toolchain.toml`, actions pinned by SHA,
    `permissions: contents: read`, and zizmor.
  - The review bot deleted.

## 8. Security

- **Current state:**
  - No secrets in the tree or in history. A search of all commits for private-key headers,
    `TAURI_SIGNING`, GitHub, AWS and Slack token shapes and credential assignments found only
    documentation text; the values in a deleted `legacy/.env.example` are placeholders (executed,
    reviewer). Secret scanning and push protection are on, and Dependabot security updates are
    on (API, reviewer).
  - The Tauri CSP is tight apart from `style-src 'unsafe-inline'` (`tauri.conf.json:24`). The
    capability grants `core:default` only. File writes go through `safe_join`, which rejects
    separators, `..` and multi-component names, with tests.
  - pdf.js 4.10.38 is outside both published advisories (CVE-2024-4367, fixed 4.2.67;
    CVE-2026-16633, affecting 5.6.83 and later), and runs with `isEvalSupported: false`
    (`src/domain/cipl/extract-text.ts:79`).
  - The xlsx reader is in-house, so no third-party xlsx CVEs apply. The LICENSE is MIT, and the
    production npm licenses are permissive.
  - The scorecard passes `tauri.capabilities-scoped`, `tauri.csp` and `core.workflow-caches`.
- **Findings:**
  - **8.1** `Blocker` `executed`. Customer shipment documents are publicly reachable. Five CIPL
    PDFs added under `src/test/fixtures/` in commits `e1c5aff` and `c7853d0` (2026-07-27) were
    squash-merged away from `main`, but GitHub keeps every pull request's head ref, and refs
    `refs/pull/26/head` through `refs/pull/32/head` still contain them (a blob-less clone of the
    public repository, listing file names only; no document was opened). Commit `1e181f5`
    recorded that they "remain in the history … reachable". Their file names carry document
    numbers, so this record doesn't repeat them. They are a customer's commercial paperwork: part
    numbers, values, consignees and classifications. The owner can't delete pull-request refs;
    GitHub Support can. Separately, `main`'s history still holds four PDFs under
    `legacy/Examples/` (added `063a6bd`, deleted `c7729f4`), named as carrier SLIs and
    instructions; whether they are blank forms or filled ones wasn't checked, because that means
    opening them.
  - **8.2** `High` `executed (reviewer)`. The installer isn't code-signed: no `signCommand` or
    `certificateThumbprint` (`tauri.conf.json`); the unsigned NSIS installer and bare
    `FormWaypoint.exe` are uploaded (`desktop.yml:55-57`). Windows shows the unknown-publisher
    SmartScreen warning, and an employer that enforces AppLocker or WDAC may block it outright
    (unknown for Omron). The updater signature (7.1) and an Authenticode signature are separate;
    "complete" needs the first, and the owner wants the second.
  - **8.3** `High` `executed` `node.audit-gate` (§8). CI's dependency audit can't fail
    (`ci.yml:29-31`, `continue-on-error: true`), covers production only, and has no schedule.
    The full audit shows 4 high and 2 moderate in dev dependencies, unaddressed, and Dependabot's
    js-yaml fix (#54) has waited since 2026-09-10.
  - **8.4** `Medium` `statically reviewed` `core.dependency-updates` (§8). No
    `.github/dependabot.yml`: security updates only, no version updates for npm, cargo or
    Actions.
  - **8.5** `Medium` `statically reviewed` `node.install-guards` (§8). No `.npmrc` release-age
    wait, git and remote dependencies allowed transitively, and no npm version pin.
  - **8.6** `Medium` `statically reviewed` `tauri.supply-chain` (§8). No `cargo audit` or
    `cargo deny`. (`Cargo.lock` carries the gtk-rs 0.18 "unmaintained" advisories, Linux-only,
    not in the Windows binary.)
  - **8.7** `Medium` `statically reviewed` `core.security-policy` (§8). No SECURITY.md, and
    private vulnerability reporting wasn't readable here (`core.settings-private-reporting`
    unscored).
  - **8.8** `Low` `statically reviewed` `vite-spa.client-env` (§8; the standard grades it high).
    `parse-vendor-b.ts:44-45` reads `import.meta.env` whole, which makes Vite inline every
    `VITE_*` variable on the build machine. Only two non-secret markers are used, and CI sets
    none, so nothing is exposed today; graded low on present risk, kept for the scorecard.
  - **8.9** `Low` `statically reviewed`. `open_output` checks only that the target's parent is
    Downloads and that it exists, then runs `explorer.exe <path>` (`lib.rs:194-205`), and
    `save_output` takes any extension (`lib.rs:175-179`). Script running in the webview could
    therefore launch any executable in Downloads. That needs script injection first, which the
    CSP and pdf.js settings make hard. The comment at `lib.rs:184-187` overstates the guarantee.
    `unique_path` is check-then-write.
  - **8.10** `Low` `statically reviewed`. The concordance download is silently truncated at
    32 MB (`lib.rs:145`, `.take`) instead of failing, and the proxy URL, which may contain
    credentials, is echoed into an error (`lib.rs:127`).
  - **8.11** `Low` `statically reviewed`. No size limits on untrusted input: the in-house ZIP
    reader inflates without a cap (`src/domain/item-library/read-workbook.ts:38-45,94`), and
    uploads aren't size-checked (`upload-panel.tsx:35`, `item-library.tsx:93`). The file is
    the user's own choice, so the impact is self-inflicted.
  - **8.12** `Low` `statically reviewed`. The public repository redistributes the carriers' blank
    forms (`public/templates/ceva-sli.pdf`, `nippon-express-sli.pdf`). The rights to do so aren't
    recorded.
  - **8.13** `Low` `statically reviewed`. The web build has no CSP (`index.html`; DEPLOYMENT.md
    sets no headers), so "documents never leave the machine" is enforced only in the desktop
    shell. Matters only if the web build is deployed.
  - core.license (skipped by the scorecard for want of a declared visibility): the repository
    has an MIT LICENSE, so it passes once visibility is declared. Not a finding.
- **Pattern that closes the gap:**
  - A GitHub Support request to purge the pull-request refs and any cached views, then a re-scan.
  - Signing in the release workflow (SignPath Foundation for open source at $0, or Azure
    Artifact Signing at about $9.99 a month, or a certificate). The owner chooses.
  - An audit that blocks on high and critical, runs weekly, and keeps an expiring waiver
    register (dependency-policy skeleton). `dependabot.yml` for npm, cargo and Actions.
  - `.npmrc` guards. `cargo deny`. SECURITY.md.
  - Rust-side extension allow-lists, plus `open_output` restricted to paths `save_output`
    returned.

## 9. Observability

- **Current state:** None. Zero `console.*` calls, no error reporter, no `onerror` or
  `unhandledrejection` handler. On the Rust side there is no log plugin, `panic = "abort"`, and
  no devtools feature. The app version isn't shown anywhere. The scorecard leaves
  `core.error-reporting` to audit.
- **Findings:**
  - **9.1** `High` `statically reviewed` `core.error-reporting` (§9). Nobody can answer "what
    failed for the shipper yesterday" or "which build are they on". With an updater, support
    depends on both.
- **Pattern that closes the gap:** in keeping with the no-network promise, a rotating local error
  log in the app data folder, written through the existing `writeDataFile` bridge. It records
  the message, stack, app version, Schedule B date and workflow step, never document content.
  Add an "Export diagnostics" action and show the version in the footer. No network reporting.

## 10. Performance

- **Current state:** pdf.js and its 2.3 MB worker load only on the first PDF parse (confirmed in
  `dist`). Lists are capped (history 50, flagged items 500), so none needs virtualising.
- **Findings:**
  - **10.1** `Low` `executed (reviewer)` `vite-spa.bundle-budget` (§10). By sourcemap
    attribution, the 987 kB main chunk carries the pdf-lib family (about 408 kB) and the DG
    workflow (about 100 kB of source), both needed only later. `vite.config.ts:20` raises the
    size warning to hide it. `public/data/schedule-b.json` (1.07 MB, 178 kB gzip) is parsed on
    every launch. Startup and parse times weren't measured, so the user impact is provisional.
- **Pattern that closes the gap:** lazy-import the carrier fill/render modules and the DG panel;
  restore the default warning; a bundle budget in CI.

## 11. Accessibility & UX completeness

- **Current state:** An AST check of 89 controls found every one labelled; `Field` and `Toggle`
  link labels with `htmlFor`/`useId`; `jsx-a11y` runs in lint. The screens are upload (with
  Schedule B refresh, item library, item-master updates, history), review (carrier, summary,
  part overrides, commodity table, checks, overrides, manual fields, output) and DG. Each has
  busy, error and result states, except two gaps: no loading state while saved data restores,
  and the Schedule B failure state (4.4).
- **Findings:**
  - **11.1** `Medium` `executed (reviewer)`. Contrast computed from `src/styles/globals.css`
    tokens (OKLCH to sRGB) fails AA for:
    - dark-mode white on primary, 2.38:1 (the "Download completed SLI" button);
    - dark-mode white on danger, 2.84:1;
    - light-mode `ink-faint` on surface and on canvas, 3.64:1 and 3.43:1 (37 uses, mostly
      `text-xs` hints);
    - the warn and pass badges, 3.90:1 and 4.38:1 at 0.7rem (`src/components/ui.tsx:65-71`).
  - **11.2** `Medium` `statically reviewed`. There are no `role="alert"`, `role="status"` or
    `aria-live` regions, so error and result banners aren't announced (`App.tsx:726-748`). No
    focus management: a successful upload or "Start over" unmounts the focused control. Hints
    aren't linked by `aria-describedby` (`ui.tsx:104,154`).
  - **11.3** `Medium` `statically reviewed`. Copy is wrong for the installed app. The stale or
    failed Schedule B banners tell the user to run `npm run data:schedule-b -- --fetch` "and
    redeploy" (`App.tsx:766,774`), including in the desktop app, which has its own refresh. The
    footer says "in this browser" (`App.tsx:972`).
  - **11.4** `Low` `statically reviewed`. `docs/ui-ux-pass.md` and `docs/ui-ux-rules.json` are
    generic (mobile, authentication flows), referenced by nothing, and already broken by 11.1.
- **Pattern that closes the gap:** fix the tokens, then a contrast test over token pairs; live
  regions for results and errors; focus moved to each step's heading; copy per platform;
  measurable rules turned into tests and the rest marked manual.

## 12. Docs, operability & stated-rule conformance

- **Current state:** The README is long and mostly accurate on behaviour, and carefully argued.
  Agent instructions live in `.agent/rules/` (7 files, all `always_on`) and `.agent/workflows/`
  (13 files), which only Antigravity reads. There is no AGENTS.md, CLAUDE.md, CONTRIBUTING.md,
  CHANGELOG or ADR directory. `docs/DEPLOYMENT.md` covers the static web build.
- **Findings:**
  - **12.1** `High` (dated: 2026-10-19) `executed` `core.no-agent-workflows` (§12). Thirteen
    Antigravity workflows stop working on 2026-10-19. Several are already broken: 10 calls
    `03-debt-audit.md` and `08-design-system-migration.md`, which don't exist; 09 describes a
    different app (Planter, Dashboard, `AuthContext`, `.jsx` paths); 06 and 14 auto-commit, and
    14 uses `git commit -am`. The mapping to the delivered skills heads the remediation plan.
  - **12.2** `High` `executed` `core.agent-rules` (§12). Every guardrail this repo states lives
    only in Antigravity files. The domain rules include "never infer an ECCN, licence, origin or
    hazmat value", "prove every figure against the source", "carrier logic lives in adapters"
    and the layer and compliance-review rules in workflow 01; they are in `.agent/rules/00`,
    `10`, `20`, `40` and `.agent/workflows/01-feature-injection.md`. Claude Code, Codex,
    Copilot and Cursor never read them, and the delivered `pre-pr` and `verify` skills look for
    the gate in AGENTS.md, CLAUDE.md or CONTRIBUTING.md (`prompts/pre-pr.md`, `prompts/verify.md`),
    none of which exists. The rules also contradict each other and the code:
    - Rule 30 prescribes slate and blue classes and shipment-status colours, while the code uses
      teal tokens and has no slate, blue or zinc classes.
    - Rule 05 triggers on "Auth, RLS, Migrations, Payment" and names `.jsx`.
    - `.agent/prompts/README-PROMPT.md:16-22` asserts Supabase and PostgreSQL.
    - Rule 40 says the Tauri build swaps IndexedDB for a file store, but
      `src/store/local-store.ts:558` still binds IndexedDB.
    - Rule 50's five attempts conflict with root-cause's three.
  - **12.3** `Medium` `executed` `core.instructions-resolve` (§12). `check:instructions`:
    - 8 hidden characters in `.agent/rules/30-design-standards.md`, lines 17, 22, 23, 24, 30
      and 31. Markdown backticks passed through PowerShell, where `` `b `` became a backspace
      and `` `r `` a carriage return, so `` `border-slate-200` `` reads as backspace plus
      `order-slate-200`.
    - 3 tab characters the linter doesn't flag (lines 16 and 30, `` `t `` decoded the same way).
    - 7 paths that don't exist: `docs/operations/ENGINEERING_KNOWLEDGE.md` three times,
      `src/setupTests.js`, `src/tests/integration/golden-paths.test.jsx`, and the two missing
      workflows.
  - **12.4** `High` `statically reviewed`. The DG workflow is marked done, yet nothing checks it
    against the regulation, and the UI doesn't say so. `roadmap.md:39-49` marks all of it ✅.
    `docs/dangerous-goods-fact-check.md:21-22` records that the licensed IATA DGR (67th edition,
    addenda, state and operator variations) was "Not available". Every figure is sourced to a
    Labelmaster course student guide (`src/domain/dangerous-goods/lithium.ts:10-13`), and PI 910
    and 974 are unconfirmed (`dangerous-goods-fact-check.md:164-169`). The DG screen names
    neither source nor edition. A Shipper's Declaration is signed under penalty, and the owner
    confirms DG has never been used.
  - **12.5** `Medium` `statically reviewed`. The two roadmaps conflict, and neither is current.
    - `roadmap.md` says "Last Updated 2026-08-06" but was edited 2026-08-24. It claims two CIPL
      formats and two carriers, while the code has three formats (`src/domain/cipl/index.ts:35`)
      plus FedEx/UPS keying and the DG declaration. It cites 336 tests (1,069 exist) and "four
      Rust commands" (seven are registered, `lib.rs:231-239`).
    - `docs/ROADMAP_ENHANCEMENTS.md` (last touched 2026-01-16) describes the deleted
      server-backed product: bulk booking, a vendor portal, ERP sync. That contradicts rule 00
      (nothing leaves the machine).
    - `roadmap.md` should control once corrected; the enhancements file belongs in
      `docs/archive/`.
  - **12.6** `Medium` `statically reviewed`. No desktop release or operations documentation, and
    `docs/DEPLOYMENT.md:59-63` is wrong about desktop: it says a Tauri build swaps in a file
    store and "nothing needs to move first", while the shell exists and still uses IndexedDB in
    WebView2. Nothing says where desktop data lives (including the DG records kept two years) or
    how to back it up. No ADRs for the client-only design, the Tauri shell or the DG scope.
  - **12.7** `Low` `statically reviewed`. README drift:
    - "Adding a third means …" (`README.md:35`), though three formats already exist.
    - "the vendor shipment" (`:31`) reads as a half-done anonymisation beside a named customer
      (`:32`), while `.env.example:3-4` says the repo names no customer.
    - `npm install` (`:17`) for a lockfile repository.
    - The layout section (`:409-431`) omits `src/lib`, `src/components` and `src/test`.
    - "four commands" (`:430`, and `capabilities/default.json:4`) where `lib.rs:3` says six and
      seven are registered.
    - "CI runs … on every push" (`:285`): only pushes to main and pull requests.
  - **12.8** `Low` `statically reviewed`. Leftovers:
    - `REVIEW-FINDINGS.md` at the root is fully resolved (five findings spot-checked as fixed),
      and its claim that Actions stopped dispatching on 2026-08-06 is out of date.
    - `docs/archive/*` reviews the deleted monorepo.
    - `Form Waypoint Draft.png` (4.07 MB) is byte-identical to `docs/assets/logo.png`, and
      neither is referenced, so 8 MB of unused images.
    - `scripts/expaes.txt` is legitimate (used by `build-schedule-b.mjs:22` and a test).
  - core.process-delivered failed in the before scorecard and is resolved by commit `169a282`
    (`prompts/.apply-manifest.json`); not carried as a finding.
- **Pattern that closes the gap:**
  - An AGENTS.md at the root, with a CLAUDE.md that imports it, built from
    `prompts/skeletons/`. It holds rules 00, 10, 20 and 40 plus workflow 01's layer and
    compliance rules, corrected to the code. Rule 30 is dropped or rewritten to the tokens.
  - `.agent/` retired after the mapping.
  - One dated roadmap.
  - A release runbook covering versioning, signing, update keys, rollback, data location and
    backup, with DEPLOYMENT.md corrected.
  - ADRs for the consequential past decisions.
  - DG labelled "unverified against the DGR" in the UI and on the declaration until a qualified
    person signs off.
  - A README sweep, and leftovers moved to `docs/archive/` or deleted.

## Conflicts

- `roadmap.md` (two formats, two carriers, 336 tests, four commands) against the code and
  README (three formats, two SLI carriers plus FedEx/UPS keying and the DG declaration, 1,069
  tests, seven commands). The code controls.
- The CI comment and `README.md:255` ("the regression tests against real shipments" run in CI;
  a clean checkout runs the whole suite) against `README.md:267` and `.gitignore` (the fixtures
  are absent, 122 tests skip). `.gitignore` controls; the comments are wrong.
- `.agent/rules/30` (slate and blue palette) against `src/styles/globals.css` (teal tokens). The
  code controls.
- `.agent/rules/40` and `docs/DEPLOYMENT.md` (desktop swaps IndexedDB for a file store) against
  `src/store/local-store.ts:558` (IndexedDB in the desktop build). The code controls.
- `.agent/rules/00` ("a check that cannot run must fail loudly") against
  `describe.skipIf(!hasFixtures())`. The rule controls; the tests are the defect (6.4).
- The keying sheet's "Gross … kg converted" label against the figure under it (net, when no
  gross was read). The label is right; the figure is the defect (5.1).
- The notes from the late-September read-only pass assumed an updater signing key to locate.
  No updater exists, so there is no key (7.1). This repository controls.

## Refuted or corrected during verification

- Notes: "the updater signing key's custody". Corrected: there is no updater and no key (7.1).
  Custody becomes a decision in the plan.
- Notes: "eight stray control characters". Confirmed, and corrected upward: 8 flagged plus 3 tab
  characters the linter doesn't report (12.3).
- Notes: "Antigravity workflows stop on 2026-10-19, not 2026-11-01". Confirmed by the delivered
  standard `core.no-agent-workflows`; not independently re-checked against Antigravity's own
  announcement in this pass.
- Reviewer's 8.1 lead ("the real CIPLs remain in the history") corrected: they are not in
  `main`'s history (squash merges), but they are in public pull-request refs 26 to 32 (auditor,
  executed).
- Reviewer graded the keying-sheet gross substitution (5.1) high; regraded blocker, because it
  is a wrong figure filed today.
- Reviewer graded `vite-spa.client-env` by the standard's high; regraded low on present risk
  (8.8).
- Reviewer graded the updater's absence a blocker; regraded high: a capability "complete"
  needs, not a defect in what ships (7.1).
- A reviewer reported the test suite unrun for want of `node_modules`; the auditor's baseline
  ran it in the worktree (the counts above).
- The skip counts were reconciled: 122 tests in 8 files skip, and vitest reports 7 skipped
  files because `carriers.test.ts` also runs ungated tests.

## Coverage and limitations

- The real-shipment suite wasn't run: the documents are on the owner's machine by design.
  Whether it passes today, after 28 changes to the code it covers, is unknown.
- The Windows installer build and the installed app weren't run; everything about runtime
  behaviour on Windows (WebView2 storage location, SmartScreen, an employer's application
  control, proxy behaviour) is statically reviewed or unknown.
- Repository settings were read only in part (branch protection, rulesets, secret scanning,
  Dependabot security updates). `check:settings` was refused a token. Default workflow token
  permissions, private vulnerability reporting and the account's plan are unscored.
- The DG figures weren't checked against the IATA DGR; nobody in this pass has the licensed
  text.
- The filing rule behind 4.7 (net or gross in the shipping-weight box) wasn't re-checked
  against 15 CFR 30.6 or the carriers' instructions.
- Contrast was computed from tokens, not measured in a rendered browser.
- Startup time, parse time and memory were not measured.
- The four `legacy/Examples/` PDFs in `main`'s history and the five pull-request-ref documents
  weren't opened.
- Areas were read by five parallel reviewers and re-verified by the auditor where a finding set a
  blocker or high grade (5.1, 6.1, 8.1, 1.1, 7.x via the scorecard and API results); medium and
  low findings rest on the reviewer's citation, spot-checked.
