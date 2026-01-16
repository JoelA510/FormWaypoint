import { request } from './core';

export const itemService = {
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
    }
};
