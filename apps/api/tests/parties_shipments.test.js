jest.mock('../src/config', () => ({
    port: 3004,
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' },
    nodeEnv: 'test'
}));

// Mock redis
jest.mock('../src/services/redis', () => ({
    connection: { on: jest.fn() }
}));

// jest.mock('nodemailer') specific mock removed to use global setup
jest.mock('../src/routes/cx', () => (req, res, next) => next()); // Mock broken CX route

const request = require('supertest');

// Mock queue to avoid Redis connection and provide mock Prisma
// We need to allow changing mock implementations per test
const mockPrisma = {
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn()
    },
    party: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn()
    },
    shipment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn()
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

// Mock Prisma Client constructor
jest.mock('@prisma/client', () => {
    return {
        PrismaClient: jest.fn().mockImplementation(() => mockPrisma)
    };
});

jest.mock('../src/queue', () => {
    return {
        createJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
        getJob: jest.fn().mockReturnValue({ id: 'mock-job-id', status: 'complete' }),
        ingestionQueue: {
            getJobCounts: jest.fn().mockResolvedValue({})
        },
        prisma: mockPrisma
    };
});

// Mock service dependencies
jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn(),
    getFilePath: jest.fn()
}));
jest.mock('../src/services/generator', () => ({
    generatePDF: jest.fn()
}));
// Mock Auth to bypass login logic for simplicity, or use real flow if we want coverage
// Here we mock auth to return a user immediately
jest.mock('../src/services/auth', () => ({
    register: jest.fn().mockResolvedValue({ user: { id: 'u1', username: 'testuser' }, token: 'valid-token' }),
    login: jest.fn().mockResolvedValue({ user: { id: 'u1', username: 'testuser' }, token: 'valid-token' }),
    verifyToken: jest.fn().mockReturnValue({ id: 'u1', username: 'testuser' }),
    prisma: {}
}));

const app = require('../src/index');

describe('Address Book & Shipment Snapshots', () => {
    let token = 'valid-token';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Party CRUD', () => {
        it('POST /parties should create a new party', async () => {
            const newParty = {
                name: 'ACME Corp',
                addressLine1: '123 Test St',
                city: 'Test City',
                postalCode: '12345',
                countryCode: 'US'
            };

            mockPrisma.party.create.mockResolvedValue({ ...newParty, id: 'p1' });

            const res = await request(app)
                .post('/parties')
                .set('Authorization', `Bearer ${token}`)
                .send(newParty);

            expect(res.statusCode).toBe(201);
            expect(res.body.id).toBe('p1');
            expect(mockPrisma.party.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ name: 'ACME Corp' })
            }));
        });

        it('GET /parties should list parties', async () => {
            mockPrisma.party.findMany.mockResolvedValue([{ id: 'p1', name: 'ACME Corp' }]);

            const res = await request(app)
                .get('/parties')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(mockPrisma.party.findMany).toHaveBeenCalled();
        });
    });

    describe('Shipment Snapshot Logic', () => {
        const mockParty = {
            id: 'p1',
            name: 'ACME Corp',
            addressLine1: '123 Test St',
            city: 'Test City',
            countryCode: 'US'
        };

        it('POST /shipments should snapshot shipper data when shipperId is provided', async () => {
            // Setup: When we find the party, return mockParty
            mockPrisma.party.findUnique.mockResolvedValue(mockParty);

            mockPrisma.shipment.create.mockImplementation((args) => Promise.resolve({
                id: 's1',
                ...args.data
            }));

            const payload = {
                shipperId: 'p1',
                consigneeId: 'p2', // Assume p2 exists/mocks
                incoterm: 'EXW',
                destinationCountry: 'DE'
            };

            const res = await request(app)
                .post('/shipments')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);

            expect(res.statusCode).toBe(201);
            expect(mockPrisma.party.findUnique).toHaveBeenCalledWith({ where: { id: 'p1' } });

            // Verify create was called with shipperSnapshot
            const createCall = mockPrisma.shipment.create.mock.calls[0][0];
            expect(createCall.data.shipperId).toBe('p1');
            expect(createCall.data.shipperSnapshot).toBeDefined();

            const snapshot = JSON.parse(createCall.data.shipperSnapshot);
            expect(snapshot.name).toBe('ACME Corp');
        });

        it('PUT /shipments/:id should UPDATE snapshot if shipperId changes', async () => {
            // Current shipment has OLD party (p1)
            const oldSnapshot = JSON.stringify(mockParty);
            mockPrisma.shipment.findUnique.mockResolvedValue({
                id: 's1',
                shipperId: 'p1',
                shipperSnapshot: oldSnapshot
            });

            // New party (p2)
            const newParty = { ...mockParty, id: 'p2', name: 'New Corp' };
            mockPrisma.party.findUnique.mockResolvedValue(newParty);

            mockPrisma.shipment.update.mockResolvedValue({ id: 's1', shipperId: 'p2' });

            const res = await request(app)
                .put('/shipments/s1')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipperId: 'p2' });

            expect(res.statusCode).toBe(200);

            // Verify update call
            const updateCall = mockPrisma.shipment.update.mock.calls[0][0];
            expect(updateCall.data.shipperId).toBe('p2');
            expect(JSON.parse(updateCall.data.shipperSnapshot).name).toBe('New Corp');
        });

        it('PUT /shipments/:id should NOT update snapshot if shipperId remains same', async () => {
            // Existing shipment
            const snapshot = JSON.stringify(mockParty);
            mockPrisma.shipment.findUnique.mockResolvedValue({
                id: 's1',
                shipperId: 'p1',
                shipperSnapshot: snapshot
            });

            mockPrisma.shipment.update.mockResolvedValue({});

            // Request same shipperId
            const res = await request(app)
                .put('/shipments/s1')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipperId: 'p1', incoterm: 'FOB' }); // Change something else

            expect(res.statusCode).toBe(200);

            const updateCall = mockPrisma.shipment.update.mock.calls[0][0];
            expect(updateCall.data.incoterm).toBe('FOB');
            // Should NOT have shipperSnapshot in data
            expect(updateCall.data.shipperSnapshot).toBeUndefined();
        });

    });
});
