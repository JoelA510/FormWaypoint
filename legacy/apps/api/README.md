# API Workspace

Node.js/Express service orchestrating ingestion, shipment management, and external integrations.

## Key Services

- **`ShipmentService`**: Core CRUD for shipments, managing relations to Parties and Line Items.
- **`ValidationService`**: Runs rule sets (e.g., "Missing HTS Code") and manages Override objects.
- **`OcrService`**: Handles file uploads and mock extraction processing.
- **`ComplianceService`**: Evaluates AES filing requirements, looks up Dangerous Goods (UN numbers), and screens parties.
- **`BookingPackageService`**: Generates email bodies and CSV attachments for Freight Forwarder handoffs.
- **`ExportRunner`**: Executes scheduled or manual ERP data push jobs (CSV/File or Webhook/HTTP).

## Project Structure

- `src/index.js` - Entry point and server configuration
- `src/routes/` - API route definitions
    - `shipments.js` - Main shipment operations
    - `compliance.js` - DG/AES/Sanctions endpoints
    - `erp.js` - Export configuration and job management
    - `forwarders.js` - Profile management and booking generation
- `src/services/` - Business logic modules
- `prisma/` - Database schema (`schema.prisma`) and seed script (`seed.js`)

## Testing

Run unit tests:
```bash
npm test
```
(Uses Jest)
