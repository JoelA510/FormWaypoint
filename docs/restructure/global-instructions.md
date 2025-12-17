# Global Instructions For AI Agents (Gemini) And Contributors

This document defines global operating rules for any AI agent (e.g., Gemini 3 High Reasoning via Antigravity) and human contributors working on Shipping-Doc-Gen.

These rules apply across **all phases** and **all epics**. Per-epic prompts must be consistent with this document unless explicitly stated otherwise.

---

## 1. Codebase Layout And Layering

### 1.1 Primary structure

Use the following canonical locations:

| Concern                     | Preferred Location                                 |
| --------------------------- | -------------------------------------------------- |
| Canonical types/schema      | `packages/schemas`                                 |
| Validation rules            | `packages/validation` or `apps/api/src/validation` |
| Shared view models          | `packages/view-models`                             |
| Backend domain services     | `apps/api/src/domain` or `apps/api/src/services`   |
| HTTP controllers / handlers | `apps/api/src/routes`                              |
| Carrier integrations        | `apps/api/src/integrations/carriers`               |
| ERP export logic            | `apps/api/src/integrations/erp`                    |
| Forwarder integrations      | `apps/api/src/integrations/forwarders`             |
| Web UI (pages/routes)       | `apps/web/src`                                     |
| Web UI components           | `apps/web/src/components`                          |

If the repo currently uses slightly different paths, follow the **existing pattern** and align new code accordingly.

### 1.2 Layering rules

* Frontend:

  * May import:

    * Canonical schema types (read-only).
    * Generated API client types.
  * Must not:

    * Contain business or compliance logic that belongs in the backend.
* Backend domain:

  * May import:

    * Canonical types.
    * Validation modules.
    * Integration abstractions (carriers, ERP, forwarders).
  * Must not:

    * Depend on UI modules.
* Validation:

  * Lives in dedicated modules, not inline inside controllers.
  * Exposed via clearly named functions (e.g., `validateShipment`).

### 1.3 Naming conventions

Use consistent naming:

* `*Service.ts` for domain services.
* `*Controller.ts` or `*Route.ts` for HTTP handlers.
* `*Gateway.ts` for external integrations (carrier, ERP, sanctions).
* `*ViewModel.ts` for document view-model builders.
* `*Mapper.ts` for mapping/parsing helpers (CSV, OCR, etc.).
   * Prisma/SQL models, migrations, and any ORM mappings.
3. Create a migration:

   * Name it clearly.
   * Include comments for intent and any data transformation.
4. Data migration/backfill:

   * For non-nullable new fields or semantics changes:

     * Provide a backfill script or safe defaults.
5. Update usage:

   * View-model builders.
   * Validation rules.
   * API DTOs.
6. Update tests:

   * Unit tests that touch the updated types.
   * Integration/e2e tests if the change affects I/O.

### 2.3 Non-breaking-first rule

* Prefer:

  * Adding fields (nullable or with safe defaults).
  * Adding JSON properties that consumer code can ignore if unknown.
* Avoid:

  * Renaming or removing fields without transitional logic.
* If a breaking change is unavoidable:

  * Mark it clearly in the PR description.
  * Include explicit migration/backfill instructions.
  * Ensure old data is handled gracefully (e.g., version checks).

---

## 3. Validation And Compliance Guardrails

### 3.1 Role of validation

* Validation is **assistive and advisory**, not an absolute compliance oracle.
* Validation may:

  * Block actions when data is clearly incomplete (e.g., missing address, missing HTS).
  * Produce errors/warnings with explicit messages and “how to fix” guidance.
  * Require explicit overrides with reason for high-severity issues.
* Validation must not:

  * Silently “fix” regulatory data (HTS, ECCN, COO, DG classification).
  * Infer sensitive classifications without user visibility and audit trail.

### 3.2 Rule structure

Each validation rule must define:

* `code`:

  * Stable identifier, e.g., `MISSING_HTS`, `EEI_THRESHOLD_EXCEEDED`.
* `severity`:

  * `error` | `warning` | `info`.
* `message`:

  * Short, actionable description, e.g.:

    * “Line 3 is missing HTS code; provide a valid 10-digit US HTS.”
* `path`:

  * JSON path to the field(s), e.g., `lineItems[2].htsCode`.
* Optional metadata:

  * Domain (e.g., `data-quality`, `compliance`, `carrier-readiness`).
  * Reference/rationale in a short code comment.

### 3.3 Overrides and audit

* Errors:

  * Block document generation and booking **unless** explicitly overridden.
* Warnings:

  * Do not block, but are visible and may be overridden for tracking.

When implementing overrides:

* Store:

  * `overriddenByUserId`
  * `overriddenAt`
  * `overrideReason`
* Emit an audit event:

  * e.g., `VALIDATION_OVERRIDDEN` with rule codes and reason.
* Document generation and booking logic:

  * Must respect override status (errors still present but overridden -> allowed).

### 3.4 Auto-fill behaviour

* Allowed:

  * Auto-fill non-regulatory convenience fields (e.g., default weights from item master).
  * Auto-suggest values from references (HTS descriptions, DG UN info), but:

    * Must be visible to the user.
    * Must be editable.
* Not allowed:

  * Silent auto-fill of HTS, ECCN, COO that users might treat as authoritative.

---

## 4. Secrets, Configuration, And Stubs

### 4.1 Secrets

* Do not hardcode:

  * API keys.
  * Passwords.
  * Tokens.
* Store secrets via:

  * Environment variables.
  * Secret manager integration (if provided by the runtime).

`CarrierAccount.credentialsJson` or similar:

* May contain:

  * References to env keys or opaque tokens loaded at runtime.
* Must not contain:

  * Real credentials committed to the repo.

### 4.2 Config and feature flags

All external integrations must be controlled by config:

* Feature flags (examples):

  * `carrierIntegrationEnabled`
  * `forwarderIntegrationEnabled`
  * `erpExportEnabled`
  * `aesAssistEnabled`
  * `dgAssistEnabled`
  * `sanctionsCheckEnabled`
* Default:

  * All integration flags should default to `false` in production config templates.
* When a feature flag is disabled:

  * Endpoints should return 404 or 503 with a clear, non-leaky message.
  * UI should hide or disable related actions.

### 4.3 Test vs production behavior

* Tests:

  * Must use mocks/fakes for:

    * Carrier APIs.
    * ERP HTTP endpoints.
    * Sanctions checking.
  * Must never call real external services.
* Dev/staging:

  * Use test credentials/accounts only.
  * Label the UI clearly if a sandbox carrier account is in use.

---

## 5. Observability And Logging

### 5.1 Logging conventions

Use structured logging:

* Always include:

  * `event` (short code, e.g., `CARRIER_RATE_REQUEST`).
  * `shipmentId` where relevant.
  * `carrierCode` or `integrationName` for external calls.
  * `correlationId` if available.
* Avoid:

  * `console.log` for new logic; use the repo’s logging abstraction.
  * Logging entire payloads that include PII or secrets.

### 5.2 External call logging

For any carrier/ERP/sanctions call:

* Log:

  * Start event (info level) with key metadata (no secrets).
  * Result event:

    * Status (success/failure).
    * HTTP status code (if applicable).
    * Duration.
* On error:

  * Log at `error` level with:

    * Error code/message.
    * High-level context (no secrets).
  * Bubble up a normalized error to API layer.

### 5.3 Error handling

* API endpoints:

  * Must not crash or leak stack traces.
  * Return a structured error payload, e.g.:

    ```json
    {
      "errorCode": "CARRIER_TIMEOUT",
      "message": "Carrier rate request timed out. Please retry or use manual portal.",
      "details": { "carrierCode": "UPS" }
    }
    ```

* Do not expose:

  * Internal library names.
  * Raw SQL queries.
  * Raw stack traces in client-facing responses.

---

## 6. Testing And CI Requirements

### 6.1 Minimum expectations per change

For any non-trivial change (new endpoints, integration, validation rules, schema changes):

* Add or update:

  * Unit tests for the new logic.
  * Integration tests for new HTTP endpoints (at least one happy path).
* When modifying behavior:

  * Update existing tests to reflect new behavior rather than deleting them, unless the behavior is truly obsolete.

### 6.2 Commands to keep green

The following commands (or equivalents defined in the repo) must pass:

* `npm test` or `pnpm test` (unit/integration tests).
* `npm run lint` (linting).
* `npm run typecheck` (TypeScript).

CI should run these for all PRs.

### 6.3 Snapshot policies

If snapshot testing is used (e.g., for HTML used in PDFs):

* Snapshots may be updated only when:

  * The change to output is intentional.
  * The PR description mentions that snapshots were updated and why.
* Do not:

  * Update snapshots just to “make tests green” without verifying intent.

---

## 7. Performance And Scale Assumptions

### 7.1 Expected scale

Assume mid-size B2B shipping:

* Shipment size:

  * Typically tens of line items, not tens of thousands.
* Daily volume:

  * Hundreds to low thousands of shipments/day per tenant.
* Reporting:

  * Queries over tens to hundreds of thousands of historical shipments are plausible, but not millions per single tenant in typical conditions.

### 7.2 Acceptable patterns

* Per-shipment operations:

  * O(n) in number of line items (validation, view-model building).
* Reporting:

  * Aggregations with proper indexing on:

    * `shipDate`
    * `carrierCode`
    * `destinationCountry`

### 7.3 Unacceptable patterns

* Full-table scans without indexes for common report queries.
* Loading an entire large table into memory for:

  * Reporting.
  * Exports.
  * Batch processing.

When in doubt, prefer simple, indexed queries and per-shipment operations.

---

## 8. UX And Copy Constraints

### 8.1 Compliance disclaimers

Compliance-related parts of the UI (validation panels, AES/DG sections, sanctions sections) must:

* Include a short, clear disclaimer, such as:

  * “This tool provides assistance only. You remain responsible for final trade compliance decisions.”
* This disclaimer:

  * Must not be removed or materially softened without explicit human approval.
  * May be reused across screens for consistency.

### 8.2 Tone

* Use:

  * Clear, operational language shipping clerks understand.
  * Concrete terms (HTS code, EEI, Incoterm) with context where necessary.
* Avoid:

  * Legal-sounding language implying the tool is an authority.
  * Overly technical jargon in user-facing copy.

### 8.3 Error messages

Error messages must:

* State:

  * What went wrong (at a user-relevant level).
  * What the user can do next (retry, contact IT, use manual carrier portal).
* Avoid:

  * Internal exception details.
  * Confusing or vague text such as “unknown error.”

---

## 9. Documentation Standards

### 9.1 Docs to maintain

When adding or changing behavior, update:

* `README`:

  * High-level capabilities and how to get started.
* `docs/*`:

  * Architecture and feature docs:

    * Phases / epics.
    * Validation rules (`docs/compliance-rules.md`).
    * Integrations (`docs/phase3-integrations.md`).
    * Configuration and feature flags.

### 9.2 Documentation content

For new or changed APIs:

* Document:

  * Endpoint path and method.
  * Purpose.
  * Request shape (JSON example).
  * Response shape (JSON example).
  * Error codes and meanings (if applicable).

For validation rules:

* Document:

  * Rule `code`.
  * Severity.
  * Trigger condition.
  * Suggested remediation.

Avoid:

* Copying entire code blocks into docs.
* Diverging semantics (doc must match actual behavior).

---

## 10. AI Agent (Gemini) Guardrails

These rules apply to any AI agent modifying the repo.

### 10.1 Things AI must not do

* Do not:

  * Introduce major new dependencies or frameworks without explicit human approval.
  * Change authentication/authorization behavior.
  * Implement new data retention or deletion policies.
  * Auto-enable experimental feature flags in production environment config.
  * Remove compliance disclaimers or downgrade validation severity without explicit instruction.

### 10.2 Things AI must always do

* Always:

  * Follow the codebase layout and layering rules in this document.
  * Prefer extending existing modules over creating near-duplicates.
  * Add or update tests when behavior changes.
  * Update relevant docs when public APIs, validation rules, or user-visible flows change.
  * Clearly annotate risky changes (schema, integrations, compliance rules) in PR descriptions.

### 10.3 TODO usage

* Avoid adding `TODO` comments unless:

  * The work is clearly scoped.
  * It is realistic to address in a near-term follow-up.
* TODO format:

  * Include owner/context and reason, e.g.:

    * `// TODO: Add support for FedEx carrier gateway once test credentials are available.`

---

## 11. How To Use This Document In Antigravity Prompts

For each Antigravity/Gemini task:

* Reference this file explicitly, e.g.:

  * “Follow `docs/restructure/global-instructions.md` for:

    * file locations,
    * schema/migration rules,
    * validation/compliance behavior,
    * integrations and secrets,
    * testing and documentation expectations.”
* Per-epic prompts should:

  * Describe the objective and relevant modules.
  * Defer to this document for all cross-cutting concerns.

---
