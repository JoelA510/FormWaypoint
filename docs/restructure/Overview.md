## Assumptions

* Repo stack (from prior report, treat as truth unless you correct it):

  * Monorepo.
  * Web app: Vite + React, TypeScript.
  * API/backend: Node/TypeScript with a relational DB (Prisma/SQL-ish).
  * OCR/parsing service: Python (FastAPI) for CIPL ingestion.
  * Shared canonical JSON schema (`packages/schemas`) for shipments, line items, parties, etc.
* You want Gemini 3 High Reasoning in Antigravity to:

  * Propose changes.
  * Implement code (within guardrails).
  * Write/adjust tests and docs.
* Scope: implement the full roadmap:

  * Phase 1 -> MVP doc automation.
  * Phase 2 -> Operational excellence.
  * Phase 3 -> Carrier/ERP integration & advanced compliance.
* AES/EEI filing, DG deep rules, and carrier APIs are **designed** now; most of their implementation will be gated behind config/feature flags and only partially implemented until validated.

---

## Goals

* Turn Shipping-Doc-Gen into:

  * A canonical shipment data hub between ERP -> docs -> carrier.
  * A defensible compliance assistant (warnings, not a “compliance oracle”).
  * A pragmatic TMS-lite for mid-size B2B shippers (parcel + LTL/air freight).
* Keep the system:

  * Schema-driven (minimal one-off hacks).
  * Extensible (new carriers, templates, rules, import formats).
  * Auditable (logs, overrides, validations clearly traceable).

---

## Phase Overview

| Phase | Focus                      | Key Outcomes                                            | Primary Risk                            |
| ----- | -------------------------- | ------------------------------------------------------- | --------------------------------------- |
| 1     | MVP doc automation         | Robust import, canonical model, core docs, basic checks | Over-scoping MVP, no shippable slice    |
| 2     | Operational excellence     | Address book, templates, more docs, deeper validation   | Rules bloat, UX friction                |
| 3     | Carrier & ERP integrations | Rate/label, booking, ERP feedback, AES/DG expansions    | Integration complexity, compliance risk |

Each phase will be broken into workstreams that Gemini can tackle as separate Antigravity “epics” or branches.

---

## Workstream Map

We will treat these as parallel but coordinated workstreams, with dependencies between them:

1. Data ingestion & canonical model.
2. Validation & compliance rule engine.
3. Document generation & template system.
4. Address book, templates, history & audit.
5. Reporting & analytics (lightweight).
6. Carrier & rate integration.
7. ERP/back-sync integration.
8. DX, tests, infra, and governance.

Below is the overarching plan by phase and workstream.

---

## Phase 1 – MVP: Core Data, Validation, and Documents

### 1. Data Ingestion & Canonical Model

**Goal:** Guarantee that any ERP/CSV export can be normalized into a stable canonical shipment schema.

Tasks:

* **Schema hardening:**

  * Lock down a versioned canonical schema: Shipment, LineItem, Party, Carrier, Document.
  * Add explicit fields for:

    * Compliance: HTS, COO, incoterm, ECCN, DG flags, EEI flags.
    * Carrier: weight/dims, service level, references.
    * Traceability: ERP order/shipment IDs, audit metadata.
  * Add schema version field and migration strategy (so future changes are non-breaking).

* **CSV/XLSX import v1:**

  * Define 1–2 “reference formats” (e.g., generic JDE export, generic SAP export).
  * Implement:

    * Upload endpoint.
    * Mapping config (JSON) from columns -> canonical fields.
    * A simple mapping UI (or config file for now) for column binding.
  * Normalize units (weight -> kg, dims -> cm, currency -> canonical) but:

    * Store raw values separately for audit.
    * Add normalization metadata (source unit, conversion factors).

* **OCR/parsing integration v1:**

  * Confirm pipeline from uploaded PDF/image -> OCR -> parsed structure -> canonical model.
  * Add confidence scores per field.
  * Mark low-confidence fields so UI can highlight them for human review.

Output for Gemini (later detail):

* “Canonical schema refinement” task.
* “CSV import & mapping engine” task.
* “OCR-bridge to canonical schema” task.

---

### 2. Validation & Compliance Rule Engine – v1 (Guardrail, Not Oracle)

**Goal:** Basic but solid validations at import and pre-export.

Tasks:

* **Core validation layer:**

  * Implement a unified validation engine:

    * Schema-level checks (type, required fields).
    * Business rules (totals, weights, EEI thresholds).
  * Tag each rule with:

    * Severity: error/warn/info.
    * Domain: compliance/data-quality/carrier.

* **MVP rules (non-controversial basics):**

  * Missing critical fields:

    * Shipper, consignee, addresses, country codes.
    * Line description, quantity, value, HTS, COO.
  * Numeric consistency:

    * Sum(line values) ~ header customs value.
    * Sum(line weights) ~ header weights.
  * EEI threshold:

    * If any line value > 2500 USD and destination not Canada -> warn “EEI likely required”.
  * HTS format:

    * Validate length/format (10 digits for US codes, numeric).
  * DG presence:

    * If DG flag set but DG details missing -> error.

* **Validation workflow integration:**

  * On import: compute a “validation summary” object and store it with the shipment.
  * On document generation: block on errors, show warnings in UI, require explicit override to proceed.

---

### 3. Document Generation & Template System – v1

**Goal:** Generate core export documents (Commercial Invoice + Packing List) from canonical data.

Tasks:

* **Template engine baseline:**

  * Choose/confirm: HTML + headless browser -> PDF.
  * Define template metadata:

    * Name, version, layout type (invoice, packing), supported locale.
    * Mapping from canonical fields to template variables.

* **Core templates:**

  * Commercial Invoice:

    * Include: shipper/consignee, invoice number/date, line detail, HTS, COO, incoterms, totals.
    * Optional: bank/payment details, USMCA-like statements as free text placeholders.
  * Packing List:

    * Include: line items grouped by package if available, weights, dimensions, total pieces.
  * Ensure both templates:

    * Respect canonical units (display units configurable).
    * Include placeholders for signatures.

* **Generation workflow:**

  * “Generate docs” endpoint that:

    * Runs final validation.
    * Renders templates.
    * Persists PDFs linked to shipment record.
  * Basic UI:

    * List generated docs per shipment.
    * Download/open.

Caution:

* Do not over-design template system. Phase 1 should target 2–3 templates only.

---

### 4. History & Audit – v1

**Goal:** Minimal but reliable history and audit logging.

Tasks:

* **Shipment archive:**

  * List shipments with key fields (date, order ref, destination, status).
  * Detail view shows:

    * Canonical data.
    * Validation summary.
    * Links to generated PDFs.

* **Audit log:**

  * Events to log:

    * Import completed.
    * Validation run.
    * User edits a field.
    * Documents generated.
    * Validation overrides accepted.
  * Store:

    * User ID, timestamp, event type, relevant IDs, diff snapshot.

---

### 5. DX, Testing, and Governance – Phase 1

**Goal:** Ensure Gemini can work safely and repeatably in this repo.

Tasks:

* **Test harness:**

  * Unit tests around:

    * Canonical schema conversions.
    * Validation engine.
    * Document generation mapping (snapshot tests for templates).
  * One end-to-end test:

    * Import CSV -> canonical -> validation -> invoice PDF.

* **Developer workflows:**

  * Clear contribution and branching strategy for Antigravity (e.g., one branch per workstream).
  * Linting, formatting, type-checking enforced in CI.

* **Compliance disclaimers:**

  * Add explicit text in:

    * UI banner.
    * README / docs.
  * Make sure future automated behavior is legally framed as “assistance”.

---

## Phase 2 – Operational Excellence & Depth

Once Phase 1 is stable and used on real flows, expand capabilities.

### 6. Address Book & Party Management

**Goal:** Remove redundant address entry and enforce consistency.

Tasks:

* **Party model & storage:**

  * Implement Party table:

    * Name, address, contact, tax IDs, optional role tag.
  * Link Parties to Shipments using role fields (shipper, consignee, forwarder, broker).

* **Address book UI:**

  * CRUD for parties.
  * Quick-select in shipment editor (search by name/city).

* **Defaults:**

  * Allow org-level default shipper (warehouse) config.

---

### 7. Shipment Templates & Item Master Data

**Goal:** Reuse recurring patterns; centralize classification data.

Tasks:

* **Item master:**

  * Item table with:

    * SKU/part number.
    * Description, HTS, ECCN, COO, default value/weight.
  * Auto-link line items by SKU where possible, auto-fill known fields.

* **Shipment templates:**

  * Templates capturing:

    * Fixed parties (shipper/consignee/forwarder).
    * Incoterm, default carrier hints.
    * Optional default line items (or at least shell line structure).
  * UI:

    * “Create from template” entry point.
    * Manage templates (name, duplicate, retire).

* **Import integration:**

  * On import, attempt to:

    * Resolve line SKUs to known items.
    * Fill missing HTS/ECCN/COO from item master.

---

### 8. Expanded Document Library

**Goal:** Cover most export documentation scenarios from one dataset.

Targets (prioritized):

1. Proforma Invoice.
2. SLI (if not done in Phase 1).
3. Certificate of Origin (generic starter form).
4. Basic DG Declaration (layout, not full logic).
5. Optional: VICS BOL / straight BOL for LTL.

Tasks:

* Extend template registry to support these forms.
* Add any missing fields into canonical schema as needed (without breaking existing flows).
* Add per-template preconditions:

  * E.g., DG Declaration requires DG-flagged lines with complete DG details.

---

### 9. Validation & Compliance Engine – v2

**Goal:** Deeper, more context-aware validation without blocking legitimate edge cases.

Tasks:

* **Reference data integration:**

  * Import full HTS/Schedule B samples into reference table.
  * Add unit-of-measure expectations to HTS.
  * Validate line UOM compatibility (where feasible).

* **Smarter rules:**

  * Incoterm-aware checks (e.g., DDP but no duties/taxes line).
  * Destination-specific hints (e.g., EU requiring certain data).
  * EEI refinement:

    * Built-in exemption code selection for low value, Canada, etc.

* **Override theology:**

  * Structured override:

    * When user bypasses a high-severity rule:

      * Require reason.
      * Record in audit log.
  * UI surfaces shipments with frequent overrides for review.

Guardrail:

* Every new rule must:

  * Be traceable to a spec/regulation.
  * Have a clear “how to fix” message.
  * Be test-covered with realistic examples.

---

### 10. Reporting & Audit UX

**Goal:** Make shipping and compliance health observable.

Tasks:

* **Basic reports:**

  * Shipments by carrier, destination, customer.
  * Validation issues summary (counts by rule, by period).

* **Audit views:**

  * Per-shipment change history.
  * Override dashboard:

    * “Shipments with high-severity overrides this month.”

* **Exports:**

  * CSV export for shipment data and audit logs for external analysis.

---

### 11. DX, Testing, and Governance – Phase 2

**Goal:** Scale safely as complexity increases.

Tasks:

* Expand unit and e2e test coverage to new features (address book, templates, extra docs).
* Add seed data and fixtures representing:

  * Typical domestic.
  * Basic international.
  * DG shipment (for tests only).
* Add internal “compliance playbook” markdown:

  * Docs that explain validation rules and their rationale.
  * Used as ground truth for AI code reviews.

---

## Phase 3 – Carrier & ERP Integrations, Advanced Compliance

This phase is high-risk/high-reward. Design first, then implement incrementally behind feature flags.

### 12. Carrier API Integration – Architecture & Pilot

**Goal:** Introduce rate-shopping and booking without destabilizing the core product.

Tasks:

* **Abstraction layer:**

  * Define internal `CarrierGateway` interface:

    * Methods: rateQuote, createShipment, cancelShipment, trackStatus.
  * Implement one concrete gateway:

    * Either a direct integration (e.g., FedEx) or via an aggregator (e.g., EasyPost/ShipEngine) to reduce complexity.

* **Rate shopping UX:**

  * From a validated Shipment:

    * Call CarrierGateway(s) to fetch services & prices.
    * Present options ranked by strategy (cheapest/fastest).
  * Persist chosen carrier/service into Shipment.

* **Booking & label:**

  * Using CarrierGateway, create shipment:

    * Receive label PDF, tracking number.
    * Store label as associated Document, attach tracking to Shipment.
  * UX:

    * “Book & print label” flow from the shipment page.

Guardrails:

* Feature flag all carrier integrations.
* Handle failures gracefully (display errors, fall back to manual workflow).

---

### 13. Freight / Forwarder Handoff

**Goal:** Reduce friction in LTL/air/ocean flows even when APIs are limited.

Tasks:

* **Standardized data bundles:**

  * Generate:

    * Carrier-agnostic CSV/JSON bundles for freight forwarders.
    * Email-ready “booking packages” (docs + structured summary).
  * Support forwarder-specific templates (CEVA, Nippon, etc.) via configurable profiles.

* **Optional EDI/API connectors:**

  * If you choose, design but do not immediately implement:

    * EDI 204/211 or similar for LTL.
    * Forwarder booking APIs if available.

---

### 14. ERP Feedback Loop

**Goal:** Close the loop back to ERP; avoid manual updates.

Tasks:

* **Generic export:**

  * Define a “shipment completion export” schema:

    * Fields: ERP order ID, shipment ID, ship date, carrier, tracking, freight cost, doc URLs.
  * Export as CSV/JSON to a drop location or via HTTP endpoint.

* **ERP-specific adapters (design-first):**

  * For JDE/SAP, design (not necessarily implement immediately):

    * Where shipment data should land (table/view).
    * How integration can be achieved (file import, ETL, API).
  * Document these for IT teams; Shipping-Doc-Gen remains ERP-agnostic.

---

### 15. Advanced Compliance – AES/EEI, DG Assist, Sanctions Hooks

**Goal:** Provide structured support for high-risk areas without owning legal responsibility.

Tasks:

* **AES integration (design-first, implementation optional):**

  * Determine minimal data subset needed for AESDirect.
  * Define:

    * AES payload builder from canonical shipment.
    * ITN capture field and workflow.
  * Start with:

    * Generating ready-to-file AES CSV/JSON and UI to store ITN/exemption codes.

* **DG assist:**

  * Maintain a UN-number reference dataset:

    * UN code -> proper shipping name, class, packing group.
  * Auto-fill DG fields when UN is provided.
  * Add validation:

    * Ensure combinations are structurally valid.
  * Keep all “final say” in user’s hands, with prominent warnings.

* **Sanctions hooks (optional):**

  * Add extension point for denied-party checking:

    * Abstract interface that can call external screening services.
  * Do not implement deep sanctions logic yourself; just make it pluggable.

---

### 16. DX, Testing, and Governance – Phase 3

**Goal:** Keep integrations and compliance features from silently breaking.

Tasks:

* Extensive integration tests for:

  * CarrierGateway (mocked carrier responses).
  * ERP export flows.
* Contract tests for:

  * Canonical schema -> carrier payload mapping.
* Monitoring/observability:

  * Log carrier and ERP integration failures with enough context.
* Security review:

  * Credentials handling for carrier APIs.
  * Data retention policies for shipment/compliance data.

---

## How This Maps to Gemini 3 in Antigravity

At a high level, we will later break this into **AI-executable epics**:

* For each workstream:

  * Define:

    * Inputs: existing files, schemas, tests.
    * Outputs: new modules, migrations, tests, docs.
    * Guardrails: no schema-breaking changes without migration; respect RLS/security patterns; keep compliance warnings as warnings.
* Use Antigravity to:

  * Run repository-wide impact analysis before large refactors.
  * Generate codemods for schema changes and template wiring.
  * Auto-generate and run unit/e2e tests.
  * Draft migration guides and internal docs from code diff.

We will design those prompts in the next steps; the plan above defines **what** to implement and **rough sequencing**, not the specific Gemini instructions.

---