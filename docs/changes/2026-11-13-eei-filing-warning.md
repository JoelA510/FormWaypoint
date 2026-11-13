# Say whether EEI has to be filed

Kind: FEATURE · Drawn up: 2026-11-13 · Owner: Joel Abraham · Status: DONE

Agreement: the owner asked for this change on 2026-11-13, in answer to item 5(b)-(d) of the
2026-11 verification: "Just flag that this needs the ITN/EEI filing, or that it doesn't with the
exception listed if that's fairly easy to do ... a warning that I need to file is helpful, a
blocker would be devastating. No need to list on the exported documentation regardless and
shouldn't become an input field." The exception list is his to confirm.

## Why

A shipper (docs/product.md, Users) decides from the review screen whether to file EEI through the
carrier's service. The check from ADR 0008 named the totals over $2,500 as information and would
not say when no filing was needed, so it did not answer the question he uses it for.

## Behavior

- **Now** (statically reviewed, `src/domain/reconcile/eei.ts` at `main`): one `info` check;
  over the figure it names the totals; under, it says the exemption alone does not settle it.
- **After:** a warning "EEI filing required" when a total is over $2,500; a warning "EEI filing
  may be required whatever the value" when a licence other than NLR or a rough-diamond heading is
  on a row; otherwise information "No EEI filing needed on value" listing the cases in 15 CFR
  30.2(a)(1)(iv). Rows not in US dollars are not compared, but the pointers are still reported.
- **Unchanged:** the arithmetic (sums per Schedule B number and D/F in whole cents; strictly over
  $2,500); `canGenerate`; every form and keying sheet; every persisted record. Proved by the
  existing arithmetic tests in `eei.test.ts` passing untouched.

## Out of scope

- An ITN field, a filing record, anything on the exported documents (the owner's instruction).
- Detecting an E:1/E:2 destination, an ITAR item, a DEA, NRC or other agency's licence beyond the
  licence column, a used vehicle, or 758.1(b) reporting for an NLR item. Named in the list.

## Against the rules

- Project rule 2 — departs, on the owner's instruction: the check says no filing is needed on
  value, which is a conclusion drawn from value; it lists the exceptions in the same sentence and
  says most can only be confirmed by the person. Recorded in ADR 0009.
- Project rule 6 — follows it: warnings and information only.
- Project rule 3 — follows it: the citations are constants; nothing is fetched.
- ADR 0008 — superseded by ADR 0009, on the owner's say-so.

## Design

`EEI_REGARDLESS_OF_VALUE` holds the citation, source, eCFR currency date (2026-11-10), retrieval
date, last amendment, the three rough-diamond headings and the eight cases in the words the check
uses. `eeiThresholdCheck` reads two pointers off the rows: a licence that is neither blank nor
NLR (any punctuation), and a commodity number under 7102.10, 7102.21 or 7102.31.

## Risks and rollback

- **Risk:** "no filing needed on value" is taken as final for a shipment under a case the tool
  cannot see — **watch:** the detail lists every case each time — **if it happens:** the owner
  can ask for the passing state to be worded more cautiously; one string.
- **Risk:** a licence exception in the licence column (`LVS`, `GBS`) raises "may be required" —
  accepted: over-warning is the safe side, and the person rules it out.
- **Rollback:** revert. Nothing persisted changes.

## Tasks

- [x] `EEI_REGARDLESS_OF_VALUE` and the three outcomes — proved by
  `src/domain/reconcile/eei.test.ts`. Planted: over-figure only informing; licence never
  checked; NLR with dots not recognised; a blank licence flagged; diamonds never checked; the
  exceptions dropped from the passing detail; the pointers dropped from the over-figure warning;
  non-dollar rows ignoring the pointers. Each failed at least one test.
- [x] ADR 0009, superseding ADR 0008; README and `roadmap.md` brought into line.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] The repository's full gate passes, and every new check was shown failing first.
- [x] docs/product.md, the README, and any ADR are updated where this change moved them.
