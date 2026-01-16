import { request } from './core';

export const documentService = {
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
    }
};
