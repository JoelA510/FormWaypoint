---
trigger: always_on
---

# Verification + Debugging (always-on)

## Verification requirement

For any logic change, API change, or schema change:

- Define the verification command(s): test, lint, typecheck, build.
- Attempt to run them in-terminal.
- If unable (blocked by missing env/secrets/services), report:
  - what you tried,
  - why it failed,
  - the exact command for a human to run,
  - expected outcome if successful.

## Debugging loop cap

Use the "Debug Loop (5)" workflow when a verification command fails.
Do not loop endlessly.
