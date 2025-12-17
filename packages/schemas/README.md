# Canonical Schemas

This workspace hosts JSON Schemas and shared definitions consumed across the monorepo. The initial release exposes `canonical-shipment.schema.json`, which codifies the header and line item structure described in the roadmap:

- Required metadata for traceability (`shipment_id`, `source_filename`, `source_hash`).
- Normalized header attributes for Incoterms, routing, licensing, and aggregated totals.
- Detailed line items with HTS, quantity, valuation, and packaging metadata.
- Discrepancy annotations for UI review workflows.

Schemas in this directory are published through the shared package registry and synchronized into the API, OCR, and frontend workspaces via tooling to be defined during Phase 1.
