import { API_URL, request } from './core';

export const importExportService = {
    exportShipment: async (shipmentId) => {
        // We do a fetch directly here to handle the blob response
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/shipments/${shipmentId}/export`, {
            headers: {
                'Authorization': token ? `Bearer ${token}` : undefined
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
    }
};
