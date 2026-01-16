import { request } from './core';

export const shippingService = {
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
    }
};
