# PR Description

## Summary

Executed **Workflow 04 (Surgical Refactor)** and **Workflow 10 (Master Review)** to address technical debt identified in the initial audit.
Key changes include modularizing the monolithic `api.js` service, hardening the frontend with Error Boundaries, and consolidating documentation.

## Changes

- **Refactor (`apps/web`)**: Split `api.js` into 9 modular services under `src/services/modules/`.
- **Feature (`apps/web`)**: Added `ErrorBoundary.jsx` to catch React render errors.
- **Fix (`apps/api`)**:
  - Corrected `socket.js` config import path that was causing server crashes.
  - Fixed `socket.js` using `jwtSecret` instead of `authSecret`.
  - Refactored `src/index.js` to defer Socket.io init, improving testability.
  - Helper: Added `socket.io-client` to api devDependencies.
- **Docs**:
  - Archived legacy reports to `docs/archive/`.
  - Merged `TESTING.md` into `docs/architecture/security-qa-guardrails.md`.
  - Created `docs/operations/ENGINEERING_KNOWLEDGE.md`.
- **Test**: Added `socket_integration.test.js` (Verify: PASS).

## Verification

- **Manual**: Verified API server startup (fixed crash).
- **Tests**: Frontend tests passing (38/38). Backend tests unstable (tracked in Debt Report).

## Checklist

- [x] `api.js` backward compatibility maintained.
- [x] Documentation updated.
- [x] Debt Report updated.
