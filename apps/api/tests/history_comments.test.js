// Mock confg
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

const request = require('supertest');
const app = require('../src/index');

// Mock @prisma/client
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        auditLog: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        comment: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        user: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn()
        },
        document: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            update: jest.fn(),
            create: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };
    return {
        PrismaClient: jest.fn().mockImplementation(() => mockPrisma)
    };
});

// Mock queue module
jest.mock('../src/queue', () => {
    const mockPrisma = {
        auditLog: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        comment: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        user: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn()
        },
        document: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            update: jest.fn(),
            create: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };

    return {
        createJob: jest.fn(),
        getJob: jest.fn(),
        getDocument: jest.fn(),
        updateDocument: jest.fn(),
        prisma: mockPrisma
    };
});

// Mock auth service
jest.mock('../src/services/auth', () => ({
    register: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    login: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    verifyToken: jest.fn().mockReturnValue({ id: 'user-id', username: 'testuser' }),
    prisma: {} // Mock prisma export if needed
}));

// Mock storage
jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn().mockResolvedValue({ url: '/url', path: '/path' }),
    getFilePath: jest.fn().mockReturnValue('/tmp/mock-file')
}));

// Mock db to use queue.prisma
jest.mock('../src/db', () => require('../src/queue').prisma);

describe('Document History and Comments', () => {
    let token;
    let docId = 'test-doc-id';
    const { prisma: mockPrisma } = require('../src/queue');

    beforeAll(async () => {
        // We mocked auth service, so we just need a token
        token = 'valid-token';
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default doc for ownership checks
        mockPrisma.document.findUnique.mockResolvedValue({
            id: docId,
            userId: 'user-id'
        });
    });

    it('should add a comment to a document', async () => {
        // Mock user upsert for the comment route (fallback admin user)
        mockPrisma.user.upsert.mockResolvedValue({ id: 'user-id', username: 'admin' });

        // Mock comment create
        mockPrisma.comment.create.mockResolvedValue({
            id: 'comment-id',
            text: 'This is a test comment',
            userId: 'user-id',
            createdAt: new Date(),
            user: { username: 'admin' }
        });

        // Mock audit log create
        mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-id' });

        // We need a valid token. Since we didn't do the full auth flow in beforeAll (it's complex to mock),
        // we can try to bypass auth or just mock the auth flow now.
        // Let's try to register/login with mocks.

        // Mock for register
        // prisma.user.findUnique (check if exists) -> null
        // prisma.user.create -> user

        // Mock for login
        // prisma.user.findUnique -> user

        // But `auth.js` service might be using `bcrypt`.

        // Let's just try to hit the endpoint. If it fails with 401/403, we know we need a token.
        // The previous test did register/login.

        // Login skipped, token is hardcoded
        // const loginRes = await request(app)
        //     .post('/auth/login')
        //     .send({ username: 'testuser', password: 'password' });
        // token = loginRes.body.token;

        // Now perform the comment add
        const res = await request(app)
            .post(`/documents/${docId}/comments`)
            .set('Authorization', `Bearer ${token}`)
            .send({ text: 'This is a test comment', user: 'testuser' });

        expect(res.statusCode).toBe(201);
        expect(res.body.text).toBe('This is a test comment');
        expect(mockPrisma.comment.create).toHaveBeenCalled();
        expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should retrieve comments for a document', async () => {
        mockPrisma.comment.findMany.mockResolvedValue([
            {
                id: 'comment-id',
                text: 'This is a test comment',
                userId: 'user-id',
                createdAt: new Date(),
                user: { username: 'testuser' }
            }
        ]);

        const res = await request(app)
            .get(`/documents/${docId}/comments`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
        expect(res.body[0].text).toBe('This is a test comment');
    });

    it('should retrieve history for a document', async () => {
        mockPrisma.auditLog.findMany.mockResolvedValue([
            {
                id: 'log-id',
                action: 'comment_added',
                documentId: docId,
                userId: 'user-id',
                timestamp: new Date(),
                details: JSON.stringify({ text: 'This is a test comment' }),
                user: { username: 'testuser' }
            }
        ]);

        const res = await request(app)
            .get(`/documents/${docId}/history`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const commentEvent = res.body.find(h => h.action === 'comment_added');
        expect(commentEvent).toBeDefined();
        expect(commentEvent.user.username).toBe('testuser');
    });
});
