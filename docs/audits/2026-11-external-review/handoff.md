# Handoff: the 2026-11 external review, after its last merged change

Written 2026-11-13 for the next session. State of `main` at `54fb10d` (PR #97).

## Done

Every buildable item from `verification.md` is merged or decided; section 6 of that file records
the outcome of each. Pull requests #86 to #97. ADRs 0005 to 0010. AGENTS.md project rule 6
("Never block what a person can fix") records the owner's standing preference.

## Open, waiting on the owner

1. **FedEx Ship Manager commodity upload (next build).** Goal: the tool writes a file that FedEx
   Ship Manager *Software* (the desktop application, which the owner uses) loads into its
   commodity database, so commodities are picked in Ship Manager instead of keyed, and Export
   AgentFile carries them into the EEI. Needs from the owner: the header row of a commodity
   export from their Ship Manager Software (or one row with made-up values). Not real part data:
   AGENTS.md project rule 5. Constraints: no network call (project rule 3); the file is built from
   the item library and the shipment, like the keying sheet in `src/carriers/keying-sheet/`; the
   README's reason for not generating import files ("layouts are configured per installation")
   is answered by matching the owner's own export. Likely a rule 14 change (a carrier's field
   mapping): plan it in `docs/changes/` first.
2. **Item 1, real in-house invoices.** Needs real filled workbooks and PDFs on a machine that can
   run `npm run test:real`. Not soon. The loader in `src/test/fixtures.ts` takes no in-house
   names yet; add them only with the documents.

## Decided, do not reopen

- Item 7 (import concordance): dropped.
- Item 8 (weight basis): dropped; weights are measured on a scale.
- Item 5(b)-(d): no ITN field, nothing about EEI on the exported documents; the EEI check warns
  (ADRs 0009, 0010).
- Box 26 / ADR 0001: net weight stays; forwarders take gross from the commercial invoice.
- FedEx API filing: not pursued. The Ship API does not file EEI, and any API call would carry
  shipment data off the machine (project rule 3, `docs/product.md` non-goals).

## Working notes for the next session

- Every PR is reviewed by Codex on GitHub. Each of its findings so far was real; wait for its
  pass on the final commit before merging, and re-request it with an `@codex review` comment.
- The owner rarely has a command line where the real documents are, so `npm run test:real`
  cannot be assumed to run. Say in each PR whether a change could alter a parse or a filed
  figure.
- Regulatory figures are dated records in source with their citation, source, eCFR currency
  date and retrieval date: `EEI_LOW_VALUE_EXEMPTION`, `EEI_REGARDLESS_OF_VALUE`,
  `EEI_BY_DESTINATION` (`src/domain/reconcile/eei.ts`), `DG_RULES_SOURCE`
  (`src/domain/dangerous-goods/lithium.ts`). Re-read them from the primary text, never from
  memory.
