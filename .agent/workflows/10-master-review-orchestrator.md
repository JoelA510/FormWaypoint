---
description: Master Orchestrator - Runs Debt Audit, Refactoring, Verification, and Documentation in a converged loop.
trigger: Manual request to "Run Master Review" or before major releases.
---

# Workflow: Master Review Orchestrator

This workflow acts as the "Manager," orchestrating the execution of specialized workflows to ensure the codebase is clean, verified, and documented before a release or PR.

---

## Phase 1: The Debt Cleanup Loop (Fixing the Past)

**Goal:** Identify and fix all technical debt items before attempting validation.

1. **Run Debt Audit:**
   - Execute **Workflow 03** (`.agent/workflows/03-debt-audit.md`).
   - **Output:** `DEBT_REPORT.md`.

2. **Surgical Remediation Cycle:**
   - **Read** `DEBT_REPORT.md`.
   - **Loop**: For _every_ item listed in the report:
     1. Execute **Workflow 04** (`.agent/workflows/04-surgical-refactor.md`) passing the specific debt item as input.
     2. Verify the specific fix works.
   - **Repeat** Step 1 (Audit) and Step 2 (Remediation) until `DEBT_REPORT.md` returns **0 critical/correctness/maintainability issues**.

---

## Phase 2: The Quality Convergence Loop (Ensuring Correctness)

**Goal:** Iterate between design, behavior, and code standards until all checks pass simultaneously.

**Start Loop:**

1. **Design Standardization (Workflow 08):**
   - _Condition:_ Run this step **ONLY IF** the Debt Audit or Remediation involved changes to UI components or CSS.
   - Execute **Workflow 08** (`.agent/workflows/08-design-system-migration.md`) to align UI with Rule 30.
   - Auto-correct any detected "drift" (e.g., hardcoded hex values, wrong shadows).

2. **Browser Verification (Workflow 09):**
   - Execute **Workflow 09** (`.agent/workflows/09-browser-verification.md`).
   - **Check**: Did "Golden Paths" pass? Did "Design Regression Check" pass?
   - _If Fail:_ Fix the immediate issue and **restart Phase 2**.

3. **Code Review & Security Scan (Workflow 07):**
   - Execute **Workflow 07** (`.agent/workflows/07-pre-pr-review.md`).
   - **Check**: Are there any blocking findings in `code_review_draft.md`?
   - _If Fail:_ Fix the violations and **restart Phase 2**.

**End Loop:** Proceed only when Workflows 07, 08, and 09 all pass sequentially without requiring changes.

---

## Phase 3: Documentation & Release Prep (Updating the Record)

**Goal:** Update all project documentation to reflect the work done since the last cycle.

1. **Gather Context:**
   - Identify the scope of changes made during Phase 1 (Refactors) and Phase 2 (Fixes).
   - **Note (Activity Log Window):**
     - For the **initial run**: Log all activity since the last PR merge in the repo as a stand-in.
     - For **subsequent runs**: Log all activity since the previous run of this Master Workflow.

2. **Execute Documentation Update:**
   - Execute **Workflow 06** (`.agent/workflows/06-pre-pr-docs.md`).
   - **Verify Outputs:**
     - `ENGINEERING_KNOWLEDGE.md` has new patterns/bugs logged.
     - `roadmap.md` is updated (Done/In Progress).
     - `README.md` structure is accurate.
     - `PR_DESCRIPTION_DRAFT.md` is generated and high-quality.

---

## Final Output

- **Status:** ✅ Ready for PR / Release
- **Artifacts:**
  - Clean `DEBT_REPORT.md`
  - Passing `code_review_draft.md`
  - Passing Test Suite (Golden Paths)
  - `PR_DESCRIPTION_DRAFT.md`
