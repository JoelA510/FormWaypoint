# 0003. Dangerous goods output is marked unverified until a qualified person checks it

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** the owner (Joel Abraham)
- **Applies to:** the dangerous goods workflow (`src/domain/dangerous-goods/`, `src/features/dangerous-goods.tsx`, the Shipper's Declaration in `src/carriers/dgd/`)

## Context

The lithium battery workflow classifies cells and batteries, checks package and consignment
limits, and produces a Shipper's Declaration and a package checklist. Every figure comes from the
Labelmaster *Shipping Lithium Batteries* course materials (Student Guide rev. 02/01/2026,
Supplemental Appendix rev. 01/01/2025). The licensed IATA DGR, its addenda and the state and
operator variations were not available when it was built (`docs/dangerous-goods-fact-check.md`),
and two packing instructions are unconfirmed. The workflow has never been used for a real
consignment. A Shipper's Declaration is signed under penalty, and the owner's definition of
"complete" does not include it (audit finding 12.4).

## Decision

Until a person qualified to sign a Shipper's Declaration has checked the rules against the current
DGR, every dangerous goods output says it is unverified: the Generate card shows the notice
(`DG_SOURCE_NOTICE` in `src/domain/dangerous-goods/lithium.ts`), both downloads stay disabled until
the operator acknowledges it, and the checklist prints it under its title. The acknowledgement is
not saved; it is asked each time.

## Alternatives considered

### Alternative: hide the workflow

Removes the risk, and the work. Rejected: the workflow is useful as a preparation aid, and the
notice puts the check where the signature is.

## Consequences

- No declaration is produced without the operator being told, at that moment, what it rests on.
- When a qualified review is done, this ADR is superseded by one recording who checked it, against
  which DGR edition, and when it must be rechecked (the DGR is revised every January).

## Verification

`src/features/dangerous-goods.test.tsx` fails if the notice is missing or a download is enabled
before the acknowledgement; `src/domain/dangerous-goods/checklist.test.ts` fails if the checklist
drops the notice.
