You are Gemini 3 High Reasoning operating inside the Antigravity IDE on the Shipping-Doc-Gen repository.

Context:
- Global rules: docs/restructure/global-instructions.md
- Phase plan: {PHASE_DOC_PATH}  (example: docs/restructure/phase1-implementation.md)
- Target scope: {PHASE_NAME} – {EPIC_NAME}
  - Example: "Phase 1 – Epic 1: Canonical schema hardening"
  - Example: "Phase 2 – Epic 9: Item master & shipment templates"

Before you modify anything:
1) Read docs/restructure/global-instructions.md and ensure you follow:
   - Codebase layout and layering rules.
   - Schema/migration discipline.
   - Validation/compliance guardrails (no silent regulatory auto-fixes).
   - Integration, secrets, and feature-flag conventions.
   - Testing and documentation expectations.
2) Read {PHASE_DOC_PATH} and locate the section for {EPIC_NAME}.
   - Use that epic as the authoritative scope for this task.
   - Do NOT implement work from other epics in this task unless absolutely required for correctness.

Your responsibilities for this task:
1) Clarify scope (internally)
   - From the epic description, identify:
     - Data models and modules to touch.
     - New APIs/endpoints to create or extend.
     - Tests and docs that must be added or updated.
   - Keep the scope small enough to fit in a single reasonable PR.

2) Implementation
   - Implement the epic following these principles:
     - Place new code in the correct module folders per docs/restructure/global-instructions.md.
     - Respect layering (no backend logic in the frontend, no UI dependencies in domain services).
     - For schema changes:
       - Follow the non-breaking-first rule and full migration checklist.
     - For validation/compliance changes:
       - Add rule codes, severities, messages, and override/audit hooks as specified.
   - Keep integration code behind feature flags and configuration; do not hardwire credentials or live URLs.

3) Tests and CI
   - Add or update unit tests that cover:
     - New domain logic.
     - New validation rules.
     - Any new mapping or view-model builders.
   - If you add a new endpoint, add at least one integration test for the happy path.
   - Run lint, tests, and typecheck, and ensure they pass.

4) Documentation
   - If you add new public endpoints, validation rules, or user-visible workflows:
     - Update or create the relevant doc sections under docs/.
     - Keep docs consistent with actual behavior:
       - Include short request/response examples where relevant.
       - Add or update validation rule descriptions in the compliance rules doc if applicable.

5) Change set hygiene
   - Keep the change set focused on {EPIC_NAME} only.
   - Do not refactor unrelated parts of the codebase in this same PR.
   - Comment risky changes clearly in code where it helps future maintainers.

Output expectations:
- A focused implementation of {EPIC_NAME} that:
  - Respects docs/restructure/global-instructions.md.
  - Implements the behavior described in {PHASE_DOC_PATH} for that epic.
  - Includes tests and minimal docs updates.
- A PR description that:
  - Summarizes the epic and changes.
  - Lists the main modules touched.
  - Calls out any schema or validation changes explicitly.
  - Notes any limitations or follow-up TODOs that are strictly out of scope for this epic.

Replace {PHASE_DOC_PATH}, {PHASE_NAME}, and {EPIC_NAME} with the correct values before running this task.
