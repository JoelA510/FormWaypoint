# Package and overpack fields start unanswered where a default speaks for the shipper

Kind: BUGFIX · Drawn up: 2026-10-19 · Owner: Joel Abraham · Status: PROPOSED

## Why

Follows `docs/changes/2026-10-19-dg-entries-start-unanswered.md`, which made the battery
questions start unanswered and listed the remaining defaults as out of scope. Three of those
remaining defaults put words or figures on the Shipper's Declaration, or pass a check, on the
shipper's behalf: the packaging description, the package and overpack counts, and the
"prohibited dangerous goods in the same box" answer. The shipper signs the declaration under
penalty (docs/product.md, Users; ADR 0003). A value they never chose shouldn't reach it, and a
check shouldn't report "declared" for an answer nobody gave (AGENTS.md project rules 1 and 2).

## Behavior

- **Now** (executed 2026-10-19: `assess()` and `buildDeclaration()` on a panel-made package
  holding one fully answered battery type, nothing else touched):
  - `emptyPackage` gives `packagingType: 'Fibreboard box'`, `count: 1` and
    `coPackedWithProhibitedClass: false` (`src/domain/dangerous-goods/types.ts`, `emptyPackage`).
  - The declaration's packing line reads **"1 Fibreboard box x 2.124 kg"**. Both the packaging
    and the count came from defaults.
  - `dg.co-pack` **passes**, with "Nothing prohibited declared in the same outer packaging".
  - `dg.package-count` **passes**.
  - `emptyOverpack` gives `count: 1` and `coPackedWithProhibitedClass: false`, with the same
    effect on the overpack checks (statically reviewed).
  - The package count also feeds the consignment-level battery mark exemption, which applies
    only to two packages or fewer. A count left at 1 for a consignment of three boxes makes that
    exemption easier to grant (statically reviewed, `batteryMarkExemption` in `assess.ts`).
- **After:**
  - **Packaging** starts blank. A new blocking check, `dg.packaging-type.<package>`, fails on a
    blank description. Today a blank one is filed as the word "package" (`dgd.ts:273`,
    `checklist.ts:143`).
  - **Package count** and **overpack count** start unstated and show as blank inputs. The
    existing `dg.package-count` and `dg.overpack-count` checks already refuse a count that isn't
    a whole number of at least one, so they block until one is typed.
  - **"Also holds prohibited dangerous goods"**, on packages and overpacks, becomes a three-way
    choice: Not answered / No / Yes. `dg.co-pack` and the overpack co-packing check block on
    "Not answered", with a detail that says it hasn't been answered.
- **Unchanged:**
  - A consignment with every one of these answered assesses, declares and checklists exactly as
    today. Proved by the existing `assess`, `dgd` and `checklist` suites passing, once
    `test-support.ts` states these values explicitly the way it now states `condition`.
  - "Yes" to prohibited co-packing still blocks with today's wording; "No" still passes with
    today's wording, minus the claim that it was declared when it wasn't.
  - Records saved before the change still list in the history panel.
  - The CIPL fill sets none of these. It never did, and its tests already assert the package is
    untouched.

## Out of scope

The other defaults traced for this plan start on the restrictive side, so leaving them costs
the shipper a click but can't put an unchosen value on the declaration (all statically
reviewed):

- `buttonCellsInEquipment: false`. "True" is the answer that relieves: it excepts the test
  summary (`testSummaryCheck`) and can exempt the battery mark (`batteryMarkExemption`). False
  asks for both.
- `wattHourMarkedOnCase: false`. Blocks until confirmed.
- `innerMarksVisible: false` (overpack). Requires the marks to be reproduced outside.
- `prepareToSectionI: false`. Section II is a relief with its own conditions, which the
  assessment checks (the 5 kg ceiling and the rest). Section I is the person's decision, and the
  field is documented as left false until they make it.
- `aircraft: 'cargo-aircraft-only'`. The restrictive choice; the assessment refuses the reverse.
- `stateVariationsChecked`, `operatorVariationsChecked`, `vehicleDetermination`,
  `testSummaryScope` and `stateOfChargeBasis` already start unanswered and block.

## Against the rules

- **Project rules 1 and 2** — brings the code into line: no unchosen figure or description on
  the declaration, and no compliance answer given by default.
- **Project rule 4** — FOLLOWS: one new blocking check (`dg.packaging-type`), shown failing
  first; the co-packing checks gain a blocking "not answered" state rather than passing.
- **AGENTS.md rule 14** — APPLIES: the shape of a persisted record (`coPackedWithProhibitedClass`
  widens to `boolean | null` on `DgPackage` and `Overpack`, both stored in
  `DgConsignmentRecord.consignment`), and a dangerous goods figure (the package count's
  default). This plan is the agreement.
- **Counts keep their type.** `count` stays a `number`, with 0 as "not stated". That is the
  existing convention: the panel already stores 0 for a cleared box so `dg.overpack-count` can
  refuse it (`packageCountInConsignment`, `assess.ts:260-268`). Keeping it means no type change
  across the many readers of `count`.
- **ADR needed?** No. Same reasoning as the battery-entry plan: the types only widen, and the
  behavior is what the rules already require.

## Design

**Types and defaults** (`types.ts`):

- `emptyPackage`: `packagingType: ''`, `count: 0`, `coPackedWithProhibitedClass: null`.
- `emptyOverpack`: `count: 0`, `coPackedWithProhibitedClass: null`.
- `DgPackage.coPackedWithProhibitedClass` and `Overpack.coPackedWithProhibitedClass` become
  `boolean | null`.
- `test-support.ts`'s `pkg()` and `overpack()` set `packagingType: 'Fibreboard box'`, `count: 1`
  and `coPackedWithProhibitedClass: false` explicitly, as its contract ("everything the shipper
  is responsible for is already answered") requires.

**Checks** (`assess.ts`):

- New `dg.packaging-type.<package>`, blocking, in `packageChecks`. Title: "<label>: packaging
  described". Fails when `packagingType.trim()` is empty, with the detail "The declaration names
  the packaging (for example 'Fibreboard box'); it is not assumed."
- `dg.co-pack.<package>` gets three cases:
  - `null` fails: "Not answered: whether this box also holds dangerous goods that may not travel
    with lithium batteries", followed by the list;
  - `true` fails with today's wording;
  - `false` passes, with "Nothing prohibited in the same outer packaging" followed by the list.
    It no longer says "declared".
- The overpack co-packing check (`conflicted`, `assess.ts:1661`) blocks on `null` the same way.
- `dg.package-count` and `dg.overpack-count` need no logic change. Their detail for a count of 0
  should read "How many identical packages is not stated" instead of the half-a-box wording,
  which is about non-integers.

**Labels.** `packageLabel` (`assess.ts:280`) falls back to "package" for a blank description.
That is right for check titles and stays. The declaration and checklist fallbacks to "package"
stay too: they are only reachable while `dg.packaging-type` blocks generation.

**UI** (`src/features/dangerous-goods.tsx`):

- **Packaging:** the input keeps its "Fibreboard box" placeholder, which now reads as an
  example rather than a value.
- **Counts:** the package count and overpack count inputs show blank for 0 (`value={count || ''}`).
- **Co-packing:** the two "Also holds prohibited dangerous goods" toggles become `Select`s with
  Not answered / No / Yes, under the same labels and hints.
- **Badge:** the "1 package · 0 kg" badge reads "packages not counted" while any count is 0.
- Native controls with visible labels; nothing new for keyboard or screen readers.

**Persistence.** No IndexedDB change. Records are written only through the downloads, which a
failing blocking check disables, so no record holds a `null` or a 0 count here. Older records
hold booleans and whole counts, which still fit.

## Risks and rollback

- **Risk:** while a count is 0, the requirements panel computes the consignment-level mark
  exemption over zero packages and may list fewer marks. It does that today for a cleared count.
  — **watch:** the panel's existing "Incomplete" banner. — **if it happens:** extend
  `DgAssessment.complete` to include unstated counts, so the banner and badge cover it. That is
  task 4.
- **Risk:** a test that builds packages through `emptyPackage` directly starts failing. —
  **watch:** the first run. — **if it happens:** state the values in the test; never restore
  the default.
- **Rollback:** revert. No stored data needs migrating either way.

## Tasks

- [ ] 1. Defaults and widened types, with `test-support` stating the answered values — proved
      by `types.test.ts`: `emptyPackage` and `emptyOverpack` start with a blank packaging, count
      0 and co-packing `null`. Also by every existing DG suite passing unchanged.
- [ ] 2. `dg.packaging-type` — proved by `assess.test.ts`:
      - a blank packaging fails it and blocks generation;
      - a described one passes;
      - the executed reproduction above no longer declares "Fibreboard box" unless one was
        typed.

      Shown failing first against today's `emptyPackage`.
- [ ] 3. Three-way co-packing on packages and overpacks — proved by `assess.test.ts`: `null`
      blocks with "Not answered", `true` blocks as today, `false` passes without "declared".
- [ ] 4. `complete` covers unstated counts and unanswered co-packing — proved by
      `assess.test.ts`: a consignment with every battery answered but a package count of 0 has
      `complete: false`.
- [ ] 5. UI: blank count inputs, the three-way selects, the badge — proved by
      `dangerous-goods.test.tsx`:
      - a fresh panel shows blank packaging and count, and co-packing "Not answered";
      - choosing "No" and typing a count of 1 and a packaging description clears those checks.
- [ ] 6. README DG section and `roadmap.md` — proved by: review.

## Done when

- [ ] Every task's test passes, and the "Unchanged" list has a test each.
- [ ] `npm run check` passes, and every new check was shown failing first.
- [ ] The README and `roadmap.md` are updated. docs/product.md needs no change.

## Open questions

1. **Blocking: should a blank packaging description block every package, or only where a
   declaration is required?** Recommended: every package. The bench checklist prints it for
   Section II packages too, and the forwarder reads it. The alternative blocks only for
   Sections IA, IB and I and lets a Section II checklist read "package".
