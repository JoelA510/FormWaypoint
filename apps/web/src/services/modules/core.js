export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Internal token holder for when localStorage is not available or for manual implementation
let memoryToken = null;

export const request = async (endpoint, options = {}) => {
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

export const setToken = (token) => {
    memoryToken = token;
    try {
        if (token) localStorage.setItem('token', token);
        else localStorage.removeItem('token');
    } catch (e) {
        console.warn('[API] localStorage access failed during setToken', e);
    }
};
