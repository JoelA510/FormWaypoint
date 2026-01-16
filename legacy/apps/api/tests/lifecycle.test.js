// tests/lifecycle.test.js
jest.mock('../src/config', () => ({
    port: 3003,
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' },
    nodeEnv: 'test'
}));

// Provide mocks for all other services to avoid errors
jest.mock('../src/services/redis', () => ({ connection: { on: jest.fn() } }));
// jest.mock('nodemailer') removed
jest.mock('../src/services/email', () => ({
    sendEmail: jest.fn().mockResolvedValue(true)
}));
jest.mock('../src/utils/fileValidation', () => ({}));
jest.mock('../src/services/storage', () => ({}));
jest.mock('../src/services/generator', () => ({}));
jest.mock('../src/services/history/historian', () => ({ logShipmentEvent: jest.fn() }));
jest.mock('../src/services/portability/importExportService', () => ({}));
jest.mock('../src/routes/cx', () => (req, res, next) => next()); // Mock broken CX route

const request = require('supertest');

// MOCK QUEUE & PRISMA
jest.mock('../src/queue', () => {
    const mockPrisma = {
        user: { findUnique: jest.fn() },
        party: { findUnique: jest.fn() },
        shipment: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };
    return {
        prisma: mockPrisma,
        createJob: jest.fn(),
        addJob: jest.fn()
    };
});

// Mock Auth
jest.mock('../src/services/auth', () => ({
    verifyToken: jest.fn().mockReturnValue({ id: 'user-id', username: 'testuser' })
}));

const app = require('../src/index');
const { prisma: mockPrisma } = require('../src/queue');

describe('Shipment Lifecycle', () => {
    const testToken = 'mock-token';

    beforeEach(() => {
        jest.clearAllMocks();
        // Default Mock Returns
        mockPrisma.party.findUnique.mockResolvedValue({ id: 'party-id', name: 'Test Party' });
    });

    describe('POST /shipments', () => {
        it('should create shipment with lifecycle fields', async () => {
            const payload = {
                shipperId: 'p1',
                consigneeId: 'p2',
                incoterm: 'FOB',
                destinationCountry: 'US',
                status: 'ready_to_book',
                assignedTo: 'user-2',
                dueDate: '2025-01-01'
            };

            mockPrisma.shipment.create.mockResolvedValue({ id: 'new-ship', ...payload });

            const res = await request(app)
                .post('/shipments')
                .set('Authorization', `Bearer ${testToken}`)
                .send(payload);

            expect(res.statusCode).toBe(201);
            expect(mockPrisma.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    status: 'ready_to_book',
                    assignedTo: 'user-2',
                    dueDate: expect.any(Date)
                })
            }));
        });

        it('should default lifecycle fields if missing', async () => {
            const payload = {
                shipperId: 'p1',
                consigneeId: 'p2',
                incoterm: 'exw',
                destinationCountry: 'CA'
            };
            mockPrisma.shipment.create.mockResolvedValue({ id: 'new-ship', status: 'draft' });

            await request(app).post('/shipments').set('Authorization', `Bearer ${testToken}`).send(payload);

            expect(mockPrisma.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    status: 'draft',
                    assignedTo: 'user-id', // default to creator
                    dueDate: null
                })
            }));
        });
    });

    describe('PUT /shipments/:id', () => {
        it('should update lifecycle fields', async () => {
            mockPrisma.shipment.findUnique.mockResolvedValue({ id: 's1', shipperId: 'p1' });
            mockPrisma.shipment.update.mockResolvedValue({ id: 's1', status: 'booked' });

            const res = await request(app)
                .put('/shipments/s1')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    status: 'booked',
                    assignedTo: 'user-3',
                    dueDate: '2025-02-01'
                });

            expect(res.statusCode).toBe(200);
            expect(mockPrisma.shipment.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 's1' },
                data: expect.objectContaining({
                    status: 'booked',
                    assignedTo: 'user-3',
                    dueDate: expect.any(Date)
                })
            }));
        });
    });

    describe('GET /shipments', () => {
        it('should filter by status', async () => {
            mockPrisma.shipment.findMany.mockResolvedValue([]);
            mockPrisma.shipment.count.mockResolvedValue(0);

            await request(app)
                .get('/shipments?status=ready_to_book')
                .set('Authorization', `Bearer ${testToken}`);

            expect(mockPrisma.shipment.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { status: 'ready_to_book' }
            }));
        });

        it('should not filter status if param missing', async () => {
            mockPrisma.shipment.findMany.mockResolvedValue([]);
            mockPrisma.shipment.count.mockResolvedValue(0);

            await request(app).get('/shipments').set('Authorization', `Bearer ${testToken}`);

            expect(mockPrisma.shipment.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: {}
            }));
        });
    });
});
