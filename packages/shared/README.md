# Shared Libraries

Cross-cutting utilities, TypeScript types, and adapters that are consumed by both API and web workspaces.

## Planned Modules
- `types/` mirroring JSON Schemas via code generation.
- `normalization/` for currency, unit, and HTS validation helpers.
- `templates/` for export template metadata contracts.
- `testing/` utilities to aid contract tests across services.

## Phase 1 Actions
- Configure build tooling (tsup/tsc) for publishing to internal registry.
- Generate TypeScript types from `packages/schemas` artifacts.
- Establish lint/test scaffolding shared via workspace scripts.
