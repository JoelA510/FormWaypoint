---
description: Start working on a GitHub Issue (Branch, Plan, Assign)
---

1. **Analyze the Issue**
    - **Attempt**: Call `issue_read(issue_number=...)` to get the full context, requirements, and constraints. Also call `get_me()` to identify the current user's login.
    - **Fallback**: If the GitHub tool call fails (e.g., Docker/MCP is unavailable):
      - Ask the user to **paste** the Issue Title, Description, and any requirements strings.
      - Ask them for their GitHub username if needed for assignment planning.

2. **Create Feature Branch**
    - Generate a branch name: `feat/<issue-number>-<short-description>` (e.g., `feat/12-add-login`).
    - Call `create_branch(branch=..., from_branch="main")`.
    - _Note: If the branch exists, ask the user if they want to reuse it or create a new one._

3. **Draft Implementation Plan**
    - Create or Overwrite `implementation_plan.md` with the standard template.
    - **Goal**: Summarize the Issue Body.
    - **Proposed Changes**: List likely file modifications based on your knowledge of the codebase.
    - **Verification**: Define how you will prove it works (e.g., "Add test case to `auth.test.jsx`").

4. **Admin Housekeeping**
    - **Attempt**: Call `issue_write(method="update", issue_number=..., assignees=["<current-user-login>"])` and update project status.
    - **Fallback**: If the GitHub tool call fails:
      - **Log action item**: "Please manually assign yourself to Issue #..."
      - **Log action item**: "Please move Issue #... to 'In Progress' on the project board."

5. **Handover**
    - Notify the user: "Branch `feat/...` created. Plan drafted. Please review `implementation_plan.md`."
