# Remediation plan

Repo: **JoelA510/FormWaypoint** · Plan drawn up: 2026-10-08 · Source audit: [`audit.md`](./audit.md)

**Status:** IN PROGRESS as of 2026-10-09. D1 in review; Milestone 1 next. The owner reviews
and approves each pull request before it merges.

End state: every audit area at "no blocker/high findings", end-to-end coverage of the critical
journey, a released build installed and smoke-tested, docs current. Measured against: a shipper at
Omron installs it on Windows, gets updates without reinstalling, and can produce SLI forms for CIPL
documentation without the tool ever filing a wrong figure.

## Dated: Antigravity workflows stop on 2026-10-19 (11 days)

This item comes first whatever its severity (the owner's instruction). It is **D1** below, and it
closes audit findings 12.1, 12.2 and 12.3. Each workflow, and what replaces it:

| Workflow | What it does | Replaced by | Action |
| --- | --- | --- | --- |
| 00-auto-roadmap | Takes the next roadmap item through plan, build, test, review, and marks it done | `discovery` (Stage 0: what's next) then `plan-change` | Retire. Picking the next item is the owner's call; no skill writes roadmap status, and none should. |
| 01-feature-injection | Places a change in its layer (domain, adapter, UI, store); compliance review: never infer ECCN, licence, origin, hazmat | `plan-change` for the procedure | Retire, **after** its layer and compliance rules move into AGENTS.md. They exist nowhere else. |
| 02-test-plan | Writes a TEST_PLAN.md and doesn't implement | `plan-change` (risks; tasks that each name their test) | Retire. |
| 04-surgical-refactor | Fixes one DEBT_REPORT.md item behind a pinning test | `plan-change` (refactor) and `verify`; debt lives in this plan | Retire. Its input file doesn't exist. |
| 05-debug-loop-5 | Five attempts at a failing command, then a failure report | `root-cause` | Retire. root-cause stops after three hypotheses; rule 50 goes with it. |
| 06-pre-pr-docs | Updates docs and roadmap, drafts the PR text, auto-commits | `pre-pr` (doc sweep, description) | Retire. Its target file doesn't exist, and it commits on its own. |
| 07-pre-pr-review | Lint, test, build, checklist, review draft | `review-change` and `pre-pr` | Retire. |
| 09-browser-verification | Golden-path integration tests and a click-through | none | **Needs rewriting, not converting**: it describes another app (Planter, Dashboard, `.jsx`). Its intent becomes M3a item M3.4 (the journey test). Don't run `/migrate-workflows` on it. |
| 10-master-review-orchestrator | Loops debt audit, refactor, design, browser, review, docs | `complete` | Retire. It calls two workflows that don't exist. |
| 11-remote-pr-review | Reviews a PR through GitHub and posts the review | `review-change` (reports; doesn't post) | Retire (owner's go, 2026-10-09). |
| 12-start-feature | From an issue: branch, plan, assign | `plan-change` for the plan only | Drop (owner's go, 2026-10-09). |
| 13-debt-sync | Syncs DEBT_REPORT.md items to GitHub issues | none | Drop. Its input doesn't exist; this plan is the debt register. |
| 14-log-lesson | Appends a lesson, then `git commit -am` | every skill's "Keeping a lesson" step (`prompts/README.md`) | Retire. Its target file doesn't exist, and `commit -am` sweeps in unrelated changes. |

## Rules for this plan

- **Traceability.** Every audit finding ID appears exactly once below: as an item, as
  "resolved by", or under "Deferred with reason".
- **Severity** uses the audit's definitions. Where an item's grade differs, it says why.
- **Milestone size.** About five items each, from Milestone 2 on. Milestone 1 ships in two pull
  requests, so each can be reverted on its own.
- **Each item's test gate** is shown failing with the fix reverted before the item counts as done.
- **Do not do** (out of scope, however tempting):
  - No backend, no accounts, and no network telemetry or error reporting. The no-upload promise
    stands.
  - No framework migration. The pdf.js 4 to 6, TypeScript 5 to 7 and Vite major upgrades aren't
    in this plan. ESLint 9 to 10 is (7.5), because 9 is end-of-life.
  - Never commit a real shipment document, document number or customer identity, in a fixture or
    anywhere else.
  - Never rewrite `main`'s history without the owner's explicit, separate approval.
  - Never change the bundle identifier `com.formwaypoint.app`. WebView2 keeps the shipper's
    IndexedDB under it, and the updater identifies the app by it.
  - Don't run `/migrate-workflows` across `.agent/workflows/` wholesale (see the table).
  - No `npm audit fix --force`, `--legacy-peer-deps`, or hand-edited lockfiles.
  - Never read, print or copy the update-signing private key or a signing certificate.

## Item format

> **ID. Gap** (audit finding, severity)
> - **Fix approach / Files touched / Depends on / Effort / Acceptance criteria / Test gate /
>   Rollback / Diff class / Verification label** (verification labels are all "statically
>   reviewed" until the item is done)

---

## D1. Agent rules into AGENTS.md; retire the Antigravity workflows (by 2026-10-19)

> **D1. Every repo guardrail lives in files only Antigravity reads, and those stop on 2026-10-19**
> (audit findings 12.1 high, 12.2 high, 12.3 medium)
> - **Fix approach:**
>   - Write `AGENTS.md` from `prompts/skeletons/AGENTS.skeleton.md`, plus `CLAUDE.md` importing it
>     (`@AGENTS.md`).
>   - Fold in `.agent/rules/00`, `10`, `20`, `40` and workflow 01's layer and compliance-review
>     rules, each corrected to the code (three formats; seven commands; IndexedDB in the desktop
>     build; the teal tokens).
>   - Name the gate (`npm run check`, plus the Rust checks once 7.4 lands) where `pre-pr` and
>     `verify` look for it.
>   - Drop rule 30 (its hidden characters go with it) or rewrite it to the tokens; drop rules 05
>     and 50.
>   - Retire `.agent/workflows/` and `.agent/prompts/` per the table above (`.agent/prompts`
>     asserts Supabase and PostgreSQL).
>   - Add `docs/standards/conformance.json` declaring `"visibility": "public"`, so `core.license`
>     scores.
> - **Files touched:** `AGENTS.md`, `CLAUDE.md` (new); `.agent/` (removed);
>   `docs/standards/conformance.json` (new).
> - **Depends on:** the owner's answers on workflows 11 and 12 (keep or drop).
> - **Effort:** M
> - **Acceptance criteria:** Claude Code, Codex, Copilot and Cursor each load the same rules.
>   `check:instructions --root .` reports nothing. No rule names a tool, path or product this repo
>   doesn't have.
> - **Test gate:** `npm run check:instructions -- --root <repo>` and `check:conformance`
>   (core.agent-rules, core.no-agent-workflows and core.instructions-resolve pass). Shown failing
>   on today's tree (the before scorecard).
> - **Rollback:** revert the commit; `.agent/` returns (it stops working on 2026-10-19 regardless).
> - **Diff class:** minimal diff (docs only).

---

## Milestone 1: stop the bleeding

Every blocker (audit findings 5.1, 6.1, 8.1), plus the enforcement floor. Two pull requests and one owner action.

### PR 1A: figures

> **M1.1. The FedEx/UPS keying sheet keys net weight as "Gross"** (5.1, blocker)
> - **Fix approach:** when the CIPL states no gross weight, leave the package weight blank, add
>   it to the sheet's manual fields with the note "Gross weight not on the CIPL — weigh the
>   package", and say so in the output warnings. Never substitute net.
> - **Files touched:** `src/carriers/keying-sheet/index.ts` (the `grossKg` line and the two
>   weight rows), `src/carriers/keying-sheet/keying-sheet.test.ts`.
> - **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** a Vendor B FedEx or UPS sheet shows a blank weight flagged manual;
>   an Omron sheet with GROSS WT filled shows that figure converted.
> - **Test gate:** a test with `totalGrossWeightKg: null` asserts a blank weight and a manual
>   field, for FedEx and UPS. It fails with the `?? netKg` fallback restored.
> - **Rollback:** revert the PR (restores the old fallback).
> - **Diff class:** minimal diff.

> **M1.2. No running test checks the figures on either SLI** (6.1, blocker; resolves 6.2)
> - **Fix approach:** one golden test per carrier, with no fixtures. Run `buildSyntheticCipl` (and
>   `buildOmronCiPdf`) through parse, reconcile, `buildDraft`, the real template fill and
>   read-back. Compare the **entire** field map (header, parties, signature, every weight, value,
>   quantity and Schedule B box, the hazmat boxes) against expected values written out by hand.
>   Cover both `hazardous: true` and `false` (6.2).
> - **Files touched:** `src/carriers/sli-golden.test.ts` (new), `src/test/synthetic/*` if a
>   builder needs a field.
> - **Depends on:** none · **Effort:** M
> - **Acceptance criteria:** the auditor's planted defects (weight x1.1, value x0.9, ZIP in the
>   EIN box, a hard-coded country or date, hazmat hard-wired to "no") each fail at least one test.
> - **Test gate:** the plants above, re-run and recorded in the PR.
> - **Rollback:** revert (tests only).
> - **Diff class:** minimal diff.

> **M1.3. The generation-blocking draft checks run in no gate** (6.3, high; resolves 6.6)
> - **Fix approach:** take `describe.skipIf(!hasFixtures())` off every block that reads no
>   document (`guards.test.ts:101,134,185`, the unreadable-document test at `:237`,
>   `carriers.test.ts:157`). Give `profile-complete`, `destination-country`, `export-date` and
>   `mode-supported` synthetic tests.
> - **Files touched:** `src/domain/guards.test.ts`, `src/carriers/carriers.test.ts`.
> - **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** the skip count drops; each of the four checks has a running test
>   that fails it.
> - **Test gate:** forcing each check to pass (the reviewer's plant at `draft.ts:296,306,318,330`)
>   fails the suite.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M1.4. The real-shipment suite skips silently and hasn't run since 2026-07-28** (6.4, high;
> graded into Milestone 1 because 28 changes to the code it covers have never met it)
> - **Fix approach:**
>   - `FW_REQUIRE_FIXTURES=1` makes a run fail when any manifest document is missing.
>   - Without it, a Vitest global setup prints the skip loudly, and CI writes it to the job
>     summary.
>   - Correct the CI comment and `README.md:255`.
>   - Add a dated "full-suite runs" log in `docs/testing.md`.
>   - **Owner action:** run `FW_REQUIRE_FIXTURES=1 npm test` on the machine with the documents
>     now and log the result; any failure is a new item.
> - **Files touched:** `vitest.config.ts`, `src/test/fixtures.ts` or a setup file,
>   `.github/workflows/ci.yml` (summary step and comment), `README.md`, `docs/testing.md` (new).
> - **Depends on:** none · **Effort:** S (plus the owner's run)
> - **Acceptance criteria:** with the variable set and fixtures absent the run exits non-zero; CI
>   shows "122 tests skipped: real-shipment documents absent" in its summary; the log has a dated
>   row.
> - **Test gate:** the required mode run in CI without fixtures is expected to fail (asserted by a
>   script test).
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

### PR 1B: the enforcement floor

> **M1.5. CI isn't a required check** (7.3, high)
> - **Fix approach:** commit `.github/rulesets/main.json` from the skeleton. It requires the
>   `check` status, a pull request and linear history, and blocks force-pushes and deletion. The
>   owner imports it (Settings, Rules). The repo is public, so the plan allows it.
> - **Files touched:** `.github/rulesets/main.json` (new).
> - **Depends on:** none · **Effort:** S (plus a settings step)
> - **Acceptance criteria:** a pull request with a failing `check` can't be merged; a direct push
>   to `main` is refused.
> - **Test gate:** the branch-protection API returns the rule (`check:settings` passes
>   `core.settings-branch-protected` with a token); demonstrated by a deliberately red draft PR.
> - **Rollback:** disable the ruleset in Settings.
> - **Diff class:** minimal diff (settings).

> **M1.6. No observability, no error boundary, no visible version** (9.1, high; resolves 5.2)
> - **Fix approach:**
>   - An error boundary around each workflow keeps entered values in state, shows the message,
>     and offers "Start over".
>   - `window.onerror`, `unhandledrejection` and the boundary write to a rotating local log (the
>     last 200 entries) through `bridge.writeDataFile` on desktop, or IndexedDB on the web.
>   - Each entry holds message, stack, app version, Schedule B date and workflow step, and never
>     document content.
>   - "Export diagnostics" in the footer, and the version shown there.
> - **Files touched:** `src/main.tsx`, `src/App.tsx`, `src/components/error-boundary.tsx` (new),
>   `src/lib/error-log.ts` (new), `src/desktop/index.ts`.
> - **Depends on:** none · **Effort:** M
> - **Acceptance criteria:** an induced throw in `reconcile` shows the boundary, not a blank
>   window; the log holds the entry; the export contains no document text.
> - **Test gate:** a jsdom test makes `reconcile` throw and asserts the boundary renders and one
>   log entry exists with no document fields. It fails with the boundary removed.
> - **Rollback:** revert.
> - **Diff class:** minimal diff (new modules, two wiring points).

### Owner action

> **M1.7. Customer CIPLs are reachable through public pull-request refs** (8.1, blocker)
> - **Fix approach:**
>   1. File a GitHub Support request (Sensitive data removal) asking for `refs/pull/26/head`
>      through `refs/pull/32/head` (or the commits `e1c5aff`, `c7853d0` and their descendants on
>      those refs) to be dereferenced and garbage-collected, and cached views purged. Claude
>      drafts the request; the owner sends it.
>   2. Open the four `legacy/Examples/*.pdf` from `main`'s history yourself. If any is a filled
>      form, that becomes a separate decision: a `main` history rewrite needs your explicit
>      approval.
>   3. Decide whether the customer must be told.
> - **Files touched:** none.
> - **Depends on:** none · **Effort:** S (owner), with Support's turnaround unknown.
> - **Acceptance criteria:** a fresh blob-less clone that fetches `refs/pull/*/head` lists no
>   file under `src/test/fixtures/`.
> - **Test gate:** the scan command recorded in `docs/testing.md`, which today lists five files.
> - **Rollback:** n/a.
> - **Diff class:** n/a.

**Milestone exit:**
- [ ] CI is a required check and blocks merge (M1.5).
- [ ] The local error log receives an induced error (M1.6).
- [ ] Zero open blockers. 8.1 stays open until Support confirms, and this milestone says so
  rather than closing over it.
- [ ] The Desktop build artifact from the merged commit is installed and smoke-tested (manual QA
  steps 1-4).

---

## Milestone 2a: data integrity, figures

> **M2.1. A blank becomes zero; nothing read can pass** (4.1, medium)
> - **Fix approach:** header totals stay `null` when unread, and block. Add a blocking
>   `rows-present` check and a per-line `values-present` check. The audit record stores `null`,
>   not 0.
> - **Files touched:** `src/domain/cipl/parse-vendor-a.ts`, `parse-vendor-b.ts`,
>   `parse-omron-ci.ts`, `src/domain/reconcile/index.ts`, `lines.ts`, `src/App.tsx`, tests.
> - **Depends on:** M1.2 · **Effort:** M
> - **Acceptance criteria:** an Omron document with no headings and no totals band can't
>   generate; a line with no value is named.
> - **Test gate:** synthetic documents with the totals band removed, and with one value blanked,
>   both block; each passes with the old `?? 0`.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.2. One module decides what each box files** (4.3, medium; resolves 4.2)
> - **Fix approach:** `src/domain/filed-figure.ts`, one rounding function per kind (money to
>   cents, weight to grams, then the box's precision) with a floor-or-warn policy per box. A CEVA
>   value that rounds to $0 warns (finding 4.2). The adapters, keying sheet, review box and DG renderer
>   call it. An ESLint `no-restricted-syntax` rule bans `toFixed` and `Math.round` on figures
>   elsewhere. **Flagged refactor:** it touches every adapter. The cost of the status quo is 16
>   precision fixes in seven weeks, each one figure computed at two surfaces; the risk is a
>   behaviour change on ties, caught by M1.2's golden tests. Agree it before it starts.
> - **Files touched:** the new module; `src/carriers/*/adapter.ts`, `keying-sheet/index.ts`,
>   `features/review.tsx`, `dangerous-goods/dgd.ts`, `assess.ts`, the parsers' six bare roundings,
>   `eslint.config.js`.
> - **Depends on:** M1.2 · **Effort:** L
> - **Acceptance criteria:** the SLI, keying sheet and review screen show the same figure for the
>   same line under every grouping mode; a $0.40 CEVA row warns.
> - **Test gate:** a property test over the synthetic builder (every grouping mode; SLI row sums
>   equal keying-sheet totals equal review totals) and the tie cases 1.005, 2.675 and 1.0005.
>   Fails against today's mixed rounding.
> - **Rollback:** revert.
> - **Diff class:** flagged refactor.

> **M2.3. Generation proceeds when Schedule B isn't loaded** (4.4, medium)
> - **Fix approach:** "Schedule B unavailable" is a blocking check. The 10-digit format check runs
>   without the index. The badge shows the failure.
> - **Files touched:** `src/domain/reconcile/index.ts`, `src/domain/schedule-b/index.ts`,
>   `src/App.tsx`.
> - **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** a failed dataset load blocks generation and says why.
> - **Test gate:** reconcile with a null index yields a blocking check; fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.4. The import preview shows weights 10x or 100x off** (1.1, medium)
> - **Fix approach:** export `parseWeight` and the pound factor from one place. The preview calls
>   them.
> - **Files touched:** `src/domain/item-library/index.ts`, `src/features/item-library.tsx`,
>   `src/domain/units.ts`.
> - **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** a gram column holding `1,5` previews and stores the same 0.0015 kg, through one function.
> - **Test gate:** a test that preview and import agree for `1,5`, `0,25`, `1,234` and `1,234.5`.
>   Fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.5. Net weight filed where the form asks for gross** (4.7, medium; owner decision)
> - **Fix approach:**
>   1. The owner confirms the rule (15 CFR 30.6, and what Nippon Express and CEVA accept).
>   2. Record it in an ADR.
>   3. If gross is required: wire `useGrossWeight` to a carrier setting, reconcile the per-row
>      gross against the packing-list gross where one is printed, and block when it isn't
>      available rather than fall back.
>   4. If net is accepted: correct the comment and add the ADR.
> - **Files touched:** `docs/adr/0001-shipping-weight.md` (new); possibly
>   `src/carriers/registry.ts`, the adapters, `reconcile`.
> - **Depends on:** the owner's decision · **Effort:** S or M
> - **Acceptance criteria:** the ADR states the rule and its source; the forms follow it.
> - **Test gate:** golden tests (M1.2) assert the chosen weight per carrier.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

**Milestone exit:**
- [ ] Each test gate shown failing with its fix reverted.
- [ ] The installed build is smoke-tested on one real document per format (manual QA step 4).

## Milestone 2b: security and saved data

> **M2.6. Saved records have no version or validation** (4.6, medium; resolves 2.2. Graded into
> this milestone because the updater (M4.2) makes every release read the last release's records)
> - **Fix approach:**
>   - `schemaVersion` on every record.
>   - A validating decoder per store that fills defaults, quarantines records it can't read into
>     a `rejected` store, and reports a count.
>   - `Number.isFinite` guards at the reconcile boundary.
>   - Validate the Schedule B payload's shape on load.
>   - Bump `DB_VERSION` with an `upgrade()` that stamps existing records.
> - **Files touched:** `src/store/local-store.ts`, `src/App.tsx`,
>   `src/domain/schedule-b/index.ts`, `refresh.ts`, tests.
> - **Depends on:** none · **Effort:** M
> - **Acceptance criteria:** opening a database written by today's build loses nothing; a
>   corrupted record is reported, not rendered as `NaN`.
> - **Test gate:** a migration test that seeds a v5 database (fake-indexeddb) with today's record
>   shapes plus one malformed record, opens it with the new code, and asserts every field
>   survives and the bad one is quarantined. Fails without the decoder.
> - **Rollback:** a down-migration isn't possible in IndexedDB. The decoder only adds fields, so
>   the previous build still reads the records. Verified by the same test in reverse.
> - **Diff class:** minimal diff.

> **M2.7. The npm dependency audit can't fail, and updates don't arrive** (8.3, high; resolves 8.4,
> 8.5)
> - **Fix approach:**
>   - Merge #54.
>   - Update the dev dependencies behind the 4 high advisories (`npm update` within ranges, or a
>     reasoned, expiring waiver in `docs/security/audit-waivers.json` per the dependency-policy
>     skeleton).
>   - CI audits everything at `--audit-level=high` without `continue-on-error`, plus a weekly
>     scheduled run.
>   - `.github/dependabot.yml` for npm, cargo and github-actions, with a 7-day cooldown.
>   - `.npmrc` with `min-release-age=7`, `allow-git=root`, `allow-remote=root`, and
>     `packageManager` pinning npm 11.15 or later.
> - **Files touched:** `.github/workflows/ci.yml`, `.github/workflows/audit.yml` (new),
>   `.github/dependabot.yml`, `.npmrc`, `package.json`, `package-lock.json`,
>   `docs/dependency-policy.md` (new).
> - **Depends on:** none · **Effort:** M
> - **Acceptance criteria:** a high advisory without a current waiver turns CI red.
> - **Test gate:** `check:conformance` passes node.audit-gate, core.dependency-updates and
>   node.install-guards. Shown failing on today's tree.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.8. Rust dependencies are never checked for advisories** (8.6, medium)
> - **Fix approach:** `cargo deny check advisories licenses` on pull requests and weekly, with
>   `deny.toml` ignoring the Linux-only gtk-rs advisories for the Windows target, with reasons.
> - **Files touched:** `src-tauri/deny.toml` (new), the workflow from M2.7.
> - **Depends on:** M2.7 · **Effort:** S
> - **Acceptance criteria:** a new advisory in a Windows dependency fails CI.
> - **Test gate:** tauri.supply-chain passes; shown failing today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.9. No way to report a vulnerability privately** (8.7, medium)
> - **Fix approach:** `SECURITY.md` from the skeleton (private reporting through GitHub, the
>   owner's response time). The owner turns on private vulnerability reporting.
> - **Files touched:** `SECURITY.md` (new) · **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** the "Report a vulnerability" button shows on the Security tab.
> - **Test gate:** core.security-policy passes; shown failing today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M2.10. DG is marked done without verification against the DGR** (12.4, high)
> - **Fix approach:** until a DG-qualified person signs off against the current IATA DGR: a
>   banner on the DG screen and a line on the generated checklist saying the figures are not
>   verified against the IATA DGR and naming the course guide they come from, with its revision
>   date. The declaration's generate button needs an explicit acknowledgement. Add an ADR recording the scope and the sign-off needed, and
>   `roadmap.md` marks DG "built, unverified".
> - **Files touched:** `src/features/dangerous-goods.tsx`, `src/domain/dangerous-goods/checklist.ts`,
>   `docs/adr/0002-dangerous-goods-scope.md` (new), `roadmap.md`.
> - **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** nobody can generate a declaration without seeing that it is
>   unverified.
> - **Test gate:** a jsdom test asserts the banner and that generate stays disabled until
>   acknowledged; fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff. Full verification is deferred (below).

> **M2.11. Test profiles hold real-looking identity data** (6.11, medium)
> - **Fix approach:** replace the address, EIN, names, phones and email in
>   `carriers.test.ts:52-65` and `guards.test.ts:22-35` with obviously fictitious values
>   (`00-0000000`, example.com, a 555 number).
> - **Files touched:** those two files · **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** no real-looking identity remains in tests.
> - **Test gate:** a test that scans `src/**/*.test.ts` for EIN-shaped numbers other than
>   `00-0000000` and for non-example email domains; fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

**Milestone exit:**
- [ ] Each test gate shown failing with its fix reverted.
- [ ] The conformance scorecard shows these IDs passing.
- [ ] An installed build opens the previous build's data intact (manual QA step 6).

---

## Milestone 3a: testing depth

> **M3.1. Vendor B's PDF path is untested end to end** (6.5, high)
> - **Fix approach:** a synthetic Vendor B PDF builder beside `cipl.ts` and `omron-ci.ts`, run
>   through `parseCiplFile` (extraction, detection, the `SHIPMENT#` label) and the golden test
>   from M1.2.
> - **Files touched:** `src/test/synthetic/vendor-b.ts` (new), tests · **Depends on:** M1.2 ·
>   **Effort:** M
> - **Acceptance criteria:** detection, parse and fill of a Vendor B PDF run in CI.
> - **Test gate:** `isVendorBFormat` forced false fails the suite; it passes today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.2. Omron has no header golden and no Excel-saved workbook test** (6.7, medium)
> - **Fix approach:** add an Omron case to M1.2's golden test (header, consignee country, ship
>   date). Add a synthetic workbook written in Excel's shared-strings layout (built in the test,
>   not a customer file).
> - **Files touched:** `src/carriers/sli-golden.test.ts`, `src/domain/cipl/parse-omron-ci.test.ts` ·
>   **Depends on:** M1.2 · **Effort:** S
> - **Acceptance criteria and test gate:** breaking shared-string lookup in the Omron reader
>   fails a test.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.3. The Shipper's Declaration is never read back** (6.8, medium)
> - **Fix approach:** extract the rendered declaration's text by position with pdfjs and assert
>   UN number, proper shipping name, class, packing instruction and quantities in their columns.
> - **Files touched:** `src/domain/dangerous-goods/dgd.test.ts` · **Depends on:** none ·
>   **Effort:** S
> - **Acceptance criteria and test gate:** swapping two columns in `dgd.ts` fails it.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.4. No end-to-end journey test; the Rust command surface is untested** (6.9, medium)
> - **Fix approach:**
>   - One journey test (Vitest with jsdom and Testing Library): load the synthetic CIPL, review,
>     pick a carrier, generate, assert the delivered bytes are a filled SLI.
>   - Rust tests for `save_output` and `open_output` path rules and the concordance size limit.
>   - A test that every command name and argument in `src/desktop/index.ts` matches
>     `generate_handler!`.
>   - This replaces workflow 09's intent.
> - **Files touched:** `src/app.journey.test.tsx` (new), `src-tauri/src/lib.rs` tests,
>   `src/desktop/commands.test.ts` (new), `package.json` (Testing Library dev dependency).
> - **Depends on:** M1.2 · **Effort:** M
> - **Acceptance criteria:** the journey runs in CI.
> - **Test gate:** removing the generate button's handler fails the journey; renaming a command on
>   one side fails the contract test.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.5. Coverage isn't measured** (6.10, medium; resolves 6.12)
> - **Fix approach:** `@vitest/coverage-v8`, reported in the CI summary, with a floor set at the
>   measured value and ratcheted. Fix the three unguarded loops and drop the global timeout to
>   per-test where needed (6.12).
> - **Files touched:** `vitest.config.ts`, `package.json`, `ci.yml`,
>   `dgd.test.ts`, `assess.test.ts` · **Depends on:** M1.2 · **Effort:** S
> - **Acceptance criteria:** CI shows coverage, and a drop below the floor fails.
> - **Test gate:** deleting a covered test drops coverage under the floor; the run fails.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

## Milestone 3b: CI depth

> **M3.6. The Rust side is never checked on a pull request** (7.4, medium)
> - **Fix approach:** apply `cargo fmt`; fix the `ptr_arg` at `lib.rs:92`. Add a Windows job on
>   pull requests running `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
>   `cargo test`, plus `tauri build --no-bundle` so packaging breaks before merge.
> - **Files touched:** `src-tauri/src/lib.rs`, `.github/workflows/ci.yml` · **Depends on:** none ·
>   **Effort:** S
> - **Acceptance criteria:** a formatting slip in Rust turns the PR red.
> - **Test gate:** tauri.rust-gates-in-ci passes; the baseline's fmt and clippy failures show the
>   job failing before the fix.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.7. Toolchains and actions aren't pinned; ESLint is end-of-life** (7.5, medium)
> - **Fix approach:**
>   - `.nvmrc` (24) read by `setup-node` (`node-version-file`).
>   - `rust-toolchain.toml` at a named version of 1.90 or later.
>   - Every action pinned by commit SHA with a version comment (Dependabot keeps them current
>     after M2.7).
>   - ESLint 10 with its plugins.
> - **Files touched:** `.nvmrc`, `src-tauri/rust-toolchain.toml`, the workflows, `package.json`,
>   `package-lock.json`, `eslint.config.js` · **Depends on:** M2.7 · **Effort:** M
> - **Acceptance criteria:** two builds of the same commit use the same Node, Rust and actions.
> - **Test gate:** node.runtime-pinned and node.ci-uses-pin pass; shown failing today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.8. The review bot reports reviews that never happened** (7.6, medium)
> - **Fix approach:** delete `.github/workflows/review-bot.yml`. The `review-change` skill is the
>   review.
> - **Files touched:** that file · **Depends on:** none · **Effort:** S
> - **Acceptance criteria:** no "No issues found" comment appears on a PR.
> - **Test gate:** n/a (removal); the conformance workflow audit (M3.9) covers what's left.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.9. Workflows aren't audited and run with default token permissions** (7.7, medium)
> - **Fix approach:** `permissions: contents: read` at the top of each workflow, widened per job
>   only where needed. zizmor on pull requests, failing on findings.
> - **Files touched:** the workflows · **Depends on:** M3.8 · **Effort:** S
> - **Acceptance criteria:** a workflow that asks for write without need fails CI.
> - **Test gate:** core.workflows-audited passes; shown failing today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M3.10. Unchecked index reads in the parsers** (2.1, medium)
> - **Fix approach:** `noUncheckedIndexedAccess` in a `tsconfig` covering `src/domain/cipl/`,
>   fixing the 129 errors with explicit guards that report an unreadable row rather than default
>   it. Add a ratchet file holding the count for the rest of `src/`, failing if it rises. Use
>   type-aware lint (`recommendedTypeChecked`, `no-floating-promises`).
> - **Files touched:** `tsconfig.app.json` or `src/domain/cipl/tsconfig.json`, the three parsers,
>   `eslint.config.js` · **Depends on:** M1.2, M3.1 · **Effort:** L
> - **Acceptance criteria:** `npm run typecheck` runs the stricter flag on the parsers.
> - **Test gate:** an unguarded index added to a parser fails typecheck.
> - **Rollback:** revert.
> - **Diff class:** flagged refactor (it touches all three parsers; agree first).

**Milestone exit:**
- [ ] Each test gate shown failing with its fix reverted.
- [ ] Coverage reported.
- [ ] The conformance scorecard shows every Milestone 3 ID passing.

---

## Milestone 4: complete, against the owner's definition

The first build with the updater is the last one installed by hand. Every later version arrives on
its own.

> **M4.1. No versioning, release or rollback** (7.2, high)
> - **Fix approach:**
>   - `package.json` is the one version source: `tauri.conf.json` reads `"../package.json"`, and a
>     test fails if `Cargo.toml` differs.
>   - A release workflow on `v*` tags builds on Windows through `npm run desktop:build` (the
>     locked CLI) and publishes the installer to a GitHub Release, keeping old releases.
>   - Rollback is a higher version built from the last good tag.
> - **Files touched:** `src-tauri/tauri.conf.json`, `.github/workflows/release.yml` (new),
>   `desktop.yml`, `package.json`, a version-sync test · **Depends on:** M1.5, M3.6, M3.7 ·
>   **Effort:** M
> - **Acceptance criteria:** tagging `v0.2.0` produces a public release with the installer, and
>   the installed app shows 0.2.0 (M1.6's footer).
> - **Test gate:** the version-sync test fails with `Cargo.toml` edited alone.
> - **Rollback:** delete the release; a newer tag supersedes it.
> - **Diff class:** minimal diff.

> **M4.2. No auto-updater** (7.1, high)
> - **Fix approach:**
>   - Add `tauri-plugin-updater` with `createUpdaterArtifacts: true`, the public key in
>     `tauri.conf.json`, and the endpoint
>     `https://github.com/JoelA510/FormWaypoint/releases/latest/download/latest.json`.
>   - The app checks on start and offers the update; the passive install mode suits a per-user
>     installer.
>   - The release workflow signs with `TAURI_SIGNING_PRIVATE_KEY` and `_PASSWORD`, held as
>     secrets in a `release` Environment that needs the owner's approval, and publishes
>     `latest.json`.
>   - **Key custody** goes in the release runbook (M4.4):
>     - the owner generates the pair on their own machine (`tauri signer generate`);
>     - the private key and password are stored in the owner's password manager and in one
>       offline encrypted copy;
>     - the owner names a second custodian, or records that there is none;
>     - losing the key strands every installed copy on its version until a manual reinstall.
>   - The updater is the first plugin, so an ADR records reversing "no plugins, deliberately"
>     (`lib.rs:9-12`).
>   - Bump `rust-version` to 1.90 or later.
> - **Files touched:** `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
>   `src-tauri/capabilities/default.json` (`updater:default`), `src-tauri/src/lib.rs`,
>   `src/desktop/index.ts`, a small update prompt in `src/App.tsx`, `release.yml`,
>   `docs/adr/0003-updater.md` · **Depends on:** M4.1, M2.6 · **Effort:** M
> - **Acceptance criteria:** 0.2.0 installed by hand offers 0.2.1 on start, installs it without a
>   reinstall, and keeps the profile, item library and history.
> - **Test gate:**
>   - tauri.updater-key passes (configured, key not in the repository, HTTPS endpoint).
>   - A CI step verifies `latest.json`'s signature against the committed public key and fails on
>     mismatch, shown failing with a wrong key.
>   - The update itself is manual QA step 7.
> - **Rollback:** publish a higher version built from the last good tag; `latest.json` points at
>   it.
> - **Diff class:** flagged refactor (first plugin; an ADR reverses a stated decision).

> **M4.3. The installer isn't code-signed** (8.2, high; owner decision on the route)
> - **Fix approach:** sign in the release workflow through `bundle.windows.signCommand`. The
>   options, at the $0 budget:
>   - (a) **SignPath Foundation**: free for open source. MIT and public qualify; it needs the
>     automated release build from M4.1, a code-signing policy on the project page, and SignPath
>     Foundation shown as publisher. Apply at signpath.org.
>   - (b) **Azure Artifact Signing**: about $9.99 a month for an individual in the US; breaks the
>     budget.
>   - (c) **Stay unsigned**: SmartScreen warns on every install, and the shipper clicks through.
>     That works only if Omron's IT allows unsigned software, which is unknown.
>
>   Recommendation: apply for (a) now (approval takes time), ship M4.1 and M4.2 unsigned meanwhile,
>   and find out (c)'s answer from Omron IT. Update signing (M4.2) doesn't depend on this.
> - **Files touched:** `tauri.conf.json`, `release.yml`, `docs/code-signing-policy.md` (if (a)) ·
>   **Depends on:** M4.1 · **Effort:** S once approved
> - **Acceptance criteria:** the installer's properties show a valid signature with a timestamp.
> - **Test gate:** a release-workflow step runs `signtool verify /pa` on the installer and fails
>   when unsigned.
> - **Rollback:** remove `signCommand`; releases go back to unsigned.
> - **Diff class:** minimal diff.

> **M4.4. No desktop runbook; DEPLOYMENT.md wrong about desktop; no ADRs** (12.6, medium)
> - **Fix approach:**
>   - `docs/release-runbook.md` from the skeleton: versioning, tagging, signing, update-key
>     custody and recovery, rollback, the manual QA script.
>   - Also in the runbook: where desktop data lives (the WebView2 profile under the app
>     identifier; outputs in Downloads) and how to back it up.
>   - Correct `docs/DEPLOYMENT.md`'s desktop section.
>   - ADRs for the client-only design and the Tauri shell (DG scope is M2.10; the updater is M4.2).
> - **Files touched:** `docs/release-runbook.md`, `docs/DEPLOYMENT.md`, `docs/adr/0004-*`,
>   `docs/adr/0005-*` · **Depends on:** M4.1, M4.2 · **Effort:** S
> - **Acceptance criteria:** someone other than the owner could cut a release from the runbook.
> - **Test gate:** `check:instructions` and the placeholder check over the new docs; the runbook's
>   QA steps run once against a real release.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M4.5. Schedule B staleness isn't gated and can be masked** (4.5, medium)
> - **Fix approach:**
>   - Record the concordance's source date (from Census, not the run date) in the dataset.
>   - A stale dataset is a blocking check the user can acknowledge with a reason, stored with the
>     shipment.
>   - `build-schedule-b.mjs` without `--fetch` keeps the source date.
> - **Files touched:** `scripts/build-schedule-b.mjs`, `src/domain/schedule-b/*`,
>   `reconcile/index.ts`, `App.tsx` · **Depends on:** M2.3 · **Effort:** S
> - **Acceptance criteria:** a dataset dated before the last January or July revision blocks
>   until acknowledged.
> - **Test gate:** reconcile with a stale dataset yields the check; re-running the build script
>   offline leaves the date unchanged. Both fail today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

**Milestone exit:**
- [ ] A tagged release installs.
- [ ] The next release arrives through the updater with data intact (manual QA step 7).
- [ ] The installer is signed, or the owner has recorded the decision to ship unsigned.
- [ ] The runbook has been followed once.

---

## Milestone 5a: polish, accessibility and copy

> **M5.1. Contrast fails AA in several token pairs** (11.1, medium)
> - **Fix approach:** adjust the dark primary and danger and light `ink-faint` and badge tokens.
>   Add a contrast test computing every text and background pair from `globals.css`.
> - **Files touched:** `src/styles/globals.css`, `src/styles/contrast.test.ts` (new) ·
>   **Depends on:** none · **Effort:** S
> - **Acceptance criteria and test gate:** every pair at least 4.5:1; the test fails on today's
>   tokens.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.2. Results aren't announced; focus is lost** (11.2, medium)
> - **Fix approach:** `role="alert"` for errors and `role="status"` for results; focus moves to
>   each step's heading; hints linked through `aria-describedby`.
> - **Files touched:** `src/App.tsx`, `src/components/ui.tsx`, the panels · **Depends on:** M3.4 ·
>   **Effort:** S
> - **Acceptance criteria and test gate:** a journey-test assertion that focus lands on the review
>   heading after upload, and that the error banner has the alert role; fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.3. Copy is wrong for the installed app** (11.3, medium)
> - **Fix approach:** the desktop banners point at the in-app refresh; the web banners keep the
>   script; the footer names the platform.
> - **Files touched:** `src/App.tsx` · **Depends on:** none · **Effort:** S
> - **Acceptance criteria and test gate:** a test rendering both platforms asserts no `npm` text in
>   the desktop banner.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.4. A stale "Saved to" survives a failed retry** (5.3, medium)
> - **Fix approach:** clear `saved` when an attempt starts; key the output panel to a hash of the
>   draft.
> - **Files touched:** `src/features/output-panel.tsx`, `src/features/dangerous-goods.tsx` ·
>   **Depends on:** none · **Effort:** S
> - **Acceptance criteria and test gate:** a jsdom test where the second generate fails asserts no
>   "Saved to" is shown; fails today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.5. The UI/UX rules are declared, not enforced** (11.4, low)
> - **Fix approach:** fold the measurable rules into M5.1 and M5.2's tests; move the generic docs to
>   `docs/archive/`.
> - **Files touched:** `docs/ui-ux-*` · **Depends on:** M5.1, M5.2 · **Effort:** S
> - **Acceptance criteria:** nothing in `docs/` states a UI rule no test or review step holds.
> - **Test gate:** the tests in M5.1 and M5.2.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

## Milestone 5b: polish, structure and docs

> **M5.6. pdf-lib and DG load eagerly; no bundle budget** (10.1, low)
> - **Fix approach:** dynamic `import()` for the carrier fill and render modules and the DG panel;
>   drop the raised `chunkSizeWarningLimit`; a budget file checked in CI.
> - **Files touched:** `src/App.tsx`, `src/features/output-panel.tsx`, `vite.config.ts`,
>   `bundle-budget.json`, `ci.yml` · **Depends on:** M3.4 · **Effort:** S
> - **Acceptance criteria:** the main chunk drops by about 400 kB (measured).
> - **Test gate:** vite-spa.bundle-budget passes; a budget below the current size fails CI.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.7. `domain` and `carriers` import each other; env read inside a parser** (1.2, medium;
> resolves 8.8)
> - **Fix approach:**
>   - Move the shared types and `parseLooseDate` into `domain`.
>   - Pass the Vendor B markers in through a typed config module that reads the two variables by
>     name (8.8).
>   - A `no-restricted-imports` rule per folder.
> - **Files touched:** `src/domain/draft.ts`, `src/carriers/form-utils.ts`,
>   `src/carriers/types.ts`, `src/domain/cipl/parse-vendor-b.ts`, `src/config.ts` (new),
>   `eslint.config.js` · **Depends on:** M3.10 · **Effort:** M
> - **Acceptance criteria:** `check:env` reports nothing; the boundary rule passes.
> - **Test gate:** an import from `carriers` into `domain` fails lint; vite-spa.client-env passes.
> - **Rollback:** revert.
> - **Diff class:** flagged refactor (moves shared types across a boundary).

> **M5.8. Dead code and duplicate derivations** (1.4, low; resolves 1.3)
> - **Fix approach:**
>   - knip in CI.
>   - Remove the uncalled functions, the unused alias and the dead ESLint override.
>   - Hoist the adapter fallback to one function.
>   - Use `localDate()` in the refresh stamp (finding 1.3).
> - **Files touched:** as listed in 1.3 and 1.4, `knip.json`, `ci.yml` · **Depends on:** none ·
>   **Effort:** S
> - **Acceptance criteria:** knip reports nothing.
> - **Test gate:** node.unused-code passes; an unused export fails CI.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.9. Two conflicting roadmaps** (12.5, medium)
> - **Fix approach:** correct `roadmap.md` (formats, carriers, test count, command count, DG
>   status, a true date); move `docs/ROADMAP_ENHANCEMENTS.md` to `docs/archive/`.
> - **Files touched:** `roadmap.md`, `docs/ROADMAP_ENHANCEMENTS.md` · **Depends on:** M2.10 ·
>   **Effort:** S
> - **Acceptance criteria:** one roadmap, matching the code.
> - **Test gate:** review only (docs).
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.10. README drift and leftovers** (12.7, low; resolves 12.8)
> - **Fix approach:**
>   - Correct the README lines listed in 12.7 and the command counts in `capabilities/default.json`
>     and `lib.rs:3`.
>   - Move `REVIEW-FINDINGS.md` to `docs/archive/`.
>   - Delete the duplicate `Form Waypoint Draft.png`, keeping `docs/assets/logo.png` (unreferenced
>     either way; the owner may want neither).
> - **Files touched:** `README.md`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`,
>   `REVIEW-FINDINGS.md`, the PNG · **Depends on:** M5.9 · **Effort:** S
> - **Acceptance criteria:** the README matches the tree.
> - **Test gate:** `check:instructions` (paths in instruction files); review for prose.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

## Milestone 5c: hardening

> **M5.11. `open_output` can launch any file in Downloads; `save_output` takes any extension** (8.9,
> low; resolves 8.10, 8.11)
> - **Fix approach:**
>   - Allow `.pdf` and `.xlsx` only, in Rust.
>   - `open_output` accepts only paths `save_output` returned this session (a set in Tauri
>     `State`).
>   - Write with `create_new(true)`.
>   - Fail when the concordance read reaches the 32 MB cap, and redact userinfo from the proxy URL
>     (8.10).
>   - Cap upload size and total inflated bytes in the ZIP reader (8.11).
> - **Files touched:** `src-tauri/src/lib.rs`, `src/domain/item-library/read-workbook.ts`,
>   `src/features/upload-panel.tsx`, `item-library.tsx` · **Depends on:** M3.4, M3.6 · **Effort:** M
> - **Acceptance criteria:** opening an unsaved path is refused; an oversized file is refused with
>   a message.
> - **Test gate:** Rust tests for each refusal and a JS test for the inflate cap, each failing
>   today.
> - **Rollback:** revert.
> - **Diff class:** minimal diff.

> **M5.12. Redistribution rights for the carriers' blank forms aren't recorded** (8.12, low)
> - **Fix approach:** the owner confirms the forms are freely distributable (both carriers publish
>   them for shippers) and notes the source and date in `public/templates/README.md`; if not, the
>   app asks the user to supply the blank form.
> - **Files touched:** `public/templates/README.md` · **Depends on:** the owner · **Effort:** S
> - **Acceptance criteria:** the source and terms are written down.
> - **Test gate:** n/a (records a fact).
> - **Rollback:** n/a.
> - **Diff class:** minimal diff.

---

## Manual QA script

Run on Windows, with the installed build.

1. Install the build from the latest Desktop build artifact (later, from the GitHub Release).
   Expect: it installs per-user, launches, and the footer shows the version (after M1.6). Note any
   SmartScreen or IT block.
2. Load a real CIPL of each format: Vendor A, the `SHIPMENT#` layout, and Omron as xlsx and as
   PDF. Expect: no blocking check you can't explain, and the commodity table matches the
   document.
3. Generate a Nippon Express SLI and a CEVA SLI for one shipment. Compare every box with a form
   processed by hand for the same shipment. Expect: identical figures. A difference is a new
   blocker.
4. Generate FedEx and UPS keying sheets for a Vendor B shipment. Expect: the package weight is
   blank and flagged to weigh (after M1.1), never the net weight.
5. Unplug the network, or block census.gov, and run the Schedule B refresh. Expect: a clear
   failure, and the bundled dataset still in use.
6. Install the next build over the current one. Expect: the profile, item library, part weights
   and history are all present.
7. With M4.2 shipped: install vN by hand, publish vN+1, then start vN. Expect: it offers the
   update, installs it without a reinstall, and keeps everything from step 6. Repeat on the Omron
   network to confirm GitHub's release downloads get through the proxy.
8. Induce an error (after M1.6, with a deliberately malformed CIPL that throws). Expect: the error
   screen, not a blank window, and an entry in "Export diagnostics".

Steps 2 and 3 are what the real-shipment suite (M1.4) automates on the owner's machine. Step 7 is
partly automated by M4.2's signature check.

## Discovered during execution

- (none yet)

## Deferred with reason

- **Full verification of the DG figures against the IATA DGR** (what M2.10 leaves open). Needs the
  licensed DGR and a DG-qualified reviewer, neither available here; M2.10 makes the gap visible
  instead. Reopen if DG becomes part of "complete" or is about to be used for a real shipment.
- **8.13 Web build has no CSP.** The web build isn't deployed, and the desktop shell has one.
  Reopen if the web build is hosted anywhere (a meta CSP matching `tauri.conf.json`, and a test).
- **Web hosting** (the owner's Vercel question). Not needed for "complete": the desktop app
  updates from GitHub Releases, which are free, HTTPS and versioned, and keep old releases for
  rollback. A web copy at a `secureyour.tech` subdomain on Vercel would work technically, but
  Vercel's Hobby plan is for non-commercial use, and this is used for work. Reopen if a browser
  version is wanted for machines where installing isn't allowed.

## When this plan is done

Mark the status line DONE with the date, move lessons worth keeping into a lessons-learned file
(skeleton: `prompts/skeletons/docs/lessons-learned.md`), and leave this plan in its dated folder.
Don't keep appending to it.
