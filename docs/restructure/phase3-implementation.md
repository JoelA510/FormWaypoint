## Assumptions

* Phase 1 and 2 are implemented and stable:

  * Canonical `ShipmentV1` / `ShipmentLineItemV1` / `PartyV1` / `ShipmentDocumentV1`.
  * CSV and OCR import -> canonical.
  * Validation engine v2 with overrides.
  * Address book, Item master, Shipment templates.
  * Expanded document set (Invoice, Packing, Proforma, SLI, COO, DG layout).
  * Reporting, history, and audit logging in place.
* Stack:

  * Backend: Node/TypeScript with relational DB and Prisma (or equivalent).
  * Frontend: Vite + React.
* Phase 3 will:

  * Add the first **real carrier integration** (likely via an aggregator).
  * Add **forwarder handoff packages**.
  * Add **ERP feedback/export**.
  * Add **advanced compliance hooks** (AES/EEI, DG assist, sanctions) with strict disclaimers.
* No carrier/ERP will be hardcoded; all integrations must be optional and feature-flagged.

---

## Phase 3 – High-Level Goals

* **G1:** Provide rate and label/booking flows for at least one carrier (or aggregator) via a `CarrierGateway` abstraction.
* **G2:** Provide structured booking packages and email templates for freight forwarders (CEVA, Nippon, etc.).
* **G3:** Close the loop back to ERP with a generic “shipment completion export” that can be adapted to JDE/SAP.
* **G4:** Provide structured AES/EEI and DG assist features that support compliance without pretending to be the authority of record.
* **G5:** Control all integrations with feature flags, strong logging, and solid tests.

---

## Epic 14 – Carrier API Integration & Pilot Rate/Booking

### Scope

* Introduce a **carrier abstraction layer** (`CarrierGateway`).
* Integrate with at least one carrier or aggregator for:

  * Rating (rate shopping).
  * Shipment booking.
  * Label generation.
  * Basic tracking hookup.

### Non-goals

* No full implementation for multiple carriers in this epic.
* No deep carrier-specific options (accessorials, multi-stop, etc.) yet.
* No direct modification of ERP in this epic.

### Implementation Steps

1. **Data model extensions**

   * Add a `CarrierAccount` table:

     * `id: string`
     * `carrierCode: string` (e.g., `UPS`, `FEDEX`, `DHL`, `AGG_EASYPOST`)
     * `displayName: string`
     * `apiType: "direct" | "aggregator"`
     * `credentialsJson: jsonb` (encrypted or stored in a secrets service in reality)
     * `isActive: boolean`
     * `createdAt`, `updatedAt`

   * Add a `ShipmentCarrierMeta` table (or embed in `Shipment`):

     * `shipmentId: string`
     * `carrierAccountId?: string`
     * `selectedServiceCode?: string`
     * `rateQuoteJson?: jsonb` (full raw quote used)
     * `bookingResponseJson?: jsonb`
     * `labelDocumentId?: string` (FK to `ShipmentDocument`)
     * `trackingNumber?: string`
     * `bookedAt?: Date`

   * For simplicity, embed `carrierCode` and `serviceLevelCode` in `ShipmentV1` view model but store full meta here.

2. **`CarrierGateway` abstraction**

   * Define an interface in backend (TypeScript):

     ```ts
     interface RateQuoteRequest {
       shipment: ShipmentV1;
       lineItems: ShipmentLineItemV1[];
     }

     interface RateOption {
       carrierCode: string;
       serviceCode: string;
       serviceName: string;
       estimatedTransitDays?: number;
       totalCharge: number;
       currency: string;
       raw: unknown;
     }

     interface BookingRequest {
       shipmentId: string;
       selectedRate: RateOption;
       labelFormat?: "PDF" | "ZPL";
     }

     interface BookingResult {
       trackingNumber: string;
       labelPdfBuffer: Buffer;
       raw: unknown;
     }

     interface CarrierGateway {
       rateQuote(req: RateQuoteRequest): Promise<RateOption[]>;
       createShipment(req: BookingRequest): Promise<BookingResult>;
       cancelShipment?(trackingNumber: string): Promise<void>;
       trackShipment?(trackingNumber: string): Promise<unknown>;
     }
     ```

   * Implement a registry:

     ```ts
     function getCarrierGateway(carrierAccount: CarrierAccount): CarrierGateway;
     ```

3. **Pilot integration (one carrier/aggregator)**

   * Choose a first integration target (architecturally assume an aggregator like EasyPost/ShipEngine, but code must be generic).

   * Implement `AggregatorGateway`:

     * Map `RateQuoteRequest` -> aggregator API call.
     * Map aggregator response -> `RateOption[]`.
     * Map booking requests -> label and tracking.

   * Use environment variables / secrets for creds, but read them into `CarrierAccount.credentialsJson` or equivalent.

4. **Rate shopping API**

   * Endpoint: `POST /api/shipments/:id/rates`

     * Steps:

       * Retrieve Shipment + LineItems.
       * Run validation:

         * If there are un-overridden errors that are incompatible with real shipment (e.g., missing address or weight):

           * Return 422 with issues, do not call carrier.
       * Build `RateQuoteRequest`.
       * Look up available `CarrierAccount`s that are active and allowed.
       * For each account:

         * Call `getCarrierGateway(account).rateQuote(req)`.
         * Aggregate all `RateOption`s.
       * Persist `rateQuoteJson` into `ShipmentCarrierMeta` (for reproducibility).
       * Return a list of normalized `RateOption`s to UI.

   * Handle failures:

     * If a carrier call fails:

       * Log error (with correlation ID).
       * Continue with others (partial success allowed).
       * Mark in response which carriers had errors.

5. **Booking & label API**

   * Endpoint: `POST /api/shipments/:id/book`

     * Body: `{ carrierAccountId, serviceCode }`.

     * Steps:

       * Check that a rate quote is available for this shipment and selected carrier/service (or re-call rateQuote to verify).
       * Build `BookingRequest`.
       * Call `gateway.createShipment`.
       * On success:

         * Store `trackingNumber`, `bookingResponseJson` in `ShipmentCarrierMeta`.
         * Generate `ShipmentDocumentV1` for label:

           * Store label PDF as document (type `carrier-label`).
         * Update `ShipmentV1` representation to include `carrierCode`, `serviceLevelCode`, `trackingNumber`.
         * Emit audit event `CARRIER_BOOKED`.
       * On failure:

         * Return structured error.
         * Emit audit event `CARRIER_BOOKING_FAILED`.

6. **Tracking API (minimal)**

   * Endpoint: `GET /api/shipments/:id/tracking`

     * Steps:

       * Look up `ShipmentCarrierMeta` for tracking number and carrier.
       * If gateway supports `trackShipment`:

         * Call it, return normalized status (e.g., delivered/in transit/exception).
       * Else:

         * Provide link template to carrier’s public tracking page.

7. **Feature flags & configuration**

   * Add configuration:

     * `carrierIntegrationEnabled: boolean` (per environment).
     * Optional: `allowedCarrierCodes: string[]`.

   * Ensure:

     * When disabled, rate and booking endpoints return 503 or harmless stub.

8. **UI integration**

   * On shipment detail page:

     * New “Rate & book” section:

       * Button: “Get rates”.
       * Table of `RateOption`s: carrier, service, price, transit estimate.
       * Action: “Select & book” -> calls booking endpoint.

     * Show booked status:

       * Carrier, service, tracking number.
       * Button: “View label” (download from documents).
       * Button: “Open carrier tracking” (link).

   * Distinguish clearly between:

     * Document-only shipments (no booking).
     * Booked shipments.

### Testing

* Backend:

  * Unit tests for `AggregatorGateway` mapping functions.
  * Unit tests for `getCarrierGateway` registry.
  * Integration tests using mocked HTTP client for aggregator:

    * Successful rate/booking.
    * Error handling (timeouts, bad responses).

* Frontend:

  * Tests for rate table rendering and selection.
  * Test for booking flow with mocked API.

* E2E (sandbox mode):

  * Use a fake carrier or a test account endpoint.
  * Flow: create shipment -> rate -> book -> label document created.

### Gemini Instructions (summary)

* Introduce `CarrierGateway` abstraction and registry.
* Implement one concrete gateway for a pilot carrier/aggregator.
* Add rate/booking/tracking APIs and DB models.
* Add UI components for rate shopping and booking.
* Build tests and ensure all carrier calls are behind feature flags and safe error handling.

---

## Epic 15 – Freight / Forwarder Handoff

### Scope

* Support **LTL/air/ocean** workflows where booking is typically via forwarders (CEVA, Nippon, etc.).
* Generate **data bundles and email packages** that reduce duplicate entry in portals or manual emails.

### Non-goals

* No EDI implementation beyond a basic payload design.
* No direct integration with all forwarder APIs in this epic.

### Implementation Steps

1. **Forwarder profile model**

   * `ForwarderProfile` table:

     * `id: string`
     * `name: string` (e.g., CEVA, Nippon)
     * `emailTo: string[]`
     * `emailCc?: string[]`
     * `emailSubjectTemplate: string` (e.g., `Booking request: {{shipmentId}} / {{consigneeName}}`)
     * `emailBodyTemplate: string` (e.g., mustache-style template referencing shipment fields)
     * `attachmentTypes: string[]` (e.g., `["commercial-invoice", "packing-list", "sli"]`)
     * `dataBundleFormat: "csv" | "json" | "none"`
     * `createdAt`, `updatedAt`

2. **Booking package view model**

   * Build `ForwarderBookingPackageViewModel`:

     * `shipment: ShipmentV1`
     * `lineItems: ShipmentLineItemV1[]`
     * `shipper: PartyV1`
     * `consignee: PartyV1`
     * `forwarder: PartyV1`
     * `documents: ShipmentDocumentV1[]` (filtered for included types)
     * `summary:`

       * `totalWeight`
       * `totalVolume` (if dims are present later)
       * `numPackages`
       * `readyDate`, `cutoffDate?`

   * This view model feeds both:

     * Email templates.
     * Data bundles.

3. **Bundle generation**

   * CSV bundle:

     * Column set:

       * Shipment refs (internal, ERP).
       * Shipper/consignee addresses.
       * Line description, HTS, quantity, weight, value.
     * Implement `buildForwarderCsvBundle(viewModel)` that returns a CSV string or buffer.

   * JSON bundle:

     * Direct serialization of a simplified version of the view model.

   * Store generated bundle as a `ShipmentDocumentV1` of type `forwarder-data-bundle` (format `csv` or `json`).

4. **Email template rendering**

   * Use a simple templating system (e.g., mustache/handlebars-like):

     * Replace tokens like `{{shipment.id}}`, `{{consignee.name}}`, `{{totalWeightKg}}`.

   * Build a function:

     ```ts
     function buildForwarderEmail(
       profile: ForwarderProfile,
       vm: ForwarderBookingPackageViewModel
     ): { subject: string; body: string; recipients: string[]; cc: string[] };
     ```

   * DO NOT send emails directly in Phase 3; instead:

     * Return content to UI or:

       * Optionally integrate with a mailer behind a strict feature flag and config (safe default: manual).

5. **API endpoints**

   * `GET /api/forwarders` – list profiles.
   * `POST /api/forwarders` – create/update profiles.
   * `POST /api/shipments/:id/forwarder-package`:

     * Body: `{ forwarderProfileId: string }`.

     * Steps:

       * Build booking view model.
       * Generate required docs if missing (Invoice, Packing, SLI, etc.).
       * Generate data bundle if required.
       * Build email subject/body.
       * Persist bundle/doc metadata.
       * Return:

         * Subject, body, recipients.
         * Links to attachments.

6. **UI integration**

   * On shipment detail:

     * A “Forwarder booking” panel:

       * Select forwarder profile.
       * Generate booking package.
       * Show:

         * Subject.
         * Body (in a text area).
         * Attachments list (links).
       * Button: “Copy email text” and “Copy recipients”.

   * Optionally: a “Send via configured SMTP” button in a later sub-epic.

### Testing

* Backend:

  * Unit tests for:

    * Email template rendering.
    * CSV/JSON bundle generation.
  * Integration test:

    * Forwarder package generation for a sample shipment.

* Frontend:

  * Test rendering of booking panel and copy-to-clipboard logic (if implemented).

### Gemini Instructions (summary)

* Define `ForwarderProfile` model and CRUD APIs.
* Implement view models and bundle builders (CSV/JSON).
* Implement booking package endpoint and UI.
* Do not send emails automatically by default; surface outputs to the user.

---

## Epic 16 – ERP Feedback Loop & Generic Export

### Scope

* Provide a **generic shipment completion export** that ERP teams can ingest.
* Support both **file-based** and **HTTP-based** export flows.
* Keep ERP-specific logic mostly in configuration.

### Non-goals

* No direct JDE/SAP API integration in this epic.
* No bidirectional sync; this is outbound-only.

### Implementation Steps

1. **Export schema**

   * Define `ShipmentCompletionExportV1`:

     * `shipmentId: string`
     * `erpOrderId?: string`
     * `erpShipmentId?: string`
     * `shipDate: string` (ISO date)
     * `carrierCode?: string`
     * `serviceLevelCode?: string`
     * `trackingNumber?: string`
     * `totalFreightCharge?: number`
     * `currency: string`
     * `destinationCountry: string`
     * `documents: { type: string; url: string }[]` (public or internal URLs)
     * `exportedAt: string`

   * This is the canonical shape used for export.

2. **Export configuration**

   * `ErpExportConfig` table or config file:

     * `id: string`
     * `name: string` (e.g., “JDE CSV”, “SAP JSON API”)
     * `targetType: "file" | "http"`
     * `fileFormat?: "csv" | "json"`
     * `filePathTemplate?: string` (e.g., `/exports/jde/{{YYYY}}/{{MM}}/shipments-{{date}}.csv`)
     * `httpUrl?: string`
     * `httpMethod?: "POST" | "PUT"`
     * `httpHeadersJson?: jsonb`
     * `enabled: boolean`
     * `createdAt`, `updatedAt`

   * Keep mapping from canonical export fields to ERP fields in JSON if needed (`fieldMappingsJson`).

3. **Export job model**

   * `ErpExportJob` table:

     * `id: string`
     * `configId: string`
     * `status: "pending" | "running" | "success" | "failed"`
     * `fromDate: Date`
     * `toDate: Date`
     * `createdAt`, `updatedAt`
     * `runAt?: Date`
     * `errorMessage?: string`
     * `exportedShipmentIds?: string[]`

4. **Export builder**

   * Build a function:

     ```ts
     function buildShipmentCompletionExports(
       fromDate: Date,
       toDate: Date
     ): Promise<ShipmentCompletionExportV1[]>;
     ```

     * Fetch all shipments with `shipDate` (or equivalent) in range.
     * For each:

       * Build export payload from canonical Shipment + `ShipmentCarrierMeta` + `ShipmentDocument` records.

   * Implement:

     * CSV builder: `exportsToCsv(exports: ShipmentCompletionExportV1[]): string`.
     * JSON builder: `exportsToJson(exports: ShipmentCompletionExportV1[]): unknown`.

5. **Export runners**

   * File-based runner:

     * For `targetType = "file"`:

       * Resolve `filePathTemplate` using current date/time.
       * Write CSV/JSON string to that path (or to configured storage bucket).
       * Update `ErpExportJob` with success/failure.

   * HTTP-based runner:

     * For `targetType = "http"`:

       * POST/PUT JSON exports array to configured URL.
       * Respect headers and auth from `httpHeadersJson`.
       * Handle responses:

         * 2xx -> success.
         * Other -> failure, store error.

6. **APIs for export management**

   * `POST /api/erp-export-jobs`:

     * Body: `{ configId, fromDate, toDate }`.
     * Creates job and kicks off runner (or schedules via background worker).

   * `GET /api/erp-export-jobs` – list jobs and statuses.

   * `GET /api/erp-export-jobs/:id` – details and error message.

7. **UI integration**

   * “ERP Export” screen:

     * List available `ErpExportConfig`s.
     * Form to create a new job (date range).
     * Table of jobs with status and link to logs.

   * On Shipment detail:

     * Optional label “Included in ERP export on <date> (job id)”.

### Testing

* Backend:

  * Unit tests:

    * Export builder for sample shipments.
    * CSV/JSON formatting with edge cases (missing tracking, missing freight charges).
  * Integration tests:

    * File-based runner writes to a temp directory.
    * HTTP-based runner using a mock HTTP server.

* Frontend:

  * Tests for export job creation and listing.

### Gemini Instructions (summary)

* Implement canonical completion export format.
* Implement config-driven file and HTTP export runners.
* Provide APIs and basic UI to drive exports.
* Ensure everything is idempotent and robust to failures.

---

## Epic 17 – Advanced Compliance (AES/EEI, DG Assist, Sanctions Hooks)

### Scope

* Provide **structured support** for AES/EEI, DG data, and sanctions checks.
* Make clear that:

  * The tool is an assistant.
  * Final decisions remain with compliance staff.

### Non-goals

* No full end-to-end AES submission (unless you later choose to implement and test it thoroughly).
* No proprietary regulatory content baked in; use configuration and generic rules.

### Implementation Steps

#### 17.1 AES/EEI Assist

1. **Data model extensions**

   * In `ShipmentV1` or associated table, ensure fields:

     * `aesRequired?: boolean`
     * `aesItn?: string`
     * `eeiExemptionCode?: string`
     * `aesFiledAt?: Date`
     * `aesFilingMethod?: "AESDirect" | "Broker" | "Forwarder"`

   * These may already exist from earlier phases; if so, standardize naming and persistence.

2. **AES payload builder (assist)**

   * Define `AesFilingPayloadV1` (not sent automatically in this epic):

     * `exporter`: party details.
     * `consignee`: party details.
     * `shipmentDetails`: origin, destination, mode of transport.
     * `lineItems`: HTS, value, quantity, ECCN, COO.
     * `routedTransaction?: boolean`
     * `exemptionCode?: string`.

   * Implement:

     ```ts
     function buildAesFilingPayload(shipmentId: string): Promise<AesFilingPayloadV1>;
     ```

   * Use this to generate a JSON or CSV that:

     * Can be used by a broker/compliance person to key into AESDirect.

3. **UI workflow**

   * On shipment detail:

     * “AES/EEI” section:

       * Show:

         * AES-required determination (from validation engine).
         * Fields for: `aesRequired`, `aesItn`, `eeiExemptionCode`, `aesFilingMethod`.
       * Button: “Generate AES data file”:

         * Calls builder.
         * Saves JSON/CSV as `ShipmentDocumentV1` of type `aes-data`.
         * Makes file downloadable.

   * Validation updates:

     * If `aesRequired === true` and `aesItn` and `eeiExemptionCode` are both empty:

       * Error or strong warning.
     * Once `aesItn` is entered:

       * Validation passes for AES.

4. **Audit**

   * Emit `AES_DATA_GENERATED` event when builder runs.
   * Emit `AES_INFO_UPDATED` when ITN/exemption fields change.

#### 17.2 DG Assist

1. **UN number reference**

   * `DgUnReference` table:

     * `id: string`
     * `unNumber: string`
     * `properShippingName: string`
     * `hazardClass: string`
     * `packingGroup?: string`
     * `limitedQuantityEligible?: boolean`
     * `notes?: string`

   * Seed with a **small** starter set relevant to your traffic or keep it configurable.

2. **Auto-fill DG fields**

   * When user sets `dgUnNumber` on a line or when a template line has it:

     * Auto-fill `dgHazardClass`, `dgPackingGroup` from reference if present.
     * Mark that auto-fill was used (for audit).

3. **DG validation rules**

   * Extend validation engine:

     * If `isDangerousGoods` true but no `dgUnNumber` -> error.
     * If `dgUnNumber` exists but not found in reference -> warning.
     * If `dgHazardClass` or `dgPackingGroup` missing for known UN -> error.

4. **UI**

   * In line-item editor:

     * When `isDangerousGoods` is toggled:

       * Show DG sub-fields and a UN lookup field.
     * Provide auto-complete on `dgUnNumber` from `DgUnReference`.

   * On DG declaration document generation:

     * Use fully populated DG fields, but include an on-page disclaimer.

5. **Audit**

   * Log `DG_FIELDS_AUTOFILLED` when reference data is used to fill line fields.

#### 17.3 Sanctions / Denied Party Hooks

1. **Sanctions check abstraction**

   * Define `SanctionsCheckGateway` interface:

     ```ts
     interface SanctionsCheckGateway {
       checkParties(parties: PartyV1[]): Promise<{
         partyId: string;
         status: "clear" | "potential_match" | "error";
         details?: unknown;
       }[]>;
     }
     ```

   * Provide a **stub implementation** that always returns `status: "clear"` until you integrate with a real provider.

2. **Integration points**

   * On demand: `POST /api/shipments/:id/sanctions-check`:

     * Evaluate shipper, consignee, forwarder, broker.
     * Store results in a `SanctionsCheckResult` table:

       * `id`, `shipmentId`, `resultsJson`, `createdAt`.

   * Validation integration (optional in Phase 3):

     * If any `potential_match` is returned:

       * Add validation WARNING: “Sanctions check returned potential matches; review before shipment.”

3. **UI**

   * “Sanctions check” section:

     * Button: “Run sanctions check”.
     * List last result status and timestamp.
     * Note: “This is an external screen; final responsibility remains with your compliance officer.”

### Testing

* AES:

  * Backend:

    * Unit tests for `buildAesFilingPayload` mapping.
    * Validation tests for AES-required vs ITN/exemption fields.
  * Frontend:

    * Tests for AES info form and generating data file.

* DG:

  * Backend:

    * Tests for UN reference lookup and auto-fill behavior.
    * DG validation rules.
  * Frontend:

    * Tests for DG fields in line editor, auto-complete.

* Sanctions:

  * Backend:

    * Tests for stub `SanctionsCheckGateway`.
  * Frontend:

    * Simple tests for sanctions section rendering.

### Gemini Instructions (summary)

* Extend models and validation for AES fields, DG assist, and sanctions hooks.
* Implement AES data file generation and UI to capture ITN/exemption.
* Implement DG UN reference lookups and DG validation.
* Implement sanctions-check stub and UI, clearly labeled as assistive.

---

## Epic 18 – DX, Testing, and Governance (Phase 3)

### Scope

* Ensure integrations are **observable**, **testable**, and **separated** by environment.
* Tighten secrets handling and feature flagging.

### Non-goals

* No heavy SRE stack; basic observability is sufficient.

### Implementation Steps

1. **Environment separation**

   * Ensure config supports:

     * `ENV=local|dev|staging|prod`.
     * Separate carrier/ERP configs per environment.
     * Test carrier accounts separate from production accounts.

   * For non-prod envs:

     * Always use test endpoints/credentials.
     * Visibly label UI as “Sandbox” for carrier actions.

2. **Feature flags**

   * Centralize flags (config or DB):

     * `carrierIntegrationEnabled`
     * `forwarderIntegrationEnabled`
     * `erpExportEnabled`
     * `aesAssistEnabled`
     * `dgAssistEnabled`
     * `sanctionsCheckEnabled`

   * Wrap all new features with guards:

     * When disabled, endpoints:

       * Return 404 or 503 with clear message (configurable).

3. **Logging & monitoring**

   * For all external calls (carrier, ERP HTTP export, sanctions):

     * Log:

       * Request metadata (without sensitive data).
       * Response status.
       * Latency.
       * Errors (with truncated details).

   * Add correlation IDs:

     * Per shipment.
     * Per export job.
     * Per carrier interaction.

4. **Tests and mocks**

   * Provide:

     * Mock `CarrierGateway` implementation for tests (no network).
     * Mock `SanctionsCheckGateway`.
     * Mock HTTP ERP export server.

   * E2E tests:

     * Use mocks, not real external calls.
     * Cover:

       * Rate + booking happy path.
       * Forwarder package generation.
       * ERP export job run.
       * AES data generation.

5. **Security & secrets**

   * Ensure no credentials are stored in code or commit history.
   * Use secrets management in config:

     * Map `CarrierAccount.credentialsJson` to env or secrets vault.
     * Document expected key names.

6. **Documentation**

   * `docs/phase3-integrations.md`:

     * Carrier integration architecture.
     * Forwarder booking packages.
     * ERP export patterns.
     * AES/DG/sanctions assist.
     * Feature flags and environments.

   * Explicitly state:

     * “Integrations and compliance features are assistive only; shippers remain responsible for regulatory compliance.”

### Testing

* CI pipeline must still pass all tests with external interactions mocked.
* Manual smoke tests in a dev environment for:

  * Carrier rate and booking (against test accounts).
  * ERP export to a dev endpoint.
  * AES/DG workflows.

### Gemini Instructions (summary)

* Add environment-aware config and feature flags.
* Add structured logging around all external integrations.
* Provide mocks for carrier, ERP, sanctions in tests.
* Document Phase 3 architecture and operator responsibilities.

---

## Suggested Implementation Order for Phase 3

1. Epic 14 – Carrier API Integration & Pilot.
2. Epic 15 – Freight / Forwarder Handoff.
3. Epic 16 – ERP Feedback Loop & Generic Export.
4. Epic 17 – Advanced Compliance (AES/EEI, DG, Sanctions).
5. Epic 18 – DX, Testing, Governance.

You can create one Antigravity/Gemini task per epic, referencing these instructions and constraining affected modules.

---
