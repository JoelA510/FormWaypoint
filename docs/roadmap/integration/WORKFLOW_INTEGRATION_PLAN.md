# FormWaypoint Deep Integration Plan

**Transforming functionality into disjointed workflows.**

Based on `COMP_UX_MASTER_MAP.md`, this plan outlines the specific steps to elevate the existing backend services into cohesive, best-in-class user experiences.

---

## Phase 14: The Shipping Engine (Karrio Integration)

**Goal:** Complete the "Quote-to-Cash" cycle for shipments.

### 14.1 Carrier Onboarding (The "Connect" UX)

- [ ] **Backend**: Enhance `CarrierConnection` model to store encrypted `credentials` JSON.
- [ ] **API**: Implement `POST /api/carriers/connect` with credential validation logic (test request to carrier).
- [ ] **UI Support**: expose `/api/carriers/schema/:code` to dynamically render input forms (e.g. UPS vs FedEx fields).

### 14.2 The Booking Loop (Rate Shopping)

- [ ] **Service Update**: Update `RateShoppingService` to use `CarrierFactory` for *live* parallel fetching (replacing any mocks).
- [ ] **Normalization**: Create a `RateNormalizer` utility to map carrier-specific service codes to a standard enum (e.g. `express`, `standard`, `saver`).
- [ ] **Execution**: Implement `POST /api/shipments/:id/buy_label` to execute the purchase, save the label to S3, and generate the Commercial Invoice.

### 14.3 Unified Tracking

- [ ] **Webhooks**: Refine `WebhookService` to handle incoming carrier events and map status codes to the FormWaypoint enum (`pre_transit`, `in_transit`, `delivered`).
- [ ] **Timeline**: Expose a simplified "Events" array on the `Shipment` model for the frontend Timeline UI.

---

## Phase 15: The Operations Command (Fleetbase Integration)

**Goal:** Connect the digital shipment to physical assets.

### 15.1 Asset Management

- [ ] **Schema**: Ensure `Vehicle` and `Driver` models have necessary fields (capacity, license, current location).
- [ ] **API**: Create CRUD endpoints for `FleetRegistry` (Teams/Drivers/Vehicles).

### 15.2 The Dispatcher Map

- [ ] **Geocoding**: Implement `GeocodingService` (Google/Mapbox) to auto-populate lat/lng for `Address` entries.
- [ ] **Assignment Logic**: Implement `POST /api/dispatch/assign` to link an Order to a Driver/Vehicle and trigger notifications.

### 15.3 Driver Workflow (PWA)

- [ ] **Mobile Endpoints**: Create optimized endpoints for the Driver App (`GET /api/driver/manifest`, `POST /api/driver/update_status`).
- [ ] **ePOD**: Integrate `DigitalSignatureService` with the shipment completion flow (upload signature image + location data).

---

## Phase 16: The Intelligent Archive (Paperless-ngx Integration)

**Goal:** "Ingest and Forget" document processing.

### 16.1 The Consumption Pipeline

- [ ] **Sanitization**: Implement `GhostscriptService` to sanitize PDFs to PDF/A compliance before storage.
- [ ] **OCR**: Upgrade `ScanService` to inject the text layer *into* the PDF (sandwich PDF) rather than just storing text in DB.

### 16.2 Auto-Classification & Search

- [ ] **Rules Engine**: Implement `MatchingRule` model (regex/keyword) and `AutoClassifierService`.
- [ ] **Search**: Verify `tsvector` implementation allows for full-text seach across document body content.

---

## Execution Priority

1. **Phase 14 (Shipping)**: Immediate revenue/utility impact.
2. **Phase 16 (Paperless)**: High usability impact.
3. **Phase 15 (Fleetbase)**: Expansion into fleet management.
