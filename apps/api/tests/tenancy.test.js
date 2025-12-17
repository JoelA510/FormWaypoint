const request = require('supertest');
const jwt = require('jsonwebtoken');

// 1. Mock Prisma Client Globally
const mockPrisma = {
    party: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn()
    },
    item: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn()
    },
    shipment: {
        findUnique: jest.fn(),
        update: jest.fn()
    },
    carrierAccount: {
        findMany: jest.fn()
    },
    shipmentCarrierMeta: {
        upsert: jest.fn()
    },
    user: {
        findUnique: jest.fn()
    },
    $connect: jest.fn(),
    $disconnect: jest.fn()
};

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => mockPrisma)
}));

// 2. Mock Config/Env
jest.mock('../src/config', () => ({
    authSecret: 'test-secret',
    nodeEnv: 'test',
    storage: { path: '/tmp/storage', s3: { bucket: 'test-bucket' } },
    port: 3001,
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test', port: 587, user: 'test', pass: 'test' }
}));

// 3. Mock Services
jest.mock('../src/services/redis', () => ({
    connection: {
        get: jest.fn(),
        setex: jest.fn()
    }
}));

jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn(),
    getFilePath: jest.fn()
}));

jest.mock('nodemailer', () => ({
    createTransporter: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        process: jest.fn()
    })),
    Worker: jest.fn(),
    QueueEvents: jest.fn()
}));

// 4. Import App
const app = require('../src/index');

// Helper to generate token
const generateToken = (id) => jwt.sign({ id, username: `user${id}`, role: 'user' }, 'test-secret');

describe('Multi-tenant Isolation', () => {
    const userA = 'user-a-id';
    const userB = 'user-b-id';
    const tokenA = generateToken(userA);

    beforeEach(() => {
        jest.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValue({ id: userA, role: 'user' });
    });

    describe('Parties (Address Book)', () => {
        it('GET /parties should filter by createdByUserId', async () => {
            mockPrisma.party.findMany.mockResolvedValue([]);
            mockPrisma.party.count.mockResolvedValue(0);

            await request(app)
                .get('/parties')
                .set('Authorization', `Bearer ${tokenA}`)
                .expect(200);

            const callArgs = mockPrisma.party.findMany.mock.calls[0][0];
            expect(callArgs.where).toHaveProperty('createdByUserId', userA);
        });
    });

    describe('Items', () => {
        it('GET /items should filter by createdByUserId', async () => {
            mockPrisma.item.findMany.mockResolvedValue([]);
            mockPrisma.item.count.mockResolvedValue(0);

            await request(app)
                .get('/items')
                .set('Authorization', `Bearer ${tokenA}`)
                .expect(200);

            const callArgs = mockPrisma.item.findMany.mock.calls[0][0];
            expect(callArgs.where).toHaveProperty('createdByUserId', userA);
        });
    });

    describe('Carriers (Rate Shopping)', () => {
        it('POST /shipments/:id/rates should only use User A carrier accounts', async () => {
            const shipmentId = 'shipment-123';

            mockPrisma.shipment.findUnique.mockResolvedValue({
                id: shipmentId,
                createdByUserId: userA,
                originCountry: 'US',
                destinationCountry: 'CA',
                totalWeightKg: 10,
                lineItems: []
            });

            mockPrisma.carrierAccount.findMany.mockResolvedValue([
                { id: 'acct-1', userId: userA }
            ]);

            await request(app)
                .post(`/carriers/${shipmentId}/rates`)
                .set('Authorization', `Bearer ${tokenA}`)
                .expect(200);

            const callArgs = mockPrisma.carrierAccount.findMany.mock.calls[0][0];
            expect(callArgs.where).toHaveProperty('userId', userA);
        });
    });
});
