const complianceService = require('./complianceService');
const { PrismaClient } = require('@prisma/client');

jest.mock('@prisma/client', () => {
    const mockPrisma = {
        shipment: {
            findUnique: jest.fn()
        },
        dgUnReference: {
            findFirst: jest.fn()
        },
        sanctionsCheckResult: {
            create: jest.fn()
        }
    };
    return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('ComplianceService', () => {
    const prisma = new PrismaClient();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('determineAesRequirement', () => {
        test('should return true for high value shipment (>2500)', () => {
            const shipment = {
                lineItems: [{ valueUsd: 3000 }],
                destinationCountry: 'DE'
            };
            const result = complianceService.determineAesRequirement(shipment);
            expect(result).toBe(true);
        });

        test('should return false for low value shipment (<2500)', () => {
            const shipment = {
                lineItems: [{ valueUsd: 1000 }],
                destinationCountry: 'DE'
            };
            const result = complianceService.determineAesRequirement(shipment);
            expect(result).toBe(false);
        });

        test('should return false for Canada shipment regardless of value', () => {
            const shipment = {
                lineItems: [{ valueUsd: 5000 }],
                destinationCountry: 'CA'
            };
            const result = complianceService.determineAesRequirement(shipment);
            expect(result).toBe(false);
        });
    });

    describe('lookupUnNumber', () => {
        test('should call prisma findFirst with contains', async () => {
            await complianceService.lookupUnNumber('1234');
            expect(prisma.dgUnReference.findFirst).toHaveBeenCalledWith({
                where: { unNumber: { contains: '1234' } }
            });
        });
    });

    describe('screenParties', () => {
        test('should return clear status when no match', async () => {
            const shipment = {
                id: 's1',
                shipper: { id: 'p1', name: 'Good Guy' },
                consignee: { id: 'p2', name: 'Nice Company' },
                forwarder: { id: 'p3', name: 'Safe Logistics' }
            };
            prisma.shipment.findUnique.mockResolvedValue(shipment);

            const result = await complianceService.screenParties('s1');

            expect(result.status).toBe('CLEAR');
            expect(prisma.sanctionsCheckResult.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'CLEAR' })
            }));
        });

        test('should return match status when denied party found', async () => {
            const shipment = {
                id: 's1',
                shipper: { id: 'p1', name: 'Evil Corp' },
                consignee: { id: 'p2', name: 'Nice Company' }
            };
            prisma.shipment.findUnique.mockResolvedValue(shipment);

            const result = await complianceService.screenParties('s1');

            expect(result.status).toBe('MATCH');
            expect(result.results.find(r => r.name === 'Evil Corp').status).toBe('MATCH');
            expect(prisma.sanctionsCheckResult.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ status: 'MATCH' })
            }));
        });
    });
});
