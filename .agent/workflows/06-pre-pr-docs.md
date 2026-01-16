---
description: Pre-PR documentation update - updates README, roadmap, PR description, and engineering knowledge
---

// turbo-all

# Pre-PR Documentation Workflow

This workflow updates all project documentation before creating a Pull Request. Run this after completing feature work and before pushing/opening a PR.

---

## Step 1: Gather Context

Before making any updates, collect the information needed:

1. **Get the Git diff summary**:

   ```bash
   git diff --stat HEAD~10
   git log --oneline -10
   ```

   > **Critical**: To avoid recency bias, if you are working on a long-running branch or PR, verify against the full `.diff` or `.patch` (e.g., from the GitHub PR URL) to ensure you capture _all_ changes, not just the recent ones.

2. **Identify modified files and features** by reviewing the recent commits.

3. **Note any lessons learned** during this work (bugs encountered, patterns discovered, gotchas to avoid).

---

## Step 2: Update ENGINEERING_KNOWLEDGE.md

**File**: `docs/operations/ENGINEERING_KNOWLEDGE.md`

If any non-trivial bugs were fixed or new patterns were established:

1. Add a new entry using the format: `## [CATEGORY-NNN] Title`
2. Include:
   - **Tags**: Relevant hashtags (e.g., #database, #react, #rls)
   - **Date**: Current date
   - **Context & Problem**: What went wrong or what challenge was faced
   - **Solution & Pattern**: What fixed it and why
   - **Critical Rule**: One-liner takeaway for future developers

> **Skip if**: No novel bugs or patterns were encountered.

---

## Step 3: Update roadmap.md

**File**: `roadmap.md`
**Prompt Reference**: `.agent/prompts/ROADMAP-PROMPT.md`

1. Update the **"Last Updated"** date at the top.
2. Review roadmap items affected by this PR:
   - Change 📅 (Planned) → ✅ (Done) if fully implemented and verified
   - Change 📅 → 🚧 (In Progress) if partial work committed
3. Update **"Current Focus"** to reflect the next priority.
4. Add a row to **"Project History"** if a major milestone was completed.
5. Update **"UX Workflows & Status"** if workflow status changed.

---

## Step 4: Update README.md

**File**: `README.md`
**Prompt Reference**: `.agent/prompts/README-PROMPT.md`

1. Update the **"Last verified"** date and commit SHA.
2. Review these sections for accuracy:
   - **Section 2 (Project Structure)**: Add new directories/files if structure changed
   - **Section 4 (Architecture)**: Update component responsibilities if new services added
   - **Section 5 (Current State)**: Update working features, limitations, or tech debt
3. **Constraint**: Every claim must be backed by a file link.

> **Skip if**: Only bug fixes with no structural changes.

---

## Step 5: Generate PR_DESCRIPTION_DRAFT.md

**File**: `PR_DESCRIPTION_DRAFT.md`
**Prompt Reference**: `.agent/prompts/PR-PROMPT.md`

Generate the PR description using the template in PR-PROMPT.md:

1. **Summary**: 3-4 bullet points in user-facing language (no file names)
2. **Roadmap Progress**: Table of affected roadmap items with status
3. **Architecture Decisions**: Key patterns, trade-offs, tech debt
4. **Review Guide**: Categorize files by risk level (High/Medium/Low)
5. **Verification Plan**: Step-by-step test instructions

### Required Input Data

- Git diff: `git diff main...HEAD --stat`
- Changed files: `git diff main...HEAD --name-only`
- Commit messages: `git log main...HEAD --oneline`
- **Full Context**: The `.diff` or `.patch` file (if available) to ensure 100% coverage of changes.

---

## Step 6: Verification

1. **Check links**: Ensure all file references in documentation are valid
2. **Check dates**: Confirm "Last Updated" dates are current
3. **Check consistency**: Roadmap status matches README "Current State"
4. **Commit documentation**:

   ```bash
   git add README.md roadmap.md docs/operations/ENGINEERING_KNOWLEDGE.md
   git commit -m "docs: update documentation for PR"
   ```

> **Note**: `PR_DESCRIPTION_DRAFT.md` is gitignored and should not be committed.

---

## Quick Reference

| Document                   | When to Update                 | Prompt File                        |
| -------------------------- | ------------------------------ | ---------------------------------- |
| `ENGINEERING_KNOWLEDGE.md` | Bugs fixed, patterns learned   | N/A (follow existing format)       |
| `roadmap.md`               | Features completed/started     | `.agent/prompts/ROADMAP-PROMPT.md` |
| `README.md`                | Structure/architecture changes | `.agent/prompts/README-PROMPT.md`  |
| `PR_DESCRIPTION_DRAFT.md`  | Every PR                       | `.agent/prompts/PR-PROMPT.md`      |
