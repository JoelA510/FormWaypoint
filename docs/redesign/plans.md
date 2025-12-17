# Shipping-Doc-Gen Redesign & Evolution Plan

## 1. Project Context & Assumptions

* **Current Architecture**: React/Vite frontend + Node/Express backend.
* **Existing Components**:
  * **Dashboard/Work Queue**: `apps/web/src/components/dashboard/ShipmentList.jsx` (needs enhancement for task-centricity).
  * **Scheduling**: `apps/web/src/components/shipping/PickupScheduler.jsx` (exists, needs tight integration).
  * **Rates**: `apps/web/src/components/shipping/RateShopper.jsx` (pilot phase).
  * **Review**: `apps/web/src/components/review/ShipmentReviewPage.jsx` (strong document focus).
* **Goal**: Transition from "Document Automation" to "Shipping Scheduling & Management" without losing the core document strengths.

## 2. Target Information Architecture

### Navigation (Left Sidebar)

* **Work Queue** (Home): Task-centric list (Ready to Book, In Transit, Exceptions).
* **Shipments**: All historical shipments (Search/Filter).
* **Schedule**: Unified view of Pickups (`PickupScheduler`) and Appointments.
* **Rates**: Quick rate quote tool (`RateShopper`).
* **Documents**: Document templates and generated history.
* **Address Book**: `apps/web/src/components/address-book`
* **Products**: `apps/web/src/components/items`

## 3. Implementation Plan

### Phase 1: Work Queue & Lifecycle Foundation (P0)

**Goal**: Turn the Dashboard into a "Work Queue" that drives action.

* **Enhance `ShipmentList.jsx`**:
  * Add status tabs: "Draft", "Ready to Book", "Booked", "In Transit", "Closed".
  * Add "Next Action" column (e.g., "Review Docs", "Book Pickup").
  * Integrate directly with `ShipmentReviewPage`.
* **Backend State Machine**:
  * Formalize shipment statuses in Prisma schema and API.
  * Add `due_date` and `assigned_to` fields.

### Phase 2: Booking Integration (P1)

**Goal**: Make "Booking" a first-class citizen, not just a document export.

* **Integrate `RateShopper.jsx`**:
  * Embed in the Shipment Review flow (Side drawer or "Book" step).
  * Persist selected rate/carrier to the Shipment record.
* **Integrate `PickupScheduler.jsx`**:
  * Trigger from "Booked" status.
  * Generate pickup request emails/API calls.

### Phase 3: Exceptions & Tracking (P2)

**Goal**: Manage post-booking lifecycle.

* **Tracking UI**:
  * Add timeline view to Shipment Details.
* **Exception Management**:
  * Flag shipments with errors (API failures, tracking exceptions).
  * "Exceptions" tab in Work Queue.

## 4. Gap Analysis

| Feature | Current State | Action |
| :--- | :--- | :--- |
| **Work Queue** | `ShipmentList` (Basic Grid) | **Enhance**: Add logic-driven tabs and "Next Action" indicators. |
| **Rate Shopping** | `RateShopper` (Standalone) | **Integrate**: Connect to Shipment lifecycle. |
| **Pickups** | `PickupScheduler` (Standalone) | **Integrate**: Trigger after "Booking". |
| **Exceptions** | None | **Create**: Add Exception flags and UI. |
| **Lifecycle** | Implicit | **Formalize**: Enforce state transitions in API. |

## 5. Immediate Next Steps

1. **Refactor Dashboard**: Convert `ShipmentList` to `WorkQueue`.
2. **Schema Update**: Add status/lifecycle fields to `Shipment` model.
3. **Route Wiring**: Connect `WorkQueue` -> `Review` -> `Booking`.
