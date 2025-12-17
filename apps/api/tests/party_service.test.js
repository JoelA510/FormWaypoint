const partyService = require('../src/services/parties/partyService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mock Prisma
jest.mock('@prisma/client', () => {
    const mPrisma = {
        party: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        shipment: {
            count: jest.fn()
        }
    };
    return { PrismaClient: jest.fn(() => mPrisma) };
});

describe('PartyService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('listParties should filters by isAddressBookEntry and search term', async () => {
        const mockData = [{ id: '1', name: 'Test Party' }];
        prisma.party.findMany.mockResolvedValue(mockData);
        prisma.party.count.mockResolvedValue(1);

        const result = await partyService.listParties({ search: 'test', limit: 10 });

        expect(prisma.party.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                isAddressBookEntry: true,
                OR: expect.arrayContaining([
                    { name: { contains: 'test' } }
                ])
            })
        }));
        expect(result.data).toEqual(mockData);
        expect(result.total).toBe(1);
    });

    test('deleteParty should prevent deletion if linked to shipment', async () => {
        const userId = 'user-1';
        prisma.shipment.count.mockResolvedValue(1); // Linked
        prisma.party.findUnique.mockResolvedValue({ id: '123', createdByUserId: userId });

        await partyService.deleteParty('123', userId);

        // Should soft delete/archive instead of hard delete
        expect(prisma.party.update).toHaveBeenCalledWith({
            where: { id: '123' },
            data: { isAddressBookEntry: false }
        });
        expect(prisma.party.delete).not.toHaveBeenCalled();
    });

    test('deleteParty should hard delete if unused', async () => {
        const userId = 'user-1';
        prisma.shipment.count.mockResolvedValue(0); // Not linked
        prisma.party.findUnique.mockResolvedValue({ id: '123', createdByUserId: userId });

        await partyService.deleteParty('123', userId);

        expect(prisma.party.delete).toHaveBeenCalledWith({ where: { id: '123' } });
    });
});
