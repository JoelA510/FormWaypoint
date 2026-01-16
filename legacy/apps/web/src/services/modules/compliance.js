import { request } from './core';

export const complianceService = {
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
    }
};
