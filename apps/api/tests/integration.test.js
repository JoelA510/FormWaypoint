jest.mock('../src/config', () => ({
    port: 3003,
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' },
    nodeEnv: 'test'
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

const request = require('supertest');
const { prisma: mockPrisma } = require('../src/queue');

// Mock queue to avoid Redis connection
jest.mock('../src/queue', () => {
    const mockPrisma = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn()
        },
        document: {
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };

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
        prisma: mockPrisma
    };
});

// Mock storage
jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn().mockResolvedValue({ url: '/url/mock-file', path: '/tmp/mock-file' }),
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

        testToken = res.body.token;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default Prisma finds for ownership checks
        mockPrisma.document.findUnique.mockResolvedValue({
            id: 'mock-doc-id',
            userId: 'user-id',
            header: '{}', // JSON string for parsing
            lines: '[]'
        });
        mockPrisma.document.update.mockResolvedValue({
            id: 'mock-doc-id',
            header: '{"shipper":"Updated Shipper"}'
        });
    });

    it('should upload a file, process it, and retrieve the result', async () => {
        const uploadRes = await request(app)
            .post('/upload')
            .set('Authorization', `Bearer ${testToken}`)
            .attach('file', path.join(__dirname, '../../../services/ingestion/tests/golden/pdf/sample.pdf'));

        expect(uploadRes.statusCode).toBe(202);
        expect(uploadRes.body.jobId).toBeDefined();

        const jobId = uploadRes.body.jobId;
        const docId = 'mock-doc-id'; // getJob mock returns this
        /*
                expect(uploadRes.body.jobs).toBeDefined();
                expect(uploadRes.body.jobs.length).toBe(1);
                expect(uploadRes.body.jobs[0].status).toBe('pending');
        
                const jobId = uploadRes.body.jobs[0].id;
                const docId = uploadRes.body.jobs[0].docId || 'mock-doc-id';
        */

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

        expect(res.statusCode).toBe(202);
        expect(res.body.message).toBe('Export started');
        expect(res.body.jobId).toBeDefined();
    });
});
