# Battery entries start unanswered instead of pre-classified

Kind: BUGFIX · Drawn up: 2026-10-19 · Owner: Joel Abraham · Status: DONE

## Why

A shipper preparing a lithium battery declaration (docs/product.md, Users) is shown a
classification for a battery they have not described. Every new entry starts as lithium ion,
battery, standalone, assembled battery pack, in sound condition, so the tab names a UN number,
packing instruction and section before anyone has said what is in the box. On a lithium metal
shipment that is the wrong UN number, and the only thing standing between it and the declaration
is whether some unrelated field happens to block. This breaks AGENTS.md project rule 2, and it
contradicts the panel's own claim that "an unanswered one blocks rather than defaults"
(`src/features/dangerous-goods.tsx:11-12`). The CIPL fill (ADR 0004) made it more likely: a
fuller form makes a pre-filled dropdown easier to leave unread.

## Behavior

- **Now** (executed, `assess()` on `newConsignment()`, 2026-10-19). A fresh entry has
  `spec: { chemistry: 'lithium-ion', form: 'battery', configuration: 'standalone' }`,
  `articleLevel: 'battery-pack'` and `condition: 'sound'` (`src/domain/dangerous-goods/types.ts:365-392`),
  and classifies at once as **UN3480 PI 965**. When a watt-hour figure is typed (the field's hint
  shows how to work one out from volts and ampere-hours, which a lithium metal label carries), it
  classifies as **UN3480 PI 965 Section IB**. No check names the chemistry, form, configuration,
  article level or condition, because none can be unanswered. The blocks that remain (test
  summary, Wh mark, state of charge, carrier, variations, declaration fields) are all satisfiable
  without ever opening the chemistry dropdown. Observed the same way in the browser on the
  reported shipment, through the CIPL fill.
- **After:**
  - A new entry's chemistry, cell-or-battery, configuration, article level and condition start
    **not answered**. Each dropdown shows "Not answered" until a choice is made.
  - An entry with any of them unanswered is **not classified**. A blocking check per entry
    (`dg.unanswered.<package>/<entry>`) names exactly which questions are open, so nothing is
    generated.
  - While any entry is unanswered, the consignment badges read **classification incomplete**
    instead of "Section II - no declaration" / "passenger permitted". Today an empty consignment
    shows those badges, which reads as a permissive verdict on goods nobody has described. The
    requirements panel says the same above anything it lists.
  - Until the chemistry is chosen, the energy input says to choose it first, instead of offering
    the watt-hour field by default.
- **Unchanged:**
  - Classification of a fully answered entry, and every figure, check, mark, statement, declaration
    and checklist built from one. Proved by the existing `assess`, `lithium`, `dgd` and `checklist`
    suites passing untouched (their fixtures in `test-support.ts` are fully answered).
  - Retention records saved before this change still list in the history panel. Proved by a
    rendering test with a record in the old shape.
  - The CIPL fill still sets none of these fields (existing `cipl-seed.test.ts` assertion), and
    its entries now start unanswered like any other.
  - No download is possible while a blocking check fails (`DeclarationPanel`, existing test).

## Out of scope

Sibling defaults found while tracing this one (statically reviewed). Each pre-answers something
for the shipper, with consequences of different weight, and each deserves its own decision:

- `packagingType: 'Fibreboard box'` (`emptyPackage`). It is printed on the declaration as the
  packaging description.
- `coPackedWithProhibitedClass: false`, on packages and overpacks. "No prohibited dangerous goods
  in this box" is asserted by default.
- `buttonCellsInEquipment: false`. It decides the four-cell count for the equipment battery mark.
- `wattHourMarkedOnCase: false`. Conservative: it blocks rather than permits.
- `aircraft: 'cargo-aircraft-only'`. A choice, not a fact; it is the restrictive one, and the
  assessment refuses the reverse.

Recommended follow-up: one pass over these toggles, deciding for each whether "false" is a safe
starting point or needs an unanswered state. Tracked here until it has its own plan.

## Against the rules

- **Project rule 2, never infer a compliance value** — this change brings the code into line with
  it.
- **Project rule 4, a check that cannot run fails loudly** — FOLLOWS: an unclassifiable entry adds
  a blocking check; it is not dropped from the assessment silently.
- **AGENTS.md rule 14** — APPLIES on two counts: a dangerous goods classification rule's inputs,
  and the shape of a persisted record (`BatteryEntry`, stored whole in
  `DgConsignmentRecord.consignment`). This plan is the agreement; nothing is built before it.
- **ADR 0003 (DG marked unverified)** — FOLLOWS: unaffected.
- **ADR 0004 (DG reads the CIPL)** — FOLLOWS: its consequence "making those start unanswered is a
  separate change" is this change.
- **ADR needed?** No. The persisted change only widens types (old records stay valid, no
  migration), and the behavior is what rule 2 already requires. Nothing here is a new decision
  that needs its reasoning recorded.

## Design

**Types** (`src/domain/dangerous-goods/types.ts`, `lithium.ts`):

```ts
// lithium.ts: BatterySpec is unchanged; it stays the complete input classifyForAir takes.
// types.ts: what a person has told us so far.
interface BatterySpecAnswers {
  chemistry: Chemistry | null
  form: CellOrBattery | null
  configuration: Configuration | null
  wattHours: number | null
  lithiumContentG: number | null
}
interface BatteryEntry { spec: BatterySpecAnswers; articleLevel: ArticleLevel | null; condition: BatteryCondition | null; /* rest unchanged */ }

// An entry whose classification inputs are all answered, and the guard that proves it.
type AnsweredEntry = BatteryEntry & { spec: BatterySpec; articleLevel: ArticleLevel; condition: BatteryCondition }
function unansweredQuestions(entry: BatteryEntry): string[]   // [] when answered
function isAnswered(entry: BatteryEntry): entry is AnsweredEntry
```

`emptyEntry` sets the five to `null`. The CIPL seed's "untouched entry" comparison is against
`emptyEntry`, so it follows without change.

**Assessment** (`assess.ts`). `EntryAssessment.entry` becomes `AnsweredEntry`, so every reader
inside the assessment, the declaration and the checklist keeps the complete type it has today. The
compiler then finds every site that reads raw `pkg.entries` and has to decide what to do with an
unanswered one; that is the point of narrowing the type rather than null-checking at each read.
For each package:

- answered entries are classified exactly as now;
- unanswered entries go to a new `PackageAssessment.unanswered: BatteryEntry[]` and each adds a
  blocking check, `dg.unanswered.<package>/<entry>`, titled "Battery type N in package M is not
  described". Its detail lists the open questions in the screen's words ("chemistry, cell or
  battery");
- the package's net weight still sums all of its entries, so totals don't shrink while a
  question is open.

`DgAssessment` gains `complete: boolean`, false while any entry is unanswered.

**UI** (`src/features/dangerous-goods.tsx`):

- The chemistry, cell-or-battery, configuration, article level and condition `Select`s each get a
  first `<option value="">Not answered</option>`; `''` maps to `null`.
- With no chemistry, the energy field is replaced by a line saying to choose the chemistry first.
- The consignment badges show a single "classification incomplete" badge (warn tone) when
  `!assessment.complete`.
- The requirements panel shows the same line above its list.
- The per-entry classification line shows "Not classified: answer chemistry, ..." for an
  unanswered entry.
- Native selects with visible labels, and the check is announced through the existing checks
  panel. Nothing new for keyboard or screen-reader behavior.

**Persistence.** No IndexedDB schema or version change. Records are written only through the two
downloads, both disabled while a blocking check fails (`DeclarationPanel`, `blocked`), so no
record ever holds a `null` here. Records saved before the change hold full answers, which still
fit the widened type. Records are never loaded back into the editor (they are only fingerprinted,
`dangerous-goods.tsx:208`).

## Risks and rollback

- **Risk:** a site that reads raw entries treats an unanswered one as answered, or crashes on
  `null`. — **watch:** `tsc` with the narrowed `EntryAssessment.entry`, plus a test that runs
  `assess`, `buildDeclaration` and `buildChecklist` over a consignment with one answered and one
  unanswered entry. — **if it happens:** fix it at that site; the guard is the only test of
  answered-ness.
- **Risk:** existing tests that build entries through `emptyEntry` rather than `test-support`
  start failing for the right reason. — **watch:** the first test run. — **if it happens:**
  answer the fields in that test, never in `emptyEntry`.
- **Risk:** more clicks per entry, and someone picks the first option to get past the block. —
  **watch:** nothing in code can; the block at least makes it a choice. — **if it happens:** that
  is a person's answer, as rule 2 intends.
- **Rollback:** revert. No stored data needs migrating either way.

## Tasks

- [x] 1. Types, `emptyEntry`, `unansweredQuestions` and `isAnswered` — proved by
      `types.test.ts` (new): a fresh entry lists all five questions; each answered in turn drops
      off the list; a fully answered entry passes `isAnswered`; `wattHours` and `lithiumContentG`
      are not on the list (the energy check already covers them).
- [x] 2. `assess` partitions entries and adds `dg.unanswered` and `complete` — proved by
      `assess.test.ts`:
      - `assess(newConsignment())` has no classifications, `complete: false`,
        `canGenerate: false`, and a failing `dg.unanswered.*` check naming all five questions;
      - the reproduction above (lithium-ion defaults plus a typed Wh figure) no longer yields
        UN3480;
      - a package with one answered and one unanswered entry classifies the answered one exactly
        as alone and keeps both net weights in its total.

      Shown failing first against today's `emptyEntry`.
- [x] 3. Declaration and checklist over a mixed consignment — proved by `dgd.test.ts` and
      `checklist.test.ts`: both build without throwing from a consignment with an unanswered
      entry, and neither mentions it as classified.
- [x] 4. UI: "Not answered" options, the chemistry-first energy field, the incomplete badge and
      the per-entry line — proved by `dangerous-goods.test.tsx`:
      - a fresh panel shows "classification incomplete" and no UN number;
      - choosing the chemistry reveals the matching energy field;
      - answering all five shows the classification line;
      - the CIPL-filled entry shows "Not classified".
- [x] 5. Old records still render — proved by `dangerous-goods.test.tsx`: the history panel
      lists a record whose consignment holds a fully answered entry in the old shape.
- [x] 6. Docs: the README DG section and `roadmap.md`, saying entries start unanswered — proved
      by: review; no behavior.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] `npm run check` passes, and every new check was shown failing first.
- [x] The README and `roadmap.md` are updated. docs/product.md needs no change.

## Decisions taken

Agreed with the owner on 2026-10-19: condition is included. The sibling defaults under "Out of
scope" get their own plan next.

## What the build taught

- `test-support.ts`'s `entry()` builder had been inheriting `condition: 'sound'` from
  `emptyEntry`. It now states it, which is the builder's stated job ("everything the shipper is
  responsible for is already answered"). No existing test changed otherwise.
- The panel's own help text names UN3480 and UN3090, so a UI test asserting "no UN number on
  screen" passes or fails on prose. The tests match the classification line's shape
  ("Class 9 · PI") instead.
