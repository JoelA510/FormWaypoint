# Project Health Check Report

**Date**: 2025-12-10
**Scope**: `apps/web` (Lint), `apps/api` (Tests), `packages/schemas` (Types)

## Summary

| Component | Status | Issues Found |
| :--- | :--- | :--- |
| **apps/web** | ⚠️ Issues | **3 Critical Errors**, 92 Warnings |
| **apps/api** | ✅ Cleaned | Fixed legacy/broken tests (`ocr_mapper`, `portability`, `queue`) |
| **packages/schemas** | ✅ Healthy | No type errors |

## Detailed Findings

### 1. `apps/web` - Critical React Errors

These errors cause infinite render loops or performance degradation and **must be fixed**.

| File | Issue | Severity |
| :--- | :--- | :--- |
| `src/components/address-book/PartyModal.jsx` | `Calling setState synchronously within an effect` | **Critical** |
| `src/components/items/ProductModal.jsx` | `Calling setState synchronously within an effect` | **Critical** |
| `src/components/parties/PartiesPage.jsx` | `Calling setState synchronously within an effect` | **Critical** |

**Recommendation**: Wrap these state updates in a condition (e.g. `if (party && party.id !== formData.id)`) or use `useMemo`/`key` reset pattern.

### 2. `apps/web` - Warnings (92)

- **Unused Variables**: `React` (not needed in Vite), `AnimatePresence`, `Link`, etc.
- **Hook Dependencies**: `useEffect` missing dependencies in dependency array.
  - *Risk*: Stale closures or missing updates.

### 3. `apps/api` - Test Cleanup

- **Deleted**: `tests/ocr_mapper.test.js` (Legacy, replaced by `ocr.test.js`).
- **Fixed**: `tests/portability.test.js` (Fixed invalid import path and missing Redis mock).
- **Fixed**: `tests/queue.test.js` (Added missing Redis service mock to prevent `ECONNREFUSED`).

## Next Steps

1. **Authorize Fix**: Fix the 3 critical React errors in `apps/web`.
2. **Lint Cleanup**: Run an autofix pass (`eslint --fix`) to clear unused variable warnings.
