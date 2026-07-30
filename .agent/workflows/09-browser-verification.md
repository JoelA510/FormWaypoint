---
description: Verify the golden path end to end in a real browser, and check the UI against Rule 30.
trigger: After any UI refactor, feature addition, or manual request to 'Verify App'.
---

# Workflow: Browser Verification & Golden Path

## Phase 0: Know what this project tests with

Before touching anything, understand the existing setup rather than assuming a stack:

- Vitest runs in the **`node`** environment (`vitest.config.ts`). The domain layer is pure
  TypeScript and the PDF parser runs against pdfjs' Node build. A test that needs a DOM
  opts in per-file with `// @vitest-environment jsdom`.
- There are **no component tests and no `@testing-library` dependency**, and that is a
  choice, not a gap. The risk in this tool is a wrong value on a signed form, not a
  mis-rendered button, so the test budget goes to the domain layer.
- **Do not install a testing-library stack, switch the global environment to jsdom, or
  scaffold a `golden-paths.test.tsx` to satisfy this workflow.** If a UI behaviour
  genuinely needs a regression test, add one jsdom-scoped file and say why.

## Phase 1: The golden path

There is one journey and it is linear. No login, no dashboard, no routing — the app is a
single screen that advances.

| Step | Feature | What must hold |
| :--- | :--- | :--- |
| 1. Upload | `src/features/upload-panel.tsx` | A CIPL is accepted, its format is detected, and the detected format is named on screen. A PDF matching no format fails loudly. |
| 2. Review | `src/features/review.tsx` | Every commodity row shows its provenance: proved against the document, or supplied. Blocking and advisory checks are visually distinct (Rule 30). |
| 3. Manual fields | `src/features/manual-fields.tsx` | The values no document carries — consignee type, routed-export status, origin — are asked for, never guessed. A blank one blocks. |
| 4. Output | `src/features/output-panel.tsx` | Generation is refused while any blocking check stands. On success the form downloads (browser) or reports its saved path with an Open button (desktop). |

Two side paths, each reachable from the main screen:

- **Item library** (`src/features/item-library.tsx`) — import, weight-unit confirmation,
  and the bad-commodity-number list by part number.
- **Schedule B refresh** (`src/features/schedule-b-refresh.tsx`) — desktop only; the
  staleness badge, and the change log written before the dataset is replaced.

## Phase 2: Execution

1. **Run the gate**: `npm run check` — typecheck, lint, tests, production build.
2. **Expect skips.** A clean checkout runs 200 tests and skips 122; those need the shipment
   PDFs, which are never committed. Skips here are a pass, not a failure to chase.
3. **Serve it**: `npm run dev` (browser) or `npm run desktop:dev` (needs a Rust toolchain).
   The desktop-only behaviours — Schedule B refresh, saved output paths — cannot be
   verified in a browser at all. Say so rather than reporting them as passing.

## Phase 3: Adversarial pass

Drive the running app and look for what a headless run cannot see: overlapping text, broken
z-index, unclickable controls, layout shift when a long consignee address wraps, a check
badge whose colour does not survive dark mode.

Walk it as a filer, not as a developer: upload a CIPL, correct something on the review
screen, try to generate with a required field blank, then fill it and generate.

## Phase 4: Design regression check

Scan changed components for the failure Rule 30 exists to prevent — a raw Tailwind colour
class where a token belongs:

```bash
grep -rnE "\b(text|bg|border|ring)-(slate|zinc|gray|blue|red|amber|emerald|green)-[0-9]{2,3}\b" src --include="*.tsx"
```

Any hit is a defect: raw palette classes are invisible to the dark-scheme block in
`src/styles/globals.css` and will read correctly in one scheme and wrongly in the other. The
correct form is `text-[var(--color-ink-soft)]`, `bg-[var(--color-surface)]`,
`border-[var(--color-block)]`. Verify against
[`.agent/rules/30-design-standards.md`](../rules/30-design-standards.md) before correcting.

## Phase 5: Reporting

- ✅ **Golden path**: [Pass/Fail] — which steps were walked, in which build
- ✅ **`npm run check`**: [Pass/Fail] — tests run / skipped
- ✅ **Design compliance**: [Pass/Fail] — raw-palette hits found
- 📝 **Fixes applied**: what was corrected during the run
- ⚠️ **Not verified**: anything desktop-only that was skipped, said plainly
