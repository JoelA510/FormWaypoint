---
trigger: always_on
---

# Workflow Triggers (Decision Matrix)

**Usage**: Consult this table at the start of every plan. If the User's request or current State matches a "Trigger Condition", **recommend or execute** the corresponding Workflow.

| Trigger Condition (User Intent / Context) | Workflow to Invoke | Rationale |
| :--- | :--- | :--- |
| **New Task / Roadmap**<br>User says "What's next?" or finishes a task. | /00-auto-roadmap | Enforces roadmap priority; prevents "cherry-picking". |
| **New Feature Request**<br>User asks to "Add X" or "Implement Y". | /01-feature-injection | Ensures architecture constraints are checked *before* coding. |
| **High Risk Change**<br>Task involves Auth, RLS, Migrations, or Payment logic. | /02-test-plan | "Measure twice, cut once" for critical systems. |
| **"Clean up the mess"**<br>User notes quality issues or requests a health check. | /03-debt-audit | Separates discovery (Audit) from action (Fix). |
| **Fixing a Debt Item**<br>Addressing a specific line from DEBT_REPORT.md. | /04-surgical-refactor | Keeps refactors atomic and reversible. |
| **Persistent Failure**<br>A test or build command fails 2+ times in a row. | /05-debug-loop-5 | Prevents infinite context loops/hallucinations. |
| **Pre-PR / "I'm Done"**<br>Feature is complete, verified, and ready for review. | /06-pre-pr-docs | Ensures docs (README/Roadmap) never drift from code. |
| **Self-Review**<br>Before asking User to review or merge. | /07-pre-pr-review | Catches low-hanging fruit (console.log, types) early. |
| **UI/CSS Work**<br>After touching .jsx or .css files. | /08-design-system-migration | Enforces Rule 30 (Design Standards) programmatically. |
| **Frontend Logic Change**<br>After modifying React components or Hooks. | /09-browser-verification | Verifies "Golden Paths" (Login -> Dash -> Board) still work. |
| **"Big Release" / Converge**<br>Preparing for major version or full cleanup. | /10-master-review-orchestrator | Runs the full loop: Audit -> Fix -> Design -> Verify -> Docs. |
| **Reviewing External PR**<br>User asks you to review a GitHub PR. | /11-remote-pr-review | Applies internal Engineering Standards to external code. |
| **Starting GitHub Issue**<br>User links an Issue # or asks to start one. | /12-start-feature | Reduces admin overhead (Branch, Assign, Plan). |
| **Tracking Debt**<br>User wants to move Audit items to GitHub. | /13-debt-sync | Shifts debt tracking to where work happens. |
| **Tricky Bug Solved**<br>You just fixed a complex/novel issue. | /14-log-lesson | Prevents regression; shares knowledge with future Agents. |
