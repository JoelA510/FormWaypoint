# Starting and carried declared values are named until someone confirms them

Kind: BUGFIX · Drawn up: 2026-11-12 · Owner: Joel Abraham · Status: DONE

Agreement: as for the two plans before it. The owner asked for the verification report's items
one pull request at a time, gave the implementing session discretion over open decisions, and on
2026-11-12 stated a standing preference for warnings over blocks wherever a manual correction
exists. This plan follows that preference.

## Why

A shipper filling an SLI (docs/product.md, Users) signs for the consignee type, whether the
parties are related, whether the goods are hazardous and whether the export is routed. The tool
filled all four in before anyone chose them, and for a consignee seen before it also carried the
consignee ID, type, related-party status and destination from the last shipment without saying
so. Item 6 and finding A of the 2026-11 verification.

## Behavior

- **Now** (statically reviewed; receipts in the verification report, item 6 and section 4):
  - `defaultShipmentSettings` starts consignee type at the adapter's `RESELLER`, related parties
    at the adapter's `true`, hazardous and routed export at `false`.
  - On a new document, a saved consignee's ID, type, related-party status and destination are
    set on the shipment (`src/App.tsx`). No text on the screen marks them and no check concerns
    them. `lastUsed` is stored and never shown.
  - A carried destination is filed in place of the document's own.
- **After:**
  - Each of those values is marked as a starting value or as carried, with the date.
  - A warning check, `settings-confirmed`, lists every marked value with what will be filed and
    where it came from, until the person changes the value or confirms the set.
  - The same list heads the shipment's manual fields, with a "These are right for this shipment"
    button.
  - A warning check, `destination-carried-differs`, appears when a carried destination is not the
    one the document gives.
- **Unchanged:**
  - Every value that is filled in today is still filled in, with the same value. Proved by the
    existing draft, golden and adapter suites passing untouched.
  - What is saved about a consignee, and when.
  - `canGenerate`: both checks are warnings.
  - The ECCN, licence and SME are still not carried, as the comment in `App.tsx` explains.

## Out of scope

- Changing any starting value, or moving one into the exporter profile. If the exporter's
  consignees are always related-party resellers, that is a profile setting for a later change.
- Stopping the carried destination from outranking the document (ADR 0007, alternatives).
- Persisting the confirmation.

## Against the rules

- Operating rule 14 — the change touches how a filed value is presented, not how it is chosen,
  and no persisted record. Planned anyway, because it is the fix for a rule 2 finding.
- Project rule 2 — departs, on the owner's decision: a starting or carried value can still be
  filed unconfirmed. It is now named in a warning saved with the shipment. Recorded in ADR 0007.
- Project rule 4 — follows it: both checks have tests that make them fail.
- ADR 0007 (new, in this change). No existing ADR is touched.

## Design

**Domain** (`src/domain/draft.ts`). `SettingSources` maps each of six settings to
`{ kind: 'default' }` or `{ kind: 'carried', lastUsed }`. `defaultSettingSources()` marks the four
starting values. `carriedSettingSources()` lays the carried marks over them and skips a blank
consignee ID or destination. `sourcesAfterEdit()` drops the mark from any setting whose value a
person changed. `unconfirmedSettingChecks()` returns the two checks; it is separate from
`checkDraft` because the sources are per-shipment screen state, not part of the draft.

**App.** `settingSources` is state beside `settings`: set to the defaults when a document loads,
to the carried set when a saved consignee is found, updated on each settings edit, emptied by the
confirm button. Not saved. The checks join the list `canGenerate` and the history record read.

**UI.** `ManualFieldsPanel` shows a `role="note"` list and a button while anything is marked.
Native elements; the button is reachable in tab order ahead of the fields it speaks for.

## Risks and rollback

- **Risk:** a warning on every shipment is clicked through unread — **watch:** the list states
  the values themselves, so confirming means having seen them — **if it happens:** move the
  constant ones into the exporter profile so the list is only ever the exceptions.
- **Risk:** changing the carrier resets a starting value while its mark has been confirmed —
  **watch:** `applyCarrierDefaults` keeps the previous consignee type and related-party value
  (statically reviewed) — **if it happens:** re-mark on carrier change.
- **Rollback:** revert the commit. Nothing persisted changes.

## Tasks

- [x] Sources, their two constructors and `sourcesAfterEdit` — proved by
  `src/domain/draft-sources.test.ts`. Planted: defaults not marked; blank carried ID marked;
  carried type not marked; an edit clearing every mark, or none.
- [x] `settings-confirmed` and `destination-carried-differs` — proved by the same file. Planted:
  check always passes; check blocks; date dropped; differing destination unreported; compared
  case-sensitively; a typed destination treated as carried.
- [x] The note and the confirm button — proved by `src/features/manual-fields.test.tsx`. Planted:
  note hidden; button inert.
- [x] `App.tsx` marks on load and adds the checks — no test; statically reviewed. The app shell
  has no test harness.
- [x] ADR 0007; README and `roadmap.md` brought into line.

## Done when

- [x] Every task's test passes, and the "Unchanged" list has a test each.
- [x] The repository's full gate passes, and every new check was shown failing first.
- [x] docs/product.md, the README, and any ADR are updated where this change moved them.
