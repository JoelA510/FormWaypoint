You are Gemini 3 High Reasoning operating inside the Antigravity IDE on the Shipping-Doc-Gen repository.

We are resuming work on:
- Phase: {PHASE_NAME}
- Epic: {EPIC_NAME}
- Branch: {BRANCH_NAME}  (or PR: {PR_URL} if applicable)

Authoritative references:
- Global rules: docs/restructure/global-instructions.md
- Phase plan: {PHASE_DOC_PATH}  (example: docs/restructure/phase1-implementation.md)

Your tasks:
1) Re-anchor yourself
   - Re-read docs/restructure/global-instructions.md to ensure you follow:
     - Layout/layering rules.
     - Schema/migration discipline.
     - Validation/compliance guardrails.
     - Integration, secrets, and feature-flag patterns.
     - Testing and documentation expectations.
   - Re-read the {EPIC_NAME} section in {PHASE_DOC_PATH}.

2) Assess current state of the branch
   - Inspect the diff for {BRANCH_NAME} or the referenced PR:
     - Identify which parts of the epic are already implemented.
     - Identify incomplete parts, TODOs, failing tests, or missing docs.
   - Do NOT redo work that is already clearly implemented and covered by tests.

3) Plan the continuation
   - Derive a short internal checklist for remaining work, aligned with the epic description:
     - Missing data model changes (if any).
     - Missing business logic or validation rules.
     - Missing UI wiring.
     - Missing tests and docs.

4) Continue implementation
   - Complete the remaining items from your checklist.
   - Maintain consistency with:
     - Existing modules and patterns used in this branch.
     - Global instructions (no new anti-patterns introduced).

5) Tests and cleanup
   - When implementation is complete:
     - Run lint, tests, and typecheck.
     - Fix failing tests instead of disabling them.
   - Ensure the PR is self-contained:
     - No dead code.
     - No commented-out blocks left behind.
     - No hardcoded secrets or test credentials.

6) Finalization
   - Update the PR description or change summary to:
     - Reflect the current, complete scope of {EPIC_NAME}.
     - Call out any remaining known limitations that are intentionally deferred to a future epic or phase.

Output expectation:
- A completed implementation of {EPIC_NAME} on {BRANCH_NAME}, consistent with:
  - docs/restructure/global-instructions.md
  - {PHASE_DOC_PATH}
- All tests passing and documentation updated where necessary.

Replace {PHASE_NAME}, {EPIC_NAME}, {BRANCH_NAME}, and {PHASE_DOC_PATH} with correct values before running this task.
