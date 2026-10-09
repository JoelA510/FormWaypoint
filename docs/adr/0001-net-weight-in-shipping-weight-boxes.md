# 0001. File net weight in the SLIs' shipping-weight boxes

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** the owner (Joel Abraham)
- **Applies to:** Nippon Express box 26 and the CEVA "Shipping Weight" column
  (`src/carriers/nippon-express/adapter.ts`, `src/carriers/ceva/adapter.ts`)

## Context

Nippon Express box 26 is captioned "Gross Shipping Weight", and CEVA's column "Shipping Weight".
The adapters write each row's **net** weight there, because every completed form for a past
shipment did. The 2026-10 audit (finding 4.7) asked whether that is a wrong figure: shipping
weight is usually read as including packaging, and a CIPL in the Vendor A layout prints a gross
per line that the adapters never use. `useGrossWeight` and `grossWeightByRow` were added to the
Nippon adapter as a switch, and nothing sets them.

## Decision

We file the net weight in both boxes, as the forms filed by hand always have. The switch stays
unset. The CEVA package line ("Pieces & Dimensions") keeps the shipment's gross weight where the
CIPL prints one, and the FedEx/UPS keying sheets key the gross package weight or leave it to be
weighed (never the net).

## Alternatives considered

### Alternative: gross weight per row

Closer to the boxes' captions, but it departs from every form filed so far, and a per-row gross
exists only for the Vendor A layout; the `SHIPMENT#` layout prints no weights and Omron prints a
gross total only. Rejected by the owner.

## Consequences

- The SLI weights match the forms filed by hand, which is what the real-shipment suite checks.
- If a carrier or an auditor asks for gross weight, this ADR is superseded and the switch is wired
  to a carrier setting; the golden test (`src/carriers/sli-golden.test.ts`) then changes with it.

## Verification

`src/carriers/sli-golden.test.ts` asserts the net weight (1.700 kg per row of the synthetic
shipment) in both forms, so a change to gross fails it.
