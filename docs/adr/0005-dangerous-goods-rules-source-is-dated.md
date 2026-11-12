# 0005. The dangerous goods rules carry a dated source, and warn once a later DGR is in force

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** the owner (Joel Abraham), who delegated the open choices below to the
  implementing session's recommendation on 2026-11-12
- **Applies to:** the dangerous goods workflow (`src/domain/dangerous-goods/lithium.ts`,
  `assess.ts`, `checklist.ts`, `src/features/dangerous-goods.tsx`) and `DgConsignmentRecord` in
  `src/store/local-store.ts`

## Context

ADR 0003 marks every dangerous goods output unverified and notes that the DGR is revised every
January. Nothing in the code knew a date. The source of the figures was prose inside
`DG_SOURCE_NOTICE`, and no comparison with today's date existed anywhere in the workflow
(`docs/audits/2026-11-external-review/verification.md`, item 3). The Schedule B dataset has had a
staleness warning since 2026-07; the dangerous goods figures, which sit behind a declaration
signed under penalty, had none.

The figures come from course materials revised 02/01/2026, so they can reflect nothing later than
the regulations of 2026. IATA states "The 2027 DGRs come into force on 1 January 2027"
(https://www.iata.org/en/programs/cargo/dgr/download/, retrieved 2026-11-12). The DGR itself is
licensed and was not read.

## Decision

We hold what the figures rest on, and the first day a later DGR is in force, as one dated record
(`DG_RULES_SOURCE`), with where that date was read and when. From that day:

- a warning check, `dg.rules-current`, fails on every consignment;
- the Generate card shows the lapse and asks for a second acknowledgement, separate from the one
  ADR 0003 asks for, before either download is enabled;
- the checklist prints the lapse under its title;
- the retention record says the consignment was prepared under superseded figures.

Before that day the checklist still prints the source and the date, and the retention record
still carries them. The lapse **warns and does not block**. The Shipper's Declaration itself
carries no stamp.

## Alternatives considered

### Alternative: block generation once lapsed

Safest on paper. Rejected: nothing here was ever verified against a DGR (ADR 0003), so the day a
new edition takes effect does not turn verified output into unverified output; it widens a check
the preparer already owes. A block would stop the tool on 1 January until a release ships, for
figures that may not have changed, and the way round it would be to keep an old build. The second
acknowledgement puts the lapse in front of the person at the moment they generate, which is what
a block would be for.

### Alternative: stamp the edition on the Shipper's Declaration

Rejected twice over. The declaration is drawn to the IATA layout, and text that layout has no box
for is a reason for an acceptance check to refuse the form. And no edition can honestly be named:
the figures were taken from course materials, not read against an edition.

### Alternative: a versioned ruleset as data

What `roadmap.md` describes as knowingly absent. Still the right end state, and far larger than
one dated record. This decision does not start it and does not get in its way.

## Consequences

- A January revision is now one edit to `DG_RULES_SOURCE` plus whatever figures changed, and the
  tool says so on its own from the day it is due.
- `supersededOn` is a date this repository asserts. It must be re-read from IATA when the
  materials are updated, and never edited from memory.
- `DgConsignmentRecord` gains an optional `rulesSource`. Records written before it decode
  unchanged and show no stamp, which is not a claim that they were current.
- ADR 0003 stands unchanged. When a qualified review supersedes it, that ADR records the edition
  checked and the recheck date, and `DG_RULES_SOURCE` is where the recheck date goes.

## Verification

`lithium.test.ts` fails if the lapse is not detected on the day, is detected a day late, or an
unreadable date reads as current. `assess.test.ts` fails if the check is missing or blocks.
`checklist.test.ts` fails if the source line or the lapse line is dropped.
`src/features/dangerous-goods.test.tsx` fails if the second acknowledgement is not required, if
the retention record is not stamped, or if the history stops marking a lapsed record.
`src/store/decode.test.ts` fails if a record without the stamp, or with an unreadable one, is
mishandled. Each was run against a planted defect on 2026-11-12.
