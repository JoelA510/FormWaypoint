# 0006. D/F starts from the country of origin, and a person can enter it per part

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** the owner (Joel Abraham), who delegated the open choices below to the
  implementing session's recommendation on 2026-11-12
- **Applies to:** `src/domain/reconcile/lines.ts` and `index.ts`, both SLI adapters and the keying
  sheets through the rows they are given, `PartOverrideRecord` in `src/store/local-store.ts`, the
  per-part table in `src/features/review.tsx`

## Context

Every commodity row is filed as D (domestic) or F (foreign). The tool derived the letter from the
line's country of origin alone, showed it on the review screen as text, and offered no way to
change it (`docs/audits/2026-11-external-review/verification.md`, item 2). A line with no country
of origin was filed F.

The Foreign Trade Regulations do not define the indicator by country of origin. 15 CFR 30.6(a)(11)
refers to § 30.1(c), where *domestic goods* are "Goods that are grown, produced, or manufactured
in the United States, or previously imported goods that have undergone substantial transformation
in the United States, including changes made in a U.S. FTZ, from the form in which they were
imported, or that have been substantially enhanced in value or improved in condition by further
processing or manufacturing in the United States", and *foreign goods* are those entered and "not
substantially transformed in form or condition by further processing or manufacturing in the
United States" (eCFR, title 15 current to 2026-11-09, retrieved 2026-11-12). A CIPL states where
goods were made. It does not state what was done to them afterwards.

So the derivation could only ever be wrong toward F, and a blank origin produced a letter no
document supported. Both are a compliance value the tool inferred (AGENTS.md project rule 2).

## Decision

The country of origin gives the starting letter, as before. A person can enter D or F against a
part, with a reason, and that entry is filed in place of the derived letter in both directions. It
is kept against the part and reused, shown wherever it is in force with its date, name and reason,
and named in a warning check whenever it changes the letter a document gives.

A line that states no country of origin still files F, as it always has, and now raises a warning
that names the line, says it is being filed as F on no document's say, and points to the per-part
entry. It warns and does not block: the owner's standing preference, stated on 2026-11-12, is a
warning wherever a manual correction exists, because a block can hold a whole shipment over one
error that a person could fix in a moment.

## Alternatives considered

### Alternative: per shipment, not per part

Whether a part was substantially transformed is a fact about how the part is made, the same on
every shipment, and asking for it again each time invites a different answer on a tired day.
Rejected for that reason. The cost is a value carried between shipments, which is why the entry
shows its date and reason and raises a warning each time it changes a letter.

### Alternative: require an approver as well as a reason

Classification overrides record one. Rejected here: the tool has one user, who is the signer, and
the entry already records their name from the exporter profile. A second name field would be the
same name typed twice.

### Alternative: block on a blank origin

The first version of this change did, on the reading that filing F for a blank origin puts a
value on the form that no document states (project rules 1 and 2). Rejected by the owner in
review: a line with neither an origin nor a part number could not be answered per part at all, so
the block had no way out but editing the source document, and a parser that dropped an origin
would have held every shipment in that layout. The warning says the same thing without stopping
the work, and the generated form stays editable.

### Alternative: stop deriving the letter and ask for every part

The most literal reading of rule 2. Rejected: for goods made in the United States, and for
foreign goods re-exported untouched, the origin does settle it, and that is most lines. A question
asked of every part is one nobody reads.

## Consequences

- A foreign-origin part that is domestic for the EEI can now be filed correctly, once, and stays
  correct.
- A blank country of origin is still filed as F. That is a value the documents do not state, and
  it stands as a known, warned departure from the letter of project rules 1 and 2, on the owner's
  decision. Nothing that generated before stops generating, so this change needs no
  `npm run test:real` run to be safe; the run would only show whether any real fixture now
  raises the warning.
- An entry can split or merge commodity rows, because D/F is part of what makes a row.
- `PartOverrideRecord` gains four optional fields. Records saved before them decode unchanged.
- The tool still decides nothing: it has no view on whether a transformation is substantial.

## Verification

`src/domain/reconcile/origin-status.test.ts` fails if an entry is ignored, applied to a line with
no part number, or reported when it agrees with the document, and if a blank origin stops being
warned about by name or starts blocking. `keying-sheet.test.ts` fails if the sheet states a different letter from the SLI.
`src/store/local-store.test.ts` and `decode.test.ts` fail if an entry-only record is dropped or a
stored value other than D or F is trusted. `src/features/review.test.tsx` fails if an entry can
be applied without a reason or a signer, or is shown without its date. Fifteen planted defects
were run against them on 2026-11-12; each failed at least one test.
