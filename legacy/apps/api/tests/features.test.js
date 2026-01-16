// Mock config
jest.mock('../src/config', () => ({
    port: 3003,
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test', port: 587, user: 'test', pass: 'test' },
    carriers: { fedexUrl: 'http://fedex', upsUrl: 'http://ups' },
    nodeEnv: 'test'
}));
jest.mock('../src/routes/cx', () => (req, res, next) => next()); // Mock broken CX route

// Mock auth service to bypass DB
jest.mock('../src/services/auth', () => ({
    register: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    login: jest.fn().mockResolvedValue({ user: { id: 'user-id', username: 'testuser' }, token: 'valid-token' }),
    verifyToken: jest.fn().mockReturnValue({ id: 'user-id', username: 'testuser' }),
    prisma: {}
}));

// Mock Redis Service
jest.mock('../src/services/redis', () => ({
    connection: {
        get: jest.fn(),
        setex: jest.fn(),
        on: jest.fn()
    }
}));

// Mock queue and prisma
jest.mock('../src/queue', () => {
    const mockPrisma = {
        documentTemplate: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        },
        notification: {
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn()
        },
        user: {
            findUnique: jest.fn(),
            update: jest.fn(),
            upsert: jest.fn()
        },
        document: {
            findMany: jest.fn(),
            count: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };

    return {
        createJob: jest.fn(),
        getJob: jest.fn(),
        getDocument: jest.fn(),
        prisma: mockPrisma
    };
});

jest.mock('../src/db', () => require('../src/queue').prisma);

const request = require('supertest');
const app = require('../src/index');
const { prisma } = require('../src/queue');

describe('Feature Verification', () => {
    let token = 'valid-token';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Feature 1: Document Templates', () => {
        it('should create a new template', async () => {
            prisma.documentTemplate.create.mockResolvedValue({
                id: 'template-id',
                name: 'Test Template',
                description: 'A test template',
                header: '{}',
                userId: 'user-id'
            });

            const res = await request(app)
                .post('/templates')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Test Template',
                    description: 'A test template',
                    header: {}
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.name).toBe('Test Template');
            expect(prisma.documentTemplate.create).toHaveBeenCalled();
        });

        it('should list templates', async () => {
            prisma.documentTemplate.findMany.mockResolvedValue([
                { id: 'template-id', name: 'Test Template', header: '{}' }
            ]);

            const res = await request(app)
                .get('/templates')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.length).toBe(1);
        });
    });

    describe('Feature 2: Enhanced Search & Filters', () => {
        it('should filter documents by date range and status', async () => {
            prisma.document.findMany.mockResolvedValue([]);
            prisma.document.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/documents?startDate=2023-01-01&endDate=2023-12-31&status=completed')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    createdAt: expect.anything(),
                    status: 'completed'
                })
            }));
        });
    });

    describe('Feature 3: Email Notifications', () => {
        it('should create a notification preference', async () => {
            prisma.user.update.mockResolvedValue({
                id: 'user-id',
                notifyOnComment: true
            });

            const res = await request(app)
                .put('/notifications/settings')
                .set('Authorization', `Bearer ${token}`)
                .send({ notifyOnComment: true });

            expect(res.statusCode).toBe(200);
            expect(prisma.user.update).toHaveBeenCalled();
        });

        it('should list notifications', async () => {
            prisma.notification.findMany.mockResolvedValue([
                { id: 'notif-id', message: 'Test Notification', read: false }
            ]);

            const res = await request(app)
                .get('/notifications')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.length).toBe(1);
        });
    });
});
