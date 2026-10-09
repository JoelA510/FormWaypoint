# 0002. Figure precision on the generated forms

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** the owner (Joel Abraham)
- **Applies to:** every figure written to an SLI or keying sheet (`src/carriers/`, `src/domain/draft.ts`)

## Context

Sixteen precision fixes between July and September 2026 were nearly all one figure computed at
two surfaces with two roundings (audit finding 4.3). The audit proposed a single module through
which every filed figure would pass. The owner declined that refactor and set the precision each
kind of figure is filed to instead.

## Decision

| Figure | Precision |
| --- | --- |
| Currency totals (row values, invoice totals) | 2 decimals |
| Unit prices | as stated, unrounded |
| Weights in kilograms | 3 decimals |
| Weights in pounds | 1 decimal or finer |

Where the code stood on 2026-10-09:

- Nippon Express row values (`toFixed(2)`), keying-sheet totals and customs value (2 decimals),
  every kilogram weight on every form (3 decimals) and keying-sheet pounds (2 decimals) already
  conformed.
- The keying sheet's per-unit value is a quotient (row total over quantity), kept to 6 decimals:
  a quotient has no "as stated" form, and 6 decimals carries every figure these documents print.
- CEVA's package line printed whole pounds; it now prints one decimal.
- CEVA's row values are whole dollars, following the form's own instruction ("U.S. dollar, omit
  cents"). That differs from the 2-decimal rule and is an open question for the owner; until it
  is answered, a row that rounds to $0 is named in a warning.
- The Schedule B reporting quantity in KG is a whole number by AES rule. It is a quantity, not a
  weight, and is outside this table.

## Alternatives considered

### Alternative: one filed-figure module

Every box's figure produced by one function per kind. Declined by the owner: the rules above are
few and already applied at each site; the golden test holds them.

## Consequences

- A new box follows the table. A change to a box's precision is a rule-14 change (AGENTS.md).

## Verification

`src/carriers/sli-golden.test.ts` asserts every box on both SLIs, including the precision of each
figure (for example `1.700`, `90.00`, `8.2 lbs / 3.740 Kg gross`); the keying-sheet tests assert
its totals.
