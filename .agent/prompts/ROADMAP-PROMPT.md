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
6. **Check the tail sections**: "Open questions" and "Known residue" go stale quietly. If a change resolved one, remove it and say so in Project History; if it changed the trade-off, rewrite the reasoning.

## Output Requirements

- [x] **Update discipline**: Ensure the "Last Updated" date is changed.
- [x] **Strict Adherence**: Follow the definitions in the template below.
- [x] **No Optimism**: Do not mark things as "Done" unless they are in the codebase.
- [x] **Name consistency**: Do not rename existing milestone rows; a reader tracking a feature across revisions needs the name to hold still.

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
- Numbers are claims: test counts, dataset sizes and command counts must be checked
  against the code before they are written down, not carried forward from the last edit.
- Do not remove completed items; keep history visible (or move to a History section).
-->

# FormWaypoint Roadmap

**Last Updated**: YYYY-MM-DD

## Current focus

<Two short paragraphs: what the tool does today and how far it goes, then what the
remaining planned work has in common and whether anything blocks it.>

## Milestone tracker

One row per capability, in the order it was built. Never delete a row; a shipped feature
stays visible.

| Feature | Status | Description |
| :--- | :--- | :--- |
| **<Name>** | ✅ Done / 🚧 In Progress / 📅 Planned | <What it does, and the detail that makes it non-obvious.> |

## <Deep dive sections, as needed>

Where a mechanism needs more than a table row to be understood — how the Schedule B refresh
works, why a change log has two scopes — give it its own section. Explain the reasoning,
not just the behaviour.

## Open questions

Decisions deliberately left open, with the reason. Not a to-do list.

- **<Question>.** <What is unresolved, what the current default is, and why.>

## Known residue

Things that are wrong or unresolved and are staying that way for now, with the reasoning
that makes it a defensible trade rather than neglect.

## Project history

| Date | Milestone | Details |
| :--- | :--- | :--- |
| YYYY-MM-DD | **<Name>** | <What shipped.> |
```
