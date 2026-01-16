# Engineering Knowledge

## Critical Rules

- **Configuration**: Always use `require('../config')` (relative to service) or absolute path alias when importing config in backend services. Do not assume `../../config`.
- **API Structure**: Use Modular Services pattern in `apps/web/src/services/modules/*`. Do not add new methods to `api.js` directly.
- **Testing**: `sanity.test.js` mocks are sensitive to import depth.

## Known Issues

- **Socket Tests**: `socket_integration.test.js` fails in CI/local due to mock resolution issues. (Tracked in DEBT_REPORT).

## [DEV-001] Prisma Local Generation

- **Tags**: #prisma #pnpm #windows
- **Date**: 2026-01-16
- **Context & Problem**: `pnpm dlx prisma generate` failed on Windows with `postgresql` provider because it couldn't locate `get-config` binary or environment paths correctly in the dlx sandbox.
- **Solution & Pattern**: Use `pnpm exec prisma generate` or run from a local script. Ensure `.env` is properly located or variables passed inline if needed.
- **Critical Rule**: Do not rely on `pnpm dlx` for Prisma generation in this monorepo structure; use local workspace dependency `pnpm exec`.

## [DEV-002] Monorepo Protocol

- **Tags**: #pnpm #monorepo
- **Date**: 2026-01-16
- **Context & Problem**: Internal packages (like `@repo/schema`) failed to link when using standard semantic version ranges.
- **Solution & Pattern**: Used `workspace:*` protocol in `package.json`.
- **Critical Rule**: Always use `workspace:*` for internal monorepo dependencies.
