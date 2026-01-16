---
trigger: always_on
---

# Engineering Standards (FormWaypoint 2026)

## Monorepo & Tooling
- **Manager**: Turborepo. Run commands via 	urbo run <task>.
- **Package Manager**: NPM.
- **Strictness**: No ny. No // @ts-ignore without rigorous justification.

## Backend (pps/api)
- **Framework**: Hono (Node.js adapter).
- **Validation**: Zod (using @repo/schema).
- **Database**: Prisma with zod-prisma-types.
- **API Styling**: RPC-like interaction or Strict OpenAPI.

## Frontend (pps/web)
- **Framework**: React 19 + Vite.
- **Routing**: TanStack Router (File-based).
- **State**:
  - Server State: TanStack Query v5.
  - Client State: Zustand (avoid Context for frequent updates).
  - URL State: TanStack Router search params.

## Shared (packages/*)
- **Schema**: Single Source of Truth for Zod types.
- **UI**: Shadcn/UI + Tailwind v4.

## Testing
- **Unit/Integration**: Vitest.
- **End-to-End**: Playwright (future).
- **Mocking**: Dependency Injection preferred over module mocking.

## Git & Workflow
- **Commits**: Conventional Commits (feat, fix, chore).
- **Branching**: Feature branches off main.
