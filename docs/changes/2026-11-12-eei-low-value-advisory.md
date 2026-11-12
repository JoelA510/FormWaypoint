# The review screen says which commodity totals are over the EEI low-value figure

Kind: FEATURE · Drawn up: 2026-11-12 · Owner: Joel Abraham · Status: DONE

Agreement: as for the three plans before it. The owner asked for the verification report's items
one pull request at a time, gave the implementing session discretion over open decisions, and
prefers warnings to blocks. He confirmed the $2,500 figure on 2026-11-12, in review of the pull
request.

## Why

A shipper preparing an SLI (docs/product.md, Users) needs to know whether the shipment has to be
filed in AES. The commonest reason is value: any one Schedule B number over $2,500. The tool held
every figure that test needs and said nothing. Item 5(a) of the 2026-11 verification.

## Behavior

- **Now** (executed 2026-11-12: the searches in the verification report, item 5): no check,
  field or output concerns the EEI filing requirement.
- **After:** one check of severity `info`, `eei-low-value-exemption`, on every reconciliation
  that has rows.
  - Any Schedule B number whose total, with D and F counted apart, is over $2,500 is named with
    its value, and the check says EEI has to be filed for it, citing 15 CFR 30.37(a) and the date
    the text was current to.
  - Where none is, it says so, and says this does not mean no filing is required, citing
    15 CFR 30.2(a)(1)(iv).
  - Where the rows are not priced in US dollars, or the currency could not be read, it compares
    nothing and says which currency they are in.
  - The heading says what was found: none over, how many over, or not compared.
- **Unchanged:**
  - Whether a shipment can be generated. Proved by the reconcile suites passing untouched and by
    the test that asserts the severity in both directions.
  - Every row, figure and other check.
  - Nothing is saved that was not saved before; the check rides in the history record's check
    list like any other.

## Out of scope

- Items 5(b) to 5(d) of the report: an ITN on the shipment record, a corrected-filing diff, an ITN
  on the keying sheet. They make the tool a record of filings and need a line in
  `docs/product.md` first.
- Any other exemption in § 30.37, and every case in § 30.2(a)(1)(iv).
- Currency conversion. A document with no US dollar set is not compared.

## Against the rules

- Operating rule 14 — not strictly on its list (no filed figure, mapping, persisted shape, DG
  rule or network call), but it encodes a regulatory figure, so it is planned and has an ADR.
- Project rule 2 — follows it: the check never concludes that no filing is required.
- Project rule 3 — follows it: the figure is a constant; nothing is fetched.
- Project rule 4 — follows it: the check has tests that make it fail.
- ADR 0006 — relies on it: D/F decides which total a row's value joins.
- ADR 0008 (new, in this change).

## Design

**Regulatory figure.** `$2,500`, 15 CFR 30.37(a), read from the eCFR
(`https://www.ecfr.gov/api/versioner/v1/full/2026-11-09/title-15.xml?part=30&section=30.37`),
title 15 current to 2026-11-09, retrieved 2026-11-12, section last amended at 90 FR 39122
(2025-08-14). Held as `EEI_LOW_VALUE_EXEMPTION` with all of those fields. Quoted in ADR 0008.

**Arithmetic.** `eeiBuckets(sliLines)` sums `valueUsd` in whole cents by normalised Schedule B
number and D/F. Rows are finer than that (they also split on ECCN, licence, SME and unit), so a
comparison per row would miss totals over the figure. "Over" is strictly greater: the exemption
covers "$2,500 or less".

**Check.** `eeiThresholdCheck(sliLines, currency)` returns one `info` check, or none for no rows.
Added to `reconcile()` after the capacity check, with the selected header's currency.

## Risks and rollback

- **Risk:** the regulation is amended — **watch:** the owner confirmed the figure on 2026-11-12;
  the dates in `EEI_LOW_VALUE_EXEMPTION` say when it was read — **if it happens:** one edit to the record; the tests that name 2500 change with it.
- **Risk:** the passing wording is read as "no EEI needed" — **watch:** the caveat is in the
  same sentence and a test fails if it is dropped — **if it happens:** drop the passing state and
  show the check only when a total is over.
- **Risk:** a wrong D/F puts value in the wrong total — **watch:** ADR 0006's warning names every
  entered or unstated D/F on the same screen.
- **Rollback:** revert the commit. Nothing persisted changes.

## Tasks

- [x] `EEI_LOW_VALUE_EXEMPTION` — proved by `src/domain/reconcile/eei.test.ts`: the figure,
  citation, source and dates are present as data.
- [x] `eeiBuckets` — proved by the same file. Planted: rows not summed (3 fail); D and F summed
  together; one number written two ways counted twice; a floating-point sum (1 fails each).
- [x] `eeiThresholdCheck` — proved by the same file. Planted: exactly $2,500 counted as over
  (2 fail); severity `warning` (2); caveat dropped; totals not sorted; always passing (1 or 2).
- [x] Wired into `reconcile()` — proved by the same file through a real parse. Planted: the line
  removed (1 fails).
- [x] Currency guard and headings — proved by the same file, including through `reconcile()` on a
  parse whose headers say JPY. Found in review: the first version treated a document with no US
  dollar set as dollars, and headed an over-the-figure result "No commodity number totals over
  $2,500". Planted: currency never checked (3 fail); compared case-sensitively; `reconcile()`
  always passing USD; the heading fixed to the passing statement (1 fails each).
- [x] ADR 0008; README and `roadmap.md` brought into line.

One planted defect survived at first: removing the per-row rounding alone changes nothing for
the test's input, because ten cents times a hundred is exact. The defect was replanted as a sum
taken in dollars, which fails the test.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] The repository's full gate passes, and every new check was shown failing first.
- [x] docs/product.md, the README, and any ADR are updated where this change moved them.
