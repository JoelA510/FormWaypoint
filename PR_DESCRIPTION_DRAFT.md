# PR Description

## Summary

- Scaffolded the complete Monorepo structure with `pnpm` workspaces.
- Implemented the core "Greenfield" Tech Stack: Node 24, Hono, React 19, Prisma 7.2.
- Wired up vertical slices for **Ingestion** (S3/BullMQ) and **Classification** (Hybrid Search).
- Created a fully typed Frontend shell consuming Backend types via RPC.

## Roadmap Progress

| Feature | Status |
| :--- | :--- |
| Monorepo Setup | ✅ Done |
| Data Layer (Prisma + ParadeDB) | ✅ Done |
| Ingestion Pipeline | ✅ Done |
| Hybrid Search Engine | ✅ Done |

## Architecture Decisions

- **Vertical Slices**: Code is organized by domain (`modules/ingestion`, `modules/classification`) rather than technical layers.
- **Hybrid Search**: We are using Prisma's `raw` queries to access ParadeDB's `@@@` operator for BM25 search, as Prisma Schema DSL support is limited.
- **Type Safety**: We enforce `Strict` typescript. The Frontend consumes the Backend's `AppType` directly.

## Review Guide

- **High Risk**:
  - `packages/schema/prisma/schema.prisma`: The core data model.
  - `apps/api/src/index.ts`: The main server entrypoint and router wiring.
- **Medium Risk**:
  - `apps/web/src/routes/shipments.tsx`: The primary UI view.
  - `services/ai/`: The Python service scaffolding.
- **Low Risk**:
  - `*.json`: Config files.

## Verification Plan

1. `pnpm install`
2. `turbo run dev`
3. Verify `http://localhost:5173/shipments` loads without error.
4. Verify `http://localhost:3000/ingest` accepts requests.
