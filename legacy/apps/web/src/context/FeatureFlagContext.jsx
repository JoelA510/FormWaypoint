import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const FeatureFlagContext = createContext(null);

export const FeatureFlagProvider = ({ children }) => {
    const [features, setFeatures] = useState({
        CARRIER_INTEGRATION: true,
        ERP_EXPORT: true,
        COMPLIANCE_ENHANCED: true,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeatures = async () => {
            try {
                // We'll add this endpoint to api.js, but for now direct fetch or assume api.request
                // Let's assume we implement api.getFeatures() or use raw request
                // Using generic request for now as api.js update is next
                const response = await api.request('/config/features');
                if (response) {
                    setFeatures(response);
                }
            } catch (err) {
                console.warn('Failed to fetch feature flags, using defaults', err);
            } finally {
                setLoading(false);
            }
        };

        fetchFeatures();
    }, []);

    const isFeatureEnabled = (key) => {
        return features[key] === true;
    };

    return (
        <FeatureFlagContext.Provider value={{ features, isFeatureEnabled, loading }}>
            {children}
        </FeatureFlagContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useFeatureFlags = () => {
    const context = useContext(FeatureFlagContext);
    if (!context) {
        throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
    }
    return context;
};
