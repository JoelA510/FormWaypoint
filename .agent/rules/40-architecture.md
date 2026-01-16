---
trigger: always_on
---

# Architecture (FormWaypoint 2026)

## Monorepo Structure

### 1. pps/api (Backend)
- **Hono**: RPC-style API.
- **Modules**: src/modules/{domain}.

### 2. pps/web (Frontend)
- **Vite + React 19**.
- **Features**: src/features/{domain}.
- **Routes**: src/routes (TanStack Router).

### 3. packages/schema (Shared)
- **Zod Schemas**: Single source of truth.
- **Types**: Exported TypeScript types inferred from Zod.

## Critical Constraints

1. **No Shared State**: pps/web cannot import from pps/api. They share packages/schema.
2. **Type Safety**: Backend changes must break Frontend build if schema mismatches.
3. **Validation**: All inputs must be validated by Zod schemas from @repo/schema.
