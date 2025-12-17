# Security, QA, and Delivery Guardrails

## Security Foundations
- Enforce SSO via Supabase + enterprise IdP (Google, Microsoft, optional Okta) with org-scoped RBAC roles: Admin, Preparer, Reviewer, ReadOnly.
- Require tenant isolation for all data access, with RLS policies on shipments, documents, exports, and audit tables.
- Field-level encryption for PII (contacts, tax IDs) managed through KMS-integrated key management.
- Immutable audit log capturing user actions, job transitions, export generations, and schema updates.
- Secrets management via environment-specific vault, never stored in repo; adhere to `.env.local` gitignore.

## Collaboration & History
- Versioning strategy for shipments: append-only revisions with diff metadata.
- Inline commenting linked to canonical fields with notification hooks.
- Webhooks for downstream integrations guarded by HMAC signatures.

## QA & Testing Strategy
- Linting (ESLint, Prettier) and TypeScript checks for frontend packages.
- Unit and integration tests for API endpoints, parsing adapters, and exporter logic.
- Contract tests ensuring schema compatibility between API, OCR service, and frontend.
- Accessibility checks (axe) and Lighthouse budget for UI changes.
- Performance smoke tests on large batch uploads and long PDFs.

## Delivery & Operations
- Containerized services with CI pipeline running `npm ci`, lint, tests, and build.
- Staging environment with seeded templates and anonymized sample docs.
- Observability stack (logs, metrics, traces) with alerting on ingestion failures and export errors.
- Backup and PITR strategy for Postgres plus replication for object storage.
