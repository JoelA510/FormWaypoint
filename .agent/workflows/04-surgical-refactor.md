---
description: Surgical Refactor (one item)
---

Input: one DEBT_REPORT.md item (exact text).

Steps:

1. Locate and understand current behavior.
2. Ensure a safety net:
   - if tests exist: run them first
   - else: write a characterization/pinning test
3. Apply minimal refactor to fix the item.
4. Run verification commands.
5. Update DEBT_REPORT.md marking the item as completed with date + commit hash.
