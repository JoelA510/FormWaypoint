# Roadmap Update Prompt

## Your Task

You are a Technical Product Manager updating the project roadmap based on recent engineering progress. Your goal is to maintain a high-level view of "What is done" vs "What is next", ensuring the document is always accurate to the current state of the code.

## Instructions

1. **Review the Changelog/Diffs**: Understand exactly what features or fixes were just delivered.
2. **Date Check**: Always update the **"Last Updated"** date at the top of the file.
3. **Update Statuses**:
   - Change 📅 (Planned) to ✅ (Done) if the feature is fully implemented and verified.
   - Change 📅 to 🚧 (In Progress) if partial work is committed.
4. **Refine "Current Focus"**: Update the header summary to reflect what the team should look at next.
5. **Add History**: If a major milestone was reached, consider adding a row to "Project History".
6. **Verify Workflows**: Check section "2. UX Workflows & Status". If a previously broken or partial workflow is now working, update it.

## Output Requirements

- [x] **Update discipline**: Ensure the "Last Updated" date is changed.
- [x] **Strict Adherence**: Follow the definitions in the template below.
- [x] **No Optimism**: Do not mark things as "Done" unless they are in the codebase.
- [x] **ID Consistency**: Do not change the IDs (e.g., `P5-REPORT-UI`) of existing items so we can track them.

---

```markdown
<!--
ROADMAP CONTRACT (keep this block at the top)

Scope:
- This document allows Product Owners and Developers to track high-level progress.
- It is the SINGLE SOURCE OF TRUTH for "What are we building?"

Update discipline:
- Update "Last Updated" date on every edit.
- Mark items as ✅ (Done), 🚧 (In Progress), 📅 (Planned), or ❌ (Skipped).
- Do not remove completed items; keep history visible (or move to a History section).
-->

# FormWaypoint Roadmap & History

**Last Updated:** YYYY-MM-DD
**Current Focus:** <One-line summary of current priority>

---

## 1. Project History

A chronological overview of major eras.

| Era        | Timeline | Key Milestones                                 |
| :--------- | :------- | :--------------------------------------------- |
| **<Name>** | <Date>   | **<Theme>**: Summary of valid accomplishments. |

---

## 2. UX Workflows & Status

The core user journeys identified in the codebase.

### <Category Name>

| Workflow            | Status               | Notes                               |
| :------------------ | :------------------- | :---------------------------------- |
| **<Workflow Name>** | <Emoji> **<Status>** | Key technical detail or limitation. |

---

## 3. Future Roadmap

Remaining phases from the original plan.

### Phase X: <Theme>

_Goal: <One sentence goal>_

#### X.1 <Feature Name>

- **ID:** `<ID-TAG>`
- **Goal**: <Specific outcome>
- **Status**: <Emoji status>
```
