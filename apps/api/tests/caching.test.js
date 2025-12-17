const request = require('supertest');
const express = require('express');
const { connection: redis } = require('../src/services/redis');
// const prisma = require('../src/prisma/client'); // Mock this - REMOVED

const { getCarrierGateway } = require('../src/services/carriers/carrierGateway'); // Mock this

// Mocks
jest.mock('../src/services/redis', () => ({
    connection: {
        get: jest.fn(),
        setex: jest.fn(),
        on: jest.fn()
    }
}));

jest.mock('../src/services/carriers/carrierGateway', () => ({
    getCarrierGateway: jest.fn()
}));

// Mock Prisma
const mockPrisma = {
    shipment: { findUnique: jest.fn() },
    carrierAccount: { findMany: jest.fn() },
    shipmentCarrierMeta: { upsert: jest.fn() }
};

// Setup Express app
const app = express();
app.use(express.json());
// Inject mock prisma? Or we can't easily inject without dependency injection or jest.mock of @prisma/client.
// We'll trust the route file imports @prisma/client. So we must mock `@prisma/client`.
// Since route requires `@prisma/client` directly, let's look at how we can mock it.
// Standard jest approach:

jest.mock('@prisma/client', () => {
    return {
        PrismaClient: jest.fn().mockImplementation(() => mockPrisma)
    };
});

// Import route AFTER mocks
// Mock User Middleware
app.use((req, res, next) => {
    req.user = { id: 'user-123' };
    next();
});

// Import route AFTER mocks
const carriersRouter = require('../src/routes/carriers');
app.use('/shipments', carriersRouter);

describe('Carrier Rate Caching', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mocks
        mockPrisma.shipment.findUnique.mockResolvedValue({
            id: 'ship-123',
            createdByUserId: 'user-123',
            originCountry: 'US',
            destinationCountry: 'CA',
            totalWeightKg: 10,
            lineItems: [{ id: 'item-1' }]
        });

        mockPrisma.carrierAccount.findMany.mockResolvedValue([
            { id: 'acct-1', isActive: true, userId: 'user-123' }
        ]);

        getCarrierGateway.mockResolvedValue({
            getRates: jest.fn().mockResolvedValue([{ service: 'Standard', coast: 100 }])
        });
    });

    it('should fetch from gateway on cache miss and set cache', async () => {
        // Cache miss
        redis.get.mockResolvedValue(null);

        const res = await request(app).post('/shipments/ship-123/rates');

        expect(res.status).toBe(200);
        expect(redis.get).toHaveBeenCalled(); // Checked cache
        expect(getCarrierGateway).toHaveBeenCalled(); // Hit gateway
        expect(redis.setex).toHaveBeenCalled(); // Set cache
        // Check cache args
        const setArgs = redis.setex.mock.calls[0];
        expect(setArgs[0]).toContain('rates:ship-123'); // Key
        expect(setArgs[1]).toBe(600); // TTL
    });

    it('should return cached rates on cache hit and avoid gateway', async () => {
        // Cache hit
        const cachedData = JSON.stringify([{ service: 'CachedService', cost: 50 }]);
        redis.get.mockResolvedValue(cachedData);

        const res = await request(app).post('/shipments/ship-123/rates');

        expect(res.status).toBe(200);
        expect(res.body[0].service).toBe('CachedService');

        expect(redis.get).toHaveBeenCalled(); // Checked cache
        expect(getCarrierGateway).not.toHaveBeenCalled(); // DID NOT Hit gateway
        expect(redis.setex).not.toHaveBeenCalled(); // No need to set
    });
});
