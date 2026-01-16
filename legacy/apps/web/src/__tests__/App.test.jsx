import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { vi } from 'vitest';
import App from '../App';
import { api } from '../services/api';

// Mock API
vi.mock('../services/api', () => ({
    api: {
        uploadFile: vi.fn(),
        getJob: vi.fn(),
        getDocument: vi.fn(),
        setToken: vi.fn(),
        getComments: vi.fn().mockResolvedValue([]),
        addComment: vi.fn(),
        getHistory: vi.fn().mockResolvedValue([]),
        request: vi.fn().mockResolvedValue({ CARRIER_INTEGRATION: true, ERP_EXPORT: true, COMPLIANCE_ENHANCED: true }),
        get: vi.fn().mockResolvedValue([]),
        post: vi.fn().mockResolvedValue({})
    },
    API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
}));

// Mock the Login component to avoid auth flow in tests
vi.mock('../components/auth/Login', () => {
    return {
        default: function MockLogin({ onLogin }) {
            return (
                <button onClick={() => onLogin({ username: 'testuser' }, 'fake-token')}>
                    Mock Login
                </button>
            );
        }
    };
});

// Mock UploadZone to avoid polling and file handling complexity in integration tests
vi.mock('../components/upload/UploadZone', () => ({
    default: ({ onDocumentUploaded }) => (
        <button onClick={() => onDocumentUploaded({
            id: 'doc-123',
            header: { shipper: 'Test Shipper' },
            lines: [],
            meta: { validation: [] }
        })}>
            Mock Upload
        </button>
    )
}));

// Mock global fetch
global.fetch = vi.fn((url) => {
    if (url === '/auth/me') {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ username: 'testuser' })
        });
    }
    if (url === '/notifications') {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
        });
    }
    if (url.startsWith('/documents/')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                id: 'doc-123',
                header: { shipper: { name: 'Test Shipper' } },
                lines: [],
                meta: { validation: [] }
            })
        });
    }
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
    });
});

// Mock window.open
global.open = vi.fn();

describe('App Integration', () => {
    beforeEach(() => {
        vi.setConfig({ testTimeout: 30000 });
    });

    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
        vi.clearAllMocks();
    });

    const login = async () => {
        const loginButton = screen.getByText(/Mock Login/i);
        fireEvent.click(loginButton);
        await waitFor(() => expect(screen.getByText(/FormWaypoint/i)).toBeInTheDocument(), { timeout: 15000 });
    };

    test('renders login and allows access', async () => {
        render(<App />);
        const loginButton = screen.getByText(/Mock Login/i);
        fireEvent.click(loginButton);
        await waitFor(() => {
            const headerElement = screen.getByText(/FormWaypoint/i);
            expect(headerElement).toBeInTheDocument();
        }, { timeout: 15000 });
    });

    test('renders upload zone after login', async () => {
        render(<App />);
        await login();
        await waitFor(() => {
            const uploadText = screen.getByText(/Mock Upload/i);
            expect(uploadText).toBeInTheDocument();
        });
    });

    it('switches to review after successful upload', async () => {
        // Mock successful flow
        api.uploadFile.mockResolvedValue({ id: 'job-123' });
        api.getJob.mockResolvedValue({ status: 'completed', documentId: 'doc-123' });
        api.getDocument.mockResolvedValue({
            header: { shipper: 'Test Shipper' },
            lines: [],
            meta: { validation: [] }
        });

        render(<App />);
        await login();

        // Trigger mock upload
        const uploadBtn = await screen.findByText('Mock Upload', {}, { timeout: 5000 });
        fireEvent.click(uploadBtn);

        await waitFor(() => expect(screen.getByText(/Shipment Details/i)).toBeInTheDocument(), { timeout: 15000 });
    });

    it('allows editing and saving document', async () => {
        // Mock successful flow
        api.uploadFile.mockResolvedValue({ id: 'job-123' });
        api.getJob.mockResolvedValue({ status: 'completed', documentId: 'doc-123' });
        api.getDocument.mockResolvedValue({
            id: 'doc-123',
            header: { shipper: { name: 'Test Shipper' } },
            lines: [],
            meta: { validation: [] }
        });
        api.updateDocument = vi.fn().mockResolvedValue({});

        render(<App />);
        await login();

        // Trigger mock upload
        const uploadBtn = await screen.findByText('Mock Upload', {}, { timeout: 5000 });
        fireEvent.click(uploadBtn);

        // Wait for review screen
        await waitFor(() => expect(screen.getByText(/Shipment Details/i)).toBeInTheDocument(), { timeout: 15000 });

        // Change Shipper
        const shipperInput = screen.getByDisplayValue('Test Shipper');
        fireEvent.change(shipperInput, { target: { value: 'Updated Shipper' } });

        // Click Save
        fireEvent.click(screen.getByText('Save Changes'));

        // Verify API call
        await waitFor(() => expect(api.updateDocument).toHaveBeenCalledWith('doc-123', expect.objectContaining({
            header: expect.objectContaining({ shipper: expect.objectContaining({ name: 'Updated Shipper' }) })
        })));

        expect(screen.getByText('Changes saved successfully')).toBeInTheDocument();
    });

    it('allows exporting document', async () => {
        // Mock successful flow
        api.uploadFile.mockResolvedValue({ id: 'job-123' });
        api.getJob.mockResolvedValue({ status: 'completed', documentId: 'doc-123' });
        api.getDocument.mockResolvedValue({
            id: 'doc-123',
            header: { shipper: 'Test Shipper' },
            lines: [],
            meta: { validation: [] }
        });
        api.triggerExport = vi.fn().mockResolvedValue({ url: '/test.pdf' });

        render(<App />);
        await login();

        // Trigger mock upload
        const uploadBtn = await screen.findByText('Mock Upload', {}, { timeout: 5000 });
        fireEvent.click(uploadBtn);

        // Wait for review screen
        await waitFor(() => expect(screen.getByText(/Shipment Details/i)).toBeInTheDocument(), { timeout: 15000 });

        // Click Export
        fireEvent.click(screen.getByText('Generate PDF'));

        // Verify API call
        await waitFor(() => expect(api.triggerExport).toHaveBeenCalledWith('doc-123', 'sli', 'sli'));

        // Verify window.open called
        expect(global.open).toHaveBeenCalledWith(expect.stringContaining('/test.pdf'), '_blank');

        await waitFor(() => expect(screen.getByText(/Export complete/i)).toBeInTheDocument(), { timeout: 15000 });
    });
});
