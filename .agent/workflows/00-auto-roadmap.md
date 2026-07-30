---
description: Auto-Advance Roadmap
---

Use this workflow to automatically identify and begin the next priority item from the project roadmap.

## 1. Identify Next Target

1. **Read Roadmap**: Read `roadmap.md`.
2. **Select Item**:
   - Look for the first item marked `🚧 In Progress`.
   - If none, look for the first item marked `📅 Planned` in the earliest active Phase.
3. **Confirm**: State the selected milestone name (e.g., `More CIPL formats`) to the user.

## 2. Execute Feature Injection

(This mirrors the standard Feature Injection workflow, but pre-filled with the selected item)

1. **Clarify Scope**:
   - Read `docs/operations/ENGINEERING_KNOWLEDGE.md`.
   - **Architecture Check**: Does this item (`[Selected Item]`) affect what is proved against the source document, what a carrier adapter writes into a box, or the shell's native surface?
   - drafted Consistency Plan if needed.
2. **Plan**:
   - Create `implementation_plan.md`.
   - Update `roadmap.md` status to `🚧 In Progress`.
3. **Implement**:
   - Write code in small, verifiable steps.
4. **Verify**:
   - Run `npm test`.
   - Create `walkthrough.md`.
5. **Finalize**:
   - Run `/07-pre-pr-review` (Pre-PR Review Workflow).
   - Generate PR Description.

## 3. Completion

- Mark item as `✅ Done` in `roadmap.md`.
- Ask user if they want to proceed to the _next_ item.
