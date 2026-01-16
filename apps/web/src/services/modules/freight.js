import { request } from './core';

export const freightService = {
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
        return request(`/forwarders/shipments/${shipmentId}/booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId })
        });
    }
};
