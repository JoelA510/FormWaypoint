# FormWaypoint (2026 Rewrite)

**Last verified**: 2026-01-16

A self-healing, fully typed, AI-native logistics platform. Built with the **2026 Tech Stack**.

## 1. Quick Start

```bash
# Install dependencies
pnpm install

# Start Development Server (Full Stack)
turbo run dev
```

## 2. Project Structure

- **apps/api**: Hono (Node 24) Backend.
  - `src/modules`: Domain-driven vertical slices (Ingestion, Classification, Shipments).
- **apps/web**: React 19 + Vite + TanStack Router.
  - `src/routes`: File-based routing.
  - `src/utils/client.ts`: Type-safe Hono RPC Client.
- **packages/schema**: Shared Prisma Schema & Zod Types.
  - `prisma/schema.prisma`: Defines `Shipment` and `HtsCode` with ParadeDB extensions.
- **services/ai**: Python 3.14 FastAPI Service (OCR & Predictions).

## 3. Technology Stack

- **Monorepo**: Turborepo + pnpm
- **Backend**: Hono (RPC-style)
- **Database**: PostgreSQL (Neon) + ParadeDB (Search/Vector)
- **ORM**: Prisma 7.2 (TypedSQL, `postgresqlExtensions`)
- **Frontend**: React 19, Tailwind v4, TanStack (Router/Query)
- **AI**: Python + FastAPI (ATLAS/Tesseract wrappers)

## 4. Architecture Standards

- **Vertical Slices**: Code organized by feature capability, not usage layer.
- **Strict Type Safety**: Frontend consumes Backend types directly via `hc<AppType>`.
- **Schema First**: All data changes start in `@repo/schema`.

## 5. Current State

- ✅ **Monorepo Scaffolding**: Complete.
- ✅ **Data Ingestion**: S3 Uploads & BullMQ Workers implemented.
- ✅ **Search**: Hybrid Search (BM25 + Vector) wired up via Prisma Raw SQL.
- ✅ **Frontend**: Shipment Review page consuming real API types.
- 🚧 **AI Service**: Endpoints mocked, logic pending.
