---
description: Sync Debt Report items to GitHub Issues
---

1. **Read Debt Report**
    - Read `DEBT_REPORT.md` to parse the list of debt items.
    - Extract Title, Description, and Priority for each item.

2. **Fetch Existing Debt Issues**
    - **Attempt**: Call `list_issues(labels=["debt"], state="open")` to get currently tracked debt.
    - **Fallback**: If unavailable, effectively skip deduping or ask the user if they want to proceed blindly.

3. **Sync Items**
    - For each item in `DEBT_REPORT.md` that is NOT in the existing set:
      - **Attempt**: Call `issue_write(method="create", title=..., body=..., labels=["debt", "maintenance"])`.
      - **Fallback**: If `issue_write` fails:
          - **Generate a Markdown List** of the issues that _would_ have been created.
          - **Output** this list to the chat and ask the user to batch-create them or track them manually.

4. **Update Report (Optional)**
    - If the user requests (and issues were successfully created), update `DEBT_REPORT.md` to include links to the newly created issues (e.g., `[Title](IssueURL)`).
