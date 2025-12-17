const request = require('supertest');
const jwt = require('jsonwebtoken');

// 1. Mock Prisma Client Globally
const mockPrisma = {
    carrierAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn()
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
    port: 3001,
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test', port: 587, user: 'test', pass: 'test' },
    storage: { s3: { bucket: 'test-bucket' } }
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

// 4. Mock Carrier Gateway to spy on getRates
const mockGetRates = jest.fn();
jest.mock('../src/services/carriers/carrierGateway', () => ({
    getCarrierGateway: jest.fn().mockImplementation(() => ({
        getRates: mockGetRates,
        bookShipment: jest.fn()
    }))
}));

// 5. Import App
const app = require('../src/index');

// Helper to generate token
const generateToken = (id) => jwt.sign({ id, username: `user${id}`, role: 'user' }, 'test-secret');

describe('Carrier Routes', () => {
    const userId = 'user-123';
    const token = generateToken(userId);

    beforeEach(() => {
        jest.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValue({ id: userId, role: 'user' });

        // Default Mock Carrier
        mockPrisma.carrierAccount.findMany.mockResolvedValue([
            { id: 'acct-1', userId, provider: 'mock', isActive: true }
        ]);

        mockGetRates.mockResolvedValue([{
            carrierCode: 'MOCK',
            serviceCode: 'GROUND',
            totalCharge: '10.00'
        }]);
    });

    describe('POST /carriers/rates (Ad-hoc)', () => {
        test('Should calculate rates and convert LBS to KG', async () => {
            const shipmentData = {
                from: { country: 'US', zip: '10001' },
                to: { country: 'US', zip: '90210' },
                package: {
                    weight: '10',
                    weightUnit: 'lb'  // Input is 10 lbs
                }
            };

            const response = await request(app)
                .post('/carriers/rates')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipment: shipmentData })
                .expect(200);

            // Verify response structure
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].carrierCode).toBe('MOCK');

            // Verify Conversion Logic in carrierGateway call
            expect(mockGetRates).toHaveBeenCalledTimes(1);
            const calledShipment = mockGetRates.mock.calls[0][0];

            // 10 lbs * 0.453592 = 4.53592 kg
            expect(calledShipment.totalWeightKg).toBeCloseTo(4.53592);
            expect(calledShipment.originCountry).toBe('US');
        });

        test('Should handle KG directly without conversion', async () => {
            const shipmentData = {
                from: { country: 'US', zip: '10001' },
                to: { country: 'US', zip: '90210' },
                package: {
                    weight: '5',
                    weightUnit: 'kg' // Input is already KG
                }
            };

            await request(app)
                .post('/carriers/rates')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipment: shipmentData })
                .expect(200);

            expect(mockGetRates).toHaveBeenCalledTimes(1);
            const calledShipment = mockGetRates.mock.calls[0][0];
            expect(calledShipment.totalWeightKg).toBe(5);
        });

        test('Should return 400 for invalid shipment data', async () => {
            await request(app)
                .post('/carriers/rates')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipment: {} }) // Missing required fields
                .expect(400);
        });

        test('Should return empty list if no carrier accounts', async () => {
            mockPrisma.carrierAccount.findMany.mockResolvedValue([]);

            const shipmentData = {
                from: { country: 'US', zip: '10001' },
                to: { country: 'US', zip: '90210' },
                package: { weight: '1', weightUnit: 'kg' }
            };

            const response = await request(app)
                .post('/carriers/rates')
                .set('Authorization', `Bearer ${token}`)
                .send({ shipment: shipmentData })
                .expect(200);

            expect(response.body.data).toEqual([]);
        });
    });
});
