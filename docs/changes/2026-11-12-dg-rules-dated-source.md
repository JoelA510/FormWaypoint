# The dangerous goods rules say when they stop describing the regulations in force

Kind: FEATURE · Drawn up: 2026-11-12 · Owner: Joel Abraham · Status: DONE

Agreement: the owner asked for the items in `docs/audits/2026-11-external-review/verification.md`
to be worked through one pull request at a time and, on 2026-11-12, gave the implementing session
discretion to follow its own recommendation on the open decisions. The three decisions this plan
needed are recorded under Design with the recommendation taken. The date in `DG_RULES_SOURCE`
is the one figure still owed the owner's own confirmation; see Risks.

## Why

A shipper with a battery consignment by air (docs/product.md, Users) is told on every output that
the rules are unverified (ADR 0003). Nothing tells them when the rules are also out of date. The
DGR is reissued each January, the figures here come from materials revised 02/01/2026, and the
workflow had no date in it at all: on 4 January 2027 it would have produced the same checklist,
with the same notice, as on 12 November 2026. Item 3 of the 2026-11 verification confirms the gap.

## Behavior

- **Now** (executed 2026-11-12: the greps in the verification report, item 3):
  - `DG_SOURCE_NOTICE` names the course material revisions inside a sentence. No date is data.
  - No code under `src/domain/dangerous-goods/`, `src/features/dangerous-goods.tsx` or
    `src/carriers/dgd/` compares a rules date with the current date.
  - A retention record does not say which figures a consignment was prepared under.
- **After:**
  - `DG_RULES_SOURCE` in `lithium.ts` holds the materials, the first day a later DGR is in force
    (`2027-01-01`), and where and when that date was read.
  - A warning check, `dg.rules-current`, is on every assessment. It passes and names the date
    until that day, and fails from it.
  - Every checklist prints the source and the date under the unverified notice. From the day, it
    also prints the lapse in bold, and the failed check appears under Outstanding.
  - From the day, the Generate card shows the lapse and a second checkbox, and neither download
    is enabled until both are ticked.
  - Each retention record carries `rulesSource`: the materials, the date, and whether the lapse
    had come when it was prepared. The history list marks a record prepared after it.
- **Unchanged:**
  - `DG_SOURCE_NOTICE` reads exactly as before, and is still shown and printed where ADR 0003
    says. Proved by the existing tests that assert it verbatim.
  - Before the day, the Generate card asks for one acknowledgement, as now.
  - `canGenerate` is decided by the blocking checks alone. A consignment that could be generated
    on 31 December can be generated on 1 January.
  - The Shipper's Declaration PDF is untouched.
  - Records saved before this change still decode and list.

## Out of scope

- Updating any figure to the 2027 DGR. This change makes the tool say the figures are superseded;
  it does not supersede them.
- A ruleset as versioned data (`roadmap.md`, "What the dangerous goods workflow still does not
  do").
- The other nine items of the verification report.

## Against the rules

- Operating rule 14 (a dangerous goods rule; the shape of a persisted record) — follows it: this
  plan, agreed as above.
- Operating rule 9 — follows it: each new test was run against a planted defect (Tasks).
- Project rule 2 — follows it: nothing is inferred. The date is read from IATA and held with its
  source.
- Project rule 3 — follows it: no network call. The date is a constant.
- Project rule 4 — follows it: an unreadable date counts as lapsed, so the check fails loudly.
- ADR 0003 — follows it, and is not superseded. The notice, the acknowledgement and where they
  appear are unchanged.
- ADR 0005 (new, in this change) records the decision to warn and not block, and to leave the
  declaration unstamped.

## Design

**Decisions taken** (each was the owner's; the recommendation was followed):

1. *Warn or block once lapsed:* warn, with a second required acknowledgement. Reasons in ADR 0005.
2. *The date and its source:* `2027-01-01`, from IATA's statement "The 2027 DGRs come into force
   on 1 January 2027" (https://www.iata.org/en/programs/cargo/dgr/download/, retrieved
   2026-11-12).
3. *Where the stamp is printed:* the checklist, the screen and the retention record. Not the
   Shipper's Declaration.

**Data.** `DG_RULES_SOURCE` is a constant: `materials`, `supersededOn` (`YYYY-MM-DD`), and
`supersededBasis` (`statement`, `source`, `retrieved`). `dgRulesLapsed(onDate)` compares a local
`YYYY-MM-DD` string with `supersededOn`; a string in any other shape is lapsed. Local, because a
UTC date calls the afternoon of 31 December the new year across the United States.

**Assessment.** `assess(consignment, onDate = localDate())` appends `rulesCurrencyCheck(onDate)`
after `canGenerate` is decided.

**Persisted record.** `DgConsignmentRecord.rulesSource?: { materials, supersededOn,
lapsedWhenPrepared }`, copied from the constant at preparation so a record goes on saying what it
was prepared under after the constant has moved. `decodeDgConsignments` reads a record without it
unchanged, and drops a stamp that is present but unreadable (logged as a repair), keeping the
record.

**UI.** `DeclarationPanel` takes an optional `onDate`. When lapsed it renders a `role="alert"`
block with `DG_RULES_LAPSED_NOTICE` and a labelled native checkbox; the downloads are disabled
until both acknowledgements are ticked. Neither is saved. The history table adds "rules superseded
<date>" beside the prepared date for a lapsed record.

## Risks and rollback

- **Risk:** the date is wrong, or the owner reads the source differently — **watch:** the owner
  confirms `supersededOn` and `supersededBasis` against IATA — **if it happens:** one edit to the
  constant; the tests that name `2027-01-01` change with it.
- **Risk:** the lapse warning becomes one more box ticked without reading — **watch:** it stays
  failing on every consignment and printed on every checklist until the figures are updated —
  **if it happens:** ADR 0005 is revisited and the check made blocking, a one-word change.
- **Risk:** the app is left open across midnight on 31 December; the assessment is memoised on the
  consignment and keeps the old date until something is edited — **watch:** the Generate card and
  the checklist read the date when they render or print, so both show the lapse regardless.
- **Rollback:** revert the commit. Records already written keep an extra `rulesSource` field,
  which the older decoder passes through untouched.

## Tasks

- [x] `DG_RULES_SOURCE`, `dgRulesLapsed`, `DG_RULES_LAPSED_NOTICE` — proved by
  `src/domain/dangerous-goods/lithium.test.ts`: the boundary day, an unreadable date, and that
  the notice and the record name the same materials. Planted: never lapsed (5 tests fail), a day
  late (5 fail), unreadable reads as current (1 fails).
- [x] `dg.rules-current` in `assess` — proved by `assess.test.ts`: passes before, fails as a
  warning from the day, `canGenerate` unmoved. Planted: severity `blocking` (3 fail).
- [x] Checklist source line and lapse line — proved by `checklist.test.ts`. Planted: each line
  dropped (1 fails each).
- [x] Second acknowledgement — proved by `src/features/dangerous-goods.test.tsx`: one box before
  the day; two after, and the downloads stay disabled on the first alone. Planted: the second not
  required (1 fails).
- [x] `rulesSource` on the retention record — proved by the same file, downloading a checklist
  through the panel with the clock on either side of the day. Planted: stamp hard-coded (1 fails).
- [x] History marker — proved by the same file. Planted: marker removed (1 fails).
- [x] Decode path — proved by `src/store/decode.test.ts`: a record saved before the field, a
  stamped one, and five unreadable stamps. Planted: unreadable stamp trusted (1 fails).
- [x] ADR 0005; README, `roadmap.md` and `docs/product.md` brought into line.

One test written for this plan was removed: it claimed to prove that the always-present check
cannot stand in for `checks.length > 0`, and a planted defect showed it proved nothing, because
`dg.structure` is always present too. The ordering is kept and the comment beside it says so.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] The repository's full gate passes, and every new check was shown failing first.
- [x] docs/product.md, the README, and any ADR are updated where this change moved them.
