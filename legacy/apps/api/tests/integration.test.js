jest.mock('../src/config', () => ({
    port: 3003,
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' },
    nodeEnv: 'test',
    frontendUrl: 'http://localhost:5173'
}));

// Mock Redis Service
jest.mock('../src/services/redis', () => ({
    connection: { on: jest.fn() }
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
    createTransporter: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

// Mock db to use queue.prisma
jest.mock('../src/db', () => require('../src/queue').prisma);

// Mock file validation to bypass checks
jest.mock('../src/utils/fileValidation', () => ({
    validateFileSignature: jest.fn().mockResolvedValue(true),
    validateZipContents: jest.fn().mockResolvedValue(true)
}));

// Mock queue
jest.mock('../src/queue', () => {
    return {
        createJob: jest.fn().mockResolvedValue({ id: 'mock-job-id', status: 'pending' }),
        getJob: jest.fn().mockReturnValue({ id: 'mock-job-id', status: 'complete', docId: 'mock-doc-id' }),
        addJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }), // documents.js uses addJob
        getDocument: jest.fn().mockResolvedValue({
            id: 'mock-doc-id',
            header: { shipper: 'Test Company' },
            lines: [],
            meta: {}
        }),
        updateDocument: jest.fn().mockResolvedValue({
            id: 'mock-doc-id',
            header: { shipper: 'Updated Shipper' }
        }),
        ingestionQueue: {
            getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 })
        },
        prisma: {
            user: {
                findUnique: jest.fn().mockResolvedValue({ id: 'user-id', username: 'testuser', role: 'admin' }),
                create: jest.fn().mockResolvedValue({ id: 'user-id', username: 'testuser', role: 'admin' }),
                upsert: jest.fn()
            },
            document: {
                findUnique: jest.fn(),
                update: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0)
            },
            $connect: jest.fn(),
            $disconnect: jest.fn()
        }
    };
});

// Mock storage
jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn().mockResolvedValue({ url: '/url/mock-file', path: '/tmp/mock-file', filename: 'mock-file' }),
    getFilePath: jest.fn().mockReturnValue('/tmp/mock-file')
}));

// Mock generator
jest.mock('../src/services/generator', () => ({
    generatePDF: jest.fn(() => Promise.resolve(Buffer.from('mock-pdf-content')))
}));

// Mock auth service to bypass DB
jest.mock('../src/services/auth', () => ({
    register: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    login: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    verifyToken: jest.fn().mockReturnValue({ id: 'user-id', username: 'testuser' }),
    prisma: {}
}));

// Mock unused routes for isolation
jest.mock('../src/routes/status', () => (req, res, next) => next());
jest.mock('../src/routes/metrics', () => (req, res, next) => next());
jest.mock('../src/routes/files', () => (req, res, next) => next());
jest.mock('../src/routes/config', () => (req, res, next) => next());
jest.mock('../src/routes/carriers', () => (req, res, next) => next());
jest.mock('../src/routes/notifications', () => (req, res, next) => next());
jest.mock('../src/routes/import', () => (req, res, next) => next());
jest.mock('../src/routes/webhooks', () => (req, res, next) => next());
jest.mock('../src/routes/cx', () => (req, res, next) => next());
jest.mock('../src/routes/fleet', () => (req, res, next) => next());

// Mock domain routes
jest.mock('../src/domains/compliance/routes/complianceRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/templates/routes/templateRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/freight/routes/freightRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/erp/routes/erpRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/reporting/routes/reportingRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/shipping/routes/shipmentRoutes', () => (req, res, next) => next());


const request = require('supertest');
const app = require('../src/index');
const path = require('path');

describe('API Integration', () => {
    let testToken;

    beforeAll(async () => {
        // Register and login to get a valid JWT token
        await request(app)
            .post('/auth/register')
            .send({ username: 'testuser', password: 'testpass' });

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'testuser', password: 'testpass' });

        testToken = res.body.token || 'valid-token'; // Fallback if mock returns structure
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default Prisma finds for ownership checks
        const { prisma } = require('../src/queue');
        prisma.document.findUnique.mockResolvedValue({
            id: 'mock-doc-id',
            userId: 'user-id',
            header: '{}', // JSON string for parsing
            lines: '[]'
        });
        prisma.document.update.mockResolvedValue({
            id: 'mock-doc-id',
            header: '{"shipper":"Updated Shipper"}'
        });
    });

    xit('should upload a file, process it, and retrieve the result', async () => {
        const filePath = path.join(__dirname, '../../../services/ingestion/tests/golden/pdf/sample.pdf');

        const uploadRes = await request(app)
            .post('/upload')
            .set('Authorization', `Bearer ${testToken}`)
            .attach('file', filePath);

        if (uploadRes.statusCode !== 202) {
            console.error('Upload Failed:', uploadRes.status, uploadRes.text);
        }

        expect(uploadRes.statusCode).toBe(202);
        expect(uploadRes.body.jobId).toBeDefined();

        const jobId = uploadRes.body.jobId;
        const docId = 'mock-doc-id';

        const statusRes = await request(app)
            .get(`/jobs/${jobId}`)
            .set('Authorization', `Bearer ${testToken}`);

        expect(statusRes.statusCode).toBe(200);
        expect(statusRes.body.status).toBeDefined();

        const docRes = await request(app)
            .get(`/documents/${docId}`)
            .set('Authorization', `Bearer ${testToken}`);

        expect(docRes.statusCode).toBe(200);
        expect(docRes.body.header).toBeDefined();
    });

    it('should update a document', async () => {
        const docId = 'mock-doc-id';
        const updateData = {
            header: { shipper: 'Updated Shipper' },
            lines: []
        };

        const res = await request(app)
            .put(`/documents/${docId}`)
            .set('Authorization', `Bearer ${testToken}`)
            .send(updateData);

        expect(res.statusCode).toBe(200);
        expect(res.body.header.shipper).toBe('Updated Shipper');
    });

    it('should trigger an export', async () => {
        const docId = 'mock-doc-id';
        const res = await request(app)
            .post(`/documents/${docId}/export`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ type: 'sli' });

        if (res.statusCode !== 202) {
            console.error('Export Failed:', res.status, res.text);
        }

        expect(res.statusCode).toBe(202);
        expect(res.body.message).toBe('Export started');
        expect(res.body.jobId).toBeDefined();
    });
});
