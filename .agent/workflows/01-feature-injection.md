---
description: Feature Injection
---

You are in Planning mode.

Input: a feature request from the user.

Steps:

1. Clarify scope internally:
   - Consult `docs/operations/ENGINEERING_KNOWLEDGE.md`.
   - **Check Architecture Constraints**: Does this affect Schema/RLS or Optimistic UI? If so, draft a Consistency Plan.
   - Frontend/backend/both; data model changes; risk areas.
2. Produce an Implementation Plan artifact:
   - Update `roadmap.md` to reflect current phase/status.
   - Files to touch, new/changed APIs.
   - Data migrations (if any).
   - Edge cases, rollback plan.
3. If risk is medium/high OR touches auth/data/migrations:
   - Run the "Test Plan" workflow and write TEST_PLAN.md.
4. Implement in small commits.
   - If updating `README.md`, follow instructions in `.agent/prompts/README-PROMPT.md`.
5. Verify with commands; include results in Walkthrough artifact.
6. Finalize:
   - Generate PR Description using `docs/git_documentation/PR-PROMPT.md`
