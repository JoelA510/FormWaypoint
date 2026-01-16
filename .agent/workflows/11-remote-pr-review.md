---
description: Perform a deep AI review of a remote Pull Request using GitHub MCP
---

1. **Fetch PR Context**
    - **Attempt**: Use `pull_request_read(method="get", ...)` to get the high-level summary (`get_files` and `get_diff`).
    - **Fallback**: If the GitHub tool call fails (e.g., Docker/MCP is unavailable):
      - Ask the user to **paste** the PR Title, Description, and a summary of changes (or the diff itself if small).
      - Proceed to Step 2 using the user-provided context.

2. **Analyze against Standards**
    - Load `user_rules` (specifically `20-engineering-standards.md` and `30-design-standards.md`).
    - For each file change, check:
      - **Type Safety**: Are there explicit types? Is `any` avoided?
      - **Styling**: Is Tailwind used exclusively? Are generic colors avoided?
      - **Architecture**: Are feature slices respected? No circular dependencies?
      - **Security**: Are there any sensitive inputs handled without validation?

3. **Submit Review**
    - **Attempt**: Use `pull_request_review_write` to post the review.
    - **Fallback**: If the GitHub tool call fails:
      - **Format** your review as a clear Markdown comment.
      - **Output** the review in the chat and ask the user to post it manually.
