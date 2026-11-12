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

A line that states no country of origin no longer files F. It blocks until the document is
corrected or a D/F is entered for its part.

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

### Alternative: keep filing F for a blank origin and warn

Keeps every past behaviour. Rejected: it files a figure the document does not state, which
project rule 1 names as the worst outcome, and the fix for the person is one entry.

### Alternative: stop deriving the letter and ask for every part

The most literal reading of rule 2. Rejected: for goods made in the United States, and for
foreign goods re-exported untouched, the origin does settle it, and that is most lines. A question
asked of every part is one nobody reads.

## Consequences

- A foreign-origin part that is domestic for the EEI can now be filed correctly, once, and stays
  correct.
- Shipments with a blank country of origin that used to produce a form now block. No synthetic
  document in the suite has one. **Whether any of the six real fixtures does is unknown** until
  the owner runs `npm run test:real`; a failure there on `origin-stated` is this change working,
  not a regression, but the owner should see it before relying on the build.
- An entry can split or merge commodity rows, because D/F is part of what makes a row.
- `PartOverrideRecord` gains four optional fields. Records saved before them decode unchanged.
- The tool still decides nothing: it has no view on whether a transformation is substantial.

## Verification

`src/domain/reconcile/origin-status.test.ts` fails if an entry is ignored, applied to a line with
no part number, or reported when it agrees with the document, and if a blank origin stops
blocking. `keying-sheet.test.ts` fails if the sheet states a different letter from the SLI.
`src/store/local-store.test.ts` and `decode.test.ts` fail if an entry-only record is dropped or a
stored value other than D or F is trusted. `src/features/review.test.tsx` fails if an entry can
be applied without a reason or a signer, or is shown without its date. Fifteen planted defects
were run against them on 2026-11-12; each failed at least one test.
