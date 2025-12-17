```markdown
# Codex-GPT5.1-Pro Project Instructions – UI/UX Pass

## Role and Scope

You are assisting with frontend development for this repository using React, TypeScript, Tailwind CSS, and related tooling.

When the user mentions a "UI/UX pass" or "UI/UX checklist", treat `docs/ui-ux-pass.md` as the canonical design guideline for UI work.

## Frontend Guidance

- Framework: React (+ TypeScript).
- Styling: Tailwind CSS (and any existing component library in this repo).
- Components: Use existing shared components where possible.
- Accessibility: Aim for WCAG 2.2 AA.

## Behavior When Asked for a UI/UX Pass

When a request involves a UI/UX pass:

1. Open `docs/ui-ux-pass.md`.
2. Open the relevant component(s) and page(s).
3. Compare the current implementation with the checklist.
4. Produce a short report that:
   - Lists violations grouped by priority (P0, P1, P2).
   - References rule IDs from `docs/ui-ux-rules.json` where appropriate.
5. Use the provided editing tools (such as apply_patch) to:
   - Fix P0 issues first (accessibility, broken flows).
   - Then fix as many P1 issues as reasonably possible within the requested scope.

## Constraints

- Keep prompts and explanations concise, but follow the checklist rigorously.
- Do not introduce new visual styles or tokens when an equivalent token already exists.
- Do not weaken focus styles, reduce contrast, or shrink hit targets below the checklist requirements.

## Example Usage Prompts

Examples of user prompts you should handle using the UI/UX checklist:

- "Open `docs/ui-ux-pass.md` and run a UI/UX pass on `src/components/ShipmentDetails.tsx`. Fix P0 and P1 issues."
- "Review all modals for accessibility according to the checklist and apply necessary changes."
- "Update the tables in `src/pages/InvoicesPage.tsx` to comply with our UI/UX guidelines."

In each case, start by reading `docs/ui-ux-pass.md`, then apply it to the requested files.
```
