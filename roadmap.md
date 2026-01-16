# FormWaypoint Roadmap

**Last Updated**: 2026-01-16

## Current Focus

**Greenfield Scaffolding & Vertical Slices** - Establishing the core 2026 Tech Stack (Monorepo, Hono, React 19, Prisma 7.2) and implementing the first vertical slices (Ingestion, Hybrid Search).

## Milestone Tracker

| Feature | Status | Target | Description |
| :--- | :--- | :--- | :--- |
| **Monorepo Setup** | ✅ Done | Q1 2026 | Turbo, pnpm, strict TypeScript, shared Schema. |
| **Data Layer** | ✅ Done | Q1 2026 | Prisma 7.2, ParadeDB/Vector extensions, Zod generation. |
| **Ingestion Pipeline** | ✅ Done | Q1 2026 | S3 Uploads (Presigned URLs), BullMQ Worker scaffolding. |
| **Hybrid Search** | ✅ Done | Q1 2026 | ParadeDB (`@@@` BM25) integration via Prisma Raw SQL. |
| **Shipment Review UI** | ✅ Done | Q1 2026 | React 19, TanStack Router, Hono RPC Client. |
| **Gold Standard Seeder** | ✅ Done | Q1 2026 | Sync HTS codes from UK Trade Tariff API. |
| **AI Service** | 🚧 In Progress | Q1 2026 | Python FastAPI service (Mock endpoints implemented, Real Logic Pending). |
| **Database Provisioning** | 📅 Planned | Q1 2026 | Spin up actual Neon/ParadeDB instance. |
| **Auth Integration** | 📅 Planned | Q1 2026 | Clerk or similar integration. |

## Project History

| Date | Milestone | Details |
| :--- | :--- | :--- |
| 2026-01-16 | **Greenfield Scaffolding** | Initial monorepo setup, core backend modules, and frontend shell. |
