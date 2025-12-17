jest.mock('../src/config', () => ({
    port: 3005,
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

jest.mock('nodemailer', () => ({
    createTransporter: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock Prisma
const mockPrisma = {
    shipment: {
        create: jest.fn()
    },
    $connect: jest.fn(),
    $disconnect: jest.fn()
};

jest.mock('../src/queue', () => ({
    prisma: mockPrisma,
    createJob: jest.fn(),
    ingestionQueue: { getJobCounts: jest.fn().mockResolvedValue({}) }
}));

// Mock Auth
jest.mock('../src/services/auth', () => ({
    register: jest.fn().mockResolvedValue({ user: { id: 'u1' }, token: 'valid-token' }),
    login: jest.fn().mockResolvedValue({ user: { id: 'u1' }, token: 'valid-token' }),
    verifyToken: jest.fn().mockReturnValue({ id: 'u1', username: 'testuser' }),
    prisma: {}
}));

const app = require('../src/index');

describe('CSV Import API', () => {
    let token = 'valid-token';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('POST /api/import/csv should process valid CSV and create shipment', async () => {
        const csvContent =
            `incoterm,currency,origin,destination,description,qty,price,weight
FOB,USD,China,USA,Widget A,100,10.5,500
FOB,USD,China,USA,Widget B,200,5.0,200`;

        const buffer = Buffer.from(csvContent);

        mockPrisma.shipment.create.mockResolvedValue({
            id: 'ship-1',
            lineItems: [{ id: 'l1' }, { id: 'l2' }]
        });

        const res = await request(app)
            .post('/import/csv')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', buffer, 'test.csv');

        expect(res.statusCode).toBe(201);
        expect(res.body.shipmentId).toBe('ship-1');
        expect(res.body.totalLines).toBe(2);

        // Verify Prisma Call
        const createCall = mockPrisma.shipment.create.mock.calls[0][0];
        expect(createCall.data.incoterm).toBe('FOB');
        expect(createCall.data.originCountry).toBe('China');
        expect(createCall.data.lineItems.create).toHaveLength(2);
        expect(createCall.data.lineItems.create[0].description).toBe('Widget A');
        expect(createCall.data.lineItems.create[0].extendedValue).toBe(1050); // 100 * 10.5
    });

    it('POST /api/import/csv should fail on empty CSV', async () => {
        const buffer = Buffer.from('');

        const res = await request(app)
            .post('/import/csv')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', buffer, 'empty.csv');

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/empty/i);
    });

    it('POST /api/import/csv should fail on missing file', async () => {
        const res = await request(app)
            .post('/import/csv')
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/no file/i);
    });
});
