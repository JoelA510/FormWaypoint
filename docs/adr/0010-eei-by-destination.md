# 0010. The EEI warning also reads the destination and the ECCNs

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** the owner (Joel Abraham), who asked for the exceptions to be detected "if that's
  fairly easy to do" and directed the implementing session to review and confirm the lists
- **Extends:** ADR 0009 (which it does not supersede)
- **Applies to:** `src/domain/reconcile/eei.ts`, `checkDraft` in `src/domain/draft.ts`

## Context

ADR 0009 named the Country Group E:1/E:2 case and the EAR's own reporting rules (15 CFR 758.1(b))
in its list of exceptions, but did not detect them. Re-reading the sources on 2026-11-13 found that
two of them can be read off what the tool already holds, and that one of them bears directly on
this exporter's shipments:

- § 758.1(b)(10) (eCFR, title 15 current to 2026-11-10; section last amended at 91 FR 46260,
  2026-07-23): EEI is required "For all exports of items on the Commerce Control List to the
  People's Republic of China, Russia, or Venezuela, regardless of value, unless the export may be
  made under the exemption listed under paragraph (c)(4) of this section", which is License
  Exception GOV. Its note puts Hong Kong under China. The in-house form states an ECCN per line,
  and an ECCN other than EAR99 is an item on the Commerce Control List.
- § 758.1(b)(1): every export subject to the EAR to Country Group E:1 or E:2, whatever the value.
  Supplement no. 1 to part 740 lists E:1 as Iran, North Korea and Syria, and E:2 as Cuba.
- § 758.1(b)(3): every 600-series or 9x515 item, whatever the value or destination; recognisable
  from the ECCN.

## Decision

- A draft check, `eei-destination`, reads the destination the draft will file. It warns that EEI is
  required whatever the value for a Country Group E destination, and for any ECCN other than EAR99
  going to China, Hong Kong, Russia or Venezuela, naming the ECCNs and the GOV exemption. Where
  rows going to those four have no ECCN, it says whether they are controlled cannot be told.
- The value check adds a 600-series or 9x515 ECCN to its pointers.
- Both lists are held as dated data with their source, `EEI_BY_DESTINATION`.
- Warnings only, never a block (AGENTS.md project rule 6).

The DG lapse date (ADR 0005) and the 30.2(a)(1)(iv) list (ADR 0009) were re-read on 2026-11-13
at the owner's direction and found unchanged; each record carries `rechecked: '2026-11-13'`.

## Alternatives considered

### Alternative: one combined check

The value check runs on the document side and the destination is settled on the person's side,
where it can be typed over or carried from the consignee. Combining them would mean the value check
reading a destination the person has since changed. Two checks, each reading the value it is about.

## Consequences

- A shipment of 5A992.c items to China under $2,500 now warns that EEI is required, where it used
  to say none was needed on value.
- The country lists change by rule. They must be re-read when parts 740 or 758 are amended.
- Still not detected: ITAR items, DEA and NRC permits, used vehicles, STA (except where it is
  typed in the licence column), the Unverified List, VEU, and 3A069 to Country Group D.

## Verification

`src/domain/reconcile/eei.test.ts` fails if a Country Group E destination or a controlled item to
the four destinations is missed, if EAR99 is taken for controlled, if rows with no ECCN go unmentioned,
if the GOV exemption is dropped, if 600-series or 9x515 ECCNs are missed or ordinary ones taken for
them, or if the check is not part of `checkDraft`. Eight planted defects were run on 2026-11-13; each
failed at least one test.
