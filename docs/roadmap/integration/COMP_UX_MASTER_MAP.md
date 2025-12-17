# FormWaypoint Master UX Workflow Map

**Synthesized from Karrio, Fleetbase, and Paperless-ngx**

This document serves as the "Gold Standard" reference for FormWaypoint's user experience. It maps the best-in-class workflows from our three primary inspirations to specific implementation targets in FormWaypoint.

---

## 1. The Shipping Engine (Inspiration: Karrio)

*Core Philosophy: "Headless First & Developer Experience"*

| Workflow | Distinction (Why it works) | FormWaypoint Replication Strategy | Status |
| :--- | :--- | :--- | :--- |
| **Carrier Onboarding** | **Unified Auth**: Abstracts complex credential requirements (Keys, Meters, Secrets) into a simple "Connect" wizard. Test connection validation gives immediate feedback. | **Target**: `CarrierAccount` model already exists. Need a UI "Wizard" that dynamically renders fields based on `carrierCode` schema. | 🏗️ Partial |
| **Rate Shopping** | **Aggregated Speed**: Parallel API calls allow sorting by "Cheapest" vs "Fastest". | **Target**: `RateShoppingService` is implemented. Needs UI visualization (Grid/List view) with "Buy Label" action. | ✅ Backend Ready |
| **Webhook Lifecycle** | **Canonical Statuses**: Maps proprietary carrier statuses (e.g., "FedEx OC") to a clean enum (`pre_transit`, `delivered`). | **Target**: `WebhookService` and `Shipment` status enum are implemented. Need to refine the specific mapping logic per carrier. | ✅ Backend Ready |

### 🔍 Deep Dive Integration

* **The "Buy" Button**: In Karrio, this is the atomic action. In FormWaypoint, this must trigger `Shipment.purchaseLabel()`, save the `label_url`, and auto-email the `Commercial Invoice` (Phase 5).

---

## 2. The Operations OS (Inspiration: Fleetbase)

*Core Philosophy: "Command, Control & Field Visibility"*

| Workflow | Distinction (Why it works) | FormWaypoint Replication Strategy | Status |
| :--- | :--- | :--- | :--- |
| **Order Dispatch** | **Visual Assignment**: Dispatcher sees pins (jobs) and arrows (drivers) on a map. "Drag and Drop" or "Auto-Assign" based on proximity. | **Target**: `FleetMap` component (Phase 2) needs to be connected to `RouteOptimizationService`. Click-to-assign logic needed in UI. | 🏗️ Partial |
| **Driver Execution** | **Mobile Workflow**: Step-by-step logic (Nav -> Arrive -> Verify -> POD). | **Target**: PWA (Phase 9) implementation. Needs specific screens for "My Manifest" and "Capture Signature" (Phase 4). | 🏗️ Partial |
| **Real-Time Telemetry** | **Ghost Replay**: Ability to see historical path vs planned path. | **Target**: `SocketGateway` (Phase 2) handles live coords. `EmissionLog` (Phase 9) tracks distance. Need to store breadcrumbs for replay. | 🏗️ Partial |

### 🔍 Deep Dive Integration

* **The "Electronic Proof of Delivery" (ePOD)**: Fleetbase uses "Sign on Glass". FormWaypoint has `DigitalSignatureService` (Phase 11) and `SignaturePad` component. We need to wire this into the "Driver PWA" flow.

---

## 3. The Document Brain (Inspiration: Paperless-ngx)

*Core Philosophy: "Ingest, Forget & Retrieve"*

| Workflow | Distinction (Why it works) | FormWaypoint Replication Strategy | Status |
| :--- | :--- | :--- | :--- |
| **Consumption Pipeline** | **Sanitization**: Ghostscript regeneration ensures clean PDF/A even from messy sources. | **Target**: `hOCR` pipeline (Phase 3) is robust. Need to ensure `DocumentVersion` handles the "Sanitized" vs "Original" file storage. | ✅ Backend Ready |
| **Auto-Classification** | **Matching Algorithms**: Rules-based (Regex/Any/All) tagging automates "Inbox Zero". | **Target**: `AutoTaggerService` (Phase 3) and `HtsClassificationService` (Phase 12) cover this. `DeduplicationService` (Phase 6) adds reliability. | ✅ Backend Ready |
| **Deep Search** | **Full Text (OCR)**: Searching "Widget" finds the document even if metadata is missing. | **Target**: Postgres `tsvector` implementation (Phase 3) is key. RAG Service (Phase 13) adds "Chat with Doc" capability. | ✅ Backend Ready |

### 🔍 Deep Dive Integration

* **The "Inbox" Queue**: Paperless starts with everything in "Inbox". FormWaypoint should adopt this: Documents are `pending` until Classified/Reviewed. The "Chat w/ Doc" (Phase 13) is our enhancement over the static search of Paperless.

---

## 4. The "Super-App" Synthesis (FormWaypoint Differentiators)

*Where we go beyond the competitors.*

| Workflow | Innovation | Status |
| :--- | :--- | :--- |
| **Financial Liquidity** | **Payment Escrow**: Unlike Karrio/Fleetbase, we handle the money release (`PaymentService`, Phase 13). | ✅ Backend Ready |
| **Hardware Reality** | **Printing & Packing**: `ZplPrinterService` and `BinPackingService` (Phase 10) connect the software to the physical warehouse floor. | ✅ Backend Ready |
| **AI Intelligence** | **Voice & Prediction**: `VoiceWorkflow` (Phase 12) and `PredictiveEta` (Phase 9) move beyond passive data entry to active assistance. | ✅ Backend Ready |
