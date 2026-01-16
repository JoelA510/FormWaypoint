import { API_URL, request, setToken } from './modules/core';
import { authService } from './modules/auth';
import { documentService } from './modules/documents';
import { partyService } from './modules/parties';
import { itemService } from './modules/items';
import { shippingService } from './modules/shipping';
import { freightService } from './modules/freight';
import { erpService } from './modules/erp';
import { complianceService } from './modules/compliance';
import { importExportService } from './modules/importExport';

export { API_URL };

export const api = {
    // Utility
    setToken,
    request: request,

    // Auth
    ...authService,

    // Documents
    ...documentService,

    // Parties
    ...partyService,

    // Items
    ...itemService,

    // Shipping
    ...shippingService,

    // Freight/Forwarders
    ...freightService,

    // ERP
    ...erpService,

    // Compliance
    ...complianceService,

    // Import/Export
    ...importExportService,

    // Generic HTTP Methods (Legacy support)
    get: async (endpoint) => request(endpoint),
    post: async (endpoint, data) => request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    put: async (endpoint, data) => request(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),
    delete: async (endpoint) => request(endpoint, { method: 'DELETE' })
};
