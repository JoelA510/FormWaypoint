# Engineering Knowledge

Lessons that cost something to learn, kept so they are not re-learned. Four workflows write
here — `00-auto-roadmap`, `06-pre-pr-docs`, `10-master-review-orchestrator` and
`14-log-lesson` — so the format is fixed:

```
## [CATEGORY-NNN] Title

- **Tags**: #tag #tag
- **Date**: YYYY-MM-DD
- **Context & Problem**: what went wrong, under what conditions
- **Solution & Pattern**: what fixed it and why
- **Critical Rule**: the one-liner a future change has to respect
```

Categories in use: `PARSE`, `DESKTOP`, `COMPLIANCE`, `DOCS`.

---

## [PARSE-001] A document that parses is not a document that parsed correctly

- **Tags**: #parser #cipl #fixtures
- **Date**: 2026-07-30
- **Context & Problem**: Shipment K78541WH printed three things no other fixture did — a
  line block split by a page break, weights printed divided (`(@ / 6)`), and a commodity
  heading stranded at the foot of a page. All three were found by running the packaged app
  against a real shipment, not by the suite. All three failed *silently*: the parser
  produced fewer or wrong lines and the error surfaced later, as a blocking totals check.
- **Solution & Pattern**: The blocking checks did their job — nothing wrong was ever
  filed — but a blocked shipment is still a shipment nobody can file. K78541WH became a
  fixture with its own suite (`src/domain/cipl/parse-omron-pagebreak.test.ts`).
- **Critical Rule**: A new layout is not supported until a real document of that layout is
  a fixture. "It reconciles" is not evidence; "it reconciles to the totals the document
  prints" is.

## [DESKTOP-001] Handing bytes to the webview loses the file

- **Tags**: #desktop #tauri #output
- **Date**: 2026-07-30
- **Context & Problem**: The filled SLI was delivered as a blob download. That is the only
  route a browser has, but on the desktop it meant the app gave the bytes away and learned
  nothing back: not the folder, not the final name, not whether the write succeeded. Where
  the file landed was the webview's decision — the process working directory on Linux,
  somewhere unannounced on Windows. A runthrough left a keying sheet sitting untracked in
  the repository working directory, which is how this was noticed at all.
- **Solution & Pattern**: Two shell commands instead. `save_output` writes and returns the
  full path; `open_output` opens a path it wrote. The panel reports where the file went.
  `unique_path` suffixes rather than overwriting, because the earlier copy may already be
  signed.
- **Critical Rule**: If the app cannot answer "where did that file go?", it has not
  finished the job. Prefer a few lines of `std` over a plugin: the shell's stated property
  is that its whole native surface is auditable in one file.

## [COMPLIANCE-001] Never learn a classification from a historical form

- **Tags**: #compliance #schedule-b #overrides
- **Date**: 2026-07-30
- **Context & Problem**: One sample shipment was filed with `8483.10.5000` ("transmission
  shafts and cranks") against a cable assembly. Any mechanism that treated past filings as
  training data would have repeated that error indefinitely, with each repetition looking
  like more evidence.
- **Solution & Pattern**: The number filed is always the one on the CIPL. Changing it takes
  an explicit override carrying a reason and an approver, and the override is still
  challenged when it does not fit the goods.
- **Critical Rule**: History is a record of what was done, not evidence of what is correct.
  An export declaration is signed under penalty; nothing here may infer a value the
  document does not state.

## [DESKTOP-002] census.gov cannot be fetched from a page, at any packaging

- **Tags**: #desktop #schedule-b #cors
- **Date**: 2026-07-30
- **Context & Problem**: The Schedule B refresh looked like frontend work. It is not:
  `https://www.census.gov/.../expaes.txt` returns no `access-control-allow-origin` header,
  so a `fetch` from the webview is blocked no matter how the app is packaged.
- **Solution & Pattern**: The download runs in Rust (`fetch_concordance`). The parse, diff
  and change-log rendering stay in TypeScript as pure logic, pinned against the checked-in
  raw file so they cannot drift from `scripts/build-schedule-b.mjs`. The change log and CSV
  worklist are written *before* the dataset is replaced, so a refresh that fails mid-way
  can never leave a swapped dataset with no record of what moved.
- **Critical Rule**: Check the response headers of a third-party source before designing
  around it. And when a refresh mutates data somebody relies on, write the audit trail
  first and the change second.

## [DOCS-001] Documentation drifts hardest after an architecture is deleted

- **Tags**: #docs #agent-rules
- **Date**: 2026-07-30
- **Context & Problem**: When the monorepo was removed in favour of the client-side
  pipeline, the code was replaced but much of the documentation was not re-derived. Agent
  rules kept prescribing a Tailwind palette this codebase does not use, a workflow tested a
  dashboard and a task board that do not exist, and a README prompt still asked for a
  Database Schema section. These are worse than merely stale: an agent following them
  introduces the very defects the rules exist to prevent.
- **Solution & Pattern**: Treat `.agent/` as code with a compilation step nobody runs.
  Every number in a document is a claim to re-check against the source; every path
  mentioned is a link to verify.
- **Critical Rule**: When an architecture is deleted, the docs describing it are deleted or
  rewritten in the same change. A banner on a stale document still costs a reader the time
  to dismiss it.
