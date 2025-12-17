# SEC-002: Secure Static File Serving - Summary

**Status**: Completed
**Date**: 2025-12-09
**Author**: Antigravity

## Overview
This refactoring task addressed a Critical IDOR (Insecure Direct Object Reference) vulnerability in the `GET /files/:filename` endpoint. Previously, any authenticated user could download any file if they knew the filename. The route has been secured to strictly enforce ownership checks against the database before serving files.

## Changes Implemented

### 1. Ownership Verification (`apps/api/src/routes/files.js`)
-   **Database Lookup**: Integrated `PrismaClient` to lookup file metadata in `ShipmentDocument` and `Shipment` tables.
-   **RBAC Enforcement**: checks if `req.user.id` matches the `createdByUserId` of the associated shipment.
-   **Admin Override**: Users with `role: 'admin'` retain access to all files.
-   **Orphan File Blocking**: Files not found in the database (or "orphaned" uploads) are now implicitly blocked (404/403) to prevent unauthorized access to unlinked content.

### 2. Security Testing (`apps/api/tests/files_security.test.js`)
-   Created a dedicated unit test suite for the `files` router.
-   **Verified**:
    -   Requests for files owned by the user -> **allowed**.
    -   Requests for files owned by others -> **denied (404/403)**.
-   **Mocking Strategy**: Used extensive mocking of `PrismaClient` and other dependencies to isolate the router and run tests without a live database or full app context.

## Trade-offs & Notes
-   **Immediate Preview**: If the frontend relies on previewing files *before* they are linked to a Shipment (i.e., immediately after upload but before form submission), this flow might be interrupted as the ownership link is established at Shipment creation.
    -   *Mitigation*: The `upload` endpoint should return a temporary, signed URL or the UI should trust the client-side file for immediate preview.
-   **Performance**: A database query is now performed for every file download. This is negligible for document downloads but should be monitored if traffic scales significantly.

## Files Modified
-   `apps/api/src/routes/files.js`
-   `apps/api/tests/files_security.test.js` (Created)
-   `docs/refactor/processing_order.md` (Updated status)
