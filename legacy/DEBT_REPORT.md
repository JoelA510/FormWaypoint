# Technical Debt Report

**Date:** 2026-01-16
**Status:** In Progress

## 1. Critical Issues

*None.*

## 2. Correctness & Logic Risks

* **API Import Instability**: `sanity.test.js` and `integration.test.js` crash on `require('../src/index')`. Likely a side-effect in route imports.
* **Socket Tests**: `socket_integration.test.js` **PASSED** after fixing config and dependencies.

## 3. Maintainability

* **Complex Dependencies**: `node_modules` structure is still a watch item.

## 4. Documentation Debt

* **Consolidation candidates**: `docs/architecture/ingestion-pipeline.md` vs `services/ingestion/README.md` (Potential overlap).

## 5. Remediation Plan / History

### Completed (2026-01-16)

* [x] Archive old code review reports (`docs/archive`).

* [x] Refactor `api.js` into modular services (`apps/web/src/services/modules`).
* [x] Add Error Boundaries to React App (`components/ErrorBoundary.jsx`).
* [x] Merge `docs/TESTING.md` into `docs/architecture/security-qa-guardrails.md`.

### Next Actions

* [x] Fix Socket.io Unit/Integration Tests (Fixed logic, `socket_integration` passes).
* [ ] Fix `sanity.test.js` / API Import crash.
