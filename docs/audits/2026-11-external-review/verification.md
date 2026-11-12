# Verification of the 2026-11 external review

Repo: **JoelA510/FormWaypoint** · Commit verified: `c386421bd1b2586d16d7686b4e452d4a54991eaa`
(main, 2026-11-11, the same commit the review read; nothing has landed since) · Verified:
2026-11-12 · Verifier: Claude Code, working from the owner's verification brief

An earlier session read the repository at `c386421` and recommended ten changes. It ran greps and
read files; it executed nothing. This report checks each of its claims against the code and, where
a claim leans on a regulation, against the primary text. No source, test or existing document was
changed to produce it.

Verification labels: *statically reviewed* (read in the source), *executed* (a command was run and
its output observed), *fully validated* (run and the outcome verified end to end). Verdicts:
**Confirmed**, **Partly**, **Refuted**, **Cannot verify here**.

## 1. Baseline

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| Install | `npm ci` | PASS (executed) | |
| Gate | `npm run check` | PASS (executed) | typecheck, lint, test, build all green. 42 test files passed, 6 skipped; **1,111 tests passed, 104 skipped**, 0 failed. |
| Real-shipment suite | `npm run test:real` | NOT RUN | `src/test/fixtures/` is empty on a fresh clone. Every skip is the real-shipment suite; a skip is evidence of nothing. |
| Rust gates | `cargo fmt/clippy/test` | NOT RUN | No item here touches `src-tauri/`; CI runs them on Windows. |

What limited the check:

- **No real documents.** Nothing in this report says anything about how the tool behaves on a real
  shipment. Where that matters it is said in the item.
- **The UI was not driven.** Claims about what a screen shows were settled from the component
  source (statically reviewed), not by running the app.
- **The clone was shallow** (50 commits). It was unshallowed before any commit was counted;
  the first count taken on the shallow clone (42) was wrong and is not used.
- **Regulatory text.** 15 CFR Part 30 was read from the eCFR API
  (`https://www.ecfr.gov/api/versioner/v1/full/2026-11-09/title-15.xml?part=30&section=…`),
  title 15 current as of 2026-11-09, retrieved 2026-11-12. The IATA DGR itself is licensed and was
  not read; only IATA's public pages were. Fetched text is quoted as data and settles nothing the
  owner has not confirmed.
- **Two blank forms the owner supplied** (the in-house Commercial Invoice, Rev. C, and the
  Shipping Authorization form, Rev. B) were read outside the repository. They are not committed and
  nothing identifying them is reproduced here.

## 2. Summary

| # | Item | Verdict | Scope | Rules touched | Rule 14 plan | Size |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Real-shipment suite stale; in-house form has no real coverage | Confirmed (the count is worse than recorded) | In | Project 5; operating 9, 10 | No (test loader only) | S, plus the owner's run |
| 2 | D/F inferred from country of origin, not reviewable | Confirmed | In | Project 1, 2; operating 14 | **Yes** | M |
| 3 | DG rules carry no edition or expiry | Confirmed | In | Project 4; ADR 0003; operating 14 | **Yes** | M |
| 4 | Net weight in boxes captioned shipping weight | Confirmed | In | Project 1; ADR 0001; operating 14 | **Yes**, and an ADR decision | S (check only) to M (switch wired) |
| 5 | No EEI-requirement check, no ITN | Confirmed | (a) in; (b)-(d) widen the mission | Project 1, 2; operating 14 | **Yes** | L (four parts) |
| 6 | Remembered consignee values reapplied without notice | Confirmed | In | Project 2; operating 14 | **Yes** | M |
| 7 | Import code stored, never validated | Confirmed | **Out as written** | Project 3; operating 14 | **Yes**, plus product.md and an ADR | L |
| 8 | Library weights have no recorded basis | Confirmed | In | Operating 14 (persisted shape) | **Yes** | S-M |
| 9a | No copy-ready booking summary | Confirmed | In (no network) | None beyond 5 | No | S |
| 9b | No-charge box not read | Confirmed for the workbook; PDF cannot be verified here | In | Project 2; operating 14 (persisted shape) | **Yes** | S-M |
| 10 | `docs/ROADMAP_ENHANCEMENTS.md` describes the removed monorepo | Confirmed | In | None | No | S |

The review's facts held up; none of its ten claims is refuted. Where it was wrong it was wrong on
detail: a citation (item 2), a count (item 1), and the reach of an absence grep (item 4). Its
largest miss is in section 4 below: the consignee type and related-party status it worries about
carrying over in item 6 are also **pre-answered by a default on a shipment with no saved
consignee**, which is the more direct breach of project rule 2.

## 3. The items

### 1. The real-shipment suite is stale, and the in-house form has no real-document coverage

**Verdict: Confirmed.** The staleness is worse than `docs/testing.md` records.

Receipts:

- `docs/testing.md:19` records the last full run as 2026-07-28 at `1e181f5`, 209 passed, and
  says 44 non-merge commits had touched the parsers, reconciliation, adapters or draft since "as of
  2026-10-21" (statically reviewed).
- The command that entry gives, run at HEAD on the unshallowed clone (executed):
  `git rev-list --count --no-merges 1e181f5..origin/main -- src/domain/cipl src/domain/reconcile src/carriers src/domain/draft.ts`
  returns **87**. Run to the last commit on or before 2026-10-21 (`a6a1a38`) it returns **83**,
  not 44. The 44 does not reproduce; the same command with `--first-parent` gives 15, so no
  variant of it yields 44 either. The figure in `testing.md` is unverified and likely came from a
  shallow clone, the same trap this session fell into first. Four of the 87 landed after
  2026-10-21 (#82, #83, #84, #85), all in parsers or reconciliation.
- `roadmap.md:12` says the in-house form is verified "so far only against synthetic documents"
  (statically reviewed).
- `src/test/fixtures.ts:36-43` holds a closed list of six fixture names, all vendor layouts. A
  manifest entry under any other name is ignored: nothing reads it (statically reviewed). So the
  manifest **cannot** take an in-house document today. `readFixture` returns raw bytes and does
  not care about the extension, so an `.xlsx` needs no change to the reader, only new names and a
  suite that uses them.
- The owner's blank Rev. C workbook, passed through `parseCiplFile` in a throwaway test that was
  deleted afterwards (executed): detected as `inhouse-ci`, zero lines, and the three warnings a
  blank form should raise (no subtotal, no consignee, no per-line weights). The current revision
  of the real form is recognised. That says nothing about a filled one.

What the review missed: adding in-house names to `FIXTURE_NAMES` makes `npm run test:real` fail
until those documents are present, by design (`src/test/fixtures-setup.ts:30`). The loader change
and the documents therefore have to arrive together on the owner's machine, or the names go in a
separate optional list.

Smallest change: two fixture names (`inHouse1` for a saved `.xlsx`, `inHouse2` for a PDF printed
from one), a suite gated on them that asserts the parse totals against the manifest rather than
against hard-coded figures, and a corrected count in `docs/testing.md`.

Only the owner can do this:

1. Put the six vendor PDFs in `src/test/fixtures/` with `manifest.json` beside them, in the shape
   `src/test/fixtures.ts:19-28` shows.
2. Run `npm run test:real` and add a row to the table in `docs/testing.md`: date, commit, counts.
3. For the in-house form, once the loader takes it: one real filled workbook and one PDF printed
   from a real workbook, in the same directory, with their manifest entries.

Decisions for the owner: whether in-house fixtures are required by `test:real` or optional;
whether the manifest carries the expected totals (so no real figure is in a test).

### 2. The D/F indicator is inferred from country of origin and cannot be reviewed

**Verdict: Confirmed.** The regulatory premise holds; the review cited the wrong paragraph.

Receipts:

- `src/domain/reconcile/lines.ts:10-19`: `domesticForeign()` returns `D` only when the line's
  country of origin is one of six US spellings, otherwise `F`. An empty origin answers `F`
  (statically reviewed).
- `src/domain/reconcile/lines.ts:270,305`: rows are grouped on the result and it is written to
  `SLILine.domesticForeign` (statically reviewed).
- It is filed: `src/carriers/nippon-express/adapter.ts:199`, `src/carriers/ceva/adapter.ts:258`,
  and the keying sheets at `src/carriers/keying-sheet/index.ts:315,745-750` (statically reviewed).
- `src/features/review.tsx:268` renders it as plain text in a table cell. Every other figure in
  that row has an input or a picker; this has none (statically reviewed).
- No override path: `grep -rn "domesticForeign" src` excluding tests returns 24 matches, every one
  a read, a type, or the derivation above. None is in `src/store/`, and `ShipmentSettings`,
  `OverrideRecord` and `PartOverrideRecord` have no such field. The same grep finds the derivation
  it should, so the search works (executed).
- Two call sites already know the derivation is unsafe on a blank origin and guard against it:
  `src/carriers/keying-sheet/index.ts:732` and `src/domain/cipl/parse-vendor-a.ts:1175`.

The regulation (eCFR, title 15 current to 2026-11-09, retrieved 2026-11-12):

- 15 CFR 30.6(a)(11) says only: "Indicates if the goods exported are of domestic or foreign
  origin. Report foreign goods as a separate line item from domestic goods even if the commodity
  classification number is the same. See § 30.1(c) for definitions of domestic and foreign goods."
  It has no subparagraphs. **The definition the review relied on is in § 30.1(c), not in
  30.6(a)(11).**
- § 30.1(c), *Domestic goods*: "Goods that are grown, produced, or manufactured in the United
  States, or previously imported goods that have undergone substantial transformation in the
  United States, including changes made in a U.S. FTZ, from the form in which they were imported,
  or that have been substantially enhanced in value or improved in condition by further processing
  or manufacturing in the United States."
- § 30.1(c), *Foreign goods*: goods originally grown, produced or manufactured abroad and then
  entered, "but not substantially transformed in form or condition by further processing or
  manufacturing in the United States".

So D/F is its own determination. A part whose country of origin is foreign can be domestic for
the EEI, and the tool files `F` for it with no way to say otherwise. The direction of the error
matters: the tool can only be wrong toward `F`.

Fit: inside the mission. It presses on project rule 2 (a compliance value inferred, not from the
document or a person) and rule 1 (a wrong figure that looks complete). The README's "never
infers" list (`README.md:292`) names country of origin but not D/F, so the README is silent, not
contradicted. Rule 14 applies twice: how a filed value is chosen, and a persisted record.

Smallest change: keep the derivation as the starting answer and say so on the review screen
("F: origin Japan"), with a per-part override to `D` or `F` that requires a reason and is recorded
with the shipment, the way a classification override is. A blank origin should stop answering `F`
at the source and block instead.

Decisions for the owner: per part (kept across shipments) or per shipment; whether an override
needs an approver as well as a reason; whether a blank origin blocks.

### 3. The dangerous goods rules carry no edition stamp or expiry

**Verdict: Confirmed.**

Receipts:

- `src/domain/dangerous-goods/lithium.ts:47-51`: `DG_SOURCE_NOTICE` names the course material
  revisions as prose inside one string. No date is held as data (statically reviewed).
- Absence of any comparison with today's date:
  `grep -rn -i "edition\|valid.\?through\|validUntil\|expir\|lapse\|stale" src/domain/dangerous-goods src/features/dangerous-goods.tsx src/carriers/dgd`
  excluding tests returns nothing but two Tailwind class names. The same pattern over `src/`
  finds the Schedule B staleness code in twelve files, so it can match (executed).
  `grep -rn "new Date\|Date.now"` over the same DG paths returns only the retention date
  (`dgd.ts:128`) and the prepared-at timestamp (`dangerous-goods.tsx:213-228`); neither compares a
  rules date with anything (executed). The review excluded tests; including them changes nothing.
- The Schedule B equivalent exists and is the model: `scheduleBIsStale()` at
  `src/domain/schedule-b/index.ts:140`, shown at `src/App.tsx:720,804` (statically reviewed).
- ADR 0003 already says "the DGR is revised every January" and that a qualified review must record
  "when it must be rechecked".

The premise: IATA's public pages show the 68th edition dated 1 January 2027 and state the 2027
regulations come into force on that date (iata.org, retrieved 2026-11-12). The DGR text itself was
**not checked**; it is licensed. That the figures in this repository lapse on 2027-01-01 is an
inference from an annual edition cycle, sound but the owner's to confirm. It is seven weeks away.

What the review missed: the stamp must name what the figures actually rest on. They come from
course material aligned to a year, not from a DGR edition anyone here has read, so stamping
"DGR 67th edition" on a declaration would claim more than ADR 0003 allows.

Where it would live: one exported constant beside `DG_SOURCE_NOTICE`, holding the source
revisions, the year the figures are aligned to, the valid-through date, where that date came from
and when it was retrieved. `DG_SOURCE_NOTICE`, the checklist and the declaration read it; a pure
`dgRulesLapsed(today)` mirrors `scheduleBIsStale`. A January revision then changes one record.
This is not the "ruleset as versioned data" the roadmap defers; it is one dated record.

Fit: inside the mission; it strengthens ADR 0003 without superseding it. Rule 14 applies (a
dangerous goods rule).

Decisions for the owner: warn or block once lapsed; the valid-through date and its source;
whether the stamp is printed on the declaration PDF or only on the checklist and screen.

### 4. ADR 0001 files net weight in boxes captioned for shipping weight

**Verdict: Confirmed**, with one correction to the review.

Receipts:

- `src/carriers/nippon-express/adapter.ts:196-208`: box 26 receives `line.weightKg` (net) unless
  `options.useGrossWeight` is set. `src/carriers/ceva/adapter.ts:265` writes `l.weightKg` and has
  no switch at all (statically reviewed).
- "Nothing sets them" is true of production code and false of the repository:
  `grep -rn "useGrossWeight\|grossWeightByRow" src` finds one use outside the adapter,
  `src/carriers/carriers.test.ts:249`, a test that exercises the switch (executed). The review's
  grep excluded tests and so could not see that the switch is covered. No screen, setting or
  store field reaches it.
- `src/carriers/sli-golden.test.ts:80,90,114` pins `1.700` (net) in both forms (statically
  reviewed; the suite passes in the baseline, executed).

The regulation (eCFR, as above): 15 CFR 30.6(a)(16), "The shipping weight is the weight in
kilograms, which includes the weight of the commodity, as well as the weight of normal packaging,
such as boxes, crates, barrels, etc." § 30.1(c) defines shipping weight as "the total weight of a
shipment in kilograms including goods and packaging". The premise holds: the EEI element is gross.

What that does and does not settle: the SLI is an instruction to the forwarder, and what reaches
AES is whatever the forwarder transmits. The regulation says what the EEI element means; it does
not say what these forwarders do with box 26. That is a question for them, and it is the owner's
to ask.

What a change would touch, without proposing one:

- If net stays: an advisory check in `checkDraft` saying a net figure is going into a box
  captioned for shipping weight, citing ADR 0001. Small, and consistent with the ADR.
- If gross is filed: ADR 0001 is superseded (the owner's say-so only); the Nippon switch is wired
  to a carrier setting and CEVA gains one; `sli-golden.test.ts` changes; and a per-row gross has
  to come from somewhere. Only the Vendor A layout prints one per line. The `SHIPMENT#` layout
  prints no weights and the in-house form prints a gross total only, so per-row gross for those
  would be an apportioned estimate. 30.6(a)(16) does allow estimates that total the actual
  shipping weight, but an apportioned figure is exactly what project rule 1 is wary of.

Decisions for the owner: ask the forwarders what they transmit from box 26; whether the advisory
check is wanted while the ADR stands.

### 5. No EEI-requirement check and no ITN on the shipment record

**Verdict: Confirmed.**

Receipts:

- `grep -rnw "ITN" src docs README.md roadmap.md` returns one match, in `docs/archive/` about the
  deleted monorepo. A case-insensitive search for `eei`, `noeei`, `30.37` and `2,?500` over
  non-test source returns nothing relevant. The same run finds `AES` in five files, so the search
  can match (executed).
- `src/store/local-store.ts:113-135`: `ShipmentRecord` has thirteen fields, none for an ITN, a
  filing date or an exemption (statically reviewed).
- Reprocessing: the record id is `${invoiceNumber}@${processedAt}`, keyed per run on purpose, and
  `invoiceNumber` is stored. The `LocalStore` interface has no lookup by invoice number; a caller
  would list shipments and filter. So reprocessing is **detectable from data already kept**, and
  nothing detects it today (statically reviewed).
- The keying sheet carries no EEI, ITN or exemption row (the greps above cover
  `src/carriers/keying-sheet/`).

The regulation (eCFR, as above): 15 CFR 30.37(a) exempts "commodities where the value of the
commodities shipped from one USPPI to one ultimate consignee on a single exporting conveyance
classified under an individual Schedule B number … is $2,500 or less", and adds: "Items of
domestic and foreign origin under the same commodity classification number must be reported
separately and EEI filing is required when either is over $2,500." The section's last amendment
is 90 FR 39122 (2025-08-14); § 30.6 was last amended at 91 FR 30486 (2026-05-26). The figure is
recorded here as retrieved, for the owner to confirm.

What the review missed:

- The exemption is tested **per Schedule B number and per D/F**. That is coarser than the tool's
  commodity rows, which are also split by ECCN, licence, SME and unit
  (`src/domain/reconcile/lines.ts:281-288`). Two rows of $1,500 under one Schedule B number and one
  D/F, differing only in ECCN, are $3,000 for the exemption. The check therefore has to sum the
  rows by normalised Schedule B number and D/F before comparing; a comparison per row would miss
  filings that are required. It also means item 2 comes first: a wrong D/F splits or merges value
  across the threshold.
- 30.37 opens "Except as noted in § 30.2(a)(1)(iv)". Licensed shipments, certain destinations and
  other cases require EEI whatever the value. A check may say "these rows exceed the threshold, so
  EEI is required". It must never say "no EEI is required", which would be an inferred compliance
  value (project rule 2). The advisory is one-directional.
- The four parts are not one change. (a) is a check and fits the mission. (b), (c) and (d) make
  the tool a record of filings, which `docs/product.md` does not describe: its mission is
  preparing paperwork. They need a line in product.md first.

Smallest change: (a) alone, as a warning-severity check naming the Schedule B and D/F totals over
the threshold and the rows that make them up, with
the threshold, its citation, the retrieval date and the eCFR currency date held as one dated
record. (b) to (d) wait on a product decision.

Decisions for the owner: confirm the threshold and citation; whether (b) to (d) belong in this
tool at all; if so, whether an ITN is typed after the fact on a saved shipment.

### 6. Remembered consignee values are reapplied without notice

**Verdict: Confirmed.**

Receipts:

- `src/App.tsx:321-331`: on a new document the saved `ConsigneeRecord` is read by the consignee
  name exactly as printed, and `consigneeId`, `consigneeType`, `partiesRelated` and
  `destinationCountry` are set on the new shipment's settings (statically reviewed). The comment at
  `src/App.tsx:312-318` explains why the ECCN is deliberately not carried.
- `src/store/local-store.ts:34-44`: the record holds `lastUsed`, so the date the review wants to
  show is already kept and never displayed (statically reviewed).
- No notice: `src/features/manual-fields.tsx:80-152` renders the four fields as ordinary inputs
  with static hints. A grep of `src/App.tsx`, `src/features/` and `src/components/` for
  `remember`, `carried`, `last used`, `previous shipment`, `autofill` finds comments and one
  unrelated history caption, and no text beside these fields. The same grep matches eleven other
  lines, so it can match (executed). The UI was not run.
- No check: `checkDraft` (`src/domain/draft.ts:285-350`) tests only that a destination country is
  present. Nothing concerns consignee type or related-party status (statically reviewed).

Against project rule 2: consignee type must come "from the document or from a person". A value a
person chose for an earlier shipment was chosen by a person, but not for this shipment, and the
screen does not distinguish it from one they just chose. The carried destination country also
silently outranks the document: `buildDraft` uses `settings.destinationCountry` before the
document's own (`src/domain/draft.ts:168`), so a consignee that ships to a second country files
the first.

See section 4, finding A: the same two fields are pre-answered by a default when there is no saved
consignee, which this item's fix should cover in the same change.

Smallest change: carry the values as before but mark each as "from the shipment of <lastUsed>",
and add a blocking `checkDraft` check that fails until the person confirms the consignee values
for this shipment. Confirmation is per shipment and not saved. Where the document states a
destination country and the carried one differs, the check says so.

Decisions for the owner: one confirmation for the group or one per field; blocking or warning;
whether a carried destination country should ever outrank the document.

### 7. The item library stores an import code that nothing validates

**Verdict: Confirmed.** Out of scope as written.

Receipts:

- `src/domain/item-library/index.ts:39-46`: `importCode` is documented as "kept for display and
  never used to file an export". It is read from the workbook (`:301`), decoded from the store
  (`src/store/decode.ts:109,116`) and shown as a column (`src/features/item-library.tsx:38`)
  (statically reviewed).
- `grep -rn -i "impaes\|htsus\|import concordance" src scripts docs README.md roadmap.md` returns
  one match, `README.md:287`, "It never converts an HTSUS number into a Schedule B number". The
  companion grep for `expaes` finds five files, so the search can match (executed).
- `roadmap.md:161` carries the 1,456 of 2,856 figure (statically reviewed; the figure itself is
  the owner's and unverified here).
- The export dataset for scale: `scripts/expaes.txt` is 1.77 MB raw and `public/data/schedule-b.json`
  1.07 MB for 9,746 codes (executed, `ls -la`). The import file's size was **not checked**; the
  HTSUS has roughly twice as many ten-digit lines, so expect a comparable second dataset.

What the refresh pipeline would need: a second fixed URL in `src-tauri/src/lib.rs`, a second
parser pinned against a checked-in raw file, a second dataset in `public/data/`, a second
staleness rule, and a second half to the revision diff. Each is a copy of something that exists.

Fit: this is the item that presses hardest on the product limits.

- Project rule 3 allows one network call and names it. A second file is a product decision.
- `docs/product.md` gives the tool one job: export paperwork. Validating import numbers is
  item-master hygiene for a different filing. The roadmap already says correcting the item master
  "is a separate effort".
- It would need a product.md change (mission or a new non-goal line), an ADR for the second
  network call, and a rule 14 plan.

A smaller change gets most of the value: the 1,456 flagged rows are already listed by part. Sorting
them into "ten digits, well formed, not in Schedule B" and "malformed" needs no new dataset and
tells the owner which rows are probably import numbers in the wrong column. That stops short of
calling any of them a valid HTSUS number, which is the honest limit without the import file.

Recommendation: drop as written. Take the smaller sort only if the cleanup is actually under way.

Decision for the owner: whether import-number validation belongs in this tool at all.

### 8. Library weights carry no record of how they were obtained

**Verdict: Confirmed.**

Receipts:

- `src/domain/item-library/index.ts:28-51`: an entry holds `netWeightKg`, `source` and
  `importedAt`. Nothing records a basis (statically reviewed).
- `source` is the imported file's name: `src/domain/item-library/index.ts:303`,
  `source: options.fileName` (statically reviewed).
- How supplied weights are reported today: where a layout prints no line weights, reconciliation
  checks that the supplied weights sum to the form's net total within a tolerance
  (`src/domain/reconcile/index.ts:839-853`) and blocks on a part with no weight (`:933`). Figures
  typed on the review screen are named in the "Commodity figures entered by hand" check (`:582`).
  A weight that came from the library is not named anywhere as a library weight, and nothing
  distinguishes a measured one from an estimate (statically reviewed).

Fit: inside the mission (rule 1: a figure's standing should be visible). Rule 14 applies because
`ItemLibraryEntry` is persisted; an old record without the field must still decode, with a test.

What the review missed: the basis is only as good as the column. The item master the owner
exports may have no such column, in which case this adds a field that is always blank. Worth
confirming the source system can supply it before building.

Smallest change: an optional `weightBasis` on the entry, read from a column when the heading
matches, absent otherwise; a warning naming the parts whose weight is marked estimated. No value
is inferred when the column is missing.

Decisions for the owner: does the item master have a basis column, and what values does it use;
are estimated weights a warning or just named.

### 9. Two small outputs

#### (a) Booking summary

**Verdict: Confirmed.** No copy-ready text exists; the fields mostly do.

`ShipmentHeader` (`src/domain/types.ts:173-212`) carries the invoice number, order numbers,
purchase orders, cartons, gross weight and the destination (resolved in `buildDraft`). What each
layout supplies (statically reviewed from the parsers and the header type; no real document was
read):

| Field | Vendor A | `SHIPMENT#` | In-house |
| --- | --- | --- | --- |
| Invoice number | yes | yes | yes |
| Sales order / PO numbers | yes | yes, separately | PO box |
| Destination country | usually | often absent (`draft.ts:57`) | from the address |
| Piece count | cartons | not stated | `# OF PIECES` |
| Gross weight | yes | no (`parse-vendor-b.ts:279`) | gross total |
| Dimensions | no | no | `DIMS / VOLUME` box, not parsed |

Dimensions are typed into `piecesAndDimensions` for every layout. The summary must leave a line
blank and say so where the layout states nothing, never fill it.

Fit: inside the mission, no network, no persisted shape, no filed figure. No rule 14 plan needed.
The Shipping Authorization form the owner supplied shows the fields a pickup request uses; a
summary should follow the forwarder's request, which the owner knows and this session does not.

Decision for the owner: the exact lines and their order.

#### (b) No-charge box

**Verdict: Confirmed for the workbook. Cannot verify here for a printed PDF.**

- The synthetic form prints the box in both shapes: `src/test/synthetic/inhouse-ci.ts:246`
  (workbook, a `☐` glyph in the cell text) and `:411` (PDF, `[ ]`) (statically reviewed).
- `grep -n -i "no.charge" src/domain/cipl/parse-inhouse-ci.ts` finds three comments and no code
  that reads the box (executed).
- The owner's blank Rev. C workbook holds the box the same way: the glyph is the first character
  of one cell's text, and the workbook contains no form-control parts (its archive lists one
  drawing, the logo). Ticking it means replacing the glyph by hand, so its state **is recoverable
  from the workbook**, provided the reader accepts whatever people type there (`☒`, `☑`, `X`, `x`).
- From a printed PDF it depends on whether the glyph survives in the text layer, which varies with
  the font and the print driver. The synthetic PDF's `[ ]` is this repository's stand-in, not what
  Excel prints. **Only a PDF printed from a real workbook settles it**, and that is one of the
  fixtures item 1 asks for.

Fit: inside the mission. Rule 2 applies in one direction: an unreadable box is "not stated", never
"unticked". Rule 14 applies if the attribute is saved on `ShipmentRecord`.

Smallest change: a three-state header attribute (ticked, unticked, not readable), shown on the
review screen and printed in the special instructions only if the owner wants it there. No value
changes.

Decisions for the owner: what the attribute should do downstream, if anything; whether it is saved.

### 10. Housekeeping

**Verdict: Confirmed.**

- `docs/ROADMAP_ENHANCEMENTS.md` was last touched at `af44f8d`, 2025-12-18, and describes batch
  booking, a vendor portal, carrier scorecards and denied-party screening: the monorepo removed on
  2026-07-27 (`roadmap.md`, project history). Each contradicts a non-goal in `docs/product.md`
  (executed for the log, statically reviewed for the content).
- `grep -rn "ROADMAP_ENHANCEMENTS"` over the repository finds four references, all in
  `docs/audits/2026-10-complete/`: the audit's finding 12.5 and the remediation plan's own task to
  move it to `docs/archive/` (`remediation-plan.md:763`). Nothing plans against it; the only plan
  that mentions it plans its removal (executed).

Smallest change: `git mv` to `docs/archive/`, as the remediation plan already says. The audit
documents are a dated record and keep their old path.

No decision needed.

## 4. What the review missed (the verifier's own findings)

These are this session's, not the review's. Each is statically reviewed unless it says otherwise.

**A. Consignee type and related-party status are pre-answered by a default.** Both SLI adapters
default `consigneeType: 'RESELLER'` and `partiesRelated: true`
(`src/carriers/nippon-express/adapter.ts:67-68`, `src/carriers/ceva/adapter.ts:57-58`);
`defaultShipmentSettings` falls back to `RESELLER` and `false` (`src/domain/draft.ts:100-101`).
The manual-fields screen offers the consignee type as a select with no unanswered option
(`src/features/manual-fields.tsx:139-150`). A shipment to a consignee never seen before therefore
files "Reseller, related parties" without anyone choosing it, and no check notices. `README.md:292`
says the tool never infers consignee type or related-party status, and project rule 2 says
consignee type comes from the document or a person. This is the same defect the DG workflow fixed
in "Nothing pre-answered" (`docs/changes/2026-10-19-dg-entries-start-unanswered.md`). It is more
direct than item 6 and belongs in the same change. Whether the defaults reflect a real, constant
relationship for the current exporter is the owner's to say; if so, that belongs in the exporter
profile as a stated choice, not in the adapter.

**B. `docs/testing.md` carries a count that does not reproduce** (item 1). The fix is one line,
with the note that the command needs a full clone.

**C. `domesticForeign('')` answers `F`.** Two call sites work around it (item 2). The function's
contract is the defect; the guards are the symptom.

**D. The carried destination country outranks the document** (item 6): a setting meant for layouts
that state no country overrides a layout that states one.

**E. The remediation plan's M2 task to archive `ROADMAP_ENHANCEMENTS.md` is still open** (item 10),
so AGENTS.md's "current plan" has at least one unfinished task the roadmap does not show.

## 5. Suggested order

By what a wrong form costs and what has a date on it:

1. **Item 3**: the only one with a deadline (2027-01-01).
2. **Item 2**: a filed compliance value with no way to correct it.
3. **Item 6 with finding A**: filed compliance values nobody chose.
4. **Item 5(a)**: after item 2, because the threshold is per D/F row.
5. **Item 10**, **9a**, **9b**, **8**: small, in any order.
6. **Item 4**: the advisory check now; the rest waits on the forwarders.
7. **Item 1**: the loader change whenever the owner has the in-house documents to hand.
8. **Item 7**: drop as written.
