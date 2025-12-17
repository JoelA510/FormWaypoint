# Ingestion Pipeline Scaffold

## Objectives
Establish a modular ingestion backbone that can process heterogeneous document types, orchestrate OCR where required, and capture intermediate artifacts for auditing.

## High-Level Flow
1. **Intake**
   - HTTP upload endpoint (single + batch) and monitored email inbox fan-in.
   - Client preflight validation for file size, type, and virus scanning handshake.
   - ZIP handling with per-file metadata extraction.
2. **Staging**
   - Persist original files to object storage with immutable versioning.
   - Enqueue jobs in Redis/SQS with payload referencing storage keys, tenant, and submission context.
3. **Pre-processing**
   - Branch by MIME type: native PDFs → text extraction; images/scans → OCR queue; structured formats (DOCX/XLSX/CSV/JSON/XML) → adapters.
   - Generate HOCR/raw text snapshots and store in interim bucket for traceability.
4. **Normalization Adapter Layer**
   - Each adapter outputs a common `RawExtract` contract with header candidates, table fragments, and confidence metrics.
   - Normalize units (currency, UOM) and timestamps ahead of canonical mapping.
5. **Error Handling**
   - Retry with exponential backoff for transient failures.
   - Persist job state machine (queued → processing → needs_review → done → failed) with detailed diagnostics.
   - Surface actionable errors to the frontend via notifications and audit logs.

## Phase Deliverables
- Queue definitions and worker skeletons in the Node.js API workspace.
- Python OCR microservice scaffold with FastAPI endpoint `/ocr` and async worker consuming OCR jobs.
- Shared logging/tracing contract for correlating ingestion steps.
- Integration tests to validate hand-offs between API, OCR service, and storage layers.
