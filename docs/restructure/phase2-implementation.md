## Assumptions

* Phase 1 is mostly implemented and stable:

  * Canonical `ShipmentV1`, `ShipmentLineItemV1`, `PartyV1`, `ShipmentDocumentV1`.
  * CSV import -> canonical shipment.
  * Validation engine v1 (basic rules).
  * Commercial Invoice + Packing List generation.
  * Shipment history + minimal audit log.
* DB and backend stack:

  * Node/TypeScript backend with relational DB (Prisma or similar).
  * Web app: Vite + React.
* For Phase 2 we:

  * Do not introduce breaking schema changes without explicit migrations.
  * Prefer additive changes (new tables/columns, new endpoints).
  * Keep all Phase 2 features optional; Phase 1 flows must continue to work.

---

## Phase 2 – High-Level Goals

* **G1:** Eliminate repeated manual address entry via address book and Party reuse.
* **G2:** Centralize classification and defaults in an item master and shipment templates.
* **G3:** Expand the document set to cover most export scenarios using the same canonical data.
* **G4:** Strengthen validation with reference data and better incoterm/EEI behavior.
* **G5:** Provide basic reporting and visualization of shipping/compliance health.
* **G6:** Keep complexity manageable with tests, fixtures, and documentation.

---

## Epic 8 – Address Book & Party Management

### Scope

* Introduce a normalized Party model with true address book behavior.
* Link shipments to parties by role (shipper, consignee, forwarder, broker).
* Provide UI flows to manage parties and reuse them on shipments.

### Non-goals

* No multi-tenant contact-sharing logic; assume single organization.
* No complex permissioning per party beyond existing user model.

### Implementation Steps

1. **DB schema for Party and Shipment links**

   * Create `Party` table (if not existing):

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
     * `createdAt`, `updatedAt`
     * `createdByUserId`

   * Add role-specific foreign keys to `Shipment`:

     * `shipperPartyId?: string`
     * `consigneePartyId?: string`
     * `forwarderPartyId?: string`
     * `brokerPartyId?: string`

   * Add optional snapshot fields to preserve historical accuracy:

     * `shipperSnapshot?: PartySnapshotJson`
     * `consigneeSnapshot?: PartySnapshotJson`
     * etc.

     `PartySnapshotJson` can mirror `PartyV1` shape at time of shipment creation.

   * Migration behavior:

     * For existing shipments with inline `PartyV1` structures from Phase 1:

       * Leave inline fields in canonical `ShipmentV1`.
       * Populate `shipperSnapshot` / `consigneeSnapshot` from existing data.
       * `shipperPartyId` / `consigneePartyId` remain null until first link.

2. **Shared Party model in TypeScript**

   * Define `PartyEntity` (DB-level) in backend domain layer.

   * Extend `ShipmentV1` view model to expose:

     * `shipperParty?: PartyV1`
     * `consigneeParty?: PartyV1`
     * `forwarderParty?: PartyV1`
     * `brokerParty?: PartyV1`

   * Ensure view model builder:

     * Uses linked `Party` records when `shipperPartyId` is set.
     * Falls back to snapshot/inline data if not.

3. **Party CRUD API**

   * Endpoints:

     * `GET /api/parties?query=...` – search by name, city, country.
     * `POST /api/parties` – create.
     * `PUT /api/parties/:id` – update.
     * `DELETE /api/parties/:id` – soft delete or mark as inactive.

   * Ensure basic validation:

     * `name` and `countryCode` required.
     * Optional: simple ISO country code check.

4. **Shipment linkage APIs**

   * Add endpoints/methods to:

     * Link a shipment to a party in a role:

       `POST /api/shipments/:id/link-party` with body `{ role: "shipper"|"consignee"|"forwarder"|"broker", partyId: string }`.

     * Optionally create a new party from shipment data:

       `POST /api/shipments/:id/create-party-from-snapshot` with `{ role: ... }`.

   * On shipment creation or import:

     * Optionally auto-link shipper to a default shipper party if configured (see below).

5. **Org-level default shipper configuration**

   * Add table or config for `OrganizationSettings`:

     * `defaultShipperPartyId?: string`
     * Other future settings.

   * At shipment creation (CSV/OCR/manual):

     * If `defaultShipperPartyId` exists and no shipper is specified:

       * Assign that Party to `shipperPartyId`.
       * Populate snapshot to match.

6. **UI integration**

   * Party management screen:

     * List of Parties with search/filter.
     * Simple form to create/edit.

   * Shipment detail page:

     * For each role (Shipper/Consignee/Forwarder/Broker):

       * Show current Party name and address.
       * Actions:

         * “Select from address book” (opens searchable modal).
         * “View/edit party” (navigates or opens in modal).
         * “Create new party from current snapshot” (for imported shipments).

### Testing

* Backend:

  * Unit tests:

    * Party CRUD validations.
    * View model builder prioritizing Party records over snapshots.
  * Integration tests:

    * Create Party, link to Shipment, verify API returns correct structured data.
    * Update Party; verify snapshots on existing shipments do not change.

* Frontend:

  * Component tests:

    * Party selector modal:

      * Search and select behavior.

### Gemini Instructions (summary)

* Add Party table and foreign keys on Shipments.
* Implement Party CRUD APIs.
* Implement shipment-party linking endpoints and view model logic.
* Wire simple Party management UI and shipment role selectors.

---

## Epic 9 – Item Master & Shipment Templates

### Scope

* Introduce an item master for classification and default values.
* Implement shipment templates to speed creation of recurring lanes.
* Hook import pipeline to auto-enrich line items from item master.

### Non-goals

* No full-blown ERP item sync yet; assume manual or CSV load of item master.

### Implementation Steps

1. **DB schema: Item master**

   * Create `Item` table:

     * `id: string`
     * `sku: string` (unique per org)
     * `description: string`
     * `htsCode: string`
     * `eccn?: string`
     * `countryOfOrigin: string`
     * `defaultUnitValue?: number`
     * `defaultNetWeightKg?: number`
     * `uom?: string`
     * `createdAt`, `updatedAt`
     * `createdByUserId`

   * Consider `organizationId` if multi-tenant is in scope.

2. **TypeScript models**

   * Add `ItemMasterV1` type to shared schema package.
   * Extend `ShipmentLineItemV1` with optional `itemId?: string`.

3. **Item CRUD & import**

   * Endpoints:

     * `GET /api/items?query=...`
     * `POST /api/items`
     * `PUT /api/items/:id`
     * `DELETE /api/items/:id` (soft delete or inactive flag).

   * Bulk import:

     * `POST /api/items/import-csv` to import a simple CSV of item master.
     * Map columns to the `Item` fields.

4. **Enrichment on import**

   * In CSV and OCR import flows:

     * When building `ShipmentLineItemV1`:

       * If `sku` is present:

         * Look up in Item table.
         * If found:

           * Fill missing `htsCode`, `eccn`, `countryOfOrigin`, `uom`, and possibly `unitValue` or `netWeightKg` if absent in source.
         * Track enrichment in a `LineItemEnrichment` log (optional JSON) for debug.

   * Ensure imports **do not override** explicit data from ERP; they only fill missing fields.

5. **Shipment templates schema**

   * Create `ShipmentTemplate` table:

     * `id: string`
     * `name: string`
     * `description?: string`
     * `shipperPartyId?: string`
     * `consigneePartyId?: string`
     * `forwarderPartyId?: string`
     * `incoterm?: string`
     * `currency?: string`
     * `destinationCountry?: string`
     * `defaultCarrierCode?: string`
     * `defaultServiceLevelCode?: string`
     * `lineItemsJson?: ShipmentLineItemTemplateJson[]`
     * `createdAt`, `updatedAt`, `createdByUserId`

   * `ShipmentLineItemTemplateJson` can include:

     * `sku?: string`
     * `description?: string`
     * `htsCode?: string`
     * `countryOfOrigin?: string`
     * `defaultQuantity?: number`
     * `uom?: string`
     * `defaultNetWeightKg?: number`

6. **Template usage flows**

   * Creating a template:

     * From scratch via UI:

       * Provide name, pick parties (shipper/consignee/forwarder), incoterm, destination, and optional line templates.
     * From existing shipment:

       * “Save as template” action:

         * Copy keys: parties, incoterm, currency, destination country, optional line skeletons.

   * Applying a template:

     * In “New shipment” flow:

       * Option “Create from template”.
       * When selected:

         * Pre-populate new shipment with template parties and header fields.
         * Add line items as placeholders (quantities may default to 0 or defined defaults).
     * On import:

       * Optional future step; for Phase 2, focus on manual/new shipments UI.

7. **UI integration**

   * Template management page:

     * List templates, search by name/destination.
     * Edit and duplicate templates.

   * Shipment creation UI:

     * “New shipment from template” entry point.
     * Show template summary before creating.

### Testing

* Backend:

  * Unit tests:

    * Item enrichment logic (with/without SKU).
    * Template application builder.
  * Integration:

    * Import CSV with SKU only -> line items enriched correctly.

* Frontend:

  * Template creation and usage flows:

    * Create template from shipment.
    * Use template to create new shipment and verify fields.

### Gemini Instructions (summary)

* Add Item master model and APIs.
* Wire import flows to enrich line items when SKU matches.
* Add ShipmentTemplate model and CRUD.
* Implement “save as template” and “create from template” flows in frontend.

---

## Epic 10 – Expanded Document Library

### Scope

* Add additional document types:

  1. Proforma Invoice.
  2. Shipper’s Letter of Instruction (SLI).
  3. Generic Certificate of Origin (COO).
  4. Basic Dangerous Goods (DG) declaration layout.
  5. Optionally, LTL BOL template (if reuseable).

* All based on existing canonical data + new fields from Phase 2 where needed.

### Non-goals

* No carrier-specific BOL variants yet.
* No deep DG regulatory logic; layout + structural completeness only.

### Implementation Steps

1. **Extend document type enums**

   * Extend `ShipmentDocumentV1` document type enumeration:

     * `documentKind: "commercial-invoice" | "packing-list" | "proforma-invoice" | "sli" | "certificate-of-origin" | "dg-declaration" | "bol-ltl-basic"`

   * Update DB constraints and backend code where necessary.

2. **Define view models per document**

   * For each document type, specify a TS interface for its view model (backend):

     * `ProformaInvoiceViewModel`:

       * Similar to Commercial Invoice but may exclude final payment terms and focus on quoted values.

     * `SliViewModel`:

       * Shipper, consignee, forwarder, broker.
       * Incoterm, instructions to forwarder, AES/EEI info, contact details.

     * `CertificateOfOriginViewModel`:

       * Shipper, consignee.
       * Statement of origin.
       * List of items with origin country and HS/HTS code.
       * Signature block.

     * `DgDeclarationViewModel`:

       * Shipper, consignee.
       * Forwarder.
       * DG-specific fields (UN, proper shipping name, class, packing group, quantity).
       * Declarations and signature area.

     * `BasicBOLViewModel` (optional for Phase 2):

       * Shipper, consignee, carrier.
       * Description of goods, number of packages, weights.
       * Reference numbers (PO, PRO, etc.).

   * Implement builder functions:

     * `buildProformaInvoiceViewModel(shipmentId)`
     * `buildSliViewModel(shipmentId)`
     * etc.

3. **Document preconditions**

   * Define precondition checks for each doc type, reusing validation engine where possible:

     * Proforma:

       * No extra requirements; can be generated early.

     * SLI:

       * Require `forwarderPartyId` or at least broker contact.
       * For shipments crossing EEI threshold, require flags or warnings (ITN/exemption stub fields).

     * COO:

       * Require `countryOfOrigin` for all lines.
       * Destination not domestic-only.

     * DG declaration:

       * Require `shipment.hasDangerousGoods` or DG lines.
       * All DG lines must have UN/class/packing group fields populated.

     * Basic BOL:

       * Require carrier and service level or at least a `carrierCode`.

4. **Templates (HTML -> PDF)**

   * For each view model:

     * Build HTML templates in the same style as Phase 1 docs.
     * Ensure they are printer-friendly and use a consistent header/footer style.

   * Reuse shared components:

     * Address blocks.
     * Line item tables.
     * Totals sections.

5. **Generation API and UI**

   * Extend `/api/shipments/:id/documents` endpoint to accept new document kinds.

   * Add UI controls:

     * “Generate Proforma Invoice”
     * “Generate SLI”
     * “Generate COO”
     * “Generate DG Declaration”
     * Optionally “Generate BOL”

   * Option to “Generate full export package”:

     * Generates a standard set: Invoice, Packing, SLI, COO (where applicable).

### Testing

* Backend:

  * Unit tests for each view model builder:

    * Use fixtures with required fields and assert correct mapping.
  * Integration:

    * Generate each doc type for a valid fixture shipment and check that PDFs are stored.

* Frontend:

  * Ensure new document types appear correctly in shipment doc list and generation actions.

### Gemini Instructions (summary)

* Extend document enums and DB model.
* Implement per-document view model builders and HTML templates.
* Extend document-generation endpoint and UI to cover new types.
* Add tests for preconditions and view models.

---

## Epic 11 – Validation & Compliance Engine v2

### Scope

* Enrich validation with basic reference data and more nuanced rules (incoterms, EEI, DG completeness).
* Introduce structured override behavior and audit.

### Non-goals

* No full tariff or destination-specific law modeling.
* No obligation to be 100% regionally comprehensive.

### Implementation Steps

1. **Reference data tables**

   * `HtsReference` (lightweight):

     * `id: string`
     * `htsCode: string` (10-digit)
     * `description: string`
     * `validFrom?: date`
     * `validTo?: date`
     * Optional: `expectedUom?: string`

   * `IncotermReference`:

     * `code: string` (e.g., EXW, FOB, DAP, DDP)
     * `description: string`
     * `typicalResponsibilityNotes`: JSON or text for validation hints.

   * Seed these tables with minimal data (e.g., from public lists) or placeholders for now.

2. **Rules using reference data**

   * HTS existence:

     * For each line:

       * If `htsCode` not found in `HtsReference`:

         * Warning: “HTS code not found in reference; verify manually.”

   * Optional UOM check:

     * If `HtsReference.expectedUom` is present and `line.uom` exists and differs:

       * Warning: “UOM may not match typical HTS expectations.”

   * Incoterm sanity:

     * For DDP:

       * Warn if total customs value is 0 or low compared to line values.

     * For EXW:

       * Warn if shipper and consignee countries differ but incoterm suggests buyer picks up goods.

   * EEI refinement:

     * Expand EEI rules:

       * If value > 2500 and export not to Canada:

         * Warning: “EEI likely required; record ITN or exemption code.”
       * If `aesRequired === true` and `aesItn` empty:

         * Error: “AES flagged as required but ITN is missing.”

   * DG completeness:

     * Existing rules strengthened:

       * If `isDangerousGoods` true and any of UN/class/packing group missing:

         * Error with clear path info.

3. **Override mechanism**

   * Extend `ValidationIssue` structure:

     * `overriddenByUserId?: string`
     * `overriddenAt?: Date`
     * `overrideReason?: string`

   * Add API to override issues:

     * `POST /api/shipments/:id/validation/override`:

       * Body: `{ issueCodes: string[], reason: string }`
       * Behavior:

         * Only applicable for issues with severity `"error"` or `"warning"`.
         * Mark them as overridden.

   * Document generation rules:

     * Errors NOT overridden -> still block document generation.
     * Errors overridden -> allow, but highlight overrides in audit log.

4. **Integration into existing validation engine**

   * Introduce rule registry:

     * Each rule has:

       * `id`, `description`, `domain`, `severityDefault`.
     * Execution function receives:

       * `shipment`, `lineItems`, reference data.

   * Configure rules:

     * Keep v1 rules; add v2 rules.
     * Maintain compatibility with earlier validation summaries; new fields are optional.

5. **UI integration**

   * Show validation issues grouped by severity and domain (Data / Compliance).

   * Add “Override” UX:

     * Checkboxes to select issues.
     * Text area for reason.
     * Button to confirm override; call override API.

   * View override details in the issues list (who, when, reason).

6. **Audit logging**

   * For override API:

     * Create audit event: `VALIDATION_OVERRIDDEN`.
     * Payload includes:

       * `issueCodes`.
       * `reason`.
       * previous vs new state.

### Testing

* Backend:

  * Unit tests for each new rule with reference fixture data.
  * Tests for override behavior:

    * Issue un-overridden -> doc generation blocked.
    * Issue overridden -> doc generation allowed.

* Frontend:

  * Tests for override UI components:

    * Selection, reason input, API call.

### Gemini Instructions (summary)

* Add simple HTS/Incoterm reference tables.
* Expand validation rules using these references.
* Implement override mechanism (API, DB fields, UI).
* Ensure document generation respects override status.

---

## Epic 12 – Reporting & Audit UX

### Scope

* Provide lightweight reporting on shipments, validation issues, and overrides.
* Make audit/history usable for supervision and process improvement.

### Non-goals

* No full BI platform; export-first design is acceptable.

### Implementation Steps

1. **Backend reporting endpoints**

   * `GET /api/reports/shipments-summary?from=...&to=...`:

     * Returns aggregated metrics:

       * Total shipments.
       * By carrier.
       * By destination country.
       * By document type generated (counts).

   * `GET /api/reports/validation-summary?from=...&to=...`:

     * Returns:

       * Counts of validation issues by code, severity.
       * Counts of overridden issues by code.

   * `GET /api/reports/overrides?from=...&to=...`:

     * Returns list:

       * Shipment ID, issue code, severity, overriddenBy, overriddenAt.

2. **Reporting UI**

   * Basic “Reports” section:

     * Filters:

       * Date range.
       * Optional carrier/destination filter.

   * Two primary views:

     * “Operational summary”:

       * Simple tables:

         * Shipments by carrier/destination.
         * Docs per shipment.

     * “Compliance/validation health”:

       * Table or simple charts:

         * Most common issues.
         * Overrides by type.

3. **Exports**

   * For each report API:

     * Support `?format=csv` to return a CSV download.
   * UI:

     * “Download CSV” button.

4. **Audit log UX improvements**

   * On Shipment detail:

     * Timeline view for audit events:

       * Imported, validated, edited, docs generated, overrides.
     * Ability to expand event to see payload summary.

### Testing

* Backend:

  * Tests for report queries with fixtures.
  * Ensure date filters work correctly.

* Frontend:

  * Smoke tests for report pages rendering with mock data.

### Gemini Instructions (summary)

* Implement reporting endpoints (shipments, validation, overrides).
* Build basic reporting UI with table views and CSV export.
* Enhance per-shipment audit timeline.

---

## Epic 13 – DX, Testing, and Governance (Phase 2)

### Scope

* Ensure Phase 2 complexity remains manageable.
* Provide docs and fixtures for future Phase 3 work.

### Implementation Steps

1. **Fixtures & seed data**

   * Add structured fixtures representing:

     * Domestic shipment.
     * International non-DG shipment requiring EEI.
     * DG shipment with valid DG fields.
     * Shipment with common validation issues.

   * Make fixtures usable in:

     * Unit tests.
     * E2E tests.
     * Local dev (seed script).

2. **Test coverage expansion**

   * Target:

     * All new models (Party, Item, Template).
     * All new view model builders (new document types).
     * All new validation rules.

   * Add at least one E2E scenario:

     * “Template-based shipment”:

       * Create template.
       * Create shipment from template.
       * Validate.
       * Generate full document set.
       * Override any intended validation issues.

3. **Compliance playbook documentation**

   * Add `docs/compliance-rules.md`:

     * Enumerate all validation rules:

       * Code, description, severity, reference rationale.
     * Explain overrides and responsibilities.
     * This becomes ground truth for AI and human reviewers.

4. **Developer documentation**

   * Add `docs/phase2-architecture.md`:

     * Address book and Party linking.
     * Item master enrichment flow.
     * Shipment templates.
     * New documents and how they map to canonical fields.

5. **CI enhancements**

   * Ensure:

     * New tests included in CI.
     * Code coverage reports highlight any untested new modules.

### Testing

* All Phase 2 tests must pass in CI.
* Manual smoke testing of key flows after integration.

### Gemini Instructions (summary)

* Create fixture data and seed scripts.
* Add unit/E2E tests around new epics.
* Document validation rules and Phase 2 architecture.
* Ensure CI includes new tests.

---

## Suggested Implementation Order for Phase 2

1. Epic 8 – Address Book & Party Management.
2. Epic 9 – Item Master & Templates.
3. Epic 10 – Expanded Document Library.
4. Epic 11 – Validation & Compliance Engine v2.
5. Epic 12 – Reporting & Audit UX.
6. Epic 13 – DX, Testing, and Governance.

You can create one Antigravity/Gemini “task prompt” per epic, referencing this plan and constraining files/modules to touch.

---
