# 0009. Say whether EEI has to be filed: a warning when it does, information when it does not

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** the owner (Joel Abraham), who asked for this on 2026-11-13. The exception list,
  read from 15 CFR 30.2(a)(1)(iv), is his to confirm.
- **Supersedes:** ADR 0008
- **Applies to:** `src/domain/reconcile/eei.ts`, and the check list `reconcile()` returns

## Context

ADR 0008 reported the EEI low-value exemption as information and in one direction only: it said
which commodity totals were over $2,500 and refused to say that no filing was needed, because
§ 30.37 opens "Except as noted in § 30.2(a)(1)(iv)" and the tool cannot see every case that
paragraph lists.

The owner uses the tool to decide whether to file. His organisation has no direct AES access, so
a filing goes through the carrier's own service (FedEx's). He asked, on 2026-11-13, for the check
to say plainly that a filing is needed, or that it is not with the exceptions listed; for it to
be a warning and never a block ("a warning that I need to file is helpful, a blocker would be
devastating"); and for nothing about EEI to appear on the exported documents or as an input
field.

15 CFR 30.2(a)(1)(iv) (eCFR, title 15 current to 2026-11-10, retrieved 2026-11-13; section last
amended at 91 FR 35384, June 11, 2026): "Notwithstanding exemptions in Subpart D, EEI shall be
filed for the following types of export shipments, regardless of value: (A) Requiring a
Department of Commerce, Bureau of Industry and Security (BIS) license or requiring reporting under
the Export Administration Regulations (15 CFR 758.1(b)). (B) Requiring a Department of State,
Directorate of Defense Trade Controls (DDTC) license under the International Traffic in Arms
Regulations (ITAR) (22 CFR Parts 120 through 130). (C) Subject to the ITAR, but exempt from
license requirements, except as noted by the ITAR. (D) Requiring a Department of Justice, Drug
Enforcement Administration (DEA) export permit or declaration (21 CFR 1300 through 1399).
(E) Requiring a general or specific export license issued by the U.S. Nuclear Regulatory
Commission under 10 CFR part 110. (F) Requiring an export license issued by any other federal
government agency. (G) Classified as rough diamonds under 6-digit HS subheadings 7102.10, 7102.21,
and 7102.31. (H) Used self-propelled vehicles as defined in 19 CFR 192.1 of U.S. Customs and
Border Protection regulations, except as noted in CBP regulations. Note 1 to paragraph (a)(1)(iv):
For the filing requirement for exports destined for a country in Country Group E:1 or E:2 as set
forth in supplement no. 1 to 15 CFR part 740, see 15 CFR 758.1(b)(1)."

§ 30.2(b)(1): "The EEI shall be filed prior to exportation".

## Decision

One check, `eei-low-value-exemption`, never blocking (AGENTS.md project rule 6):

- **A total is over $2,500:** a warning headed "EEI filing required", naming each total and saying
  the filing is due before export, through AES or a carrier's or agent's filing service.
- **No total is over, but the document points at an exception:** a warning headed "EEI filing may
  be required whatever the value". Two pointers are read off the rows, because they are there to
  read: a licence column that is not NLR (case (A), or another agency's), and a commodity number
  under one of the three rough-diamond headings (case (G)).
- **No total is over and nothing points at an exception:** information headed "No EEI filing needed
  on value", listing every case in § 30.2(a)(1)(iv) and the E:1/E:2 note, and saying most can only
  be confirmed by the person.
- **Rows not priced in US dollars:** nothing is compared; the pointers are still reported.

The exception list is held as dated data with its citation and source, `EEI_REGARDLESS_OF_VALUE`,
beside the $2,500 record. Nothing about EEI is printed on any form or keying sheet, and there is
no ITN field.

## Alternatives considered

### Alternative: keep ADR 0008's one-directional advisory

Avoids ever stating that no filing is needed. Rejected by the owner: the tool is how he decides
whether to file, and "the exemption only, it does not mean no filing" did not answer the question.
The exceptions are listed in the same sentence instead.

### Alternative: detect the destination's country group

Case E:1/E:2 is a fixed list in supplement no. 1 to part 740, but it changes by rule and is not
held here. Detecting it would mean keeping a sanctions list current. Named in the list, not
detected.

### Alternative: a blocking check until an ITN is entered

Rejected by the owner.

## Consequences

- The warning tells the owner to file whenever a commodity total is over $2,500, which is the
  common case.
- "No EEI filing needed on value" can be wrong for a shipment that falls under a case the tool
  cannot see (ITAR, DEA, NRC, a used vehicle, an E:1/E:2 destination, or reporting under 758.1(b)
  for an NLR item). The detail says so every time.
- A licence value that is a licence exception rather than a licence (e.g. `LVS`, `GBS`) still
  raises "may be required"; the person rules it out. Over-warning here is the safe side.
- Both records must be re-read from the eCFR when Part 30 is amended.

## Verification

`src/domain/reconcile/eei.test.ts` fails if a total over the figure only informs, if the licence or
rough-diamond pointers stop being read, if NLR written with dots or a blank licence is treated as a
licence, if the passing information drops any exception, if the pointers are dropped from the
over-figure warning, or if non-dollar rows stop being checked for them. Eight planted defects were
run on 2026-11-13; each failed at least one test.
