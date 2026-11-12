# 0007. Declared values nobody chose for the shipment are warned about, not blocked

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** the owner (Joel Abraham): warnings over blocks is his stated preference of
  2026-11-12; the remaining choices were delegated to the implementing session
- **Applies to:** `src/domain/draft.ts`, `src/App.tsx`, `src/features/manual-fields.tsx`

## Context

Two ways a declared value reached a form without anyone choosing it for that shipment
(`docs/audits/2026-11-external-review/verification.md`, item 6 and finding A):

- **Starting values.** Both SLI adapters start the consignee type at Reseller and the parties as
  related; hazardous materials and routed export start at No. A shipment to a consignee never
  seen before filed all four as they stood, and no check mentioned them. The README said the tool
  never infers any of the four.
- **Carried values.** For a consignee seen before, the consignee ID, consignee type, related-party
  status and destination country were copied from the saved record onto the new shipment. The
  screen showed them as ordinary fields. The record's `lastUsed` date was kept and never shown.
  The carried destination was also filed in place of the one the document states.

AGENTS.md project rule 2 says consignee type, hazardous-material status and routed-export status
come from the document or from a person.

## Decision

The values stay as they are filled in: the starting values still start there, and a saved
consignee's values are still carried. What changes is that each one is marked until a person
changes it or confirms the set for this shipment. While any is marked:

- a warning check, `settings-confirmed`, names each with the value that will be filed and where it
  came from (a starting value, or carried from the consignee's shipment of a given date);
- the same list is shown at the top of the shipment's manual fields, with one button that
  confirms them all;
- where a carried destination differs from the one the document gives, a second warning,
  `destination-carried-differs`, names both.

Both are warnings. Nothing is saved about the confirmation; it is asked for each shipment. The
checks are saved with the shipment's history record, so a form generated past them says so.

## Alternatives considered

### Alternative: start the values unanswered and block until chosen

What the dangerous goods workflow does (`docs/changes/2026-10-19-dg-entries-start-unanswered.md`),
and the first plan for this change. Rejected on the owner's preference: a block holds the whole
shipment where one click would do, and an unanswered consignee type needs a third state on two
persisted records and both adapters' box mappings. The warning reaches the same person at the
same moment without either cost.

### Alternative: one confirmation per field

More deliberate, and six clicks a shipment for values that are right nearly every time. Rejected:
the list already names every value, and changing a field confirms that field on its own.

### Alternative: stop carrying the destination where the document states one

Removes the one carried value that can contradict the document. Not taken here because it changes
which value is filed for shipments that work today; the disagreement is reported instead. Worth
revisiting if the warning ever fires in practice.

## Consequences

- A first-time consignee is no longer filed as a related-party reseller without a word.
- Every shipment now starts with at least one warning until the values are confirmed. That is
  one click, each time, by design.
- A starting value or a carried value can still be filed unconfirmed. This is a known departure
  from the letter of project rule 2, on the owner's decision, and it is recorded on the shipment.
- No persisted record changes shape.

## Verification

`src/domain/draft-sources.test.ts` fails if a starting or carried value is not marked, if a blank
carried value is, if an edit clears the wrong marks, if either check blocks or stops failing, or
if the carried date is dropped. `src/features/manual-fields.test.tsx` fails if the list is hidden
or the confirm button does nothing. Thirteen planted defects were run on 2026-11-12; each failed
at least one test. `App.tsx` marking the values on load and adding the checks is statically
reviewed only.
