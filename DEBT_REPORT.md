# Technical Debt Report

**Date:** 2026-01-16
**Status:** In Progress

## 1. Critical Issues

*None.*

## 2. Correctness & Logic Risks

* **Socket Tests**: The newly added `socket_integration.test.js` is failing, and `sanity.test.js` is unstable. Needs deep dive into Jest mocking of `socket.io`.

## 3. Maintainability

* **Complex Dependencies**: `node_modules` structure is still a watch item.

## 4. Documentation Debt

* **Consolidation candidates**: `docs/architecture/ingestion-pipeline.md` vs `services/ingestion/README.md` (Potential overlap).

## 5. Remediation Plan / History

### Completed (2026-01-16)

- [x] Archive old code review reports (`docs/archive`).
* [x] Refactor `api.js` into modular services (`apps/web/src/services/modules`).
* [x] Add Error Boundaries to React App (`components/ErrorBoundary.jsx`).
* [x] Merge `docs/TESTING.md` into `docs/architecture/security-qa-guardrails.md`.

### Next Actions

- [ ] Fix Socket.io Unit/Integration Tests.
