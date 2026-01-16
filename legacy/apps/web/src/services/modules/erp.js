import { request } from './core';

export const erpService = {
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
    }
};
