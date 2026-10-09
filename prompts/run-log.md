# Prompt run log

One row per run of a project prompt (`new-project.md`, `existing-project.md`), newest last. The
day-to-day prompts (`discovery.md`, `investigate.md`, `review.md`, `pre-pr.md`) aren't logged
here; the PR, issue, or discovery pass they lead to is their record. The point is
recoverability: six months after a stack was chosen or an audit was executed, this is the
fastest path back to what was actually asked, what came out of it, and which references were
current at the time.

Add a row when a run starts, and fill in the outcome columns when it finishes. If a run was
abandoned, say so and why — an abandoned run is often more informative than a clean one.

| Date | Prompt | Target | Inputs (summary) | Outputs | References verified? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| _yyyy-mm-dd_ | new / existing | repo or app name | one line: what was asked for, key constraints | files or milestones produced | yes (date) / skipped — offline / partial | what changed in the prompt as a result, open items |
| 2026-10-08 | existing | FormWaypoint (template main 9ed3142, packs node, vite-spa, tauri) | Complete means: a shipper at Omron installs on Windows, gets updates without reinstalling, and never files a wrong figure on an SLI. $0 budget, no backend, no customer data in the repo; DG assumed out of scope. Plan only: stop before Milestone 1 for the owner's go. | `docs/audits/2026-10-complete/` (reference-verification.md, audit.md, remediation-plan.md); 62 findings (3 blockers: 5.1, 6.1, 8.1) | yes (2026-10-08): no listed reference fits; Tauri, ESLint and pdf.js official sources used | Prompt gaps for the template: §8 asks about secrets in history but not data reachable through pull-request refs, which squash merges leave public after `main` is clean (found 8.1 here); `check:conformance` skips core.license when visibility isn't declared, though the host API states it. Open: owner's go on D1 and Milestone 1, workflows 11 and 12, the signing route, the net-vs-gross rule. |

## Longer write-ups

When a run produces reasoning that won't fit in a row — a rejected stack, a migration that was
considered and declined, an audit finding that reshaped the plan — write it up as an ADR in this
repo's decision records (`docs/adr/` in the layout the skeletons use, or wherever the repo
already keeps them) and link the ADR from the row. Keep this table scannable.
