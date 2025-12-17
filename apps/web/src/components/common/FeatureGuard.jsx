
import { useFeatureFlags } from '../../context/FeatureFlagContext';

/**
 * Renders children only if the specified feature is enabled.
 * @param {Object} props
 * @param {string} props.featureKey - The key of the feature to check (e.g., 'CARRIER_INTEGRATION')
 * @param {React.ReactNode} props.children - The content to render if enabled
 * @param {React.ReactNode} [props.fallback] - Optional content to render if disabled
 */
const FeatureGuard = ({ featureKey, children, fallback = null }) => {
    const { isFeatureEnabled, loading } = useFeatureFlags();

    if (loading) return null; // Or a skeleton? Null avoids flicker for fast loads.

    if (isFeatureEnabled(featureKey)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
};

export default FeatureGuard;
