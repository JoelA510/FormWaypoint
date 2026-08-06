# Full-repository review findings — 2026-08-06

A fresh-eyes review pass over the whole repository, ordered most-severe first. **Nothing
here has been fixed** — this file is the worklist. Each finding names the files and lines
it rests on and says how it was verified. Line numbers are against `main` at `14dcb10`.

Severity scale: **High** = wrong regulated output or destroyed compliance evidence;
**Medium** = wrong or silently degraded output in a reachable case; **Low** = defect with a
narrow trigger or a self-announcing failure; **Info** = hardening, staleness, or
consistency debt worth an issue but not urgent.

---

## F1 · High — The declaration never states a single overpack's identification mark, while a blocking check demands it match "identically"

`src/domain/dangerous-goods/dgd.ts:168-180` (`overpackAnnotations`) prints the overpack
marks and the "Total quantity per Overpack" figure **only when `overpack.count > 1`**. A
single overpack gets the words `Overpack used` and nothing else.

`src/domain/dangerous-goods/assess.ts:1031-1045` (`overpackChecks`) meanwhile blocks
generation until **every** used overpack has an identifier entered, and its check text says
the identifier must be "marked on the physical overpack and repeated identically in the
declaration entry, with the battery net quantity assigned to that identifier", and that
"the identifier on the box and the identifier on the declaration must read the same."

So for the common one-overpack consignment the user is forced to enter an identifier that
the generated declaration then never prints — the box carries `#A001`, the paper does not,
which is precisely the box/paper mismatch the check's own text calls "the single most
frequent cause of a correction cycle on these shipments."

One of the two sides is wrong: either the single-overpack case does not require the
identifier (then the blocking check overstates the rule and should not demand marks for a
lone overpack), or it does (then `overpackAnnotations` must print the marks and per-overpack
total for `count === 1` as well). Resolve against the DGR/training materials, then make the
check and the annotation agree. Verified by reading both functions and the UI path
(`features/dangerous-goods.tsx` renders both).

## F2 · Medium — "Clear all local data" deletes the DG retention records while its confirmation reads as though they are kept

`src/App.tsx:345-361` (`clearAll`) shows:

> "Delete the saved profile, consignees, overrides, item library, shipment history and
> prepared dangerous goods consignments from this machine? **Dangerous goods records are
> kept to evidence the two-year retention rule.**"

and then calls `localStore.clearAll()`, which (`src/store/local-store.ts:356-363`)
unambiguously clears the `dgConsignments` store, and the component zeroes
`setDgConsignments([])`.

The second sentence is readable — arguably most naturally readable — as "your DG records
will be kept". They are not. A user on a shared machine can destroy the only local evidence
of consignments still inside their two-year retention window while believing it was
preserved. Either exclude `dgConsignments` from `clearAll` (with a separate, harder
confirmation for records past their `retainUntil` date), or reword the dialog to state
plainly that retention records are being deleted and what that means. Verified by reading
both files; the store has no carve-out.

## F3 · Medium — A single tall DGD entry overflows the table into the boxes beneath it, silently

`src/domain/dangerous-goods/dgd.ts:301-317` (`paginate`) starts a new page when the *next*
line would exceed `ROWS_PER_PAGE = 14` — but a **first** line of any height is placed
(`if (used && used + height > ROWS_PER_PAGE)` is false when `used === 0`). Nothing bounds
one line's own height.

`src/carriers/dgd/render.ts:282-286` + `drawEntry` then draw every row of that line
downward from `headerBottom - 12` with no check against `tableBottom`. The table has room
for ~20 rows of 11 pt (y after the fixed header stack is 482; `tableBottom` is 190;
`(482 - 58 - 12 - 190) / 11 ≈ 20`); a line taller than that draws its overflow straight
across the Additional Handling Information and certification boxes. No warning is emitted —
unlike the handling-information box, which does warn at `render.ts:295-300` when it drops
lines.

Reachable because two inputs of unbounded length feed one line's height: the free-text
packaging type (wrapped into the 34-char quantity column at
`dgd.ts:227-229`) and the overpack marks list (`overpackAnnotations` wraps
`Overpack marks: …` into the same column — twenty overpack identifiers is ~5 rows on its
own). Fix by hard-splitting or warning in `paginate` when a single line exceeds
`ROWS_PER_PAGE`, and/or clamping + warning in `drawEntry` when `rowY` would pass
`tableBottom`. Verified by arithmetic against the geometry constants; not reproduced with a
rendered PDF.

## F4 · Medium — `retainUntil` runs from the preparation date, but the obligation runs from acceptance by the initial carrier

`src/domain/dangerous-goods/dgd.ts:124-128` computes `retainUntil` as two years from the
moment the Generate button was clicked (`features/dangerous-goods.tsx:135-156` passes
`new Date()` at click time). The application's own compliance text states the correct
anchor twice — assess.ts's retention check ("two years **after the material is accepted by
the initial carrier**", 49 CFR 172.201(e)) and the checklist's "Before it goes" item — and
preparation always precedes acceptance, so the stored keep-until date is systematically
*short* by the gap between generating the paperwork and the carrier accepting the goods
(days, sometimes more). The history panel then displays that short date as "Keep until".

Cheapest correct fix: label the column "Keep until at least" and note the anchor; better:
record an acceptance date when known and compute from it. Verified by reading
`retainUntil`, its caller, and the two places the correct rule is already stated.

## F5 · Low — Vendor-A's `invoiceTotal` also runs on packing-list header pages and can overwrite the invoice's total

`src/domain/cipl/parse-vendor-a.ts` — `parseHeaderPage` is document-kind-blind and is
called for both the invoice header and the packing-list header of a set
(`parseCiplPages:80-84`). `invoiceTotal` (≈line 346) accepts **any** row of exactly two
items shaped `<number> <three-capital-letters>`, and `parseHeaderPage` coalesces its result
over the previously parsed value with *fresh-wins* semantics. A packing-list header row
like `1113.140 KGS` in a two-item row would therefore replace the invoice's real USD total
and currency. On the known fixtures the PL totals rows carry three numbers above a
`KGS KGS M3` unit row, so this has not fired — the failure would also be loud (`KGS` fails
the USD currency check) rather than silent. Hardening: only read `invoiceTotal` on
`INVOICE`-kind pages, or reject unit strings (`KGS`, `PCS`, `M3`) that match the
`/^[A-Z]{3}$/` currency pattern. Verified by reading the call path; not reproduced.

## F6 · Low — `detectCarrier` matches `'ups'` as a bare substring

`src/carriers/registry.ts:47-55`: `text.includes('ups')` matches inside ordinary words —
"Groups", "Supship", any agent name containing `…ups…` — and auto-selects UPS, which also
swaps in UPS keying defaults via `applyCarrierDefaults`. It is only a preselection the user
can change, but a wrong silent default on a field most users trust is worth a word-boundary
match (`/\bups\b/`) like the longer names effectively get. Verified by reading; trivially
reproducible with `detectCarrier('XYZ Groups Logistics')`.

## F7 · Low — Two download paths have no in-flight guard, so a double-click writes twice and records twice

- `src/features/dangerous-goods.tsx:182-200` (`downloadChecklist`) — no `busy` state at
  all; each click writes a file **and** appends a DG retention record via `onPrepared`.
- `src/features/output-panel.tsx:95-113` (`downloadKeyingSheet`) — same shape; each click
  writes a workbook and appends a shipment history record via `onGenerated`.

`generateDeclaration` and `generate` both guard with `busy`; these two siblings don't. On
the desktop the file side is harmless (`(2)` suffix), but the duplicate audit/retention
rows are noise in exactly the tables that exist to be read later. Verified by reading; the
buttons are disabled only on `canGenerate`, not while the async work runs.

## F8 · Low — The CEVA adapter's dangerous-goods warning predates the DG workflow

`src/carriers/ceva/adapter.ts:145-150`: marking a shipment hazardous warns "Box 33 requires
an attached shipper's declaration, **which this tool does not produce**." Since the
dangerous-goods tab landed, the tool does produce an IATA Shipper's Declaration. The
statement is now false and sends the user away from a feature that exists; it should point
at the Dangerous goods tab (while keeping the caveat that the DG workflow is its own
assessment, not an attachment generated from this SLI). Verified against
`features/dangerous-goods.tsx` / `carriers/dgd/render.ts`.

## F9 · Low — `handleParsed` can leave the app stuck busy

`src/App.tsx:141-171`: `setBusy(true)` … `await localStore.getConsignee(...)` …
`setBusy(false)` with no `try/finally`. An IndexedDB failure (private-browsing quota,
corrupted DB) leaves `busy` true forever with a parsed document in state — the upload
button stays disabled with no error surfaced. Wrap in `try/finally` and report the error.
Verified by reading; the sibling paths (`generate`, `generateDeclaration`) all use
`finally`.

## F10 · Info — The shipment audit record stores only half the checks that gated it

`src/App.tsx:295-326` (`handleGenerated`) saves `reconciliation.checks`, but generation was
gated on `[...reconciliation.checks, ...checkDraft(draft, adapter)]` (App.tsx:223-230). The
saved record therefore cannot show that the profile/destination/date checks passed at
generation time — which is part of what an audit record is for. Store the combined list (or
the draft checks alongside).

## F11 · Info — The battery-mark exemption is keyed on an English string prefix

`src/domain/dangerous-goods/assess.ts:1140`:
`if (mark.startsWith('Lithium battery mark') && exemption) continue` couples the exemption
logic to the exact wording `hazardCommunicationFor` happens to emit
(`src/domain/dangerous-goods/lithium.ts:377-393`). Rewording that mark — or introducing a
mark whose name doesn't begin with that prefix — silently breaks the exemption filter with
no failing type or test local to the change. Emit a structured
`{ kind: 'battery-mark', text }` (or a constant both sides import) instead of matching
prose.

## F12 · Info — No user feedback while a CIPL is parsing

`src/features/upload-panel.tsx:18-40`: `handleFile` parses before calling `onParsed`, but
App's `busy` only turns on inside `handleParsed` — i.e. *after* the parse finishes. During
a slow multi-page parse the button reads "Choose a PDF", is not disabled, and accepts a
second file. Cosmetic, but it invites the double-submission F7 guards against elsewhere.

---

## Coverage

Read closely this pass: `features/dangerous-goods.tsx`, `domain/dangerous-goods/`
(`assess.ts`, `lithium.ts`, `dgd.ts`, `checklist.ts`), `carriers/dgd/render.ts`,
`domain/reconcile/` (`index.ts`, `lines.ts`), `App.tsx`, `store/local-store.ts`,
`src-tauri/src/lib.rs`, `lib/xlsx.ts`, `lib/deliver.ts`, `lib/report.ts`,
`domain/cipl/extract-text.ts`, `domain/draft.ts`, `domain/schedule-b/index.ts`,
`carriers/form-utils.ts`, `carriers/ceva/adapter.ts`, `carriers/registry.ts`,
`features/output-panel.tsx`, `features/upload-panel.tsx`, `features/review.tsx` (first
200 lines), `desktop/index.ts`, plus the vendor-a/vendor-b parsers, keying sheet,
`countries.ts` resolution logic, and `item-library/` — the last group already covered in
depth by the PR #44 pass and re-skimmed here.

Skimmed only (no close line-by-line read this pass): `features/manual-fields.tsx`,
`features/item-library.tsx`, `features/schedule-b-refresh.tsx`,
`domain/schedule-b/revision.ts` (second half), `domain/schedule-b/refresh.ts`,
`domain/schedule-b/parse-concordance.ts`, `carriers/nippon-express/`, `carriers/ceva/fields.ts`,
`components/ui`, and the test suites. Nothing alarming surfaced in the skims, but they have
not had the same scrutiny as the list above.

Standing environmental issue, not a code finding: GitHub Actions has not dispatched any
workflow run for this repository since 2026-08-06 ~19:21 UTC — pushes and PRs produce no
`ci.yml` run, so every recent merge is verified locally only. Needs an Actions
billing/enablement check in repository or account settings.
