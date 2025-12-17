## Assumptions

* Monorepo with (approx):

  * `web` app: Vite + React + TypeScript.
  * `api` app: Node/TypeScript (REST or RPC), relational DB via Prisma.
  * `ocr` service: Python/FastAPI (or similar).
  * Shared canonical shipment schema (JSON/TypeScript) in a reusable package.
* Gemini 3 High Reasoning runs in Antigravity with:

  * Full repo access.
  * Ability to run tests and commands.
  * PR-style workflows (branches, diffs, CI).
* Phase 1 goals (recap):

  * Harden canonical schema and ingestion path.
  * Implement CSV/XLSX import + basic mapping.
  * Wire OCR -> canonical pipeline v1.
  * Implement validation engine v1 (schema + basic business rules).
  * Generate Commercial Invoice + Packing List PDFs.
  * Save shipments + documents + minimal audit log.
  * Establish tests/CI and governance for future phases.

Below is a Phase 1 implementation plan broken into concrete “epics” that can be handed to Gemini.

---

## Phase 1 – High-Level Goals

* **G1:** Any shipment can be represented in a **versioned canonical schema** with all core fields.
* **G2:** You can import a CSV/XLSX export and turn it into a canonical Shipment + LineItems.
* **G3:** You can validate a shipment and get a structured list of errors/warnings.
* **G4:** You can generate a Commercial Invoice + Packing List PDF from a validated shipment.
* **G5:** Each shipment, its docs, and key events are stored and auditable.
* **G6:** There is at least one e2e test: `import -> validate -> generate docs`.

---

## Epic 1 – Canonical Schema Hardening

### Scope

* Lock down a **versioned canonical schema** for:

  * Shipment
  * LineItem
  * Party
  * Document (input/output)
* Ensure fields needed for:

  * Compliance: HTS, COO, Incoterms, ECCN, DG flags, EEI flags.
  * Carrier: weights/dims, service level, references.
  * Traceability: ERP IDs, audit metadata.

### Non-goals

* No full AES/EEI, DG rule logic yet.
* No detailed carrier-specific fields beyond basics.

### Implementation Steps

1. **Discover existing schema code:**

   * Use project-wide search for:

     * `Shipment`, `LineItem`, `Party` types/interfaces.
     * JSON schema files (e.g. `*.schema.json`).
   * Identify current canonical representation and its consumers (API, web, OCR).

2. **Define TypeScript canonical types:**

   * Create or refine a shared package (e.g. `packages/schemas`):

     * `ShipmentV1`
     * `ShipmentLineItemV1`
     * `PartyV1`
     * `ShipmentDocumentV1`
   * Add a schema version field, e.g. `schemaVersion: "shipment.v1"`.
   * Fields (minimum):

   **ShipmentV1:**

   * `id: string`
   * `schemaVersion: string`
   * `erpOrderId?: string`
   * `erpShipmentId?: string`
   * `shipper: PartyRef` (or embedded PartyV1)
   * `consignee: PartyRef`
   * `forwarder?: PartyRef`
   * `broker?: PartyRef`
   * `incoterm: string`
   * `currency: string`
   * `totalCustomsValue: number`
   * `totalWeightKg: number`
   * `numPackages: number`
   * `originCountry: string`
   * `destinationCountry: string`
   * `carrierCode?: string`
   * `serviceLevelCode?: string`
   * `trackingNumber?: string`
   * `aesRequired?: boolean`
   * `aesItn?: string`
   * `eeiExemptionCode?: string`
   * `hasDangerousGoods?: boolean`
   * `createdAt`, `updatedAt`
   * `createdByUserId: string`

   **ShipmentLineItemV1 (per line):**

   * `id: string`
   * `shipmentId: string`
   * `sku?: string`
   * `description: string`
   * `quantity: number`
   * `uom: string`
   * `unitValue: number`
   * `extendedValue: number`
   * `netWeightKg: number`
   * `grossWeightKg?: number`
   * `htsCode: string`
   * `countryOfOrigin: string`
   * `eccn?: string` (or `classificationCode`)
   * `isDangerousGoods?: boolean`
   * `dgUnNumber?: string`
   * `dgHazardClass?: string`
   * `dgPackingGroup?: string`

   **PartyV1:**

   * `id: string`
   * `name: string`
   * `addressLine1: string`
   * `addressLine2?: string`
   * `city: string`
   * `stateOrProvince?: string`
   * `postalCode: string`
   * `countryCode: string`
   * `contactName?: string`
   * `phone?: string`
   * `email?: string`
   * `taxIdOrEori?: string`

   **ShipmentDocumentV1:**

   * `id: string`
   * `shipmentId: string`
   * `type: "input" | "output"`
   * `format: "pdf" | "csv" | "xlsx" | "json"`
   * `label: string` (e.g., "Commercial Invoice PDF")
   * `storageKey: string` (path/URL)
   * `createdAt: Date`

3. **Sync TS types and JSON Schema:**

   * If using JSON Schema:

     * Generate schema from TS types (or vice versa).
     * Ensure `required` fields match invariants.
   * Export both TS types and compiled JSON Schemas from the shared package.

4. **DB mapping:**

   * Update Prisma (or equivalent) models to:

     * Represent Shipment, LineItem, Party, ShipmentDocument.
     * Add necessary fields and relationships.
   * Write a migration script (SQL/Prisma) that is:

     * Backwards-compatible or includes data migration logic.
   * For any existing stored data, define a one-time migration or fallback mapping.

5. **API contracts:**

   * Standardize API endpoints to consume/return canonical types.
   * Example endpoints:

     * `POST /api/shipments` – create or import.
     * `GET /api/shipments/:id` – return `ShipmentV1` + line items.
   * Ensure the API uses `ShipmentV1` as the shape (typed).

### Testing

* Unit tests on schema:

  * Ensure required fields.
  * Verify default values (if any).
* Integration test:

  * Create a `ShipmentV1` object, save via API, read back, check equality (minus computed timestamps/IDs).

### Gemini Instructions (summary)

* Locate existing schema and data model definitions.
* Refactor them into a single `packages/schemas` (or equivalent) with TS types + JSON Schemas.
* Update backend models, migrations, and APIs to use `ShipmentV1` et al.
* Add tests ensuring round-trip integrity.

---

## Epic 2 – CSV/XLSX Import v1

### Scope

* Implement CSV/XLSX upload and mapping to canonical `ShipmentV1 + ShipmentLineItemV1` for at least one “reference export” format.

### Non-goals

* No UX-heavy mapping UI; use config / simple mapping.
* No multi-shipment-per-file complexity initially (assume one shipment per uploaded file or one order per file).

### Implementation Steps

1. **Decide ingestion surface:**

   * Likely `POST /api/import/csv` endpoint:

     * Accepts file upload (multipart/form-data).
     * Accepts optional mapping config ID or inline mapping JSON.

2. **Define mapping config model:**

   * TypeScript interface, e.g.:

   ```ts
   type CsvFieldMapping = {
     shipment: {
       shipperNameColumn: string;
       consigneeNameColumn: string;
       // ...
     };
     lineItem: {
       skuColumn: string;
       descriptionColumn: string;
       quantityColumn: string;
       unitValueColumn: string;
       netWeightColumn: string;
       htsCodeColumn: string;
       originCountryColumn: string;
       // ...
     };
     // grouping key: e.g. order number column for multi-ship.
     groupingColumn?: string;
   };
   ```

   * Store mapping configs as JSON in DB or in code for now.

3. **Implement CSV/XLSX parsing utility:**

   * Use a library (e.g., `papaparse` or `csv-parse` for CSV, `xlsx` for Excel).
   * Constraints:

     * Stream large files.
     * Normalize header names (trim, lower-case).
   * For Phase 1:

     * Support CSV first.
     * Add XLSX if low effort; otherwise stub for Phase 2.

4. **Mapping engine:**

   * Given parsed rows and a `CsvFieldMapping`:

     * Build one `ShipmentV1` object:

       * Map header-level fields from, e.g., first row or separate “header” row.
     * Build an array of `ShipmentLineItemV1`:

       * For each row, map line-level fields.
     * Normalize:

       * Convert weights to kg (assume given unit, or mapping includes unit).
       * Convert currency to canonical (if needed, Phase 1 can assume all USD).
       * Compute `extendedValue = quantity * unitValue`.

5. **Normalization metadata:**

   * Add optional `normalization` field on shipment or lines:

     * Store original units and converted values.
   * Not strictly required for Phase 1 display but important for future trust.

6. **Persist and return:**

   * Persist the Shipment + LineItems via backend to DB.
   * Mark `status = "imported"` or similar.
   * Return:

     * Shipment ID.
     * Basic validation summary placeholder (to be wired once validation engine exists).

7. **Minimal UI hook:**

   * In web app:

     * Add a page/section:

       * “Import from CSV”.
       * File input + choose mapping config (drop-down or hard-coded for now).
       * On success, redirect to Shipment detail for review.

### Testing

* Unit tests:

  * Mapping engine: from synthetic CSV -> expected `ShipmentV1`.
  * Edge cases:

    * Missing column -> clear error.
    * Non-numeric values in numeric column -> error/warning.

* Integration test:

  * Upload a sample CSV:

    * Assert that the Shipment and correct count of LineItems is created.

### Gemini Instructions (summary)

* Discover how file uploads are currently handled (if at all).
* Introduce a CSV import endpoint and mapping utility.
* Wire it to create canonical Shipment records.
* Add tests and a minimal UI path to use it.

---

## Epic 3 – OCR-to-Canonical Pipeline v1

### Scope

* Connect existing OCR/parsing pipeline so that:

  * Uploaded PDFs/images -> OCR -> parsed data -> canonical `ShipmentV1`.

### Non-goals

* No advanced model training.
* No multi-document merging logic beyond one document -> one shipment.

### Implementation Steps

1. **Inventory OCR service:**

   * Locate:

     * OCR service (Python/FastAPI?) endpoints.
     * Return types (likely JSON representing header + lines).
   * Document current output shape.

2. **Design intermediary DTO:**

   * Create a TS type representing OCR output shape (e.g. `OcrInvoiceResult`).
   * This shields canonical schema from changes in OCR output.

3. **Mapping OCR result -> canonical:**

   * Implement a mapping function:

     * `mapOcrInvoiceResultToShipment(result: OcrInvoiceResult): ShipmentV1WithLines`.
   * Use heuristics:

     * Map detected “Bill to”/“Sold to” to `shipper`/`consignee`.
     * Line items: description, qty, unit price, total, HTS code if recognized.
   * Mark low-confidence fields:

     * Extend canonical schema with optional `fieldConfidence` metadata if necessary, or keep this as separate analysis for UI.

4. **API endpoint:**

   * Create `POST /api/import/ocr`:

     * Accept file (PDF/image).
     * Call OCR service.
     * Map to canonical Shipment + LineItems.
     * Persist and return Shipment ID + mapping logs.

5. **Error handling:**

   * If OCR fails or mapping fails:

     * Return structured errors.
     * Store “failed document” record for troubleshooting.

6. **UI hook:**

   * Add “Import from PDF/Scan” option.
   * Show progress + final shipment detail page.

### Testing

* Integration tests (backend):

  * Mock OCR service response -> assert mapping to canonical shapes.
* At least one e2e:

  * Use a fixture representing OCR output JSON (no real OCR call) to create a Shipment.

### Gemini Instructions (summary)

* Identify OCR API, define stable DTO.
* Implement mapping functions and endpoints.
* Add tests that stub OCR responses to produce canonical shipments.

---

## Epic 4 – Validation Engine v1

### Scope

* Unified validation engine with:

  * Rule registry.
  * Severity levels.
  * Execution at:

    * Import completion.
    * Pre-document-generation.

### Non-goals

* No complex destination-specific rules yet.
* No external compliance data sources.

### Implementation Steps

1. **Define validation result model:**

   ```ts
   type ValidationSeverity = "error" | "warning" | "info";

   interface ValidationIssue {
     code: string;            // e.g., "MISSING_HTS"
     severity: ValidationSeverity;
     message: string;         // human-readable
     path: string;            // e.g., "lineItems[2].htsCode"
   }

   interface ValidationSummary {
     shipmentId: string;
     issues: ValidationIssue[];
     createdAt: Date;
   }
   ```

2. **Create validation engine module:**

   * Expose a function:

   ```ts
   function validateShipment(shipment: ShipmentV1, lineItems: ShipmentLineItemV1[]): ValidationSummary;
   ```

   * Internally:

     * Run a series of rule functions, each returning zero or more `ValidationIssue`s.
     * Compose into a single `ValidationSummary`.

3. **Implement baseline rules:**

   * **R1: Required parties & addresses (error)**

     * Shipper + consignee present.
     * Basic address fields non-empty and country codes valid (non-empty ISO).
   * **R2: Required line fields (error)**

     * For each line: description, quantity > 0, unitValue >= 0, netWeightKg > 0, htsCode, countryOfOrigin.
   * **R3: Numeric consistency (warning/error configurable)**

     * Sum(line extendedValue) and `shipment.totalCustomsValue`:

       * If difference > configurable tolerance -> warning (Phase 1: warn).
     * Sum(line netWeightKg) vs `shipment.totalWeightKg`:

       * If difference > tolerance -> warning.
   * **R4: HTS format (warning)**

     * Check `htsCode` is digits-only and length 10 (for US-focused Phase 1).
   * **R5: EEI threshold (warning)**

     * If any line extendedValue > 2500 and destinationCountry != "CA":

       * Add warning: “EEI likely required; record ITN or exemption.”
   * **R6: DG completeness (error)**

     * If `shipment.hasDangerousGoods === true` or any line `isDangerousGoods === true`:

       * Ensure `dgUnNumber`, `dgHazardClass`, `dgPackingGroup` are defined for DG lines.

4. **Persist validation summary:**

   * Create table (or reuse existing) for `ValidationSummary` or embed in Shipment as JSON.
   * On import:

     * Run `validateShipment` on saved Shipment.
     * Store summary.
   * On explicit validation (pre-doc-generation):

     * Re-run and update summary.

5. **Wire to endpoints:**

   * `GET /api/shipments/:id/validation` to return summary.
   * Ensure doc-generation endpoint checks for:

     * Any `ValidationIssue` with `severity === "error"` → block generation, return 4xx with issue list.
     * For warnings, allow but include them in response for UI.

6. **Minimal UI:**

   * In shipment detail:

     * Show validation summary:

       * Count of errors/warnings.
       * List with path/message.
   * Later we can add inline field-level highlights; Phase 1 can start with simple list.

### Testing

* Unit tests for rules:

  * For each rule, create passing/failing shipments.
* End-to-end:

  * Import a known-bad CSV causing:

    * Missing HTS -> error.
    * Value mismatch -> warning.
  * Assert summary contents and doc-generation blocking behavior.

### Gemini Instructions (summary)

* Implement a central `validateShipment` engine with rule registry.
* Add baseline rules described above.
* Persist validation summaries and integrate with import and doc-generation flows.
* Expose validation results via API and basic UI.

---

## Epic 5 – Core Document Generation (Commercial Invoice + Packing List)

### Scope

* Generate two PDFs:

  * Commercial Invoice.
  * Packing List.
* Use canonical shipment data and ensure layout is stable.

### Non-goals

* No multi-language support yet.
* No carrier-specific BOL/labels.

### Implementation Steps

1. **Select/confirm rendering stack:**

   * HTML templates + headless browser (Playwright/Puppeteer) -> PDF.
   * Ensure we have:

     * A `renderTemplateToPdf(templateId, data)` abstraction in backend.

2. **Template data contracts:**

   * Create TS types for view models:

   ```ts
   interface InvoiceViewModel {
     shipment: ShipmentV1;
     lineItems: ShipmentLineItemV1[];
     shipper: PartyV1;
     consignee: PartyV1;
     forwarder?: PartyV1;
     totals: {
       totalValue: number;
       totalWeightKg: number;
       currency: string;
     };
   }

   interface PackingListViewModel { /* similar, with emphasis on quantity/weights */ }
   ```

   * Ensure these are derived from canonical data in one place:

     * `buildInvoiceViewModel(shipmentId: string)`.

3. **Commercial Invoice template:**

   * Create HTML/React template (server-rendered or static HTML) with:

     * Header: shipper, consignee, invoice number/date.
     * Table: description, quantity, unit value, extended value, HTS, COO.
     * Footer: totals (value, weight), incoterm, signature line.
   * Keep styling simple but printable (A4/Letter).

4. **Packing List template:**

   * Similar structure:

     * Focus on quantities, weights, packaging.
     * Group items if packaging info available; if not, list line items.

5. **Generation endpoint:**

   * `POST /api/shipments/:id/documents` with body specifying `["commercial-invoice", "packing-list"]`.
   * Flow:

     * Fetch shipment + line items + parties.
     * Run `validateShipment`:

       * If errors -> 422 with issues.
     * Build view models.
     * For each doc type:

       * Render to PDF.
       * Store in `ShipmentDocument` table with type label.
   * Return:

     * Document metadata (id, label, download URL/path).

6. **Storage integration:**

   * For Phase 1:

     * Local disk or an S3-compatible bucket (depending on existing infra).
   * Abstract storage behind an interface to swap later.

7. **UI integration:**

   * In shipment detail page:

     * “Generate documents” button.
     * After generation, list PDFs with download links.

### Testing

* Unit:

  * `buildInvoiceViewModel`:

    * Given a synthetic Shipment+lines, returns correct totals.
* Integration:

  * Call document-gen endpoint with a valid shipment:

    * Assert PDFs are stored and `ShipmentDocument` records created.
* Snapshot:

  * Optionally, generate a PDF and compare metadata/structure; or at least ensure non-zero file size.

### Gemini Instructions (summary)

* Build view-model builders.
* Create simple invoice and packing HTML templates.
* Implement doc-generation endpoint and persistence.
* Wire minimal UI for document generation & downloads.

---

## Epic 6 – History & Audit v1

### Scope

* Persist shipments and operations, and expose a minimal history UI.

### Non-goals

* No advanced reporting/dashboards yet.

### Implementation Steps

1. **Shipment list API:**

   * `GET /api/shipments` with filters:

     * Pagination.
     * Optional search by ERP order ID or destination.
   * Return summary fields:

     * id, createdAt, erpOrderId, destinationCountry, status, validation status.

2. **Shipment detail API consolidation:**

   * `GET /api/shipments/:id` returns:

     * `ShipmentV1`.
     * Line items.
     * Parties.
     * Validation summary.
     * Document metadata.

3. **Audit log model & events:**

   * DB model:

     * `id`, `timestamp`, `userId`, `shipmentId`, `eventType`, `payload` (JSON).
   * Event types (Phase 1):

     * `SHIPMENT_IMPORTED`
     * `VALIDATION_RUN`
     * `SHIPMENT_EDITED`
     * `DOCUMENTS_GENERATED`
   * Emit events:

     * After import completes.
     * After validation engine run.
     * After any edit endpoint (for now, log entire shipment diff or payload).
     * After document generation.

4. **UI – History list:**

   * Simple table:

     * Columns: Date, ERP ID, Consignee name, Destination, Status, Validation (OK/Issues).
     * Actions: View.

5. **UI – Shipment detail:**

   * Sections:

     * Summary (header).
     * Line items (table).
     * Validation issues (list).
     * Documents (list with links).
     * Activity log (timeline of audit events; Phase 1 could be minimal).

### Testing

* API integration tests:

  * Create sample shipments and check list & detail responses.
* Audit tests:

  * After import/doc generation, assert audit records exist.

### Gemini Instructions (summary)

* Implement list/detail endpoints on backend.
* Create audit log model and hooks in import/validation/doc-gen flows.
* Build simple React components in web app to display shipments and history.

---

## Epic 7 – DX, Tests, and Governance (Phase 1)

### Scope

* Make Phase 1 changes safe and maintainable.
* Ensure Gemini doesn’t silently break compliance-related behavior.

### Implementation Steps

1. **Linting & Type-checking:**

   * Ensure `npm test`, `npm run lint`, and `npm run typecheck` (or equivalents) work from repo root.
   * Wire these into CI.

2. **Minimum test coverage:**

   * Add at least:

     * Unit tests for:

       * CSV mapping.
       * Validation rules.
       * View-model builders.
     * One e2e test:

       * Flow: `CSV import -> validation -> document generation`.
   * Use a realistic synthetic input (e.g., a fake ERP export for one shipment).

3. **Compliance disclaimer surfaces:**

   * In web UI:

     * Add a top-level banner or footer notice in shipment screens:

       * Clarify that tool is an assist, not a legal authority.
   * In docs/README:

     * Add a “Compliance Disclaimer” section.

4. **Developer docs:**

   * Add `docs/phase1-architecture.md`:

     * Canonical schema overview.
     * Data flow: import -> canonical -> validation -> docs.
     * Where validation rules live and how to add new ones.
   * This doc is also a prompt source for Gemini in future phases.

5. **Git/PR hygiene:**

   * For Antigravity/Gemini:

     * Prefer one branch per epic.
     * PR template includes:

       * Summary.
       * Affected modules.
       * Tests added.

### Testing

* CI should run tests & lint on all Phase 1 branches.
* Manual sanity run:

  * Developer (you) runs the full e2e flow once and confirms UI + PDFs look correct.

### Gemini Instructions (summary)

* Ensure commands to run tests and lint are clearly specified in repo docs.
* Add tests and docs as described.
* Keep all Phase 1 changes fully typed and covered by at least smoke tests.

---

## Phase 1 – Integration Order for Gemini

Recommend instructing Gemini/Antigravity to follow roughly this order:

1. **Epic 1:** Canonical schema + DB models + API contracts.
2. **Epic 2:** CSV import -> create canonical shipments.
3. **Epic 4:** Validation engine v1 and wiring into import.
4. **Epic 5:** Document generation (uses canonical + validation).
5. **Epic 6:** History & audit (uses shipment/doc data).
6. **Epic 3:** OCR mapping (once canonical & validation are stable).
7. **Epic 7:** Tests, DX, and docs tying everything together.

You can then craft one Antigravity/Gemini prompt per epic, referencing this plan.

---
