const mockPrisma = {
    shipment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn()
    }
};

// Mock absolute dependencies based on relative paths in service
jest.mock('../../src/db', () => mockPrisma); // Wait, path from test file (tests/services) to src/db?
// Service file is in src/domains/shipping/services/ShipmentService.js
// It requires '../../../db' -> 'src/db'
// Test file is 'tests/services/shipmentService.test.js'
// If I require the service from test, it uses the mocked modules relative to ITSELF?
// Jest mocks match based on the require string passed in source code, OR absolute path match.
// I will mock the path used by the service source.
jest.mock('../../src/domains/shipping/dtos/shipmentDto', () => ({
    CreateShipmentSchema: {
        parse: jest.fn()
    },
    UpdateShipmentSchema: {
        parse: jest.fn()
    }
}));

// We need to require the service using the correct path from 'tests/services'
// tests/services is NOT where I put the test.
// I'll put the test in apps/api/tests/services/shipmentService.test.js
// Path to service: ../../src/domains/shipping/services/ShipmentService.js
// Path to db from test: ../../src/db

jest.mock('../../src/db', () => mockPrisma);

const ShipmentService = require('../../src/domains/shipping/services/ShipmentService');
const { CreateShipmentSchema } = require('../../src/domains/shipping/dtos/shipmentDto');

describe('ShipmentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createShipment', () => {
        it('should create a shipment successfully', async () => {
            const input = {
                origin: 'NY',
                destination: 'LA',
                weight: 100
            };

            const validated = { ...input, status: 'DRAFT' };
            const created = { id: 'ship-1', ...validated, trackingNumber: 'TEMP-123' };

            CreateShipmentSchema.parse.mockReturnValue(validated);
            mockPrisma.shipment.create.mockResolvedValue(created);

            const result = await ShipmentService.createShipment(input);

            expect(result.isSuccess).toBe(true);
            expect(result.getValue()).toEqual(created);
            expect(mockPrisma.shipment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    origin: 'NY',
                    trackingNumber: expect.stringMatching(/^TEMP-/)
                })
            });
        });

        it('should fail if validation error occurs', async () => {
            CreateShipmentSchema.parse.mockImplementation(() => {
                throw new Error('Validation failed');
            });

            const result = await ShipmentService.createShipment({});

            expect(result.isSuccess).toBe(false);
            expect(result.getError()).toBe('Validation failed');
            expect(mockPrisma.shipment.create).not.toHaveBeenCalled();
        });
    });

    describe('getShipment', () => {
        it('should return shipment if found', async () => {
            const ship = { id: 'ship-1' };
            mockPrisma.shipment.findUnique.mockResolvedValue(ship);

            const result = await ShipmentService.getShipment('ship-1');

            expect(result.isSuccess).toBe(true);
            expect(result.getValue()).toEqual(ship);
        });

        it('should fail if not found', async () => {
            mockPrisma.shipment.findUnique.mockResolvedValue(null);

            const result = await ShipmentService.getShipment('ship-999');

            expect(result.isSuccess).toBe(false);
            expect(result.getError()).toMatch(/not found/i);
        });
    });

    describe('listShipments', () => {
        it('should return paginated list', async () => {
            const data = [{ id: 'ship-1' }, { id: 'ship-2' }];
            mockPrisma.shipment.findMany.mockResolvedValue(data);
            mockPrisma.shipment.count.mockResolvedValue(10);

            const result = await ShipmentService.listShipments({ page: 1, limit: 10 });

            expect(result.isSuccess).toBe(true);
            const val = result.getValue();
            expect(val.data).toHaveLength(2);
            expect(val.pagination.total).toBe(10);
            expect(val.pagination.pages).toBe(1);
        });
    });
});
