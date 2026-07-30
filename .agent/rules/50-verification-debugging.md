---
trigger: always_on
---

# Verification + Debugging (always-on)

## Verification requirement

For any logic change, parser change, adapter change, or shell change:

- `npm run check` is the verification command: typecheck, lint, tests, production build.
  CI runs exactly this, so there is no second thing to remember.
- Attempt to run it in-terminal.
- If unable (blocked by missing env/secrets/services), report:
  - what you tried,
  - why it failed,
  - the exact command for a human to run,
  - expected outcome if successful.

## Debugging loop cap

Use the "Debug Loop (5)" workflow when a verification command fails.
Do not loop endlessly.

## Fixtures are not a blocker

The suites that replay real shipments skip when `src/test/fixtures/*.pdf` is absent, which
is what a clean checkout sees: 200 tests pass, 122 skip. That is a pass, not a failure to
chase. Never weaken an assertion to make a skipped suite run, and never commit a shipment
document to make one runnable.
