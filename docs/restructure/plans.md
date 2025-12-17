# ExecPlan - Shipping-Doc-Gen

## 1. Purpose and scope

This plan translates Deep Research findings into executable implementation steps to evolve Shipping-Doc-Gen into a reliable, ERP-adjacent document automation and shipping support tool for mid-size manufacturers. The focus is on enhancing workflow coverage, compliance, document accuracy, and handoff efficiency, while remaining easy to integrate incrementally.

**In scope:**
- Enhancements to CSV ingestion, document generation, compliance helpers, and carrier data outputs.
- Internal data validation and guardrails.
- Modular, extensible design for future carrier/API integration.

**Out of scope:**
- Full TMS/carrier booking API integrations (unless stubbed).
- Deep DG regulatory logic.
- Multi-tenant or SaaS hosting infrastructure.

---

## 2. Key findings -> changes mapping

| ID  | Finding (short)                             | Recommended change                                                   | Area                |
|-----|----------------------------------------------|------------------------------------------------------------------------|---------------------|
| F01 | CSV ingestion lacks validation                | Add schema-driven CSV ingestion with mapping UI and unit validation    | code/docs           |
| F02 | Missing HTS / ECCN / EEI support              | Add basic compliance assist, thresholds, EAR99/DG flags                | code                |
| F03 | Document generation incomplete                | Expand PDF generators for CI, PL, BOL, SLI, AWB                        | code                |
| F04 | No structured handoff to carriers             | Add email templates, file bundles, and tracking URL generators         | code                |
| F05 | No address book or templates                  | Add party/address book and lane templates with history tracking        | code/process        |
| F06 | No saved shipment history                     | Store past jobs with searchable metadata                              | code                |
| F07 | No rating or booking design                   | Stub design/interface for future rate shop & booking module            | docs/code scaffold  |
| F08 | Weak internal error handling                  | Harden error messaging and validation for all entry points             | code/process        |
| F09 | Unclear compliance responsibility boundaries  | Add UI warnings and legal disclaimers                                 | docs/process        |
| F10 | No structured modular rollout                 | Phase rollout via clear files, flags, and migration-safe steps         | process/code infra  |

---

## 3. Phased roadmap

### Phase 0 - Foundations / prerequisites

| Task ID   | Title                         | Depends on | Impact | Risk | Est. effort |
|-----------|-------------------------------|------------|--------|------|-------------|
| TASK-01   | Define CSV schema + validators| —          | High   | Low  | M           |
| TASK-02   | Add doc scaffolds for CI/PL   | —          | High   | Low  | M           |
| TASK-03   | Compliance flags framework    | —          | High   | Low  | S           |

### Phase 1 - High-impact, low-risk

| Task ID   | Title                               | Depends on | Impact | Risk | Est. effort |
|-----------|-------------------------------------|------------|--------|------|-------------|
| TASK-04   | CSV ingestion + field mapping       | TASK-01    | High   | Low  | M           |
| TASK-05   | HTS/ECCN/EEI threshold checks       | TASK-03    | High   | Med  | M           |
| TASK-06   | Full doc generation (PDF/CSV)       | TASK-02    | High   | Med  | M           |
| TASK-07   | Compliance warnings & disclaimers   | TASK-05    | High   | Low  | S           |

### Phase 2 - Medium-risk or structural refactors

| Task ID   | Title                             | Depends on | Impact | Risk | Est. effort |
|-----------|-----------------------------------|------------|--------|------|-------------|
| TASK-08   | Address book + template saves     | TASK-04    | Med    | Med  | M           |
| TASK-09   | Shipment history + search         | TASK-04    | Med    | Med  | M           |
| TASK-10   | Carrier bundle outputs            | TASK-06    | High   | Med  | M           |
| TASK-11   | Refactor error handling & tests   | TASK-04    | High   | Med  | M           |

### Phase 3 - Nice-to-have / long-term

| Task ID   | Title                                  | Depends on | Impact | Risk | Est. effort |
|-----------|----------------------------------------|------------|--------|------|-------------|
| TASK-12   | Stub rate-shop and booking interface   | TASK-10    | Med    | High | M           |
| TASK-13   | Export/Import of saved jobs            | TASK-09    | Med    | Low  | S           |
| TASK-14   | Integration design for SAP/JDE future  | TASK-04    | Med    | Med  | M           |

---

## 4. Concrete task backlog for Gemini

- TASK-01: Define CSV schema + validators
  - Source finding(s): F01
  - Type: code change
  - Target area: /core/ingest/, /schemas/
  - Description:
    - Define canonical field set for shipment headers + line items
    - Add Pydantic-based validation layer
    - Support unit coercion (kg/lb, inch/cm)
    - Detect missing required fields
  - Risks / caveats:
    - Variants across ERP exports
    - Tolerances for bad input must be clear
  - Acceptance criteria:
    - CSVs with missing fields are rejected with clear errors
    - All required fields enforced per type
    - Validator tested with 5 example files

- TASK-02: Add doc scaffolds for CI/PL
  - Source finding(s): F03
  - Type: code change
  - Target area: /docs/generation/
  - Description:
    - Implement template system for PDF export
    - Initial support for commercial invoice and packing list
    - Embed key header + line details
  - Risks / caveats:
    - Intl address format edge cases
    - Currency formatting
  - Acceptance criteria:
    - Sample invoice renders correctly for test job
    - Can export PDF and CSV side-by-side

(Additional tasks omitted for brevity in display. Continue through TASK-14.)

---

## 5. Dependencies and sequencing

- CSV schema validation (TASK-01) is required before reliable ingestion (TASK-04).
- Compliance tagging (TASK-03) feeds warnings (TASK-07) and HTS logic (TASK-05).
- Document generation (TASK-02, TASK-06) must precede email/export logic (TASK-10).
- Carrier integrations (TASK-12) should only be stubbed after bundle outputs are solid.

**Safe rollout strategy:**
- Use feature toggles or `settings.yml` to gate new modules (e.g., compliance checks).
- Keep legacy doc generators alongside new ones until stable.
- Design all schema changes as additive with fallbacks to avoid breakage.

---

## 6. Prompts for Gemini 3 HR in Antigravity

- "Using PLANS.md, implement TASK-01 in Shipping-Doc-Gen. Build a validation layer for CSV ingestion with Pydantic schemas. Enforce required fields and type safety."
- "Using PLANS.md, implement TASK-02. Create PDF document generation scaffolds for CI and PL using templating."
- "Using PLANS.md, implement TASK-05. Add HTS and ECCN parsing and minimal EEI eligibility rules, warn on invalid thresholds."
- "Implement TASK-08 per PLANS.md. Add persistent address book and recurring lane templates."
- "Refactor as per TASK-11. Improve exception handling and data validation failure messages across ingestion and generation."
- "Begin TASK-12 (stub only). Design an interface and fake rate-shop UI for future integrations—no real carrier calls yet."

---

## 7. Risks, open questions, and non-goals

**Top risks:**
- Fragile CSV parsing due to ERP export inconsistencies
- User misunderstanding of compliance flags vs. legal liability
- State leakage or inconsistency across multi-step job workflows
- Performance bottlenecks in large multi-line shipment exports
- Overengineering of Phase 3 before Phase 1 is hardened

**Open questions:**
- Should this persist state server-side or stay stateless per job?
- Should HTS/COO data come from ERP, user, or both?
- Which 1–2 carriers should get stubbed first (FedEx, CEVA, etc.)?

**Non-goals:**
- Real-time rating or API-based booking
- Multi-tenant SaaS productization
- Full DG compliance engine (e.g., UN codes, segregation rules)

