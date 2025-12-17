---

# CIPL Standardizer and SLI/BOL Automation - Roadmap

A web app that ingests CIPL documents in many formats, normalize...L outputs for multiple carriers. Modern UI, late 2025 standards.

## Table of Contents

* [Scope](#scope)
* [Stack at a Glance](#stack-at-a-glance)
* [Canonical Data Model](#canonical-data-model)
* [Phases](#phases)

  * [Phase 1 - Requirements and Schema](#phase-1---requirements-and-schema)
  * [Phase 2 - Ingestion and OCR Prototype](#phase-2---ingestion-and-ocr-prototype)
  * [Phase 3 - Full Ingestion Pipeline](#phase-3---full-ingestion-pipeline)
  * [Phase 4 - Extraction and Canonical Mapping](#phase-4---extraction-and-canonical-mapping)
  * [Phase 5 - Backend Infra and Security](#phase-5---backend-infra-and-security)
  * [Phase 6 - Frontend UI and UX](#phase-6---frontend-ui-and-ux)
  * [Phase 7 - SLI and BOL Generation](#phase-7---sli-and-bol-generation)
  * [Phase 8 - Accounts, Collaboration, History](#phase-8---accounts-collaboration-history)
  * [Phase 9 - QA and Testing](#phase-9---qa-and-testing)
  * [Phase 10 - Deployment and Launch](#phase-10---deployment-and-launch)
  * [Phase 11 - Enhancements and Maintenance](#phase-11---enhancements-and-maintenance)

---

## Scope

* Convert CIPL docs (PDF, XLSX, DOCX, CSV, JSON) to a canonical standard.
* From the canonical standard, generate SLI/BOL for multiple carriers.
* Operator review flows, compliance checks, and reproducible outputs.

---

## Stack at a Glance

* Frontend: React (modern UI patterns), virtualization for large lists, keyboard-first flows.
* Backend: API + job queue + storage. OCR microservice for scanned PDFs.
* Testing: Unit, integration, and Playwright E2E; CI gates for key flows.
* Security: Least privilege, RLS (if Supabase), signed URLs, sanitized logs.

---

## Canonical Data Model

* Header: shipper, consignee, incoterms, currency, ECCN/license flags.
* Lines: part number, description, quantity, net weight (kg), value (USD), HTS/Schedule B, COO (D/F).
* Checksum: quantity, net weight, value; export hash for deterministic outputs.
* Inline Markdown: columns exactly D/F, HTS & SLI Appropriate De...y of Origin. Include HTS validation and alternates when invalid.

---

## Phases

### Phase 1 - Requirements and Schema **(Status: Completed)**

* Lock input matrix. Confirm OCR baseline. Define canonical JSON...lidations. Finalize stack. Risk register for parsing edge cases.

### Phase 2 - Ingestion and OCR Prototype **(Status: Completed)**

* **Prototype ingestion modules landed:** `services/ingestion` package exposes `parseFile(buf, type)` with dispatchers for PDF, XLSX, CSV, and DOCX inputs. Normalization enforces kg/USD units, uppercases codes, validates the canonical schema with AJV, and computes quantity/weight/value checksums.
* **Golden data + accuracy report:** Seeded `tests/golden/{pdf,xlsx,csv,docx}` fixtures plus `expected.json` snapshots. Node test coverage validates canonical output per format, size-limit guards, and accuracy script summarizing per-field success.
* **Next up:** Wire optional OCR fallback (currently stubbing via plain-text fallback for PDFs), surface normalization metadata in telemetry, and wrap the package with minimal API/CLI for manual operator trials.

### Phase 3 - Full Ingestion Pipeline **(Status: Completed)**

* Drag and drop upload with progress. ZIP fan-out. Queue jobs...ervice. Persist interim raw text or HOCR. Robust error states.

### Phase 4 - Extraction and Canonical Mapping **(Status: Completed)**

* Field mappers with layout-aware extraction. Normalization rules...dation of part/qty/weight/value at line and header levels.
* **Compliance validators:** Add HTS/Schedule B and COO checks with an explicit error catalog and auto-generated checksum rows.

### Phase 5 - Backend Infra and Security **(Status: Completed)**

* API, storage, workers, auth stubs. Back-pressure and retries. ...rsistent idempotency for uploads and parsing tasks.
* **Security hardening:** Enforce RLS policies (if Supabase), use signed URLs for blobs, redact sensitive fields in logs, and add `.env` schema validation.

### Phase 6 - Frontend UI and UX **(Status: Completed)**

* Operator dashboard, doc list, review diff, and export flows...., keyboard shortcuts, and contextual validation messages.
* **Completed:** Saved filters (Search & Master Library), batched pagination reset, sorting (Updated↓/Title↑/Priority↓), a11y/keyboard polish for virtualized lists, and virtualization for large results.

### Phase 7 - SLI and BOL Generation **(Status: Completed)**

* NCBFAA SLI and initial BOL templates. Template versioning and ... of record for what was sent to carriers and when.
* **Output generation:** Map canonical JSON to SLI/BOL templates (start with FedEx and DHL). Provide HTML→PDF rendering with deterministic pagination and template versioning.

### Phase 8 - Accounts, Collaboration, History **(Status: Completed)**

* Roles, audit log, comment threads, and history of edits per doc...iew routing. Multi-tenant readiness checklist.

### Phase 9 - QA and Testing **(Status: Completed)**

* Unit tests for mappers, validators, and exporters. Integration ...arsing pipeline, storage interactions, and template rendering.
* **E2E coverage (Playwright) — gate on CI:** Saved filters across reloads; pagination reset on any filter change; comma-in-title search; keyboard navigation of virtualized results.
* **Telemetry guardrails (dev-only):** Log a counter for result fetches per filter action to confirm “single fetch per change” outside tests.

### Phase 10 - Deployment and Launch **(Status: Completed)**

* Containerized services. CI or CD with staging gates. Secrets m...ughput and failures. Beta launch with real docs. GA after fixes.

### Phase 11 - Enhancements and Maintenance **(Status: Completed)**

* Improve OCR and ML extraction on trouble fields. **(Completed: Carrier-specific OCR training for Nippon Express/Ceva)**. Add carrier t...ory updates for Incoterms, EEI, and HTS. Live roadmap iteration.

### Phase 12 - Design Overhaul **(Status: Completed)**

* **Modern UI/UX:** Integrated Tailwind CSS, Framer Motion, and Lucide Icons.
* **Redesign:** Complete overhaul of App Layout, Upload Zone, Document Review, and Login screens.
* **Polish:** Smooth animations, glassmorphism effects, and professional typography (Inter).

---

## Validation and Sanity Checks

* HTS pattern check and country length rules.
* ECCN or license presence when license type is declared.
* Incoterms rules consistency with charges and terms.
* Export hash saved for PDFs. Reproducible exports from canonical JSON plus template version.

---

## Quick Checksum

* Phases: 11
* Inputs supported at launch: 12
* Core exports listed: 8 plus
* Accessibility target: WCAG 2.2 AA
* UI flow steps: 5

---
