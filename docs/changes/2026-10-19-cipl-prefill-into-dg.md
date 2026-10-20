# Prefill the dangerous goods consignment from the CIPL already loaded

Kind: FEATURE · Drawn up: 2026-10-19 · Owner: Joel Abraham · Status: DONE

## Why

A shipper with a lithium battery shipment loads the CIPL in Standard Shipping for the SLI, then
switches to Dangerous Goods - Air and retypes the consignee, the reference and the contents from
the same document. Every retyped value is a chance to transcribe it wrong, which is the failure
this tool exists to remove (docs/product.md, Mission). The CIPL is already parsed and reconciled
in memory; the DG tab is not given it (`src/App.tsx:759-767`, statically reviewed).

## Behavior

- **Now:** the DG tab starts blank apart from defaults. The shipper block can be copied from the
  exporter profile with one button (`src/features/dangerous-goods.tsx:128`). Nothing comes from
  the CIPL, whether or not one is loaded (statically reviewed).
- **After:** when a CIPL is loaded in Standard Shipping, the DG tab shows a "From the CIPL" card
  naming the file and invoice number, with one button, **Fill from the CIPL**, that:
  - sets the **consignee** name and address, taken from the SLI draft's ultimate consignee (the
    same derivation, including the destination country the person confirmed or overrode there);
  - sets the **shipper's reference** to the invoice number;
  - when the CIPL states **one carton** and the consignment still holds a single, untouched
    package, replaces that package's one empty entry with **one entry per distinct part** on the
    CIPL, its description set to the part number and the CIPL's description (the description is
    never filed: `src/features/dangerous-goods.tsx:1201`);
  - fills only fields that are blank, and lists any field it left alone because it already held
    something.

  Beside each seeded entry's **count per package** and **net weight per package** inputs, a
  **Use CIPL figure (12 PCS)** / **(2.124 kg)** button copies that figure into the field on the
  person's click, one field at a time. The button appears only when the CIPL proves the figure
  (see Design); otherwise the line says why no figure is offered. The card also shows the CIPL's
  "shipped from" and "discharge port" text as a hint beside the airport fields, without filling
  them.
- **Unchanged:**
  - The Standard Shipping flow, its checks and every form it fills.
  - The DG tab with no CIPL loaded renders exactly as now: no card, no buttons.
  - Filling never sets chemistry, cell or battery, configuration, watt-hours, lithium content,
    article level, condition, state of charge, UN 38.3 summary, UN specification mark, package
    gross weight, equipment net weight, airports, aircraft, air waybill, emergency contact or
    signatory.
  - Filling never overwrites a non-blank field.
  - The persisted retention record (`DgConsignmentRecord` in `src/store/local-store.ts`) and the
    `DgConsignment` / `BatteryEntry` shapes do not change.
  - `assess()` and `checkDraft()` are untouched: a filled consignment passes or blocks exactly as
    the same values typed by hand would.

## Out of scope

- Classifying anything from the CIPL. Commodity-group text such as "Primary Batteries, Lithium"
  and an HTS heading such as 8506.50 are shown in the entry description as the document's words
  and never set the chemistry (AGENTS.md project rule 2).
- Multi-carton CIPLs: the parsers do not keep which carton a line is in (`SourceLine` has no
  carton field), so the per-package split is unknown and no package or figure is seeded. Parsing
  carton numbers is a separate change.
- Package gross weight: the DG model wants the package on a scale, kept apart from the CIPL's
  figure on purpose (`src/domain/dangerous-goods/types.ts`, "Three weights, none derived from
  another").
- Filling the airports. The CIPL names the shipping city and the discharge port, not the airports
  on the air waybill (open question 2).
- Seeding from a saved shipment record rather than the CIPL in memory.

## Against the rules

- **Recorded design: "Deliberately its own screen, sharing nothing with the CIPL"**
  (`src/features/dangerous-goods.tsx:1-12`, `src/App.tsx:61-69`) — DEPARTS: the DG tab reads the
  CIPL. The reason for that design (no hazard questions in the standard flow) is kept: data flows
  one way, standard to DG, and the standard flow gains nothing. Recorded in
  `docs/adr/0004-dangerous-goods-reads-the-cipl.md`, accepted 2026-10-19.
- **AGENTS.md rule 14, stop and agree a plan first** — APPLIES on two counts: how a dangerous
  goods figure (count, net weight) is chosen, and how a figure is rounded (the summed net weight).
  This plan is that agreement; nothing is built before it.
- **Project rule 1, never file a wrong figure** — FOLLOWS: a figure is offered only where the
  reconciliation proved it against the CIPL's printed totals, and only on a person's click per
  field; otherwise the field stays blank and the reason is shown.
- **Project rule 2, never infer a compliance value** — FOLLOWS: no classification input is set.
  See the risk on existing defaults below.
- **Project rule 3, nothing leaves the machine** — FOLLOWS: in-memory data passed between two
  components; no network, no storage.
- **Project rule 4, checks fail loudly** — FOLLOWS: no check is added, removed or bypassed.
- **Project rule 5, no real shipment data** — FOLLOWS: tests use `src/test/synthetic/cipl.ts`.
- **ADR 0001 (net weight in shipping weight boxes), 0002 (figure precision)** — FOLLOWS 0002: the
  summed net weight is rounded once, to the 3 decimals the CIPL prints, through `units.ts`.
- **ADR 0003 (DG output marked unverified)** — FOLLOWS: unaffected; the notice and acknowledgement
  stay.

## Design

**Data.** A new pure module, `src/domain/dangerous-goods/cipl-seed.ts`:

```ts
interface CiplSeed {
  source: { fileName: string; invoiceNumber: string }
  consignee: DgParty                       // from draft.ultimateConsignee
  shippersReference: string                // header.invoiceNumber
  routeHint: { shippedFrom: string | null; dischargePort: string | null }
  singleCarton: boolean                    // header.cartons === 1
  parts: SeedPart[]                        // distinctParts(mergedLines), document order
}
interface SeedPart {
  partNumber: string
  description: string                      // part number, description, commodity group as printed
  count: { value: number } | { value: null; why: string }
  netWeightKg: { value: number } | { value: null; why: string }
}
// consignee: the SLI draft's ultimate consignee, passed in by App.tsx so this module stays
// free of carrier types
function ciplSeed(parsed: ParsedCipl, reconciliation: Reconciliation, consignee: DgParty): CiplSeed
function applyCiplSeed(c: DgConsignment, seed: CiplSeed, newId: (p: string) => string):
  { consignment: DgConsignment; notes: string[]; links: Record<string, string> }
```

A part's **count** is offered only when the CIPL states one carton, the `total-quantity` check
passed, and every line of the part has a quantity in a count unit (PCS, EA, and the like, decided
by `canonicalUnit`, not a new list). Its **net weight** is offered only under the same carton
rule, when `parsed.providesWeights` is true (so weights supplied from the item library are never
offered as the document's), the `total-weight` check passed, and every line of the part has a
packing-list net weight. Lines of one part are summed by `partKey`, and the sum is rounded once to
3 decimals with `units.ts`'s existing rounding. Each refusal carries its reason ("the CIPL states
2 cartons and does not say which carton holds which line").

`links` maps each seeded entry id to its part key. It lives in `App.tsx` state beside
`dgConsignment`, is never persisted, and an entry whose id is not in it simply shows no figure
buttons. This is what keeps the persisted shapes unchanged.

**Wiring.** `App.tsx` computes `ciplSeed` with `useMemo` when `parsed`, `reconciliation` and
`draft` exist, and passes `cipl={seed}` and the links to `DangerousGoodsPanel`. No CIPL, no prop,
no card.

**UI.**
- The card sits above the consignment card and uses the existing `Card`, `Button` and `Badge`.
  Its states: no CIPL (not rendered); CIPL loaded (file name, invoice number, Fill button); after
  filling (a `role="status"` line saying what was set and what was kept).
- The figure buttons are `Button size="sm"` beside the input, their accessible name carrying the
  figure and unit ("Use CIPL figure (12 PCS)"); a refused figure is a visible line of text saying
  why. (Drawn up with `aria-describedby` to a source line; the label made it redundant, and it was
  not built.) The figures are refused unless the entry is a standalone battery type that is not
  equipment: with equipment, packed or contained, the CIPL's line may be the devices.
- Neither button is pressed for the person: each offered figure needs its own click.

**Failure.** `ciplSeed` throws on nothing it receives from a successful parse. A header without an
invoice number leaves the reference unset rather than setting an empty string over a typed one.

**Accessibility.** Native buttons, visible labels naming the figure, the status line announced
politely; covered by `jsx-a11y`.

## Risks and rollback

- **Risk:** a fuller-looking form makes the existing classification **defaults** easier to miss.
  `emptyEntry` starts every entry as lithium ion, battery, standalone, assembled battery pack
  (`src/domain/dangerous-goods/types.ts:365-392`, statically reviewed). On a lithium metal
  shipment a person who never opens the chemistry field is classified under the wrong UN number,
  and is stopped only if the missing watt-hour figure blocks. That is a departure from project
  rule 2 that already exists, and seeding raises its cost. — **watch:** the seeded-entry test
  asserts the spec is untouched, which keeps this change from making it worse but does not fix
  it. — **if it happens:** fix it as its own change first (chemistry, form, configuration and
  article level start unanswered and block until answered). That is rule-14 work on a
  classification input and the `BatteryEntry` shape. **Recommended before task 5 ships.**
- **Risk:** the CIPL loaded in Standard Shipping is for a different shipment from the one being
  declared. — **watch:** the card names the file and invoice number above the button. — **if it
  happens:** the values are ordinary, editable fields; "Start a new consignment" clears them.
- **Risk:** "PCS" on a CIPL counts kits or devices, not batteries. — **watch:** the count is
  offered, never set, and its button reads the document's own unit. — **if it happens:** the
  person types the battery count; the button never comes back unbidden.
- **Rollback:** revert the PR. No persisted shape or record changes, so there is nothing to
  migrate back.

## Tasks

- [x] 1. ADR 0004 accepted by the owner (2026-10-19); `docs/product.md` accepted as drafted
      (2026-10-20).
- [x] 2. `ciplSeed` in `src/domain/dangerous-goods/cipl-seed.ts` — proved by `cipl-seed.test.ts`
      on synthetic CIPLs: a one-carton PCS shipment with one part over four lines offers count
      12 and net weight exactly 2.124 (the summed lines equal the header total); two cartons
      offer neither, with the reason; a failed `total-weight` offers no weight; an unweighted
      layout (`providesWeights: false`) offers no weight; a non-count unit offers no count;
      consignee equals `draft.ultimateConsignee`. Shown failing first with the rounding removed.
- [x] 3. `applyCiplSeed` — proved by `cipl-seed.test.ts`: fills blank consignee and reference;
      keeps a typed consignee and lists it in `kept`; replaces only an untouched single package's
      single empty entry; leaves a touched package alone; never changes any field on the
      Unchanged list (deep-equality on those fields before and after); returns a link per seeded
      entry.
- [x] 4. Wire the seed through `App.tsx` and add the card — proved by
      `src/features/dangerous-goods.test.tsx`: no card without a seed; with one, the file name
      and invoice number are shown and Fill sets consignee and reference; the status line names
      what was kept.
- [x] 5. Figure buttons on count and net weight — proved by `dangerous-goods.test.tsx`: an offered
      figure fills its field only on click; a refused figure shows its reason and no button; the
      net weight button disappears when the article level is set to equipment.
- [x] 6. Update the two header comments to cite ADR 0004, and the README and `roadmap.md` DG
      sections — proved by: review; no behavior.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each (the standard-flow
      suites passing unchanged cover the first).
- [x] `npm run check` passes, and every new check was shown failing first.
- [x] The README, `roadmap.md` and ADR 0004 are updated. docs/product.md needed no change
      from this work.

## Decisions taken

Agreed with the owner on 2026-10-19:

1. Dangerous goods figures: option C, a one-click offer per field where the reconciliation
   proves the figure.
2. Airports: the CIPL's route as a hint beside each field, never a value.
3. Shipper's reference: the invoice number.
4. Added 2026-10-20, on the owner's instruction to follow the recommendation: the package count
   is offered the same way as the entry figures, a click, never filled. The offer is "1 carton"
   when the CIPL states one carton. It appears only on the package the CIPL's entries were added
   to, only while that package is the consignment's only description, and only outside an
   overpack, where the count would mean packages per overpack. Proved by `cipl-seed.test.ts`
   and `dangerous-goods.test.tsx`.

## Review fixes (2026-10-20)

An independent review of the branch before the pull request found, and this change fixed:

- The count offer trusted `total-quantity` on layouts whose quantity total is the sum of their
  own lines (the in-house form, `vendor-b`), so a misread line would be offered as proved.
  `printsQuantityTotal` in `reconcile` is now the one place that decides this, and the seed
  refuses the count where it is false.
- The entry figures (the whole carton) were offered whatever the package count, so typing two
  packages and clicking them doubled the consignment. They now wait until the package count is
  one.
- Links between seeded entries and parts were keyed by part number alone, so loading another
  CIPL with the same part offered its figures. They now carry the CIPL's file and invoice
  number (`ciplLink`).
- The "no declaration" and passenger verdicts were still stated by the Generate card and the
  `dg.declaration-fields` and `dg.aircraft` checks while the consignment was incomplete. They
  now wait for `complete`, which also holds counts to whole numbers, as the count checks do.

Codex's review of the pull request then found two more, also fixed:

- Entries were seeded from the lines that were read even when a reconciliation check showing
  every line was accounted for had failed (`packing-summary`, `line-coverage` and the like), so
  a missed battery type would be left off in silence. `COMPLETENESS_CHECKS` in the seed names
  those checks. If one fails, no entries are added and nothing is offered. Checks that cannot
  change which parts are in the box (Schedule B, export control, values, row capacity) do not
  hold the fill up; gating on every blocking check failed 16 existing fill tests, because a
  missing Schedule B dataset alone is blocking.
- The entry figures were offered while the article level was still unanswered, before anyone
  had said the goods were batteries and not devices. Unanswered now refuses them, as equipment
  does. Changing an entry to equipment after copying them takes back any figure still equal to
  the CIPL's, since for equipment it is the devices'; a figure the person typed is kept.

The owner's single review pass before merging found four more, also fixed:

- The figures were offered for a battery type contained in or packed with equipment at article
  level "battery pack", which is how the existing tests model those entries; there the CIPL's
  line may be the laptops, not their batteries. `ciplFiguresApply` now requires a standalone,
  non-equipment entry, and a configuration change away from standalone takes copied figures
  back, as equipment does.
- A packing-list line no invoice line claimed (`packing-orphans`, a warning for the SLI) did not
  stop the fill, leaving something in the box with no entry. It now counts as incomplete.
- A carton figure stayed in place after the package count changed from one, or the package went
  into an overpack or got a sibling description, doubling the consignment. Those changes now take
  the figures back (`withoutCiplFigures`).
- The panel test for an incomplete CIPL never clicked Fill and could not fail; it now does and
  asserts the refusal note.

## What the build taught

- `ciplSeed` reads weights from the packing-list lines, not the merged lines. Today that is
  defensive: reconciliation fills merged-line weights from the item library only for layouts
  that print none, which the seed refuses anyway. Covered by a test.
- An entered figure in Standard Shipping makes the totals prove the entered figure, not the
  document's, so no figure is offered once one exists. Covered by a test.
- Run against the reported real CIPL in the browser, the seeded entry showed the default
  chemistry's classification (lithium ion, UN3480) for a lithium metal part before anyone had
  answered the chemistry. Fixed in `docs/changes/2026-10-19-dg-entries-start-unanswered.md`.
