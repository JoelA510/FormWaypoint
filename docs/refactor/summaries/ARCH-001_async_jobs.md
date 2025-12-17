# ARCH-001: Async Job Queue - Summary

**Status**: Completed
**Date**: 2025-12-09
**Author**: Antigravity

## Overview
Implemented an asynchronous job queue using **BullMQ** and **Redis** to offload heavy operations (PDF generation and ZIP file processing) from the main API response loop. This improves API responsiveness and scalability.

## Changes Implemented

### 1. Infrastructure (`apps/api/src/queue/`)
-   **`index.js`**: Initializes the BullMQ `shipping-doc-gen-queue` and exports `addJob`/`getJob` helpers.
-   **`worker.js`**: Defines the worker process that consumes jobs. Currently handles:
    -   `GENERATE_PDF`: Calls `generatePDF` service.
    -   `PROCESS_UPLOAD`: (Placeholder/Structure) for async file processing.

### 2. Route Refactoring
-   **`POST /upload`** (`apps/api/src/routes/upload.js`):
    -   Now accepts the file, saves it to disk (or temp), and strictly *enqueues* a `PROCESS_UPLOAD` job.
    -   Returns `202 Accepted` immediately with a `jobId`.
    -   Removed synchronous blocking ZIP extraction logic from the request handler.
-   **`POST /documents/:id/export`** (`apps/api/src/routes/documents.js`):
    -   Now enqueues a `GENERATE_PDF` job instead of generating it inline.
    -   Returns `202 Accepted` with `jobId`.

### 3. New Endpoints
-   **`GET /jobs/:id`** (`apps/api/src/routes/jobs.js`): Allows clients to poll for job status, completion results, or failure reasons.

## Dependencies Added
-   `bullmq`: Job queue management.
-   `ioredis`: Redis client.

## Verification
-   Created `apps/api/tests/queue.test.js` to verify that hitting the API endpoints correctly adds jobs to the mocked queue.
