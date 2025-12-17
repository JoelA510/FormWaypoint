# Project Charter

## Vision
Deliver a shipping documentation automation platform that ingests diverse commercial invoices and packing lists (CIPL), normalizes them into a canonical shipment record, and generates compliant SLI/BOL outputs with actionable discrepancy resolution.

## Scope at a Glance
- **Supported inputs at launch:** PDF (native & scanned), DOCX, XLSX, CSV, JSON, XML, PNG, JPG, TIFF, email (.eml/.msg), ZIP batches, inbound REST JSON.
- **Core outcomes:** OCR for scans/images, canonical JSON system of record, export to CSV/XLSX/Markdown tables, discrepancy checks with remediation workflows.
- **Primary outputs:** NCBFAA SLI (v2020+), FedEx/DHL/UPS EEI helpers, NMFTA Straight BOL, VICS BOL, templates for CEVA, DB Schenker, Kuehne+Nagel, Nippon Express, with optional IATA AWB and ocean B/L autofill.
- **User journey:** Upload or email ingest → automatic parsing & normalization → side-by-side review with confidence indicators → validation & discrepancy resolution → export & downstream sync.

## UX Tenets
- WCAG 2.2 AA compliant responsive interface with light/dark themes and density toggle.
- Keyboard-first workflows with clear error surfacing and inline editing of parsed values.
- Transparent confidence scores and change tracking for reviewers.

## Technology Stack
- **Frontend:** React 19 + Next.js 15 (App Router, Server Components), TypeScript, Tailwind CSS 4, Radix UI, TanStack Query.
- **Backend:** Node.js 22 API service with PostgreSQL 16, object storage, Redis/SQS queues.
- **OCR & Parsing:** Python 3.11 FastAPI service with Tesseract/PaddleOCR, pdfminer, rules-first extraction augmented by ML.
- **Rendering & Outputs:** Playwright-backed HTML→PDF, CSV/XLSX/Markdown exporters.

## Risks & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Low OCR accuracy on mixed-quality scans | Blocks canonicalization | Collect representative samples early, benchmark OCR engines, plan for ML-assisted cleanup |
| Complex carrier-specific requirements | Export non-compliance | Maintain versioned template registry and validation rules per carrier |
| Performance on large batch uploads | User frustration, timeouts | Queue-based ingestion with background workers, streaming status updates |
| Regulatory updates (HTS, Incoterms) | Data inconsistency | Centralize normalization rules in shared packages, schedule quarterly reviews |
| Multi-tenant security gaps | Data leakage | Enforce org scoping, SSO, RBAC, audit logs from the outset |

## Success Criteria
- Canonical shipment schema accepted by API, OCR service, and frontend without translation gaps.
- Upload → review → export happy path functioning with discrepancy visibility.
- Compliance outputs validated against carrier checklists.
- Observability and audit trails in place for post-launch support.
