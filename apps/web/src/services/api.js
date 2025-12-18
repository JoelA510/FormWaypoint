export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Internal token holder for when localStorage is not available or for manual implementation
let memoryToken = null;

const request = async (endpoint, options = {}) => {
    // Ensure we get the latest token from localStorage if available, otherwise fallback to memory
    let token = memoryToken;
    try {
        const local = localStorage.getItem('token');
        if (local) token = local;
    } catch (e) {
        // Ignore localStorage errors (e.g. Safari private mode)
        console.warn('[API] localStorage access failed', e);
    }

    // Debug: Check if token exists for non-auth endpoints
    if (!token && !endpoint.startsWith('/auth/')) {
        console.error('[API] No token found for request to', endpoint);
        // We might not want to throw immediately to allow public endpoints if any exist, 
        // but keeping existing behavior for now as this seems to be an auth-required app.
        throw new Error('DEBUG: No authentication token found. Please login again.');
    }

    const headers = {
        ...options.headers,
        'Authorization': token ? `Bearer ${token}` : undefined
    };

    // console.log(`[API] Request to ${endpoint} with token: ${token ? 'YES' : 'NO'}`);

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Request failed: ${response.statusText}`);
    }

    return response.json();
};

export const api = {
    setToken: (token) => {
        memoryToken = token;
        try {
            if (token) localStorage.setItem('token', token);
            else localStorage.removeItem('token');
        } catch (e) {
            console.warn('[API] localStorage access failed during setToken', e);
        }
    },

    login: async (username, password) => {
        return request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    },

    register: async (username, password) => {
        return request('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    },

    uploadFile: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return request('/upload', {
            method: 'POST',
            body: formData
        });
    },

    getJob: async (jobId) => {
        return request(`/jobs/${jobId}`);
    },

    getDocument: async (docId) => {
        return request(`/documents/${docId}`);
    },

    updateDocument: async (docId, data) => {
        return request(`/documents/${docId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    triggerExport: async (docId, type = 'sli', template = 'sli') => {
        return request(`/documents/${docId}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, template })
        });
    },

    getHistory: async (docId) => {
        return request(`/documents/${docId}/history`);
    },

    getComments: async (docId) => {
        return request(`/documents/${docId}/comments`);
    },

    addComment: async (docId, text, user) => {
        return request(`/documents/${docId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, user })
        });
    },

    // Parties
    getParties: async (query = '') => {
        const queryString = query ? `?query=${encodeURIComponent(query)}` : '';
        return request(`/parties${queryString}`);
    },

    createParty: async (data) => {
        return request('/parties', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updateParty: async (id, data) => {
        return request(`/parties/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    deleteParty: async (id) => {
        return request(`/parties/${id}`, {
            method: 'DELETE'
        });
    },

    // Items (Product Library)
    getItems: async (params) => {
        const query = new URLSearchParams(params).toString();
        return request(`/items?${query}`);
    },
    createItem: async (data) => {
        return request('/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    updateItem: async (id, data) => {
        return request(`/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    deleteItem: async (id) => {
        return request(`/items/${id}`, { method: 'DELETE' });
    },

    // Shipment Templates
    getShipmentTemplates: async (params) => {
        const query = new URLSearchParams(params).toString();
        return request(`/shipment-templates?${query}`);
    },
    createShipmentTemplate: async (data) => {
        return request('/shipment-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    getShipmentTemplate: async (id) => {
        return request(`/shipment-templates/${id}`);
    },

    // Shipments
    getShipments: async (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/shipments?${query}`);
    },

    getShipment: async (id) => {
        return request(`/shipments/${id}`);
    },

    updateShipment: async (id, data) => {
        return request(`/shipments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    getValidation: async (id) => {
        const res = await request(`/shipments/${id}/validation`);
        // Ensure we return the issues array or Summary object structure expected
        return res;
    },

    dismissIssue: async (shipmentId, code) => {
        return request(`/shipments/${shipmentId}/validation/dismiss`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
    },

    generateDocument: async (shipmentId, type) => {
        return request(`/shipments/${shipmentId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });
    },

    // Forwarders (Epic 15)
    getForwarders: async () => {
        return request('/forwarders');
    },

    createForwarder: async (data) => {
        return request('/forwarders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    generateBookingPackage: async (shipmentId, profileId) => {
        // ... previous code
        return request(`/forwarders/shipments/${shipmentId}/booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId })
        });
    },

    // ERP Export (Epic 16)
    getErpConfigs: async () => {
        return request('/erp/configs');
    },

    createErpConfig: async (data) => {
        return request('/erp/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    getErpJobs: async () => {
        return request('/erp/jobs');
    },

    runErpJob: async (data) => {
        return request('/erp/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Compliance (Epic 17)
    lookupUnNumber: async (unNumber) => {
        return request(`/compliance/dg/lookup/${unNumber}`);
    },

    checkAesRequirement: async (shipment) => {
        return request('/compliance/aes/assess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipment })
        });
    },

    screenParties: async (shipmentId) => {
        return request('/compliance/sanctions/screen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId })
        });
    },

    // Import/Export (Epic 19)
    exportShipment: async (shipmentId) => {
        // We do a fetch directly here to handle the blob response
        const token = localStorage.getItem('token') || authToken;
        const response = await fetch(`${API_URL}/shipments/${shipmentId}/export`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
    },

    importShipment: async (importData) => {
        return request('/shipments/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importData)
        });
    },

    // Utilities
    request: request
};
