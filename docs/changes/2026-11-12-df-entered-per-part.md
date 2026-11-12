# D/F can be entered per part, and a blank origin no longer files as foreign silently

Kind: BUGFIX · Drawn up: 2026-11-12 · Owner: Joel Abraham · Status: DONE

Agreement: as for `2026-11-12-dg-rules-dated-source.md`. The owner asked for the verification
report's items one pull request at a time and gave the implementing session discretion over the
open decisions on 2026-11-12. The three this plan needed are under Design.

## Why

A shipper turning a CIPL into an SLI (docs/product.md, Users) signs a form that says, per
commodity row, whether the goods are domestic or foreign. The tool chose that letter from the
country of origin and gave them no way to correct it. For a part made abroad and substantially
transformed in the United States the form was wrong and looked complete. Item 2 of the 2026-11
verification.

## Behavior

- **Now** (statically reviewed; receipts in the verification report, item 2):
  - `domesticForeign()` returns D for six US spellings and F for everything else, including a
    blank.
  - The review screen prints the letter as text. No field, store record or setting changes it.
  - A line with no country of origin is filed F and no check mentions it.
- **After:**
  - The per-part table has a D/F column. It shows what the document gives ("F from Japan", "no
    origin stated") and lets a person enter D or F with a reason. The entry is saved against the
    part with their name and the date.
  - An entry is filed in place of the derived letter on both SLIs and both keying sheets, and
    regroups rows accordingly.
  - An entry in force is always shown with its date, name and reason, and can be reverted.
  - A warning check, `origin-status-entered`, names each part whose entered letter differs from
    what the document gives, or supplies one the document does not.
  - A warning check, `origin-stated`, fails on any line with no country of origin and no entry
    for its part, and says the line is being filed as F. It was blocking in the first version
    of this change; the owner asked for a warning (ADR 0006).
- **Unchanged:**
  - A shipment whose every line states an origin, with nothing entered, produces exactly the
    rows, letters and checks it did. Proved by the existing reconcile, golden and keying-sheet
    suites passing untouched (1,129 tests before any new one was added).
  - `domesticForeign()` itself. Its callers that guard a blank origin keep their guards.
  - The country of origin and country of manufacture shown and keyed. An entry changes the
    letter, never the country.
  - Part records saved before the change.

## Out of scope

- Any judgement about whether a transformation is substantial. The tool records the person's
  answer.
- Item 5(a), the EEI threshold check, which depends on this and comes next.
- Carrying the entry's reason onto a form. No form has a box for it.

## Against the rules

- Operating rule 14 (how a filed value is chosen; a persisted record's shape) — follows it: this
  plan.
- Project rule 1 — departs in one case, on the owner's decision: a blank origin is still filed as
  F. It is now warned about by name where it was silent. Recorded in ADR 0006.
- Project rule 2 — follows it for the determination: the letter can now come from a person. The
  blank-origin case is the departure noted under rule 1.
- Project rule 4 — follows it: both new checks have tests that make them fail.
- ADR 0006 (new, in this change) records the decision. No existing ADR is touched.

## Design

**Decisions taken** (each was the owner's; the recommendation was followed, reasons in ADR 0006):

1. *Per part or per shipment:* per part, kept and reused.
2. *Approver as well as reason:* reason only; the signer's name is recorded from the profile.
3. *Blank origin:* warns. The recommendation was to block; the owner chose a warning.

**Regulatory text.** 15 CFR 30.6(a)(11) and the definitions it points to in § 30.1(c), from the
eCFR, title 15 current to 2026-11-09, retrieved 2026-11-12. Quoted in ADR 0006. Nothing in the
code encodes a figure from them; the check's wording cites § 30.1(c).

**Domain.** `domesticForeignFor(line, originStatusByPart)` in `lines.ts` returns the entry for
the line's part, else `domesticForeign(origin)`. `AggregationOptions.originStatusByPart` feeds
`aggregateLines`. `originStatusChecks` in `reconcile/index.ts` adds the two checks. The keying
sheet takes the same map and uses the same resolver for its `df-code` key and its D/F cell.

**Persisted record.** `PartOverrideRecord` gains `originStatus`, `originStatusReason`,
`originStatusBy`, `originStatusAt`, all optional. `decodePartOverrides` reads a record without
them unchanged and drops a stored status that is not `D` or `F` (logged as a repair).
`mergePartOverride` is the store's merge lifted out of its transaction so "is this record now
empty" can be tested; an entry-only record is kept.

**UI.** `OriginStatusInput` in `review.tsx`: a labelled native select, a reason input, and an
Apply button disabled until there is a reason and a signer name. A line with no part number gets
no control, and the warning says why.

## Risks and rollback

- **Risk:** the blank-origin warning is read past and F is filed for goods that are domestic —
  **watch:** it names each line, and the D/F column shows "no origin stated" in the blocking
  colour for that part — **if it happens:** enter the D/F for the part; the generated form is
  also editable.
- **Risk:** a carried entry is applied to a shipment where it no longer holds — **watch:** the
  warning check and the dated line on the review screen appear every time — **if it happens:**
  revert the entry on that screen.
- **Rollback:** revert the commit. Part records keep four extra fields the older code ignores.

## Tasks

- [x] `domesticForeignFor` and `originStatusByPart` in aggregation — proved by
  `src/domain/reconcile/origin-status.test.ts`. Planted: entry ignored (5 fail); applied to a
  line with no part number (1 fails).
- [x] `origin-stated` and `origin-status-entered` — proved by the same file through `reconcile`
  on the synthetic CIPL. Planted: blank never warned about; entry does not answer a blank; agreeing
  entry reported; warning never raised (1 or 2 fail each).
- [x] Keying sheet states the same letter — proved by `keying-sheet.test.ts`. Planted: `df-code`
  key, the cell, and the blank-origin answer each ignoring the entry (1 fails each).
- [x] Record shape, merge and decode — proved by `src/store/local-store.test.ts` and
  `decode.test.ts`, including a record saved before the fields existed. Planted: entry-only
  record deleted (2 fail); map passes any value; decode trusts any letter (1 fails each).
- [x] Review screen column — proved by `src/features/review.test.tsx`. Planted: apply without a
  reason; without a signer; entry shown without its date (1 fails each).
- [x] `App.tsx` passes the map to `reconcile` and to the output panel — no test; statically
  reviewed. The app shell has no test harness, and each end of the wire is tested.
- [x] ADR 0006; README and `roadmap.md` brought into line.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] The repository's full gate passes, and every new check was shown failing first.
- [x] docs/product.md, the README, and any ADR are updated where this change moved them.
