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

### Test Stack

- **Unit Tests**: Vitest (frontend) / Jest (backend)
- **E2E Tests**: Playwright
- **Test Library**: @testing-library/react (frontend)

### Running Tests

#### Frontend Unit Tests

```bash
cd apps/web
npm test                 # Run in watch mode
npm test -- --run        # Run once
npm test -- --coverage   # With coverage report
```

#### Backend Unit Tests

```bash
cd apps/api
npm test                 # Run all tests
```

#### Ingestion Service Tests

```bash
cd services/ingestion
npm test                 # Run all tests
```

#### E2E Tests

```bash
cd apps/web
npm run test:e2e         # Run E2E tests headless
npm run test:e2e:ui      # Run with Playwright UI
```

### Test Structure

**Frontend (`apps/web`)**

```
src/
├── __tests__/              # App-level integration tests
├── components/
│   └── **/__tests__/       # Component tests
├── services/
│   └── **/__tests__/       # Service tests
└── hooks/
    └── **/__tests__/       # Hook tests

e2e/                        # Playwright E2E tests
├── auth.spec.js
├── upload.spec.js
└── review.spec.js
```

**Backend (`apps/api`)**

```
tests/
├── auth.test.js           # Authentication tests
├── history_comments.test.js # Collaboration tests  
├── integration.test.js    # API integration tests
└── generator.test.js      # PDF generation tests
```

### Best Practices

1. **Isolation**: Tests should not depend on each other
2. **Descriptive Names**: Use clear, behavior-focused test names
3. **AAA Pattern**: Arrange, Act, Assert
4. **Mock External Dependencies**: API calls, timers, etc.
5. **Test User Behavior**: Not implementation details
6. **Keep Tests Fast**: Unit tests<1s, E2E<5s per test

## Delivery & Operations

- Containerized services with CI pipeline running `npm ci`, lint, tests, and build.
- Staging environment with seeded templates and anonymized sample docs.
- Observability stack (logs, metrics, traces) with alerting on ingestion failures and export errors.
- Backup and PITR strategy for Postgres plus replication for object storage.
