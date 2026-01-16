
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeatureFlagProvider, useFeatureFlags } from '../context/FeatureFlagContext';
import FeatureGuard from '../components/common/FeatureGuard';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { api } from '../services/api';

// Mock API
vi.mock('../services/api', () => ({
    api: {
        request: vi.fn()
    }
}));

describe('Feature Flags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const TestComponent = () => {
        const { features, loading } = useFeatureFlags();
        if (loading) return <div>Loading...</div>;
        return (
            <div>
                <div data-testid="status">{JSON.stringify(features)}</div>
                <FeatureGuard featureKey="TEST_FEATURE" fallback={<div>Fallback</div>}>
                    <div>Protected Content</div>
                </FeatureGuard>
            </div>
        );
    };

    it('should fetch flags and render content when enabled', async () => {
        api.request.mockResolvedValue({ TEST_FEATURE: true });

        render(
            <FeatureFlagProvider>
                <TestComponent />
            </FeatureFlagProvider>
        );

        expect(screen.getByText('Loading...')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Protected Content')).toBeInTheDocument();
        });

        expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
        expect(api.request).toHaveBeenCalledWith('/config/features');
    });

    it('should show fallback when disabled', async () => {
        api.request.mockResolvedValue({ TEST_FEATURE: false });

        render(
            <FeatureFlagProvider>
                <TestComponent />
            </FeatureFlagProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Fallback')).toBeInTheDocument();
        });

        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should handle API errors by disabling all features (default)', async () => {
        api.request.mockRejectedValue(new Error('API Error'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(
            <FeatureFlagProvider>
                <TestComponent />
            </FeatureFlagProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('status')).toHaveTextContent('CARRIER_INTEGRATION');
        });

        consoleSpy.mockRestore();
    });
});
