---
description: Feature Injection
---

You are in Planning mode.

Input: a feature request from the user.

Steps:

1. **Scope Analysis** — identify which layer the change belongs in:
   - **Domain** (`src/domain`): parsing, reconciliation, Schedule B. Carrier-agnostic by
     rule; if the change needs to know about a forwarder, it does not belong here.
   - **Carrier** (`src/carriers/<id>`): field maps, defaults, value formatting, row
     capacity. A new forwarder is one adapter and nothing else.
   - **UI** (`src/features`): upload, review, manual fields, output.
   - **Storage** (`src/store`): only through the `LocalStore` interface, so a desktop build
     can swap the implementation.
2. **Implementation Plan**:
   - List new files and the types that change in `src/domain/types.ts`.
   - **Critical:** define the data shape first — everything downstream keys off it.
3. **Execution Order**:
   - Step 1: types and domain logic, with tests against the fixtures in `src/test/fixtures`.
   - Step 2: carrier adapter, if the change reaches a form.
   - Step 3: UI.
4. **Compliance review** — for anything touching a filed value, confirm the change does not
   infer a controlled field (ECCN, licence, country of origin, hazmat, routed export) and
   does not let a blocking check be skipped.
5. **Verification**:
   - Run `npm run check` (typecheck, lint, tests, build). CI runs exactly this.
