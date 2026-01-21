# Output Generation Baseline

## Goals
Deliver a consistent export pipeline that transforms canonical shipment records into carrier-ready documents and structured downloads without duplicating business rules across services.

## Components
- **Template Registry**: Versioned JSON definitions for each carrier (NCBFAA SLI, NMFTA BOL, VICS BOL, regional forwarders) including field mappings, conditional logic, and layout metadata.
- **Renderer Service**: Node.js or worker process that consumes canonical JSON plus template ID to render HTML via Handlebars/React server components, then converts to PDF with Playwright.
- **Structured Exporters**: Shared utilities to generate CSV, XLSX, and Markdown representations with deterministic column order and checksum rows.
- **Validation Hooks**: Rule engine confirming HTS format, ECCN/licensing requirements, Incoterm alignment, and totals reconciliation before export.
- **Storage & Distribution**: Persist generated artifacts to object storage with metadata (template version, generated_at, hash) and expose signed URLs for download.

## Early Deliverables
1. Define template metadata contract in shared packages.
2. Implement stub exporter functions with unit tests asserting Markdown table format.
3. Establish regression fixtures for carrier requirements and change detection.
4. Integrate export audit logs to support compliance reviews.
