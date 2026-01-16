const featureFlags = {
    CARRIER_INTEGRATION: process.env.FEATURE_CARRIER_INTEGRATION !== 'false', // Default true
    ERP_EXPORT: process.env.FEATURE_ERP_EXPORT !== 'false', // Default true
    COMPLIANCE_ENHANCED: process.env.FEATURE_COMPLIANCE_ENHANCED !== 'false', // Default true
    DEBUG_MODE: process.env.NODE_ENV === 'development',
};

/**
 * Get all feature flags
 * @returns {Object}
 */
const getFeatureFlags = () => {
    return featureFlags;
};

/**
 * Check if a specific feature is enabled
 * @param {string} featureName 
 * @returns {boolean}
 */
const isFeatureEnabled = (featureName) => {
    return featureFlags[featureName] === true;
};

module.exports = {
    getFeatureFlags,
    isFeatureEnabled
};
