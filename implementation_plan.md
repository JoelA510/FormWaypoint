# Implementation Plan - Comprehensive Testing

The goal is to stabilize the test suite and achieve maximum coverage for both Backend (API) and Frontend (Web).

## 1. Analysis & Instability Fixes

The `apps/api` tests (`sanity.test.js`, `integration.test.js`) are crashing because of side-effects during module loading.

- **Root Cause**: `src/index.js` routes import controllers/services that might be initializing connections (Redis, DB) or validating Env immediately.
- **Fix**: Refactor `src/index.js` and Service/Route modules to lazy-load or use dependency injection/mocking friendly patterns.
  - Specifically, ensure `require('../src/index')` does NOT start the server or connect to DB.

## 2. Backend Coverage (`apps/api`)

Targeting the core domains:

- **Shipping**: `src/domains/shipping`
- **Documents**: `src/routes/documents.js`
- **Auth**: `src/routes/auth.js`

### Proposed Changes

- **Sanity Test**: Ensure `src/index.js` can be imported without crash.
- **Integration Test**: Mock the DB/Redis layer effectively so `integration.test.js` runs full HTTP flows (using `supertest`).
- **New Tests**:
  - `tests/shipping.test.js`: Cover `POST /shipments`, `GET /shipments/:id`.
  - `tests/documents.test.js`: Cover `POST /documents/:id/export`.

## 3. Frontend Coverage (`apps/web`)

Targeting the new Service Modules:

- **Modules**: `src/services/modules/*.js`
- **Aggregator**: `src/services/api.js`

### Proposed Changes

- **New Tests**:
  - `src/services/__tests__/api_modules.test.js`: Verify that `api.js` correctly exports and delegates to modules.
  - `src/services/modules/__tests__/auth.test.js`: Unit test `authService` mock calls.

## Verification Plan

### Automated Tests

- **Frontend**: `cd apps/web && npm test -- --coverage`
- **Backend**: `cd apps/api && npm test -- --coverage`
- **Integration**: `cd apps/api && npm test tests/integration.test.js`

### Manual Verification

- N/A (Focus on automated coverage)
