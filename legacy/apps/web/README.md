# Web App Workspace

React + Vite frontend for the Document Generation platform.

## Key Components

- **`DocumentReview`**: The central workspace for validating shipment data.
    - Integrates `AesPanel`, `SanctionsPanel`, `CarrierRatePanel`, and `ForwarderBookingPanel` in the sidebar.
    - Provides interactive line-item editing with DG auto-fill.
    - Displays validation errors and allows for dismissal/overrides.
- **`ErpExportDashboard`**: Management UI for configuring and running ERP data exports.
- **`AddressBook`**: Management of persistent Shipper/Consignee profiles.
- **`ShipmentList`**: Dashboard showing all active shipments and their status.

## Tech Stack

- **Framework**: React 18 (Vite)
- **Styling**: Tailwind CSS, Lucide React (Icons)
- **Routing**: React Router DOM
- **Data Fetching**: Native `fetch` with custom hooks

## Scripts

- `npm run dev`: Start development server
- `npm run build`: Production build
- `npm run lint`: Run ESLint check
