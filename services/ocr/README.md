# OCR & Parsing Service

Python 3.11 FastAPI microservice dedicated to OCR, layout analysis, and document-specific parsing helpers.

## Planned Structure
- `app/api.py` for FastAPI routes (`/ocr`, `/extract`).
- `app/workers/` for background OCR and parsing tasks.
- `app/pipelines/` for document-type adapters (PDF, image, DOCX, XLSX, email).
- `tests/` for pytest suites covering OCR accuracy benchmarks and parsing fixtures.

## Phase 1 Actions
- Scaffold FastAPI project with health checks and OpenAPI docs.
- Integrate Tesseract/PaddleOCR bindings with configurable language packs.
- Define contract for `RawExtract` outputs consumed by the API ingestion pipeline.
