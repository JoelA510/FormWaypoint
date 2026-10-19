# 0004. The dangerous goods workflow may read the CIPL loaded in Standard Shipping, one way, on request

- **Status:** Proposed
- **Date:** 2026-10-19
- **Deciders:** the owner (Joel Abraham), on agreement of
  `docs/changes/2026-10-19-cipl-prefill-into-dg.md`
- **Applies to:** `src/App.tsx`, `src/features/dangerous-goods.tsx`, a new
  `src/domain/dangerous-goods/cipl-seed.ts`

## Context

The dangerous goods workflow was built as a separate screen that shares nothing with the CIPL to
SLI flow (`src/features/dangerous-goods.tsx:1-12`, `src/App.tsx:61-69`). The stated reason is that
lithium battery questions shown on every ordinary shipment become noise, and noise is how a hazard
question gets answered without being read.

In use, a lithium battery shipment needs both documents: the SLI from the CIPL, and the Shipper's
Declaration from the DG tab. The consignee, the reference and the contents are on the CIPL and
are retyped into the DG tab by hand. A shipper first using the DG tab with a real lithium metal
battery shipment (2026-10-19) expected the CIPL to fill it, found it did not, and could not tell
whether the CIPL belonged in that tab instead.

What a CIPL can and cannot supply to a declaration: it states parties, references, part numbers,
descriptions, quantities in the document's unit, and net and gross weights of the goods. It does
not state chemistry, watt-hours, lithium content, cell or battery, configuration, UN 38.3 status
or state of charge. Its net weight is the goods' weight, which equals the batteries' weight only
when the goods are the batteries themselves.

## Decision

We will let the DG tab read the CIPL already parsed and reconciled in Standard Shipping, in one
direction only and only when the person asks. A **Fill from the CIPL** button sets the consignee,
the shipper's reference and, for a one-carton CIPL, one entry per part, and fills blank fields
only. A dangerous goods figure (count per package, net weight per package) is never filled by that
button. It is offered field by field, on a click, and only where the reconciliation proved it
against the CIPL's printed totals. No classification input is ever set from the CIPL. The
Standard Shipping flow neither shows nor learns anything about dangerous goods.

## Alternatives considered

### Alternative: keep the screens fully separate

It keeps the original design intact and costs nothing to build. It lost because it keeps the
retyping, and retyping is the failure this tool exists to remove. It also leaves the screens'
relationship confusing: a shipper could not tell where the CIPL belonged. Keeping data out of the
standard flow, which was the actual reason for the separation, is preserved without it.

### Alternative: fill everything the CIPL states automatically when the DG tab opens

Fewest clicks. It lost because it would fill the dangerous goods figures without a person looking
at them. It would overwrite or pre-empt values already typed, and a CIPL loaded for another
shipment would fill this one silently. Project rules 1 and 2 forbid a figure nobody chose.

## Consequences

- Retyping drops to the regulatory fields, which a CIPL cannot answer anyway.
- The DG tab now depends on the CIPL contracts (`ParsedCipl`, `Reconciliation`, `SliDraft`). A
  change to those reaches `cipl-seed.ts`, and its tests are where that shows.
- A fuller-looking form makes the classification defaults in `emptyEntry` (lithium ion, battery,
  standalone, assembled battery pack) easier to leave unread. Making those start unanswered is a
  separate change that should land first.
- Revisit if carton numbers are parsed (multi-carton seeding becomes possible), or if a second
  source of DG data (a battery library) is added: it, not the CIPL, should supply the regulatory
  fields.

## Verification

`src/domain/dangerous-goods/cipl-seed.test.ts` fails if a classification input is set from a
CIPL, if a figure is offered without a passing `total-quantity` / `total-weight` check or for a
multi-carton CIPL, or if a non-blank field is overwritten. `src/features/dangerous-goods.test.tsx`
fails if the card renders with no CIPL loaded, or if a figure lands in a field without its own
click.
