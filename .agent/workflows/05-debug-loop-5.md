---
description: Debug Loop (5)
---

Trigger when a verification command fails.

Budget: max 5 attempts.

Each attempt:

1. Capture: paste the exact failing command and the key error excerpt.
2. Hypothesis: 1-2 sentences (cause -> fix).
3. Apply the smallest change consistent with the hypothesis.
4. Re-run the same command.

Stop conditions:

- Pass -> document "passed on attempt X" and summarize fix.
- Fail on attempt 5 -> write FAILURE_REPORT.md with:
  - persistent error
  - attempts 1-5 summary
  - what info is missing (if any)
  - recommended human next steps
    Hard rule: do not delete/disable tests just to pass.
