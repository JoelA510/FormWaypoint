# FormWaypoint

![FormWaypoint Logo](docs/assets/logo.png)

FormWaypoint is a shipping documentation automation platform that converts diverse Commercial Invoices & Packing Lists (CIPL) into canonical shipment data and produces compliant SLI/BOL outputs.

**Current Status:** Phase 3 Completed (Integrations & Advanced Compliance)

## Monorepo Layout

- `apps/web` – React 18 + Vite frontend for document upload, review, and export/booking management.
- `apps/api` – Node.js/Express backend structured with **Domain-Driven Design (DDD)**.
  - `apps/api/src/domains` - Core business logic (Parties, Products, Shipping, etc).
  - `apps/api/src/shared` - Common utilities and middleware.
- `apps/api/prisma` – Database schema and seed data.
- `docs` – Project documentation.

## Features Implemented

### Phase 1: Foundation

- **Canonical Schema**: Defined `Shipment`, `Party`, `LineItem` models.
- **OCR Pipeline**: Ingestion of PDF documents into structured data.
- **Validation Engine**: Rules for HTS codes, Incoterms, and mandatory fields.
- **Audit Logging**: Comprehensive history tracking for all shipment changes.

### Phase 2: User Experience

- **Address Book**: Global repository for reusable `Shipper` / `Consignee` profiles.
- **Item Master**: Product library for storing commonly shipped items (HTS, Unit Price).
- **Interactive Review**: `DocumentReview` interface for correcting OCR data.
- **Reporting**: Visual dashboards for shipment volume, value, and error rates.

### Phase 3: Integrations & Compliance

- **Carrier Rate Shopping**: Pilot integration for quoting and booking parcel shipments.
- **Freight Forwarder Handoff**: Generation of booking emails and CSV bundles for legacy forwarders.
- **ERP Feedback Loop**: Configurable export system (CSV/JSON/Webhook) to push completion data to SAP/JDE.
- **Advanced Compliance**:
  - **AES/EEI**: filing requirement determination and ITN capture.
  - **Dangerous Goods**: Auto-fill helper using UN Number reference.
  - **Sanctions**: Restricted Party Screening (DPS) integration hooks.

## Getting Started

### Prerequisites

- Node.js 18+
- SQLite (default) or other Prisma-supported DB

### Installation

1. **Clone Request**:

    ```bash
    git clone https://github.com/JoelA510/FormWaypoint.git
    cd FormWaypoint
    ```

2. **Install Dependencies**:

    ```bash
    npm install
    # or
    yarn install
    ```

3. **Database Setup**:

    ```bash
    cd apps/api
    npx prisma migrate dev --name init
    npx prisma db seed
    ```

    *This creates the SQLite DB and populates it with test shipments, forwarder profiles, and compliance reference data.*

### Running locally

1. **Start API Server**:
    In `apps/api`:

    ```bash
    npm run dev
    # Runs on http://localhost:3000
    ```

2. **Start Frontend**:
    In `apps/web`:

    ```bash
    npm run dev
    # Runs on http://localhost:5173
    ```

3. **Access Application**:
    Open browser to `http://localhost:5173`.

### Production Build (Docker)

1. **Build the Docker image**:

   ```bash
   docker build -t shipping-api -f apps/api/Dockerfile .
   ```

2. **Run the container**:

   ```bash
   docker run -p 3001:3001 --env-file apps/api/.env shipping-api
   ```

## Architecture Guide

For more details on specific subsystems:

- [Output Generation & ERP Exports](docs/architecture/output-generation.md)
- [Ingestion Pipeline](docs/architecture/ingestion-pipeline.md)
- [Security & QA Guardrails](docs/architecture/security-qa-guardrails.md)
