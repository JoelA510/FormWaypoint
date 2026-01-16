---
description: Log a recent technical lesson or fix to Engineering Knowledge
---

1.  **Synthesize Lesson**
    - Review the recent conversation history or the specific problem context provided by the user.
    - Draft a standard "Knowledge Entry" with:
      - **Problem**: What failed? (e.g., "Supabase RLS Policy recursion").
      - **Context**: Under what conditions? (e.g., "When querying `tasks` with `select=*`").
      - **Solution**: How was it fixed? (e.g., "Added `!inner` join or refactored policy").
      - **Prevention**: Rule to follow in the future.

2.  **Append to Knowledge Base**
    - Read `docs/operations/ENGINEERING_KNOWLEDGE.md`.
    - Append the new entry under the appropriate Category Header (e.g., `## Database`, `## React Patterns`).
    - _Note: If checks fail, ensure you are not duplicating an existing entry._

3.  **Commit Documentation**
    - Call `run_command` to commit the documentation update: `git commit -am "docs: update engineering knowledge with new lesson"`
