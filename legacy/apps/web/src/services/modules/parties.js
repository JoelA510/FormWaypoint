import { request } from './core';

export const partyService = {
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
    }
};
